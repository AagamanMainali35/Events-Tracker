from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class EventBase(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100, description="Type/category of the event (e.g. click, login, page_view)")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata or context payload")
    timestamp: Optional[datetime] = Field(default=None, description="Event timestamp (UTC). Defaults to current time if omitted")


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    event_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    payload: Optional[Dict[str, Any]] = None
    timestamp: Optional[datetime] = None


class EventResponse(BaseModel):
    id: str
    user_id: str
    event_type: str
    payload: Dict[str, Any]
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedEventsResponse(BaseModel):
    items: List[EventResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class EventTypeMetric(BaseModel):
    event_type: str
    count: int


class EventAnalyticsResponse(BaseModel):
    total_events_last_24h: int
    event_counts: List[EventTypeMetric]
    since: datetime
