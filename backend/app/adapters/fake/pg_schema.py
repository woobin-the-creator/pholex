"""Postgres `sample` 테이블 schema — 사내 소스 `T_ISSUE_LOT`(가명) 모방.

[Phase 2] hold는 1:N이라 이 테이블은 **explode된 hold 한 행**을 담는다(한 lot이 여러 행).
사내 AI는 `T_ISSUE_LOT`에서 active hold(`complt_date IS NULL AND catg_type='HOLD'`)를
떠서 `opertr_id` 콤마를 담당자별로 explode한 뒤 Pholex Postgres의 `sample` 테이블에 적재한다
(원본 컬럼명·원본 enum 그대로). `PgSampleLotSource`(읽기)와 seed script(쓰기)가 같은 schema
객체를 공유한다.

raw → DTO 변환(operator 매칭 필터 + lot별 my_holds 집계)은 어댑터(`PgSampleLotSource`) 책임이다.
이 테이블은 raw 그대로 들고 있는다 (issue_date는 timezone 정보 없는 naive timestamp).

컬럼 매핑(dump-job-spec.md §3.1):
- lot_id ← lot_id_list (단일 lot, 콤마 없음)
- status ← status_type (raw 그대로, active만 담으므로 사실상 Hold)
- process_step ← step_desc
- operator_ad_id ← opertr_id의 '(' 앞부분, operator_name ← 괄호 안
- item_type / issue_comment / issue_date ← 동명 소스 컬럼
- equipment(eqp_id_list)는 100% NULL이라 미적재
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, MetaData, String, Table

metadata = MetaData()

# explode된 hold 한 행. surrogate id(BIGSERIAL 대응)를 PK로 둔다 —
# (lot_id, operator_ad_id)가 비유일(같은 담당자·다른 사유)이라 자연키 불가.
sample_table = Table(
    "sample",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("lot_id", String, nullable=False),           # lot_id_list (단일 lot)
    Column("status_type", String, nullable=False),      # raw: Active / Hold / PreActive
    Column("step_desc", String, nullable=True),         # 공정 스텝
    Column("operator_ad_id", String(100), nullable=False),  # opertr_id '(' 앞 — AD id
    Column("operator_name", String(100), nullable=True),    # opertr_id 괄호 안 (한글 이름)
    Column("item_type", String(50), nullable=True),     # USER/SPC/DEFECT/L·L (표시용)
    Column("issue_comment", String, nullable=True),     # hold 사유
    Column("issue_date", DateTime(timezone=False), nullable=True),  # naive (KST wall-clock)
)
