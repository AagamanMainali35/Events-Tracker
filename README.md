  # Real-Time Event Dashboard & API (PulseStream)

  A production-grade, full-stack event ingestion, monitoring, and analytics platform built with **FastAPI**, **PostgreSQL**, **Alembic**, and **React**.

  ---

  ## Table of Contents
  - [Architecture Overview](#architecture-overview)
  - [Key Features](#key-features)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Setup & Installation](#setup--installation)
  - [Running the Application](#running-the-application)
  - [Database Migrations](#database-migrations)
  - [API Reference](#api-reference)
    - [Authentication](#authentication)
    - [Events Ingestion & Querying](#events-ingestion--querying)
    - [Analytics](#analytics)
    - [Health Check](#health-check)
  - [Rate Limiting & Security](#rate-limiting--security)
  - [Error Handling Strategy](#error-handling-strategy)
  - [Design Decisions & Trade-Offs](#design-decisions--trade-offs)
  - [Testing](#testing)

  ---

  ## Architecture Overview

  ```
                ┌─────────────────────────┐
                │    React + Vite Client  │
                │   (Tailwind CSS, Inter) │
                └────────────┬────────────┘
                              │ HTTP / JSON (Bearer JWT)
                              ▼
                ┌─────────────────────────┐
                │       FastAPI API       │
                │ (SlowAPI Rate Limiter)  │
                └────────────┬────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
  ┌───────────────────────────┐ ┌───────────────────────────┐
  │     JWT Auth / Users      │ │    Events & Analytics     │
  │   (Argon2 Password Hash)  │ │ (Async SQLAlchemy 2.0)    │
  └─────────────┬─────────────┘ └─────────────┬─────────────┘
                │                             │
                └──────────────┬──────────────┘
                              ▼
                ┌─────────────────────────┐
                │    PostgreSQL Database  │
                │  (asyncpg connection)   │
                └─────────────────────────┘
  ```

  1. **Client Tier**: React SPA with live feed polling, dynamic event filtering, and aggregated analytics visualization.
  2. **Gateway / Security Tier**: SlowAPI rate limiting (IP-based, 30 req/min default), CORS middleware, and custom JWT Bearer token authentication.
  3. **Application Tier**: Asynchronous FastAPI endpoints using modern SQLAlchemy 2.0 `select()` and async sessions.
  4. **Data Tier**: PostgreSQL database running schema migrations via Alembic.

  ---

  ## Key Features

  - **Ingestion API**: `POST /api/events` automatically attaches server-generated UUID primary keys, UTC timestamps, and the authenticated user's ID.
  - **Dynamic Event Querying**: `GET /api/events` supports:
    - Cursor/Offset pagination (`page`, `limit`).
    - Event type filtering (`event_type`).
    - User filtering (`user_id`).
    - Text search across event types and JSON payloads (`search`).
    - Timestamp range filtering (`start_date`, `end_date`).
  - **Real-Time Analytics**: `GET /api/events/analytics` aggregates 24-hour event volumes grouped by type for fast metric cards.
  - **Authentication**: JWT-based stateless auth featuring separate Access & Refresh tokens, Argon2 password hashing, and active user verification.
  - **Rate Limiting**: IP-based rate limiting via SlowAPI preventing endpoint abuse and DDoS spikes.
  - **Consistent Responses**: Centralized response utility (`response.py`) ensuring uniform error structures without intrusive global monkey-patching.

  ---

  ## Tech Stack

  ### Backend
  - **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.12+)
  - **ASGI Server**: [Uvicorn](https://www.uvicorn.org/)
  - **Database Driver**: [asyncpg](https://github.com/MagicStack/asyncpg) (Async PostgreSQL)
  - **ORM**: [SQLAlchemy 2.0](https://www.sqlalchemy.org/) (Async Engine & Declarative Base)
  - **Migrations**: [Alembic](https://alembic.sqlalchemy.org/)
  - **Authentication & Security**: PyJWT, `pwdlib` with Argon2
  - **Rate Limiting**: [SlowAPI](https://github.com/laurentS/slowapi)
  - **Package Manager**: [uv](https://github.com/astral-sh/uv)

  ### Frontend
  - **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
  - **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
  - **Typography & Icons**: Google Fonts (Inter, JetBrains Mono) & Google Material Symbols Outlined
  - **HTTP Client**: Axios

  ---

  ## Project Structure

  ```
  .
  ├── backend/
  │   ├── alembic/              # Database migration environments & revisions
  │   ├── controller/
  │   │   ├── auth.py           # Register, Login, Refresh, Me endpoints
  │   │   └── events.py         # Events Ingestion, Querying, Analytics
  │   ├── models/
  │   │   ├── events.py         # Event SQLAlchemy model (UUID, payload, indexes)
  │   │   └── users.py          # User SQLAlchemy model (email, password hash)
  │   ├── schemas/
  │   │   ├── events.py         # Pydantic schemas for events & analytics
  │   │   └── users.py          # Pydantic schemas for auth & user profiles
  │   ├── database.py           # Async SQLAlchemy engine & session factory
  │   ├── main.py               # FastAPI application setup & middleware assembly
  │   ├── middleware.py         # Custom JWT authorization middleware
  │   ├── rate_limiter.py       # SlowAPI limiter instance
  │   ├── response.py           # Standardized error & success response builders
  │   ├── security.py           # Password hashing, JWT token generation & verification
  │   ├── alembic.ini           # Alembic configuration
  │   ├── pyproject.toml        # Backend dependencies managed with uv
  │   └── .env                  # Backend environment variables
  ├── frontend/
  │   ├── src/
  │   │   ├── pages/
  │   │   │   └── Home.jsx      # Dashboard feed, filters, metrics, and event ingest modal
  │   │   ├── api.js            # Axios client with base URL & auth headers
  │   │   ├── App.jsx           # App shell
  │   │   └── main.jsx          # Vite React entry point
  │   ├── package.json
  │   └── vite.config.js
  ├── makefile                  # Developer commands
  ├── .gitignore
  └── README.md
  ```

  ---

  ## Prerequisites

  - **Python**: 3.12 or newer
  - **uv**: Fast Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
  - **Node.js**: 20+ and `npm`
  - **PostgreSQL**: 15+ running locally or remotely

  ---

  ## Environment Configuration

  Create a `.env` file inside `backend/.env` with the following variables:

  ```env
  # Database Connection (Asyncpg)
  DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/interview_db

  # Security & JWT
  SECRET_KEY=your-super-secret-random-32-byte-key
  ALGORITHM=HS256
  ACCESS_TOKEN_EXPIRE_MINUTES=30
  REFRESH_TOKEN_EXPIRE_DAYS=7

  # CORS Allowed Origins (Comma-separated)
  CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
  ```

  ---

  ## Setup & Installation

  ### 1. Clone the repository
  ```bash
  git clone <repository_url>
  cd Interview-project
  ```

  ### 2. Backend Dependencies
  Using `uv`:
  ```bash
  cd backend
  uv sync
  cd ..
  ```

  ### 3. Frontend Dependencies
  ```bash
  cd frontend
  npm install
  cd ..
  ```

  ---

  ## Running the Application

  A convenient [makefile](file:///home/momoskar/Documents/Interview-project/makefile) is provided at the repository root:

  | Command | Action |
  |---|---|
  | `make runb` | Runs the FastAPI backend server on `http://0.0.0.0:8000` with auto-reload |
  | `make runf` | Runs the React / Vite frontend on `http://localhost:5173` |
  | `make makemigrations m="description"` | Generates a new Alembic migration revision |
  | `make migrate` | Applies all pending migrations (`alembic upgrade head`) |
  | `make downgrade` | Rolls back the latest migration (`alembic downgrade -1`) |
  | `make test` | Executes backend unit/integration tests with `pytest` |
  | `make lint` | Checks code formatting and lint rules with `ruff` |

  ---

  ## Database Migrations

  Apply current database migrations to create the `users` and `events` tables with foreign keys and indexes:

  ```bash
  make migrate
  ```

  To create a new migration after editing models in `backend/models/`:
  ```bash
  make makemigrations m="add_new_field"
  make migrate
  ```

  ---

  ## API Reference

  Interactive Swagger documentation is available at: **`http://localhost:8000/docs`**

  ### Authentication

  #### `POST /register`
  Creates a new user account.
  ```json
  // Request Body
  {
    "email": "dev@example.com",
    "username": "developer",
    "password": "StrongPassword123!"
  }

  // Response (201 Created)
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": "60d13230-5e51-4f47-9951-abf03cbbaf38",
      "email": "dev@example.com",
      "username": "developer",
      "is_active": true,
      "created_at": "2026-09-25T09:48:47.382410Z"
    }
  }
  ```

  #### `POST /login`
  Authenticates user credentials and issues tokens.
  ```json
  // Request Body
  {
    "email": "dev@example.com",
    "password": "StrongPassword123!"
  }

  // Response (200 OK)
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": { ... }
  }
  ```

  #### `POST /refresh`
  Generates a new access token using a valid refresh token.
  ```json
  // Request Body
  {
    "refresh_token": "eyJhbGciOi..."
  }
  ```

  #### `GET /me`
  Retrieves current authenticated user's profile. Requires `Authorization: Bearer <access_token>`.

  ---

  ### Events Ingestion & Querying

  All `/api/events` endpoints require `Authorization: Bearer <access_token>`.

  #### `POST /api/events`
  Ingests an event payload. The server generates the UUID and links `user_id` from the JWT token.
  ```json
  // Request Body
  {
    "event_type": "order.checkout_completed",
    "payload": {
      "order_id": "ORD-94281",
      "total": 149.99,
      "currency": "USD"
    },
    "timestamp": "2026-09-25T15:30:00Z" // Optional, defaults to now()
  }

  // Response (201 Created)
  {
    "id": "a988dd22-0a25-4c07-b01c-6d9d15065e9d",
    "user_id": "60d13230-5e51-4f47-9951-abf03cbbaf38",
    "event_type": "order.checkout_completed",
    "payload": { "order_id": "ORD-94281", "total": 149.99, "currency": "USD" },
    "timestamp": "2026-09-25T15:30:00Z"
  }
  ```

  #### `GET /api/events`
  Fetches paginated events with optional filters.

  | Query Param | Type | Description |
  |---|---|---|
  | `page` | `int` (default `1`) | Current page number (1-indexed) |
  | `limit` | `int` (default `20`, max `100`) | Items per page |
  | `event_type` | `string` | Filter by exact event type (e.g. `auth.login_success`) |
  | `user_id` | `UUID` | Filter events generated by a specific user |
  | `search` | `string` | Case-insensitive search on event type or JSON payload |
  | `start_date` | `ISO 8601` | Filter events occurring on or after timestamp |
  | `end_date` | `ISO 8601` | Filter events occurring on or before timestamp |

  ```json
  // Response (200 OK)
  {
    "items": [ ... ],
    "total": 128,
    "page": 1,
    "limit": 20,
    "total_pages": 7
  }
  ```

  ---

  ### Analytics

  #### `GET /api/events/analytics`
  Calculates aggregated metrics over the trailing 24 hours.

  ```json
  // Response (200 OK)
  {
    "total_events_last_24h": 342,
    "event_counts": [
      { "event_type": "order.checkout_completed", "count": 180 },
      { "event_type": "auth.login_success", "count": 120 },
      { "event_type": "billing.payment_failed", "count": 42 }
    ],
    "since": "2026-09-24T15:30:00Z"
  }
  ```

  ---

  ### Health Check

  #### `GET /health`
  Returns system status (`{"status": "ok"}`).

  ---

  ## Rate Limiting & Security

  1. **SlowAPI Rate Limiter**: 
    - Uses remote client IP as key.
    - Configured with global defaults (`30 requests/minute`) on the events router.
    - Returns standard `429 Too Many Requests` when limits are exceeded.
  2. **Password Hashing**:
    - Uses modern **Argon2** via `pwdlib`, resistant against GPU brute-forcing.
  3. **Token Architecture**:
    - Access tokens have short validity (default 30 mins) carrying `sub` and `type="access"`.
    - Refresh tokens (default 7 days) are strictly checked for `type="refresh"`.

  ---

  ## Error Handling Strategy

  Instead of complex global interception that hides context, errors are returned via [backend/response.py](file:///home/momoskar/Documents/Interview-project/backend/response.py):

  ```python
  from response import error_response

  # Uniform error generation
  raise error_response(
      message="Invalid credentials",
      status_code=401,
      detail="The password entered is incorrect."
  )
  ```

  **Standard Error Response Body:**
  ```json
  {
    "detail": {
      "status_code": 401,
      "message": "Invalid credentials",
      "detail": "The password entered is incorrect."
    }
  }
  ```

  ---

  ## Design Decisions & Trade-Offs

  1. **Asyncpg vs Sync Psycopg**:
    - *Decision*: Adopted `asyncpg` with async SQLAlchemy sessions.
    - *Rationale*: High-throughput event ingestion endpoints benefit significantly from non-blocking I/O during database transactions.
  2. **Server-Generated UUIDs & Server-Assigned User IDs**:
    - *Decision*: Ingestion payload does not accept client-provided `id` or `user_id`.
    - *Rationale*: Prevents ID spoofing, UUID collisions, and ensures events are cryptographically attributed to the logged-in token subject.
  3. **Database Indexing**:
    - B-tree indexes added on `events.timestamp`, `events.event_type`, and `events.user_id` for fast pagination, analytics filtering, and sorting.
  4. **Offset Pagination vs Keyset Cursor**:
    - *Decision*: Offset pagination with page number and limit.
    - *Rationale*: Simplifies direct page navigation in the UI dashboard while remaining fast with indexes for typical query volumes.
  ---

  ## Testing

  Execute backend automated tests:

  ```bash
  make test
  ```
  Or directly:
  ```bash
  cd backend && uv run pytest -v
  ```
