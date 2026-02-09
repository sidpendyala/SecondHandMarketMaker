"""
SQLAlchemy 2.0 models for tracked searches, scan runs, seen items, alert events.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TrackedSearch(Base):
    __tablename__ = "tracked_searches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    query_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    min_discount: Mapped[float] = mapped_column(Float, default=0.15, nullable=False)
    frequency_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    scan_runs: Mapped[list["ScanRun"]] = relationship("ScanRun", back_populates="tracked_search", cascade="all, delete-orphan")
    seen_items: Mapped[list["SeenItem"]] = relationship("SeenItem", back_populates="tracked_search", cascade="all, delete-orphan")
    alert_events: Mapped[list["AlertEvent"]] = relationship("AlertEvent", back_populates="tracked_search", cascade="all, delete-orphan")


class ScanRun(Base):
    __tablename__ = "scan_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tracked_search_id: Mapped[int] = mapped_column(ForeignKey("tracked_searches.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)  # running, success, failed
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stats_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tracked_search: Mapped["TrackedSearch"] = relationship("TrackedSearch", back_populates="scan_runs")


class SeenItem(Base):
    __tablename__ = "seen_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tracked_search_id: Mapped[int] = mapped_column(ForeignKey("tracked_searches.id", ondelete="CASCADE"), nullable=False)
    item_key: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    last_price: Mapped[float] = mapped_column(Float, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    alerted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("tracked_search_id", "item_key", name="uq_seen_items_tracked_search_item_key"),)

    tracked_search: Mapped["TrackedSearch"] = relationship("TrackedSearch", back_populates="seen_items")


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tracked_search_id: Mapped[int] = mapped_column(ForeignKey("tracked_searches.id", ondelete="CASCADE"), nullable=False)
    item_key: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)

    tracked_search: Mapped["TrackedSearch"] = relationship("TrackedSearch", back_populates="alert_events")
