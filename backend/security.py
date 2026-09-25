# security.py
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from pwdlib import PasswordHash
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from decouple import config

SECRET_KEY = config("SECRET_KEY") 
ALGORITHM = config("ALGORITHM", default="HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = config("ACCESS_TOKEN_EXPIRE_MINUTES", default=30, cast=int)
REFRESH_TOKEN_EXPIRE_DAYS = config("REFRESH_TOKEN_EXPIRE_DAYS", default=7, cast=int)



_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Hash a plaintext password. Store the result in the DB."""
    return _password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plaintext password against a stored hash."""
    return _password_hash.verify(plain_password, hashed_password)

def create_access_token(
    subject: str,
    extra_claims: dict[str, Any] | None = None,
    expires_minutes: int | None = None,
) -> str:
    """Create a signed JWT access token."""
    now = datetime.now(timezone.utc)
    minutes = expires_minutes if expires_minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES

    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": now, 
        "exp": now + timedelta(minutes=minutes),
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: str, expires_days: int | None = None) -> str:
    """Create a longer-lived refresh token."""
    now = datetime.now(timezone.utc)
    days = expires_days if expires_days is not None else REFRESH_TOKEN_EXPIRE_DAYS

    payload = {
        "sub": str(subject),
        "iat": now,
        "exp": now + timedelta(days=days),
        "type": "refresh",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    """Decode and verify a JWT."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    if expected_type is not None and payload.get("type") != expected_type:
        raise InvalidTokenError(f"Expected token type '{expected_type}'")

    return payload


def decode_access_token(token: str) -> dict[str, Any]:
    return decode_token(token, expected_type="access")


def decode_refresh_token(token: str) -> dict[str, Any]:
    return decode_token(token, expected_type="refresh")