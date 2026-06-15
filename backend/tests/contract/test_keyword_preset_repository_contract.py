from __future__ import annotations

import pytest

_CFG = {"groups": [{"conditions": [{"field": "equipment", "value": "ETCH"}]}]}


@pytest.mark.asyncio
async def test_list_empty(keyword_preset_repository):
    assert await keyword_preset_repository.list_by_employee("99999") == []


@pytest.mark.asyncio
async def test_create_then_get_and_list(keyword_preset_repository):
    p = await keyword_preset_repository.create("99999", "p1", _CFG, is_default=False)
    assert p.id is not None
    got = await keyword_preset_repository.get("99999", p.id)
    assert got is not None and got.name == "p1" and got.config == _CFG
    listed = await keyword_preset_repository.list_by_employee("99999")
    assert [x.id for x in listed] == [p.id]


@pytest.mark.asyncio
async def test_get_other_employee_returns_none(keyword_preset_repository):
    p = await keyword_preset_repository.create("99999", "p1", _CFG, is_default=False)
    assert await keyword_preset_repository.get("88888", p.id) is None


@pytest.mark.asyncio
async def test_create_default_clears_previous_default(keyword_preset_repository):
    a = await keyword_preset_repository.create("99999", "a", _CFG, is_default=True)
    b = await keyword_preset_repository.create("99999", "b", _CFG, is_default=True)
    presets = {x.id: x for x in await keyword_preset_repository.list_by_employee("99999")}
    assert presets[a.id].is_default is False
    assert presets[b.id].is_default is True


@pytest.mark.asyncio
async def test_update_overwrites(keyword_preset_repository):
    p = await keyword_preset_repository.create("99999", "a", _CFG, is_default=False)
    new_cfg = {"groups": [{"conditions": [{"field": "status", "value": "Hold"}]}]}
    updated = await keyword_preset_repository.update(
        "99999", p.id, name="a2", config=new_cfg, is_default=True
    )
    assert updated.name == "a2" and updated.config == new_cfg and updated.is_default is True


@pytest.mark.asyncio
async def test_update_missing_raises(keyword_preset_repository):
    with pytest.raises(KeyError):
        await keyword_preset_repository.update(
            "99999", 9999, name="x", config=_CFG, is_default=False
        )


@pytest.mark.asyncio
async def test_delete_is_idempotent(keyword_preset_repository):
    p = await keyword_preset_repository.create("99999", "a", _CFG, is_default=False)
    await keyword_preset_repository.delete("99999", p.id)
    await keyword_preset_repository.delete("99999", p.id)  # 두 번째도 조용히 무시
    assert await keyword_preset_repository.get("99999", p.id) is None


@pytest.mark.asyncio
async def test_isolated_per_employee(keyword_preset_repository):
    await keyword_preset_repository.create("99999", "mine", _CFG, is_default=False)
    await keyword_preset_repository.create("88888", "theirs", _CFG, is_default=False)
    mine = await keyword_preset_repository.list_by_employee("99999")
    assert [p.name for p in mine] == ["mine"]
