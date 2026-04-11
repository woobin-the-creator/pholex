# Pholex — MVP 정의

> 이 문서가 완료 기준이다. MVP 범위 밖의 기능은 구현하지 않는다.

---

## MVP 범위

### 1. SSO 로그인

- 페이지 접속 시 자동으로 SSO 인증 개시
- 첫 접속: SSO 정보로 `users` 테이블 자동 등록 → 메인 페이지 리다이렉트
- 재접속: 기존 세션 확인 → 메인 페이지 바로 진입
- 세션 만료 시 SSO 자동 재인증 (사용자 개입 없음)

> 상세 인증 설계: `docs/auth.md`

---

### 2. 메인 페이지 — 2x3 그리드 레이아웃

```
┌─────────────────┬─────────────────┐
│   [0] 비어있음  │  [1] 내 lot hold │  ← MVP 구현 슬롯
├─────────────────┼─────────────────┤
│   [2] 비어있음  │   [3] 비어있음   │
├─────────────────┼─────────────────┤
│   [4] 비어있음  │   [5] 비어있음   │
└─────────────────┴─────────────────┘
```

- 슬롯 [0], [2], [3], [4], [5]: 빈 슬롯 UI만 렌더 (placeholder)
- 슬롯 [1] (우상단): **"내 lot hold"** 테이블 구현

---

### 3. "내 lot hold" 테이블 (슬롯 [1])

#### 필터 조건

```sql
SELECT *
FROM lot_status
WHERE status = 'hold'
  AND hold_operator_id = :logged_in_operator_id
```

- `hold_operator_id`: 외부 소스에서 수집된 사번 (number type)
- `logged_in_operator_id`: 현재 로그인한 사용자의 `users.employee_number`

> **컬럼명 주의**: `hold_operator_id`와 SSO의 operator_id 파라미터명은 예시다.
> 실제 컬럼명은 사내에서 확인 후 맞춰야 한다. `docs/onprem-setup.md` 참고.

#### 표시 컬럼

| 컬럼 | 표시명 |
|------|--------|
| `lot_id` | Lot ID |
| `status` | 상태 |
| `equipment` | 장비 |
| `process_step` | 공정 단계 |
| `hold_comment` | Hold 사유 |
| `updated_at` | 마지막 갱신 |

#### 동작

- 페이지 진입 시 REST API로 초기 데이터 로드
- 이후 WebSocket `table_update` 메시지 수신 시 해당 슬롯만 갱신
- `status = 'hold'`인 행: Critical Red(`#e53e3e`) 하이라이트 적용
- `TableHeader`: 테이블명("내 lot hold") + 리프레시 버튼 + 마지막 갱신 시간

---

## MVP 범위 밖 (다음 단계)

- 슬롯 [0], [2]~[5] 구체 테이블 구현
- 글로벌 필터 사이드바 동작
- 필터 프리셋 저장/불러오기
- 실시간 알림 (토스트)
- 사용자별 레이아웃 커스터마이징

---

## 수용 기준 (Acceptance Criteria)

- [ ] SSO 로그인 후 메인 페이지 진입
- [ ] 2x3 그리드 렌더링 — 슬롯 [0],[2]~[5]는 빈 슬롯 UI 표시
- [ ] 슬롯 [1]에 로그인 사용자의 hold 랏 목록 표시
- [ ] hold 조건: `status = 'hold'` AND `hold_operator_id = 로그인 사번`
- [ ] 행에 Critical Red 하이라이트 적용
- [ ] 리프레시 버튼 클릭 시 데이터 즉시 갱신
- [ ] WebSocket 연결 유지 및 `table_update` 수신 시 슬롯 [1] 갱신
- [ ] 로그아웃 버튼 동작 (세션 삭제 → SSO init 리다이렉트)

---

## 개발 환경 테스트용 시드 데이터

사외 개발 환경에서는 실제 API 수집이 불가하므로 seed 데이터를 DB에 직접 삽입해 테스트한다.

```sql
-- 테스트 사용자 (DEV_SSO_BYPASS 계정과 employee_number 일치)
INSERT INTO users (employee_id, employee_number, username, email, auth)
VALUES ('test001', '99999', '테스트엔지니어', 'test@dev.local', 'ENGINEER');

-- 슬롯 [1]에 표시될 hold 랏 (hold_operator_id = 99999)
INSERT INTO lot_status (lot_id, status, equipment, process_step, hold_comment, hold_operator_id)
VALUES
  ('LOT-001', 'hold', 'EQ-A01', 'STEP-10', '장비 이상 확인 필요', 99999),
  ('LOT-002', 'hold', 'EQ-B03', 'STEP-25', '자재 부족', 99999);

-- 다른 사용자의 hold 랏 (슬롯 [1]에 표시되면 안 됨)
INSERT INTO lot_status (lot_id, status, equipment, process_step, hold_comment, hold_operator_id)
VALUES
  ('LOT-003', 'hold', 'EQ-C01', 'STEP-05', '검사 대기', 88888);

-- 내 run/wait 랏 (슬롯 [1]에 표시되면 안 됨)
INSERT INTO lot_status (lot_id, status, equipment, process_step, hold_operator_id)
VALUES
  ('LOT-004', 'run', 'EQ-A02', 'STEP-15', 99999),
  ('LOT-005', 'wait', 'EQ-D01', 'STEP-08', 99999);
```
