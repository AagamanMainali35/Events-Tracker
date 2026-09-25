import pytest
import httpx
from main import app


@pytest.mark.asyncio
async def test_health_check_endpoint():
    """Test GET /health returns 200 and {'status': 'ok'}."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_rate_limiter_headers_present():
    """Test that responses include SlowAPI rate-limiting headers."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        headers_lower = {k.lower(): v for k, v in res.headers.items()}
        assert "x-ratelimit-limit" in headers_lower
        assert "x-ratelimit-remaining" in headers_lower
        assert "x-ratelimit-reset" in headers_lower
