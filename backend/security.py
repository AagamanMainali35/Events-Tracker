# security.py
from datetime import datetime, timedelta, timezone
from typing import Any

from decouple import config
from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.users import User
from response import error_response

SECRET_KEY = config("SECRET_KEY")
ALGORITHM = config("ALGORITHM", default="HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = config("ACCESS_TOKEN_EXPIRE_MINUTES", default=30, cast=int)
REFRESH_TOKEN_EXPIRE_DAYS = config("REFRESH_TOKEN_EXPIRE_DAYS", default=7, cast=int)

_password_hash = PasswordHash.recommended()
http_bearer = HTTPBearer(auto_error=False)


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


async def get_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(http_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency to extract token, verify user, and load User object from DB."""
    # 1. Check if user was already set by middleware
    user_id = getattr(request.state, "user", None)

    # 2. Or decode from Authorization header
    if not user_id:
        if not credentials or not credentials.credentials:
            raise error_response(
                message="Authentication Token missing",
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            payload = decode_access_token(credentials.credentials)
            user_id = payload.get("sub")
        except ExpiredSignatureError:
            raise error_response(
                message="Token has expired",
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": "Bearer"},
            )
        except InvalidTokenError:
            raise error_response(
                message="Invalid token",
                status_code=status.HTTP_401_UNAUTHORIZED,
                headers={"WWW-Authenticate": "Bearer"},
            )

    if not user_id:
        raise error_response(
            message="Invalid token payload",
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load User from DB
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise error_response(
            message="User not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    if not user.is_active:
        raise error_response(
            message="User account is inactive",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    return user