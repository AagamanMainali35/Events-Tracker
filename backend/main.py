import os
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

from controller.auth import router as auth_router
from middleware import JWTAuthMiddleware

# Load models into SQLAlchemy registry
import models.events
import models.users

load_dotenv()

app = FastAPI(title="EventsAPI")

# CORS setup
origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

# Middleware (CORS applied outermost, then JWTAuthMiddleware)
app.add_middleware(JWTAuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}

