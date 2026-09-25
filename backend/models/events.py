import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def generate_uuid_str() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=generate_uuid_str,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    payload: Mapped[Dict[str, Any]] = mapped_column(
        JSONB(),
        nullable=False,
        default=dict,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="events")

    __table_args__ = (
        Index("idx_events_event_type_timestamp", "event_type", "timestamp"),
    )
    
    def __repr__(self) -> str:
        return f"<Event(id={self.id}, user_id={self.user_id}, event_type={self.event_type}, timestamp={self.timestamp})>"
