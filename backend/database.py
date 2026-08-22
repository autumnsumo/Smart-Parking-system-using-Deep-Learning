"""
database.py — SQLAlchemy setup with SQLite for the Smart Parking System.

Defines the database engine, session factory, ORM models (Slot, Vehicle, Camera),
and utility functions for initialization and demo data seeding.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ---------------------------------------------------------------------------
# Engine & session
# ---------------------------------------------------------------------------

DATABASE_URL = "sqlite:///./parking.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------

def get_db():
    """FastAPI dependency that yields a database session and ensures cleanup."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------

class Slot(Base):
    """Represents a single parking slot with optional camera ROI coordinates."""

    __tablename__ = "slots"

    slot_id: str = Column(String, primary_key=True)          # e.g. "A-01"
    camera_id: str | None = Column(String, nullable=True)
    x1: int | None = Column(Integer, nullable=True)
    y1: int | None = Column(Integer, nullable=True)
    x2: int | None = Column(Integer, nullable=True)
    y2: int | None = Column(Integer, nullable=True)
    direction: str | None = Column(Text, nullable=True, default="")
    status: str = Column(String, default="vacant")           # vacant | reserved | occupied
    last_updated: datetime = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return f"<Slot {self.slot_id} status={self.status}>"


class Vehicle(Base):
    """Tracks vehicles entering and exiting the parking lot."""

    __tablename__ = "vehicles"

    id: int = Column(Integer, primary_key=True, autoincrement=True)
    plate_number: str = Column(String, index=True)
    assigned_slot: str | None = Column(String, nullable=True)
    entry_time: datetime = Column(DateTime, default=datetime.utcnow)
    exit_time: datetime | None = Column(DateTime, nullable=True)
    status: str = Column(String, default="parked")           # parked | exited

    def __repr__(self) -> str:
        return f"<Vehicle {self.plate_number} slot={self.assigned_slot}>"


class Camera(Base):
    """Represents a camera source used for occupancy detection or ANPR."""

    __tablename__ = "cameras"

    camera_id: str = Column(String, primary_key=True)        # e.g. "cam_1"
    source: str = Column(String)                             # RTSP URL or webcam index
    description: str | None = Column(String, nullable=True, default="")
    is_active: bool = Column(Boolean, default=True)
    created_at: datetime = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Camera {self.camera_id} source={self.source}>"


# ---------------------------------------------------------------------------
# Initialisation helpers
# ---------------------------------------------------------------------------

def init_db() -> None:
    """Create all tables that don't already exist."""
    Base.metadata.create_all(bind=engine)
    print("[database] Tables created / verified.")


def seed_demo_data(db: Session) -> None:
    """Seed 20 demo parking slots (A-01…A-10, B-01…B-10) if the table is empty.

    Each slot gets a sample direction string so the display screen can show
    navigation hints right away.
    """
    existing_count = db.query(Slot).count()
    if existing_count > 0:
        return

    directions_a = [
        "Enter Gate 1, turn left, Row A first slot on the left",
        "Enter Gate 1, turn left, Row A second slot on the left",
        "Enter Gate 1, turn left, Row A third slot on the left",
        "Enter Gate 1, turn left, Row A fourth slot on the left",
        "Enter Gate 1, turn left, Row A fifth slot on the left",
        "Enter Gate 1, turn left, Row A sixth slot on the left",
        "Enter Gate 1, turn left, Row A seventh slot on the left",
        "Enter Gate 1, turn left, Row A eighth slot on the left",
        "Enter Gate 1, turn left, Row A ninth slot on the left",
        "Enter Gate 1, turn left, Row A tenth slot on the left",
    ]

    directions_b = [
        "Enter Gate 1, turn right, Row B first slot on the right",
        "Enter Gate 1, turn right, Row B second slot on the right",
        "Enter Gate 1, turn right, Row B third slot on the right",
        "Enter Gate 1, turn right, Row B fourth slot on the right",
        "Enter Gate 1, turn right, Row B fifth slot on the right",
        "Enter Gate 1, turn right, Row B sixth slot on the right",
        "Enter Gate 1, turn right, Row B seventh slot on the right",
        "Enter Gate 1, turn right, Row B eighth slot on the right",
        "Enter Gate 1, turn right, Row B ninth slot on the right",
        "Enter Gate 1, turn right, Row B tenth slot on the right",
    ]

    for i in range(1, 11):
        db.add(
            Slot(
                slot_id=f"A-{i:02d}",
                direction=directions_a[i - 1],
                status="vacant",
                last_updated=datetime.utcnow(),
            )
        )

    for i in range(1, 11):
        db.add(
            Slot(
                slot_id=f"B-{i:02d}",
                direction=directions_b[i - 1],
                status="vacant",
                last_updated=datetime.utcnow(),
            )
        )

    db.commit()
    print("[database] Seeded 20 demo parking slots (A-01…A-10, B-01…B-10).")
