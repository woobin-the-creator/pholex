## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.
이번 커밋에서 `REPORT_BASE_URL` 환경변수를 `docker-compose.yml`의 `celery-worker` 서비스와
`backend/reports/tasks.py` 두 곳에 새로 추가했습니다. 그런데 사내 운영 환경(온프렘 서버,
배포 스크립트, Vault / `.env` 파일 등)에서 이 변수가 어떤 이름으로 등록되어 있는지
외부 AI는 알 수 없습니다. 변수명이 사내 실제 이름과 다르면 운영 배포 시 URL이
fallback 기본값(`http://localhost:10003`)으로 동작해 리포트 링크가 깨집니다.

## 상황

### 변경된 코드 스니펫

**docker-compose.yml** — `celery-worker` 서비스에 추가된 환경변수:

```yaml
environment:
  - REPORT_BASE_URL=${REPORT_BASE_URL:-http://localhost:10003}
```

**backend/reports/tasks.py** — 두 곳에 추가된 URL 조립 로직:

```python
base_url = os.environ.get('REPORT_BASE_URL', 'http://localhost:10003')
report_url = f"{base_url}/report/{date_str}"
```

### 계약(Contract)

| 항목 | 내용 |
|------|------|
| 변수명 (코드 내) | `REPORT_BASE_URL` |
| 기본값 (fallback) | `http://localhost:10003` |
| 사용 위치 | `celery-worker` 컨테이너 내 Celery task 실행 시 |
| 기대 형식 | `http(s)://host[:port]` — trailing slash 없음 |
| 조립 결과 예시 | `http://report-server.internal/report/2026-04-13` |
| 실패 시 동작 | fallback URL로 이메일/알림에 잘못된 링크가 삽입됨 |

## 해야 할 일

사내 팀은 아래 세 케이스 중 해당하는 케이스를 선택하고 지침대로 처리하세요.

### 케이스 A: 사내 운영 환경에 이미 `REPORT_BASE_URL` 이름으로 등록되어 있음

- 아무 작업 불필요. 배포 시 자동으로 주입됩니다.
- `.env.production` 또는 Vault에서 `REPORT_BASE_URL` 항목 존재를 확인만 하세요.

### 케이스 B: 사내에서 다른 이름을 사용 중 (예: `REPORT_SERVER_URL`, `INTERNAL_REPORT_HOST` 등)

두 가지 선택지가 있습니다. 더 안전한 **B-1**을 권장합니다.

**B-1 (권장): 코드 변수명을 사내 이름으로 맞추기**

1. `backend/reports/tasks.py` 두 곳의 `'REPORT_BASE_URL'` → 사내 실제 변수명으로 교체
2. `docker-compose.yml`의 `REPORT_BASE_URL` → 사내 실제 변수명으로 교체
3. 변경 후 커밋/배포

```python
# 예: 사내 변수명이 REPORT_SERVER_URL 인 경우
base_url = os.environ.get('REPORT_SERVER_URL', 'http://localhost:10003')
```

**B-2 (차선): 사내 변수를 `REPORT_BASE_URL`로 alias 추가**

운영 환경 `.env` 또는 배포 스크립트에 아래 줄을 추가합니다.
코드를 건드리지 않아도 되지만 변수 이름 중복이 생깁니다.

```bash
REPORT_BASE_URL=${REPORT_SERVER_URL}   # 사내 실제 변수명으로 교체
```

### 케이스 C: 리포트 서버 URL이 아직 확정되지 않았거나 서버 자체가 미구현

- 현재 코드는 fallback `http://localhost:10003`으로 동작합니다.
- 리포트 서버가 준비된 시점에 케이스 A 또는 B 절차를 수행하세요.
- 그 전까지는 Celery task 로그에서 생성된 `report_url` 값을 모니터링해 fallback이
  사용되고 있는지 확인하세요.

## 테스트 실행

배포 후 아래 명령으로 변수가 올바르게 주입되었는지 확인합니다.

```bash
# celery-worker 컨테이너 내부에서 변수 확인
docker compose exec celery-worker printenv REPORT_BASE_URL

# 또는 task 로그에서 실제 조립된 URL 확인
docker compose logs celery-worker | grep "report_url"

# 통합 테스트: 실제 리포트 task를 수동 트리거 후 URL 검증
docker compose exec celery-worker python -c "
import os
base_url = os.environ.get('REPORT_BASE_URL', 'http://localhost:10003')
print('REPORT_BASE_URL =', base_url)
assert not base_url.startswith('http://localhost'), 'WARNING: fallback URL 사용 중'
"
```
