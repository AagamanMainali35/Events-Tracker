import uuid
import pytest
import httpx
from main import app


def get_client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def create_unique_user(client: httpx.AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"auth_test_{uid}@example.com"
    username = f"user_{uid}"
    password = "StrongPassword#123"

    res = await client.post(
        "/register",
        json={"email": email, "username": username, "password": password},
    )
    assert res.status_code == 201
    data = res.json()
    return {
        "id": data["user"]["id"],
        "email": email,
        "username": username,
        "password": password,
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest.mark.asyncio
async def test_register_success():
    """Test successful user registration returns 201 with access and refresh tokens."""
    async with get_client() as client:
        uid = uuid.uuid4().hex[:8]
        email = f"user_{uid}@example.com"
        username = f"user_{uid}"
        password = "StrongPassword#123"

        res = await client.post(
            "/register",
            json={"email": email, "username": username, "password": password},
        )
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == email
        assert data["user"]["username"] == username
        assert "id" in data["user"]


@pytest.mark.asyncio
async def test_register_duplicate_email():
    """Test registering with an existing email returns 409 conflict."""
    async with get_client() as client:
        user = await create_unique_user(client)
        res = await client.post(
            "/register",
            json={
                "email": user["email"],
                "username": f"diff_user_{uuid.uuid4().hex[:6]}",
                "password": "ValidPassword123!",
            },
        )
        assert res.status_code == 409
        data = res.json()
        assert "already registered" in str(data).lower()


@pytest.mark.asyncio
async def test_register_duplicate_username():
    """Test registering with an existing username returns 409 conflict."""
    async with get_client() as client:
        user = await create_unique_user(client)
        res = await client.post(
            "/register",
            json={
                "email": f"diff_email_{uuid.uuid4().hex[:6]}@example.com",
                "username": user["username"],
                "password": "ValidPassword123!",
            },
        )
        assert res.status_code == 409
        data = res.json()
        assert "already taken" in str(data).lower()


@pytest.mark.asyncio
async def test_login_success():
    """Test login with valid email and password returns 200 with tokens."""
    async with get_client() as client:
        user = await create_unique_user(client)
        res = await client.post(
            "/login",
            json={"email": user["email"], "password": user["password"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["user"]["email"] == user["email"]


@pytest.mark.asyncio
async def test_login_wrong_password():
    """Test login with incorrect password returns 401 unauthorized."""
    async with get_client() as client:
        user = await create_unique_user(client)
        res = await client.post(
            "/login",
            json={"email": user["email"], "password": "WrongPassword!999"},
        )
        assert res.status_code == 401
        data = res.json()
        assert "invalid" in str(data).lower() or "credentials" in str(data).lower()


@pytest.mark.asyncio
async def test_login_nonexistent_email():
    """Test login with nonexistent email returns 401 unauthorized."""
    async with get_client() as client:
        res = await client.post(
            "/login",
            json={"email": "nobody_exists_12345@example.com", "password": "AnyPassword123!"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_success():
    """Test refreshing an access token using a valid refresh token."""
    async with get_client() as client:
        user = await create_unique_user(client)
        res = await client.post(
            "/refresh",
            json={"refresh_token": user["refresh_token"]},
        )
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_refresh_token_invalid():
    """Test refreshing with an invalid or malformed token returns 401."""
    async with get_client() as client:
        res = await client.post(
            "/refresh",
            json={"refresh_token": "invalid.jwt.token.structure"},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated():
    """Test GET /me returns the current user profile when authenticated."""
    async with get_client() as client:
        user = await create_unique_user(client)
        res = await client.get("/me", headers=user["headers"])
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == user["id"]
        assert data["email"] == user["email"]
        assert data["username"] == user["username"]


@pytest.mark.asyncio
async def test_get_me_unauthenticated():
    """Test GET /me returns 401 when no Authorization header is provided."""
    async with get_client() as client:
        res = await client.get("/me")
        assert res.status_code == 401
