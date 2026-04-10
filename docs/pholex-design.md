# Pholex 프로젝트 설계 문서

> 제조 랏(Lot) 모니터링 대시보드

이 파일은 인덱스입니다. AI에게 특정 기능을 구현시킬 때는 해당 영역의 문서만 읽히세요.

---

## 문서 구성

| 파일 | 내용 | 포함 섹션 |
|------|------|-----------|
| [overview.md](overview.md) | 프로젝트 개요, 기술 스택 & 결정 근거, 시스템 아키텍처, 수용 기준, 리스크, 구현 우선순위 | 1, 2, 3, 10, 11, 12 |
| [backend.md](backend.md) | DB 설계(Redis/PostgreSQL), 백엔드 구조, 실시간 데이터 흐름, WebSocket 프로토콜 전체 | 4, 6, 7, 8 |
| [frontend.md](frontend.md) | 프론트엔드 구조, Jotai atomFamily 패턴, WebSocket 클라이언트 메시지, 디자인 시스템 | 5, 8(client), 13 |
| [infra.md](infra.md) | Docker Swarm 배포, Nginx WebSocket 설정, 환경 분리(Beta/Dev), 배포 스크립트 | 9, 14 |

---

## 빠른 참조

- **백엔드 기능 구현** → `backend.md`
- **프론트엔드 컴포넌트 구현** → `frontend.md`
- **인프라/배포 설정** → `infra.md`
- **전체 맥락 파악 / 기술 스택 이유** → `overview.md`
