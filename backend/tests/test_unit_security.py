import pytest
from datetime import timedelta
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    decode_token,
)
from response import error_dict, error_response, success_response


def test_password_hashing():
    """Unit test: Password hashing and verification."""
    password = "SuperSecretPassword#123"
    hashed = hash_password(password)

    # Hash should not equal plain password
    assert hashed != password
    # Verification should succeed for correct password
    assert verify_password(password, hashed) is True
    # Verification should fail for incorrect password
    assert verify_password("WrongPassword#999", hashed) is False


def test_access_token_creation_and_decoding():
    """Unit test: Creating and decoding a valid JWT access token."""
    user_id = "user-uuid-12345"
    token = create_access_token(subject=user_id, extra_claims={"role": "admin"})

    payload = decode_access_token(token)
    assert payload["sub"] == user_id
    assert payload["type"] == "access"
    assert payload["role"] == "admin"
    assert "exp" in payload
    assert "iat" in payload


def test_refresh_token_creation_and_decoding():
    """Unit test: Creating and decoding a valid JWT refresh token."""
    user_id = "user-uuid-99999"
    token = create_refresh_token(subject=user_id)

    payload = decode_refresh_token(token)
    assert payload["sub"] == user_id
    assert payload["type"] == "refresh"


def test_token_type_mismatch_raises_error():
    """Unit test: Access token should fail when decoded as refresh token and vice versa."""
    user_id = "user-uuid-abcde"
    access_token = create_access_token(subject=user_id)
    refresh_token = create_refresh_token(subject=user_id)

    # Decoding access token as refresh token must raise InvalidTokenError
    with pytest.raises(InvalidTokenError):
        decode_refresh_token(access_token)

    # Decoding refresh token as access token must raise InvalidTokenError
    with pytest.raises(InvalidTokenError):
        decode_access_token(refresh_token)


def test_expired_token_raises_error():
    """Unit test: Token with negative expiration raises ExpiredSignatureError."""
    user_id = "user-expired-000"
    # Create token expired 10 minutes ago
    token = create_access_token(subject=user_id, expires_minutes=-10)

    with pytest.raises(ExpiredSignatureError):
        decode_access_token(token)


def test_response_utilities():
    """Unit test: Standardized response helpers in response.py."""
    # error_dict test
    err = error_dict(message="Validation failed", status_code=422, detail={"field": "email"})
    assert err["status_code"] == 422
    assert err["message"] == "Validation failed"
    assert err["detail"]["field"] == "email"

    # error_response test
    exc = error_response(message="Not found", status_code=404, detail="Entity missing")
    assert exc.status_code == 404
    assert exc.detail["message"] == "Not found"
    assert exc.detail["status_code"] == 404
    assert exc.detail["detail"] == "Entity missing"

    # success_response test
    suc = success_response(data={"item": 1}, message="Created", status_code=201)
    assert suc["status_code"] == 201
    assert suc["message"] == "Created"
    assert suc["data"]["item"] == 1
