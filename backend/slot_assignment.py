"""
slot_assignment.py — Parking-slot assignment and release logic.

Provides the core business rules for:
  • assigning the best available slot to an incoming vehicle,
  • processing vehicle exits (freeing the slot),
  • automatically releasing expired reservations,
  • computing lot-level statistics.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from fastapi import HTTPException

from sqlalchemy.orm import Session

from database import Slot, Vehicle
from firebase_sync import update_slot_firebase


# ---------------------------------------------------------------------------
# Assignment
# ---------------------------------------------------------------------------

def assign_slot(plate_number: str, db: Session) -> dict | None:
    """Assign the best available (first vacant) slot to *plate_number*.
    If the vehicle is already parked, return its current assignment.
    Returns an assignment dict on success or ``None`` when the lot is full.
    """
    # Check if already parked
    existing_vehicle = (
        db.query(Vehicle)
        .filter(
            Vehicle.plate_number == plate_number,
            Vehicle.status == "parked",
        )
        .first()
    )
    if existing_vehicle and existing_vehicle.assigned_slot:
        raise HTTPException(status_code=400, detail="Vehicle already entered")

    vacant_slots = (
        db.query(Slot)
        .filter(Slot.status == "vacant")
        .all()
    )

    if not vacant_slots:
        return None  # Parking full

    # Natural sort to ensure B2 comes before B10
    vacant_slots.sort(key=lambda s: [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s.slot_id)])
    
    best_slot = vacant_slots[0]

    # Mark slot as occupied immediately for the simulation
    best_slot.status = "occupied"
    best_slot.last_updated = datetime.utcnow()

    # Create a vehicle record
    vehicle = Vehicle(
        plate_number=plate_number,
        assigned_slot=best_slot.slot_id,
        entry_time=datetime.utcnow(),
        status="parked",
    )
    db.add(vehicle)
    db.commit()
    db.refresh(best_slot)

    # Sync to Firebase (no-op if disabled)
    update_slot_firebase(best_slot.slot_id, "occupied")

    return {
        "plate_number": plate_number,
        "assigned_slot": best_slot.slot_id,
        "direction": best_slot.direction or "Follow the signs to your slot",
    }


# ---------------------------------------------------------------------------
# Exit
# ---------------------------------------------------------------------------

def process_exit(plate_number: str, db: Session) -> dict | None:
    """Process a vehicle exit: mark as exited and free its slot.

    Returns an exit-info dict or ``None`` if no matching parked vehicle was
    found.
    """
    vehicle = (
        db.query(Vehicle)
        .filter(
            Vehicle.plate_number == plate_number,
            Vehicle.status == "parked",
        )
        .first()
    )

    if not vehicle:
        return None

    vehicle.exit_time = datetime.utcnow()
    vehicle.status = "exited"

    if vehicle.assigned_slot:
        slot = (
            db.query(Slot)
            .filter(Slot.slot_id == vehicle.assigned_slot)
            .first()
        )
        if slot:
            slot.status = "vacant"
            slot.last_updated = datetime.utcnow()
            update_slot_firebase(slot.slot_id, "vacant")

    db.commit()

    return {
        "plate_number": plate_number,
        "freed_slot": vehicle.assigned_slot,
        "entry_time": (
            vehicle.entry_time.isoformat() if vehicle.entry_time else None
        ),
        "exit_time": (
            vehicle.exit_time.isoformat() if vehicle.exit_time else None
        ),
    }


# ---------------------------------------------------------------------------
# Reservation timeout
# ---------------------------------------------------------------------------

def release_expired_reservations(
    db: Session,
    timeout_minutes: int = 10,
) -> list[str]:
    """Release slots reserved longer than *timeout_minutes*.

    Intended to be called periodically by a background scheduler.

    Returns the list of slot IDs that were released.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=timeout_minutes)
    expired_slots = (
        db.query(Slot)
        .filter(Slot.status == "reserved", Slot.last_updated < cutoff)
        .all()
    )

    released: list[str] = []
    for slot in expired_slots:
        # First, mark the vehicle as exited so it's not orphaned
        vehicle = (
            db.query(Vehicle)
            .filter(Vehicle.assigned_slot == slot.slot_id, Vehicle.status == "parked")
            .first()
        )
        if vehicle:
            vehicle.exit_time = datetime.utcnow()
            vehicle.status = "exited"

        slot.status = "vacant"
        slot.last_updated = datetime.utcnow()
        update_slot_firebase(slot.slot_id, "vacant")
        released.append(slot.slot_id)

    if released:
        db.commit()
        print(f"[ReservationTimeout] Released expired slots: {released}")

    return released


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

def get_stats(db: Session) -> dict:
    """Return current parking-lot statistics."""
    total = db.query(Slot).count()
    occupied = db.query(Slot).filter(Slot.status == "occupied").count()
    reserved = db.query(Slot).filter(Slot.status == "reserved").count()
    vacant = db.query(Slot).filter(Slot.status == "vacant").count()

    return {
        "total": total,
        "occupied": occupied,
        "reserved": reserved,
        "vacant": vacant,
    }
