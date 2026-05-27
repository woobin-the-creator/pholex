## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.

`docker-compose.yml`과 `backend/reports/tasks.py`에 `REPORT_BASE_URL`이라는 환경변수를 새로 추가했습니다. 그런데 이 변수명이 사내 운영 환경(서버, Vault, 배포 스크립트 등)에서 실제로 사용 중인 변수명과 일치하는지 외부 AI는 확인할 수 없습니다. 사내 운영 환경설정 파일, Vault 경로, 배포 스크립트는 레포 외부에 존재하기 때문입니다. 변수명 불일치 상태로 배포되면 레포트 URL이 기본값(`http://localhost:10003`)으로 fallback되어 운영 환경에서 잘못된 주소를 가리키게 됩니다.

## 상황

이번 커밋에서 아래 두 파일이 변경됐습니다.

### docker-compose.yml (celery-worker 서비스)

```yaml
environment:
  - REPORT_BASE_URL=${REPORT_BASE_URL:-http://localhost:10003}
```

### backend/reports/tasks.py

```python
base_url = os.environ.get('REPORT_BASE_URL', 'http://localhost:10003')
report_url = f"{base_url}/report/{date_str}"
```

**계약(contract)**:

| 항목 | 내용 |
|------|------|
| 환경변수 이름 | `REPORT_BASE_URL` |
| 기대 형식 | `http(s)://hostname[:port]` (후행 슬래시 없음) |
| 기본값(fallback) | `http://localhost:10003` |
| 사용 위치 | celery-worker 태스크 실행 시 레포트 URL 조합: `{base_url}/report/{date_str}` |
| 성공 시 동작 | 사내 레포트 서버로 올바른 URL 생성 |
| 실패(변수 미설정) 시 동작 | localhost fallback → 운영 환경에서 잘못된 주소 사용 |

## 해야 할 일

사내 운영 환경(Vault, 배포 스크립트, `.env` 파일 등)에서 레포트 서버 base URL에 해당하는 변수명을 확인한 뒤 아래 케이스 중 하나를 선택한다.

---

### 케이스 A: 사내 변수명이 `REPORT_BASE_URL`로 동일한 경우

변경 없이 그대로 사용 가능합니다.

**할 일:**
1. 운영 환경(Vault 또는 배포 스크립트)에서 `REPORT_BASE_URL` 값이 설정돼 있는지 확인.
2. 값이 없으면 사내 레포트 서버 주소(`http://report-server.internal:10003` 등)를 등록.
3. 배포 후 celery-worker 로그에서 URL이 올바르게 조합되는지 확인.

---

### 케이스 B: 사내 변수명이 다른 경우 (예: `INTERNAL_REPORT_URL`, `REPORT_SERVER_ADDR` 등)

레포 코드의 변수명을 사내 변수명에 맞춰 변경해야 합니다.

**할 일:**
1. 사내 실제 변수명 확인 (예: `INTERNAL_REPORT_URL`).
2. 아래 두 파일에서 `REPORT_BASE_URL`을 실제 변수명으로 교체:
   - `docker-compose.yml`: `REPORT_BASE_URL` → `{실제_변수명}`
   - `backend/reports/tasks.py`: `os.environ.get('REPORT_BASE_URL', ...)` → `os.environ.get('{실제_변수명}', ...)`
3. 변경 후 커밋 및 배포.

---

### 케이스 C: 해당 레포트 서버가 아직 미운영인 경우

레포트 서버 자체가 아직 구축되지 않았다면 환경변수 등록이 불가능합니다.

**할 일:**
1. celery-worker 배포 시 `REPORT_BASE_URL`을 임시 더미 값으로 설정해 에러를 방지.
2. 레포트 서버 구축 일정을 확인하고, 구축 완료 후 실제 주소로 업데이트.
3. 태스크 코드에 서버 미운영 상황을 처리하는 guard 추가를 검토.

---

## 테스트 실행

환경변수 설정 확인:

```bash
# 운영 환경에서 변수 주입 여부 확인
docker exec <celery-worker-container> env | grep REPORT

# 태스크 실행 후 URL 조합 확인 (로그에서)
docker logs <celery-worker-container> | grep report_url
```

로컬 검증:

```bash
# 변수 설정 후 컨테이너 재시작
REPORT_BASE_URL=http://report-server.internal:10003 docker-compose up -d celery-worker

# 태스크 수동 트리거 후 URL 확인
docker exec <celery-worker-container> python -c "
import os
base_url = os.environ.get('REPORT_BASE_URL', 'http://localhost:10003')
print('report base url:', base_url)
"
```
