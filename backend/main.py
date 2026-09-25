import os
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

from controller.auth import router as auth_router
from controller.events import router as events_router
from middleware import JWTAuthMiddleware
from rate_limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Load models into SQLAlchemy registry
import models.events
import models.users

load_dotenv()

app = FastAPI(title="EventsAPI")

# Attach slowapi limiter & exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS setup
origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

# Middleware pipeline: CORS -> SlowAPI -> JWTAuth
app.add_middleware(JWTAuthMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(events_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

