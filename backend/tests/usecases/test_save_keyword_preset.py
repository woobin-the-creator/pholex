from __future__ import annotations

import pytest

from app.adapters.fake.keyword_preset_repository import InMemoryKeywordPresetRepository
from app.domain.keyword import KeywordError
from app.usecases.save_keyword_preset import SaveKeywordPreset

_CFG = {"groups": [{"conditions": [{"field": "equipment", "value": "  ETCH "}]}]}


@pytest.mark.asyncio
async def test_create_trims_name_and_normalizes_config():
    uc = SaveKeywordPreset(InMemoryKeywordPresetRepository())
    p = await uc.execute("99999", name="  my preset ", config=_CFG)
    assert p.name == "my preset"
    assert p.config == {"groups": [{"conditions": [{"field": "equipment", "value": "ETCH"}]}]}


@pytest.mark.asyncio
async def test_create_rejects_empty_name():
    uc = SaveKeywordPreset(InMemoryKeywordPresetRepository())
    with pytest.raises(ValueError):
        await uc.execute("99999", name="   ", config=_CFG)


@pytest.mark.asyncio
async def test_create_rejects_invalid_config():
    uc = SaveKeywordPreset(InMemoryKeywordPresetRepository())
    bad = {"groups": [{"conditions": [{"field": "nope", "value": "x"}]}]}
    with pytest.raises(KeywordError):
        await uc.execute("99999", name="p", config=bad)


@pytest.mark.asyncio
async def test_update_overwrites_existing():
    repo = InMemoryKeywordPresetRepository()
    uc = SaveKeywordPreset(repo)
    p = await uc.execute("99999", name="a", config=_CFG)
    p2 = await uc.execute("99999", name="b", config=_CFG, preset_id=p.id)
    assert p2.id == p.id and p2.name == "b"


@pytest.mark.asyncio
async def test_update_missing_raises_keyerror():
    uc = SaveKeywordPreset(InMemoryKeywordPresetRepository())
    with pytest.raises(KeyError):
        await uc.execute("99999", name="b", config=_CFG, preset_id=999)
