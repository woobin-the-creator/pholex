"""사내 환경을 닮은 ~20k행 mock을 로컬 Postgres `sample` 테이블에 적재한다.

목적: 사내 500/504 환경을 로컬에서 재현하고, fake/PgSampleLotSource가 올바르게
동작함을 contract test로 검증하기 위한 데이터. **사내 실제 데이터는 한 줄도 쓰지 않고
전부 합성**한다.

oracle: golden_dataset의 4행을 raw 형태(Hold + KST naive)로 역변환해 임베드한다.
→ fetch_my_holds("99999")는 정확히 golden 3건, "88888"은 1건이어야 한다. 합성 행은
사번 99999/88888과 lot_id 접두사 LOT- 를 피해 oracle을 오염시키지 않는다.

실행:
    DATABASE_URL=postgresql+asyncpg://pholex:<pw>@localhost:5433/pholex \\
        python scripts/seed_sample_mock.py
(DATABASE_URL 미지정 시 backend 설정의 기본값을 사용)
"""

from __future__ import annotations

import asyncio
import pathlib
import random
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "backend"))

from app.adapters.fake.golden_dataset import GOLDEN_ROWS  # noqa: E402
from app.adapters.fake.pg_engine import dispose_engine, get_engine  # noqa: E402
from app.adapters.fake.pg_schema import metadata, sample_table  # noqa: E402

_KST = ZoneInfo("Asia/Seoul")

SYNTHETIC_ROWS = 20_000
BATCH_SIZE = 2_000

# 합성 hold는 이 사번 풀에서만 뽑는다 (golden의 99999/88888 제외 → oracle 보호).
EMPLOYEE_POOL = [str(10_000 + i) for i in range(1, 51)]  # 10001..10050

# raw lot_status_seg 분포 (Active 다수 / PreActive 중간 / Hold 소수).
STATUS_WEIGHTS = [("Active", 0.70), ("PreActive", 0.20), ("Hold", 0.10)]

EQP_POOL = ["CMP-01", "CMP-03", "ETCH-07", "ETCH-11", "LITHO-04", "IMP-02", "DIFF-09", "CVD-05"]
STEP_POOL = [
    "CMP / 슬러리 모니터",
    "Dry Etch / Poly",
    "Photo / Mask 4",
    "Implant / NWell",
    "Diffusion / Gate Ox",
    "CVD / Nitride",
    "Wet / Pre-clean",
]
HOLD_COMMENT_POOL = [
    "Pad life 초과 의심 — 측정값 확인 필요",
    "Dose 검증 재측정 요청",
    "Particle count 이상 — 재검사",
    "Overlay spec out — rework 검토",
    "장비 alarm 후 hold, 엔지니어 확인 대기",
]


def _weighted_status(rng: random.Random) -> str:
    roll = rng.random()
    cumulative = 0.0
    for status, weight in STATUS_WEIGHTS:
        cumulative += weight
        if roll < cumulative:
            return status
    return STATUS_WEIGHTS[-1][0]


def _golden_rows() -> list[dict]:
    """canonical golden 행을 raw sample 행으로 역변환."""
    rows = []
    for g in GOLDEN_ROWS:
        # tz-aware UTC → KST naive (어댑터가 KST→UTC로 되돌리면 원래 UTC와 동일)
        naive_kst = g["updated_at"].astimezone(_KST).replace(tzinfo=None)
        rows.append(
            {
                "lot_id": g["lot_id"],
                "lot_status_seg": "Hold",  # 모든 golden은 hold
                "eqp_type": g["equipment"],
                "step_name": g["process_step"],
                "lot_hold_comment": g["hold_comment"],
                "last_update_date": naive_kst,
                "lot_hold_user_id": g["hold_operator_employee_number"],
            }
        )
    return rows


def _synthetic_rows(rng: random.Random) -> list[dict]:
    now = datetime.now()  # naive (로컬 = KST wall-clock 가정)
    rows = []
    for i in range(1, SYNTHETIC_ROWS + 1):
        status = _weighted_status(rng)
        is_hold = status == "Hold"
        rows.append(
            {
                "lot_id": f"SIM-{i:05d}",
                "lot_status_seg": status,
                "eqp_type": rng.choice(EQP_POOL),
                "step_name": rng.choice(STEP_POOL),
                "lot_hold_comment": rng.choice(HOLD_COMMENT_POOL) if is_hold else None,
                "last_update_date": now - timedelta(minutes=rng.randint(0, 14 * 24 * 60)),
                # hold만 owner를 채운다 (사내도 hold 명령 유저만 기록).
                "lot_hold_user_id": rng.choice(EMPLOYEE_POOL) if is_hold else None,
            }
        )
    return rows


async def seed() -> None:
    rng = random.Random(20260529)  # deterministic 합성
    rows = _golden_rows() + _synthetic_rows(rng)

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(metadata.drop_all)
        await conn.run_sync(metadata.create_all)
        for start in range(0, len(rows), BATCH_SIZE):
            await conn.execute(sample_table.insert(), rows[start : start + BATCH_SIZE])
    await dispose_engine()

    holds = sum(1 for r in rows if r["lot_status_seg"] == "Hold")
    print(f"seeded {len(rows)} rows into 'sample' ({holds} holds, golden 4 임베드 포함)")


if __name__ == "__main__":
    asyncio.run(seed())
