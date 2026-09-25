from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.users import User
from response import error_response
from schemas.users import (
    RefreshTokenRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)
from security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
    get_user,
)

router = APIRouter(prefix="", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    stmt = select(User).where(or_(User.email == payload.email, User.username == payload.username))
    result = await db.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        if existing_user.email == payload.email:
            raise error_response(
                message="Email is already registered",
                status_code=status.HTTP_409_CONFLICT,
            )
        raise error_response(
            message="Username is already taken",
            status_code=status.HTTP_409_CONFLICT,
        )

    # Create new user
    new_user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Generate tokens
    access_token = create_access_token(subject=new_user.id)
    refresh_token = create_refresh_token(subject=new_user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(new_user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    # Find user by email
    stmt = select(User).where(User.email == payload.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise error_response(
            message="Invalid credentials",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        raise error_response(
            message="User account is inactive",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh")
async def refresh_token(payload: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    try:
        decoded = decode_refresh_token(payload.refresh_token)
    except Exception as e:
        raise error_response(
            message=f"Invalid refresh token: {str(e)}",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    user_id = decoded.get("sub")
    if not user_id:
        raise error_response(
            message="Malformed token",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    # Verify user is active
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise error_response(
            message="User not found or inactive",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    new_access_token = create_access_token(subject=user.id)
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_user)):
    return current_user
