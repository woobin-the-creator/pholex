from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable

from app.ports.dto import LotChangeEventDTO, LotRowDTO


@runtime_checkable
class LotSource(Protocol):
    """사내 lot 데이터 출처 추상화 (single source of truth).

    polling(`fetch_my_holds`)과 stream(`subscribe_changes`) 두 책임을 묶지만, 둘 다
    *사내 lot 데이터의 단일 외부 시스템* 추상화에 속한다. polling→upsert→event 디스패치
    *내부 일관성*은 이 어댑터가 책임진다. 어댑터가 두 메서드를 다른 백엔드에 위임해도
    되지만, 외부에서 본 행동은 한 시스템처럼 일관해야 한다.

    Canonical 값 매핑 (사내 enum → wire format) 책임은 어댑터에 있다. 알 수 없는 값의
    처리 정책(bucket/filter/log)은 어댑터가 결정한다.
    """

    async def fetch_my_holds(self, employee_number: str) -> list[LotRowDTO]:
        """주어진 사번의 현재 hold lot 전부 반환. 없으면 빈 리스트.

        Contract:
        - 반환된 모든 row의 `is_held_by_me`는 True여야 한다.
        - 반환된 모든 row의 `status`는 "hold"이다.
        - 정렬: lot_id ASC (deterministic).
        - 동일 사번 반복 호출은 동일 결과(idempotent).
        """
        ...

    def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]:
        """주어진 사번에 영향을 주는 변경 이벤트를 비동기 스트리밍.

        Contract:
        - 다중 구독자(같은 사번에 여러 iterator)에게 fan-out으로 동일 이벤트 전달.
        - `event_id`는 동일 source 내에서 unique + 시간 순서 정렬 가능.
        - `previous_status`/`new_status`는 도메인 severity 분류에 사용됨 (어댑터가 채움).
        """
        ...
