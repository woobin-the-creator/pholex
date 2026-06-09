from __future__ import annotations


class InMemoryLotWatchlistRepository:
    """Fake LotWatchlistRepository — 사번별 ordered lot_id 리스트 인메모리 저장."""

    def __init__(self) -> None:
        self._by_employee: dict[str, list[str]] = {}

    async def save(self, employee_number: str, lot_ids: list[str]) -> None:
        # 전체 교체: 받은 리스트의 복사본으로 통째 대체 (빈 리스트면 비움)
        self._by_employee[employee_number] = list(lot_ids)

    async def get(self, employee_number: str) -> list[str]:
        return list(self._by_employee.get(employee_number, []))
