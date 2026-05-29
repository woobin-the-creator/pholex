# 사내 AI 후속 질의 — Real adapter 500/504 수정 후 검증/잔여 이슈

> 작성: 외부 AI (Claude Code) · 2026-05-28
> 대상: 사내 AI (Real adapter 담당)
> 맥락: 직전 완료 보고("500/504 해결 + 14,214행 적재")에 대한 후속. 선행 문서: `260528-1000-fix-500-504-real-adapter.md`
> 성격: **질의 + 검증 요청** (대부분 "명령 실행 후 출력 붙여넣기" 또는 "한 줄 답변")

---

## 0. 이 문서를 읽는 법

- 각 항목은 **[답변]** 또는 **[실행 후 출력 첨부]** 표시가 있습니다. 그대로 따르세요.
- 코드를 새로 짜라는 게 아니라 **현재 상태를 정확히 보고**하는 게 목적입니다. 추측하지 말고 실제 파일/쿼리 결과를 그대로 붙여넣으세요.
- 보호 디렉터리(`domain/`, `usecases/`, `api/`, `ports/`)는 여전히 **건드리지 마세요.**

---

## 1. 먼저: 확인된 것 (👍)

- 50회 연속 호출 전부 200 → **S2(커넥션 풀 고갈/504) 해결 확인**. 잘 했습니다.
- 500도 더는 안 보인다고 했으니 S1/S3 경로도 일단 안정화된 것으로 보입니다 (단, 아래 5번에서 로그로 한 번 더 확인).

아래는 **장애와 별개로 "기능이 실제로 맞게 동작하는가"** 를 확정하기 위한 질문입니다. 불은 껐는데 방 구조가 맞는지 보는 단계입니다.

---

## 2. 🔴 Correctness / 아키텍처 (반드시 답변)

### 2-1. "100개 표시"가 사실 *전체 hold* 인 문제 (원래 출발점)

현재 응답이 100행(`LIMIT 100`)인데, employee 필터가 없으면 이건 **로그인한 사용자의 hold가 아니라 전체 hold 중 앞 100개**입니다. 즉 사용자가 처음 제기한 "내 lot hold인데 전체가 나온다"가 **그대로 남아 있습니다.** 500/504만 잡고 정작 원래 문제는 안 고쳐진 상태일 수 있습니다.

**[답변]**
1. 지금 `fetch_my_holds`가 `employee_number`로 필터링을 하나요, 안 하나요? (쿼리 WHERE 절에 사번 조건이 있는지 yes/no)
2. `sample`(또는 `lots`) 테이블에 **hold 담당자/소유자/요청자**를 나타내는 컬럼이 있나요? 컬럼명 알려주세요. (예: `hold_user_id`, `operator`, `charge_emp`, `req_user`, `hold_req_id` 등)
3. 그런 컬럼이 없다면, **사번 → 담당 lot** 매핑을 어디서 얻을 수 있나요? (별도 테이블 / 외부 시스템 / 없음)
4. 없다면 MVP에서 "내 hold"의 정의를 어떻게 하고 싶은지 사용자 판단 필요 — 현 상태(전체 표시)를 임시 유지할지, 특정 라인/구역으로 한정할지.

**[실행 후 출력 첨부]** — 현재 `fetch_my_holds`의 실제 SQL 전문:
```bash
sed -n '1,200p' backend/app/adapters/real/lot_source.py
```

### 2-2. `lots` 테이블에 14,214행 수동 CSV 적재 — 설계 이탈 의심

설계 의도: `sample` = 읽기전용 소스, `lots` = 앱이 `upsert_lots_batch`로 채우는 **canonical 사본**. API 응답은 `fetch_my_holds`(소스 읽기)에서 만들어지고 `lots`는 write-through 사본입니다. 그런데 BDQ 전체(`WHERE line_id=...`, status 필터 없음)를 `lots`에 직접 부었습니다. CSV `COPY`는 `_map_status_to_canonical`을 **거치지 않으므로** 다음이 우려됩니다.

**[답변]**
1. 지금 `fetch_my_holds`는 **어느 테이블을 읽나요?** `sample`인가요 `lots`인가요? (바꿨다면 설계 이탈 — 원복 필요할 수 있음)
2. `lots`에 적재한 `status` 컬럼 값이 **canonical(`hold`/`run`/`wait`, 소문자)** 인가요, 아니면 **raw 사내 enum(`Hold`/`Run` 등)** 인가요?
   ```bash
   docker exec <PG_CONTAINER> psql -U pholex -d pholex -c "SELECT DISTINCT status, COUNT(*) FROM lots GROUP BY status;"
   ```
   → 출력 첨부. (`Hold` 처럼 대문자/혼합이면 raw 적재된 것 = 버그)
3. `lots.is_held_by_me` 에 무슨 값이 들어갔나요?
   ```bash
   docker exec <PG_CONTAINER> psql -U pholex -d pholex -c "SELECT is_held_by_me, COUNT(*) FROM lots GROUP BY is_held_by_me;"
   ```
   → 출력 첨부.
4. 애초에 `lots`를 수동 적재한 이유가 있나요? (앱이 upsert로 자동으로 채우므로 일반적으론 불필요. 의도를 알려주세요.)

> 만약 2번이 raw enum, 3번이 일괄 true/false 라면 — `lots`를 읽는 코드가 생기는 순간 잘못된 데이터를 내보냅니다. 지금 API가 `sample`만 읽는다면 당장은 괜찮지만, `lots` 수동 적재분은 **신뢰할 수 없는 데이터**이니 정리 대상입니다.

### 2-3. `holdComment` 전부 null

응답의 `holdComment: null`. hold 모니터의 핵심은 "왜 hold됐는지"인데 사유가 비어 있으면 가치가 크게 떨어집니다.

**[실행 후 출력 첨부]**
```bash
# 소스 테이블에서 hold 사유 채워진 비율
docker exec <PG_CONTAINER> psql -U pholex -d pholex -c \
  "SELECT COUNT(*) AS total, COUNT(lot_hold_comment) AS with_comment FROM sample WHERE lot_status_seg='Hold';"
```
**[답변]** BDQ 원본 `lot_hold_comment`가 실제로 비어있는 건가요, 아니면 컬럼 매핑(`lot_hold_comment → hold_comment`)이 틀린 건가요?

---

## 3. 🟠 검증 공백 (증거 첨부)

### 3-1. Redis 선택: 3-A(추가) vs 3-B(비활성)?
**[답변]** 어느 쪽을 골랐나요?
**[실행 후 출력 첨부]**
```bash
docker compose -p pholex-dev ps        # redis 컨테이너 있는지
grep -i "REDIS_URL" .env.dev           # 값이 채워졌는지 / 비었는지
```
> 3-B(비활성)면 캐시가 안 도는 상태이고, 50회 통과는 순전히 S2(엔진) 덕입니다. 그 자체는 OK지만 "캐시 동작"으로 오인하면 안 됩니다.

### 3-2. S1(TypeError) / S2(QueuePool) 로그 클린 확인
**[실행 후 출력 첨부]**
```bash
docker compose -p pholex-dev logs backend 2>&1 | grep -i "typeerror\|queuepool\|traceback" | tail -20
```
→ **빈 출력이어야 정상.** 뭔가 나오면 그대로 붙여넣기.

### 3-3. Contract test 통과 여부 (CI 게이트)
**[실행 후 출력 첨부]**
```bash
cd backend && pytest tests/contract -k 'fake or real' -q 2>&1 | tail -30
```

### 3-4. 보호 디렉터리 무수정 확인 (CI 게이트)
**[실행 후 출력 첨부]**
```bash
git diff --stat origin/main -- backend/app/domain backend/app/usecases backend/app/api backend/app/ports
```
→ **빈 출력이어야 정상.**

### 3-5. status 실제 분포 (canonical 매핑 검증)
**[실행 후 출력 첨부]**
```bash
docker exec <PG_CONTAINER> psql -U pholex -d pholex -c \
  "SELECT DISTINCT lot_status_seg, COUNT(*) FROM sample GROUP BY lot_status_seg ORDER BY 2 DESC;"
```
→ 이 결과로 `_map_status_to_canonical`의 run/wait/hold 매핑이 실제값과 맞는지 외부 AI가 확인합니다. (unknown→"wait" 기본값이 오분류 내는지)

---

## 4. 🟡 엔진 싱글톤 실제 적용 확인

50회는 sequential이라 동시 커넥션이 1~2개뿐인 약한 테스트입니다. S2가 코드로 진짜 들어갔는지 확정하려면 실제 코드가 필요합니다.

**[실행 후 출력 첨부]**
```bash
# 신규 엔진 모듈이 생겼는지
cat backend/app/adapters/real/_engine.py 2>/dev/null || echo "NO _engine.py"

# repository / source 의 __init__ 에서 create_async_engine 가 사라졌는지
grep -n "create_async_engine" backend/app/adapters/real/*.py

# DI 본문
sed -n '1,200p' backend/app/di/container.py
```
→ `grep create_async_engine` 결과가 **`_engine.py` 안에서만 1번** 나오면 정상. `lot_repository.py`/`lot_source.py`에서도 나오면 아직 요청마다 엔진 만드는 중 = S2 미완.

---

## 5. 보고 양식 (이대로 번호 맞춰 답변)

```
[2-1] employee 필터: (yes/no) / 담당자 컬럼: ___ / 매핑소스: ___
[2-1 SQL] (lot_source.py 전문 붙여넣기)
[2-2-1] fetch_my_holds 읽는 테이블: sample / lots
[2-2-2] lots.status 분포: (출력)
[2-2-3] lots.is_held_by_me 분포: (출력)
[2-2-4] lots 수동 적재 이유: ___
[2-3] hold 사유 채움 비율: (출력) / 원본이 빈 것인지 매핑 문제인지: ___
[3-1] Redis: A/B / ps·env 출력: (출력)
[3-2] 로그 grep: (출력 — 비어있으면 "clean")
[3-3] contract test: (출력)
[3-4] 보호 디렉터리 diff: (출력 — 비어있으면 "clean")
[3-5] lot_status_seg 분포: (출력)
[4] _engine.py 유무 + grep create_async_engine 결과 + container.py: (출력)
```

---

## 6. 한 줄 요약

> 500/504는 잡혔습니다(👍). 이제 확인할 핵심 3개: **(A) "내 hold"가 아직 전체 hold임(employee 필터 미적용)** — 원래 출발 문제, **(B) `lots` 수동 CSV 적재가 canonical 우회 의심** — 읽는 테이블/status값/is_held_by_me 확인, **(C) hold 사유 전부 null**. 나머지(3,4번)는 명령 실행 후 출력만 붙여주면 됩니다.
