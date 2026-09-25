import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import cast, func, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.events import Event
from models.users import User
from schemas.events import (
    EventAnalyticsResponse,
    EventCreate,
    EventResponse,
    EventTypeMetric,
    EventUpdate,
    PaginatedEventsResponse,
)
from security import get_user

router = APIRouter(
    prefix="/api/events",   
    tags=["Events"],
    dependencies=[Depends(get_user)],
)


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    current_user: User = Depends(get_user),
    db: AsyncSession = Depends(get_db),
):
    """Receive an event payload, associate with current logged-in user, and save to database."""
    event_data = {
        "user_id": current_user.id,
        "event_type": payload.event_type,
        "payload": payload.payload,
    }
    if payload.timestamp:
        event_data["timestamp"] = payload.timestamp

    event = Event(**event_data)
    db.add(event)
    await db.commit()
    await db.refresh(event)

    return event

@router.get("/analytics", response_model=EventAnalyticsResponse)
async def get_event_analytics(
    current_user: User = Depends(get_user),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate metrics (event counts per type over the last 24 hours)."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=24)

    # Query event counts grouped by event_type within last 24 hours
    stmt = (
        select(Event.event_type, func.count(Event.id).label("count"))
        .where(Event.timestamp >= since)
        .group_by(Event.event_type)
        .order_by(func.count(Event.id).desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    metrics = [EventTypeMetric(event_type=row.event_type, count=row.count) for row in rows]
    total_events = sum(metric.count for metric in metrics)

    return EventAnalyticsResponse(
        total_events_last_24h=total_events,
        event_counts=metrics,
        since=since,
    )


@router.get("", response_model=PaginatedEventsResponse)
async def list_events(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    search: Optional[str] = Query(None, description="Search query inside payload text or event_type"),
    start_date: Optional[datetime] = Query(None, description="Filter events after this timestamp"),
    end_date: Optional[datetime] = Query(None, description="Filter events before this timestamp"),
    current_user: User = Depends(get_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve events with pagination and filtering options."""
    query = select(Event)
    count_query = select(func.count()).select_from(Event)

    # Filters
    if event_type:
        query = query.where(Event.event_type == event_type)
        count_query = count_query.where(Event.event_type == event_type)

    if user_id:
        query = query.where(Event.user_id == user_id)
        count_query = count_query.where(Event.user_id == user_id)

    if start_date:
        query = query.where(Event.timestamp >= start_date)
        count_query = count_query.where(Event.timestamp >= start_date)

    if end_date:
        query = query.where(Event.timestamp <= end_date)
        count_query = count_query.where(Event.timestamp <= end_date)

    if search:
        search_filter = Event.event_type.ilike(f"%{search}%") | cast(Event.payload, String).ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # Total count
    total = await db.scalar(count_query) or 0
    total_pages = math.ceil(total / limit) if total > 0 else 1

    # Fetch paginated items ordered newest first
    offset = (page - 1) * limit
    paginated_stmt = query.order_by(Event.timestamp.desc()).offset(offset).limit(limit)
    result = await db.execute(paginated_stmt)
    events = result.scalars().all()

    return PaginatedEventsResponse(
        items=[EventResponse.model_validate(e) for e in events],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )
