import pytest
from database import engine


@pytest.fixture(scope="session", autouse=True)
async def cleanup_database_engine():
    """Ensure SQLAlchemy connection pool is cleanly disposed at end of test session."""
    yield
    await engine.dispose()
