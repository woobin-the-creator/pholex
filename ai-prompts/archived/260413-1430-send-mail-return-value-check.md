## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.

`backend/reports/mail_handler.py`는 사내 메일 전송 라이브러리의 래퍼 stub입니다. 현재 레포에는 `def send_mail(): pass`만 존재하며, 실제 사내 메일 라이브러리 구현은 레포 외부에 있습니다. 이번 PR에서 `tasks.py`가 `send_mail()`의 반환값을 딕셔너리로 가정하고 `success` 키를 체크하는 로직을 추가했습니다. 그러나 stub은 항상 `None`을 반환하므로, 사내 실제 라이브러리가 이 계약을 충족하는지 확인이 필요합니다. AI는 사내 메일 라이브러리의 실제 반환 형식을 알 수 없어 직접 구현할 수 없습니다.

## 상황

`tasks.py`에 다음 코드가 추가되었습니다:

```python
result = mail_handler.send_mail(title=title, mail_body=mail_body, recipient_group=batch)
if isinstance(result, dict) and not result.get('success', True):
    error_msg = result.get('error', '알 수 없는 오류')
    raise RuntimeError(f"메일 API 오류 (batch {i}/{total}): {error_msg}")
```

이 코드가 `send_mail()`에 기대하는 계약(contract):

| 항목 | 기대값 |
|------|--------|
| 성공 시 반환값 | `{'success': True, ...}` 또는 `None` (딕셔너리가 아니면 성공으로 간주) |
| 실패 시 반환값 | `{'success': False, 'error': '오류 메시지'}` |
| 실패 시 동작 | `RuntimeError` 발생 (`메일 API 오류 (batch {i}/{total}): {error_msg}`) |

현재 stub 구현:

```python
def send_mail(title, mail_body, recipient_group):
    """사내 메일 전송. 실제 구현은 사내 라이브러리에 있음."""
    pass  # 항상 None 반환 → tasks.py 코드는 성공으로 간주함
```

## 해야 할 일

### 케이스 A: 사내 메일 라이브러리가 이미 위 계약과 호환되는 형식을 반환하는 경우

사내 라이브러리가 실패 시 `{'success': False, 'error': '...'}`를 반환한다면:

1. `mail_handler.py`의 stub을 실제 사내 라이브러리 호출로 교체한다:
   ```python
   from 사내_메일_라이브러리 import send_mail as _internal_send_mail

   def send_mail(title, mail_body, recipient_group):
       return _internal_send_mail(title=title, body=mail_body, recipients=recipient_group)
   ```
2. 실제 반환값 형식을 확인하고, `tasks.py`의 체크 로직이 올바르게 동작하는지 검증한다.
3. 추가 작업 없음.

### 케이스 B: 사내 메일 라이브러리가 다른 형식을 반환하는 경우

사내 라이브러리가 실패 시 예외를 던지거나, 다른 키 이름(`status`, `ok` 등)을 사용하거나, 불리언을 직접 반환하는 경우:

1. `mail_handler.py`에서 사내 라이브러리 반환값을 변환하는 어댑터를 구현한다:
   ```python
   def send_mail(title, mail_body, recipient_group):
       try:
           _internal_send_mail(...)
           return {'success': True}
       except SomeInternalError as e:
           return {'success': False, 'error': str(e)}
   ```
2. 변환 로직이 `tasks.py`가 기대하는 계약(`{'success': bool, 'error': str}`)을 충족하는지 확인한다.

### 케이스 C: 사내 메일 라이브러리가 아직 미구현이거나 도입 예정인 경우

1. stub을 그대로 두되, `mail_handler.py`에 명시적 플래그를 추가한다:
   ```python
   MAIL_HANDLER_IMPLEMENTED = False

   def send_mail(title, mail_body, recipient_group):
       if not MAIL_HANDLER_IMPLEMENTED:
           # 개발/스테이징 환경에서는 로그만 남기고 성공 반환
           import logging
           logging.warning(f"[STUB] send_mail called: title={title}, recipients={len(recipient_group)}명")
           return {'success': True}
       # 실제 구현으로 교체
       ...
   ```
2. 라이브러리 도입 후 위 케이스 A 또는 B에 따라 실제 구현으로 교체한다.

## 테스트 실행

사내 환경에서 실제 구현 교체 후 다음으로 검증한다:

```bash
# 백엔드 의존성 설치 후 테스트
cd backend
pip install -r requirements.txt

# 메일 전송 태스크 단위 테스트 실행 (있는 경우)
pytest reports/tests/test_tasks.py -v

# 실제 메일 발송 통합 테스트 (스테이징 환경)
# send_mail()이 실패 케이스를 올바르게 반환하는지 확인
python -c "
from reports.mail_handler import send_mail
result = send_mail(title='테스트', mail_body='본문', recipient_group=['test@company.com'])
print('result:', result)
assert isinstance(result, dict), '반환값이 dict여야 합니다'
assert 'success' in result, 'success 키가 있어야 합니다'
print('계약 확인 완료')
"
```
