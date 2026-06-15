from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import (
    delete_keyword_preset_uc,
    list_keyword_presets_uc,
    require_session,
    save_keyword_preset_uc,
)
from app.api.wire import keyword_preset_to_wire
from app.domain.keyword import KeywordError
from app.domain.session import SessionUser
from app.usecases.delete_keyword_preset import DeleteKeywordPreset
from app.usecases.list_keyword_presets import ListKeywordPresets
from app.usecases.save_keyword_preset import SaveKeywordPreset


router = APIRouter(prefix="/api/keyword-presets", tags=["keyword-presets"])


class PresetBody(BaseModel):
    # 프론트는 camelCase(isDefault)로 보낸다. snake_case도 허용(populate_by_name).
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str
    config: dict
    is_default: bool = Field(default=False, alias="isDefault")


@router.get("")
async def list_presets(
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[ListKeywordPresets, Depends(list_keyword_presets_uc)],
) -> dict:
    presets = await uc.execute(session.employee_number)
    return {"presets": [keyword_preset_to_wire(p) for p in presets]}


@router.post("")
async def create_preset(
    body: PresetBody,
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[SaveKeywordPreset, Depends(save_keyword_preset_uc)],
) -> dict:
    try:
        preset = await uc.execute(
            session.employee_number, name=body.name, config=body.config, is_default=body.is_default
        )
    except (KeywordError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return keyword_preset_to_wire(preset)


@router.put("/{preset_id}")
async def update_preset(
    preset_id: int,
    body: PresetBody,
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[SaveKeywordPreset, Depends(save_keyword_preset_uc)],
) -> dict:
    try:
        preset = await uc.execute(
            session.employee_number,
            name=body.name,
            config=body.config,
            is_default=body.is_default,
            preset_id=preset_id,
        )
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="preset not found")
    except (KeywordError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return keyword_preset_to_wire(preset)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(
    preset_id: int,
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[DeleteKeywordPreset, Depends(delete_keyword_preset_uc)],
) -> None:
    await uc.execute(session.employee_number, preset_id)
