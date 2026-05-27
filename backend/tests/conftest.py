from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("ADAPTER_MODE", "fake")
os.environ.setdefault("DEV_SSO_BYPASS", "true")

import pytest

from app.di import container as di


@pytest.fixture(autouse=True)
def _reset_di_cache():
    di.reset_for_tests()
    yield
    di.reset_for_tests()
