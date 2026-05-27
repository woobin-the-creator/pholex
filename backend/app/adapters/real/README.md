# Real Adapters (사내 AI 작업 영역)

이 디렉터리는 **사내 AI가 작성하는 Real adapter** 코드 전용입니다. Claude는 이 디렉터리를 비워 둡니다.

## 진입점

전체 사양은 `docs/adapter-spec.md`를 참조하세요.

## 명명 규약

| Port           | 파일                           | 클래스명             |
|----------------|--------------------------------|---------------------|
| LotSource      | `lot_source.py`                | `RealLotSource`     |
| LotRepository  | `lot_repository.py`            | `RealLotRepository` |
| MailSender     | `mail_sender.py`               | `RealMailSender`    |
| SsoVerifier    | `sso_verifier.py`              | `RealSsoVerifier`   |

DI 컨테이너는 `ADAPTER_MODE=real`일 때 위 규약에 따라 `importlib`로 동적 로드합니다.
규약을 어기면 DI 초기화에서 즉시 실패합니다.

## 검수

1. `pytest backend/tests/contract -k 'fake or real'` 전부 통과
2. `git diff origin/main -- backend/app/domain backend/app/usecases backend/app/api backend/app/ports/dto.py` 빈 diff (CI gate)

## 추가 책임

- alembic 마이그레이션 (`RealLotRepository`용 Postgres DDL)
- contract test 시드 (GOLDEN_DATASET 동치, 99999 사번 hold 3건 + 88888 1건)
- `.env.dev`에 사내 미러 URL 채워서 docker build 통과 검증 (Claude는 외부에서 검증 불가)
