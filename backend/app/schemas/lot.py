from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LotRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    lot_id: str = Field(alias="lotId")
    status: str
    equipment: str | None = None
    process_step: str | None = Field(default=None, alias="processStep")
    hold_comment: str | None = Field(default=None, alias="holdComment")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


class SlotPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table_id: int = Field(alias="tableId")
    rows: list[LotRow]
    diff: bool = True
    last_updated: datetime | None = Field(default=None, alias="lastUpdated")

