from app.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret")
    assert h != "s3cret"
    assert verify_password("s3cret", h) is True
    assert verify_password("wrong", h) is False


def test_token_roundtrip():
    token = create_access_token("user@example.com")
    assert decode_token(token) == "user@example.com"


def test_decode_bad_token_returns_none():
    assert decode_token("not-a-real-token") is None
