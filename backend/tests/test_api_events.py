import uuid
import pytest
import httpx
from main import app


def get_client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def create_auth_user(client: httpx.AsyncClient):
    uid = uuid.uuid4().hex[:8]
    email = f"event_tester_{uid}@example.com"
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
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest.mark.asyncio
async def test_create_event_unauthenticated():
    """Test emitting an event without token returns 401 Unauthorized."""
    async with get_client() as client:
        res = await client.post(
            "/api/events",
            json={"event_type": "auth.login_success", "payload": {"ip": "127.0.0.1"}},
        )
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_create_event_authenticated():
    """Test emitting an event with valid token returns 201 and auto-assigns user_id."""
    async with get_client() as client:
        user = await create_auth_user(client)
        unique_key = f"key_{uuid.uuid4().hex[:6]}"
        payload = {"source": "unit_test", "unique_key": unique_key, "amount": 99.5}

        res = await client.post(
            "/api/events",
            headers=user["headers"],
            json={"event_type": "order.checkout_completed", "payload": payload},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["event_type"] == "order.checkout_completed"
        assert data["user_id"] == user["id"]
        assert data["payload"]["unique_key"] == unique_key
        assert "id" in data
        assert "timestamp" in data


@pytest.mark.asyncio
async def test_list_events_pagination():
    """Test GET /api/events returns paginated response with items, total, and pages."""
    async with get_client() as client:
        user = await create_auth_user(client)
        # Emit a test event first to guarantee data presence
        await client.post(
            "/api/events",
            headers=user["headers"],
            json={"event_type": "api.webhook_dispatched", "payload": {"status": 200}},
        )

        res = await client.get(
            "/api/events?page=1&limit=5",
            headers=user["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "limit" in data
        assert "total_pages" in data
        assert data["page"] == 1
        assert data["limit"] == 5
        assert len(data["items"]) <= 5


@pytest.mark.asyncio
async def test_list_events_filter_by_type():
    """Test filtering events by event_type query parameter."""
    async with get_client() as client:
        user = await create_auth_user(client)
        unique_type = f"custom.type_{uuid.uuid4().hex[:6]}"

        # Create event of unique type
        await client.post(
            "/api/events",
            headers=user["headers"],
            json={"event_type": unique_type, "payload": {"tag": "filter_test"}},
        )

        # Query with that type
        res = await client.get(
            f"/api/events?event_type={unique_type}",
            headers=user["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        for item in data["items"]:
            assert item["event_type"] == unique_type


@pytest.mark.asyncio
async def test_list_events_search_query():
    """Test searching events by payload text content."""
    async with get_client() as client:
        user = await create_auth_user(client)
        unique_search_token = f"search_token_{uuid.uuid4().hex[:8]}"

        await client.post(
            "/api/events",
            headers=user["headers"],
            json={
                "event_type": "user.profile_updated",
                "payload": {"memo": unique_search_token},
            },
        )

        res = await client.get(
            f"/api/events?search={unique_search_token}",
            headers=user["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 1
        matched = any(unique_search_token in str(item["payload"]) for item in data["items"])
        assert matched is True


@pytest.mark.asyncio
async def test_get_event_analytics_24h():
    """Test GET /api/events/analytics returns 24h aggregate metrics."""
    async with get_client() as client:
        user = await create_auth_user(client)
        event_type = "auth.login_success"
        await client.post(
            "/api/events",
            headers=user["headers"],
            json={"event_type": event_type, "payload": {"ip": "10.0.0.1"}},
        )

        res = await client.get(
            "/api/events/analytics",
            headers=user["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert "total_events_last_24h" in data
        assert "event_counts" in data
        assert "since" in data
        assert isinstance(data["event_counts"], list)
        assert data["total_events_last_24h"] >= 1
