"""
Database module: SQLAlchemy 2.0 + session for FastAPI.
"""

import os
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from db.models import Base

_default_url = os.getenv("DATABASE_URL", "")
if not _default_url:
    _engine = None
    _session_factory = None
else:
    # Railway/Heroku may pass postgres://; SQLAlchemy 1.4+ wants postgresql://
    if _default_url.startswith("postgres://"):
        _default_url = _default_url.replace("postgres://", "postgresql://", 1)
    _engine = create_engine(
        _default_url,
        pool_pre_ping=True,
        echo=os.getenv("SQL_ECHO", "").lower() in ("1", "true"),
    )
    _session_factory = sessionmaker(
        bind=_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )


def get_engine():
    return _engine


def get_session_factory():
    return _session_factory


@contextmanager
def get_session() -> Generator[Session, None, None]:
    if _session_factory is None:
        raise RuntimeError("DATABASE_URL is not set")
    session = _session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency: yield a session and close after request."""
    if _session_factory is None:
        raise RuntimeError("DATABASE_URL is not set")
    session = _session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
