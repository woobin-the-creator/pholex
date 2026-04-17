from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.config import Settings
from app.core.auth import AuthError, build_dev_claims, extract_claims, validate_id_token


@pytest.fixture()
def rsa_keypair() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def test_build_dev_claims_uses_dev_sso_settings() -> None:
    settings = Settings(
        dev_sso_bypass=True,
        dev_sso_user_id="test001",
        dev_sso_username="테스트엔지니어",
        dev_sso_employee_number="99999",
        dev_sso_auth="ENGINEER",
    )

    claims = build_dev_claims(settings)

    assert claims.employee_id == "test001"
    assert claims.employee_number == "99999"
    assert claims.username == "테스트엔지니어"
    assert claims.auth == "ENGINEER"


def test_extract_claims_raises_when_employee_number_missing() -> None:
    settings = Settings()

    with pytest.raises(AuthError, match="employee number"):
        extract_claims(
            {
                settings.sso_employee_id_claim: "emp-1",
                settings.sso_username_claim: "Alice",
            },
            settings,
        )


def test_validate_id_token_accepts_valid_token(rsa_keypair: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_keypair
    settings = Settings(
        sso_client_id="pholex-dev",
        sso_cert=public_pem,
    )
    payload = {
        "sub": "test001",
        settings.sso_employee_id_claim: "test001",
        settings.sso_employee_number_claim: "99999",
        settings.sso_username_claim: "테스트엔지니어",
        settings.sso_auth_claim: "ENGINEER",
        "nonce": "nonce-123",
        "aud": "pholex-dev",
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(payload, private_pem, algorithm="RS256")

    claims = validate_id_token(token, expected_nonce="nonce-123", settings=settings)

    assert claims.employee_id == "test001"
    assert claims.employee_number == "99999"


def test_validate_id_token_rejects_nonce_mismatch(rsa_keypair: tuple[str, str]) -> None:
    private_pem, public_pem = rsa_keypair
    settings = Settings(
        sso_client_id="pholex-dev",
        sso_cert=public_pem,
    )
    payload = {
        "sub": "test001",
        settings.sso_employee_id_claim: "test001",
        settings.sso_employee_number_claim: "99999",
        settings.sso_username_claim: "테스트엔지니어",
        settings.sso_auth_claim: "ENGINEER",
        "nonce": "other-nonce",
        "aud": "pholex-dev",
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()),
    }
    token = jwt.encode(payload, private_pem, algorithm="RS256")

    with pytest.raises(AuthError, match="nonce"):
        validate_id_token(token, expected_nonce="nonce-123", settings=settings)
