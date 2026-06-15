from __future__ import annotations

from dataclasses import dataclass

from app.domain.keyword import query_from_config
from app.ports.dto import LotRowDTO
from app.ports.lot_repository import LotRepository


@dataclass(frozen=True, slots=True)
class SearchResult:
    rows: list[LotRowDTO]
    total: int
    page: int
    page_size: int


class SearchSpecialHold:
    """DNF config(즉석 드래프트 또는 프리셋)로 lot_status 검색 + 페이지네이션.

    정렬·dedup은 LotRepository.search가 책임진다(updated_at DESC, lot_id dedup).
    """

    DEFAULT_PAGE_SIZE = 100
    MAX_PAGE_SIZE = 500

    def __init__(self, lots: LotRepository) -> None:
        self._lots = lots

    async def execute(
        self, config: dict, *, page: int = 1, page_size: int = DEFAULT_PAGE_SIZE
    ) -> SearchResult:
        query = query_from_config(config)  # KeywordError if invalid
        page = max(1, page)
        page_size = max(1, min(page_size, self.MAX_PAGE_SIZE))
        offset = (page - 1) * page_size
        rows, total = await self._lots.search(query, limit=page_size, offset=offset)
        return SearchResult(rows=rows, total=total, page=page, page_size=page_size)
