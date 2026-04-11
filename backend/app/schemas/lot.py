from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LotRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    lot_id: str = Field(alias="lotId")
    status: str
    equipment: Optional[str] = None
    process_step: Optional[str] = Field(default=None, alias="processStep")
    hold_comment: Optional[str] = Field(default=None, alias="holdComment")
    updated_at: Optional[datetime] = Field(default=None, alias="updatedAt")


class SlotPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table_id: int = Field(alias="tableId")
    rows: list[LotRow]
    diff: bool = True
    last_updated: Optional[datetime] = Field(default=None, alias="lastUpdated")
