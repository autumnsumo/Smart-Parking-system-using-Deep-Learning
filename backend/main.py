"""
main.py — FastAPI application for the Smart Parking System.

Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Endpoints
---------
REST (JSON):
    POST   /api/vehicle/entry
    POST   /api/vehicle/exit
    GET    /api/slots
    GET    /api/slots/vacant
    POST   /api/slots/roi
    PUT    /api/slots/{slot_id}
    DELETE /api/slots/{slot_id}
    GET    /api/vehicles
    GET    /api/stats
    POST   /api/cameras
    GET    /api/cameras
    DELETE /api/cameras/{camera_id}
    POST   /api/occupancy/start
    POST   /api/occupancy/stop
    POST   /api/upload/image
    POST   /api/upload/video
    POST   /api/anpr/image

WebSocket:
    /ws/display     — entry-gate display screens
    /ws/dashboard   — admin dashboard live updates
"""

from __future__ import annotations

import os
import shutil
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from PIL import Image
import pillow_avif
import io

async def save_standardized_image(file, out_path: Path):
    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        out_path = out_path.with_suffix(".jpg")
        img.save(out_path, "JPEG")
        return out_path
    except Exception as e:
        print(f"PIL fallback failed, using raw file: {e}")
        with open(out_path, "wb") as f:
            f.write(contents)
        return out_path

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from anpr import read_plate_from_image
from database import Camera, SessionLocal, Slot, Vehicle, get_db, init_db, seed_demo_data
from firebase_sync import init_firebase, sync_all_slots_to_firebase
from occupancy import OccupancyDetector
from slot_assignment import assign_slot, get_stats, process_exit, release_expired_reservations
from websocket_manager import WebSocketManager

# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------


class VehicleEntryRequest(BaseModel):
    plate_number: str


class VehicleExitRequest(BaseModel):
    plate_number: str


class SlotROIRequest(BaseModel):
    slot_id: str
    camera_id: str = ""
    x1: int = 0
    y1: int = 0
    x2: int = 0
    y2: int = 0
    direction: str = ""


class SlotUpdateRequest(BaseModel):
    direction: str | None = None
    status: str | None = None

class SlotReserveRequest(BaseModel):
    plate_number: str | None = None


class CameraRequest(BaseModel):
    camera_id: str
    source: str
    description: str = ""


class OccupancyControlRequest(BaseModel):
    camera_id: str


# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

ws_manager = WebSocketManager()
detector = OccupancyDetector(
    model_path=os.getenv("MODEL_PATH", "models/parking_vgg16.pth")
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler — runs on startup and shutdown."""

    # ── Startup ──────────────────────────────────────────────────────
    init_db()
    init_firebase()

    # Seed demo data if the DB is empty
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()

    # Bulk-sync SQLite → Firestore (no-op if Firebase disabled)
    db = SessionLocal()
    try:
        sync_all_slots_to_firebase(db)
    finally:
        db.close()

    # Background scheduler: expire stale reservations every minute
    scheduler = None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler

        scheduler = BackgroundScheduler()

        def _check_reservations() -> None:
            session = SessionLocal()
            try:
                release_expired_reservations(session)
            finally:
                session.close()

        scheduler.add_job(_check_reservations, "interval", minutes=1)
        scheduler.start()
        print("[main] APScheduler started (reservation timeout every 60 s).")
    except ImportError:
        print(
            "[main] apscheduler not installed — reservation timeout checker disabled."
        )

    yield

    # ── Shutdown ─────────────────────────────────────────────────────
    if scheduler is not None:
        scheduler.shutdown(wait=False)
    detector.stop_all()
    print("[main] Application shut down cleanly.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Smart Parking System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════════
#  REST ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


# ── Vehicle entry / exit ──────────────────────────────────────────────────


@app.post("/api/vehicle/entry")
async def vehicle_entry(
    request: VehicleEntryRequest,
    db: Session = Depends(get_db),
):
    """Assign a slot to an incoming vehicle and broadcast updates."""
    result = assign_slot(request.plate_number, db)
    if result is None:
        raise HTTPException(status_code=409, detail="Parking lot is full")

    # Real-time updates
    await ws_manager.broadcast_vehicle_assignment(result)

    stats = get_stats(db)
    await ws_manager.broadcast_dashboard({"type": "stats_update", "data": stats})
    await ws_manager.broadcast_slot_update(
        {
            "slot_id": result["assigned_slot"],
            "status": "occupied",
            "plate_number": request.plate_number,
        }
    )

    return result


@app.post("/api/vehicle/exit")
async def vehicle_exit(
    request: VehicleExitRequest,
    db: Session = Depends(get_db),
):
    """Process a vehicle exit and free its slot."""
    result = process_exit(request.plate_number, db)
    if result is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    stats = get_stats(db)
    await ws_manager.broadcast_dashboard({"type": "stats_update", "data": stats})
    await ws_manager.broadcast_slot_update(
        {"slot_id": result["freed_slot"], "status": "vacant"}
    )

    return result


# ── Slots ─────────────────────────────────────────────────────────────────


@app.get("/api/slots")
def list_slots(db: Session = Depends(get_db)):
    """Return all parking slots ordered by slot_id."""
    slots = db.query(Slot).order_by(Slot.slot_id).all()
    
    parked_vehicles = {
        v.assigned_slot: v.plate_number
        for v in db.query(Vehicle).filter(Vehicle.status == "parked", Vehicle.assigned_slot.isnot(None)).all()
    }
    
    return [
        {
            "slot_id": s.slot_id,
            "camera_id": s.camera_id,
            "x1": s.x1,
            "y1": s.y1,
            "x2": s.x2,
            "y2": s.y2,
            "direction": s.direction,
            "status": s.status,
            "plate_number": parked_vehicles.get(s.slot_id),
            "last_updated": s.last_updated.isoformat() if s.last_updated else None,
        }
        for s in slots
    ]


@app.get("/api/slots/vacant")
def list_vacant_slots(db: Session = Depends(get_db)):
    """Return only vacant slots."""
    slots = (
        db.query(Slot)
        .filter(Slot.status == "vacant")
        .order_by(Slot.slot_id)
        .all()
    )
    return [
        {"slot_id": s.slot_id, "direction": s.direction, "status": s.status}
        for s in slots
    ]


@app.post("/api/slots/roi")
def save_slot_roi(
    request: SlotROIRequest,
    db: Session = Depends(get_db),
):
    """Create or update a slot's ROI coordinates and metadata."""
    slot = db.query(Slot).filter(Slot.slot_id == request.slot_id).first()
    if slot:
        slot.camera_id = request.camera_id
        slot.x1 = request.x1
        slot.y1 = request.y1
        slot.x2 = request.x2
        slot.y2 = request.y2
        slot.direction = request.direction
    else:
        slot = Slot(
            slot_id=request.slot_id,
            camera_id=request.camera_id,
            x1=request.x1,
            y1=request.y1,
            x2=request.x2,
            y2=request.y2,
            direction=request.direction,
        )
        db.add(slot)
    db.commit()
    return {"message": f"Slot {request.slot_id} saved", "slot_id": request.slot_id}


@app.put("/api/slots/{slot_id}")
def update_slot(
    slot_id: str,
    request: SlotUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update direction and/or status for a specific slot."""
    slot = db.query(Slot).filter(Slot.slot_id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if request.direction is not None:
        slot.direction = request.direction
    if request.status is not None:
        slot.status = request.status
    slot.last_updated = datetime.utcnow()
    db.commit()
    return {"message": f"Slot {slot_id} updated"}


@app.delete("/api/slots/{slot_id}")
def delete_slot(slot_id: str, db: Session = Depends(get_db)):
    """Delete a parking slot."""
    slot = db.query(Slot).filter(Slot.slot_id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    db.delete(slot)
    db.commit()
    return {"message": f"Slot {slot_id} deleted"}


@app.delete("/api/slots")
def delete_all_slots(db: Session = Depends(get_db)):
    """Delete all parking slots."""
    db.query(Slot).delete()
    db.commit()
    return {"message": "All slots deleted"}


# ── Vehicles ──────────────────────────────────────────────────────────────


@app.get("/api/vehicles")
def list_vehicles(
    db: Session = Depends(get_db),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """List vehicles with optional search, date filtering, and pagination."""
    query = db.query(Vehicle).order_by(Vehicle.entry_time.desc())

    if search:
        query = query.filter(Vehicle.plate_number.contains(search.upper()))
    if date_from:
        query = query.filter(Vehicle.entry_time >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(Vehicle.entry_time <= datetime.fromisoformat(date_to))

    total = query.count()
    vehicles = query.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "vehicles": [
            {
                "id": v.id,
                "plate_number": v.plate_number,
                "assigned_slot": v.assigned_slot,
                "entry_time": v.entry_time.isoformat() if v.entry_time else None,
                "exit_time": v.exit_time.isoformat() if v.exit_time else None,
                "status": v.status,
                "duration": (
                    str(v.exit_time - v.entry_time)
                    if v.exit_time and v.entry_time
                    else None
                ),
            }
            for v in vehicles
        ],
    }


@app.delete("/api/vehicles/{vehicle_id}")
def delete_vehicle_log(vehicle_id: int, db: Session = Depends(get_db)):
    """Manually delete a specific vehicle log."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle log not found")
    db.delete(vehicle)
    db.commit()
    return {"message": "Vehicle log deleted successfully"}


@app.delete("/api/vehicles")
def delete_all_vehicle_logs(db: Session = Depends(get_db)):
    """Manually wipe all vehicle logs from the database."""
    db.query(Vehicle).delete()
    db.commit()
    return {"message": "All vehicle logs cleared"}


@app.post("/api/slots/{slot_id}/empty")
async def force_empty_slot(slot_id: str, db: Session = Depends(get_db)):
    """Manually force a slot to be empty, exiting any vehicle parked there."""
    slot = db.query(Slot).filter(Slot.slot_id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    # Check if a vehicle is currently assigned to this slot
    vehicle = db.query(Vehicle).filter(Vehicle.assigned_slot == slot_id, Vehicle.status == "parked").first()
    if vehicle:
        vehicle.status = "exited"
        vehicle.exit_time = datetime.utcnow()
    
    slot.status = "vacant"
    db.commit()
    
    # Broadcast and Sync
    sync_all_slots_to_firebase(db)
    await ws_manager.broadcast_dashboard({"type": "slot_update", "data": {"slot_id": slot_id, "status": "vacant", "plate_number": None}})
    await ws_manager.broadcast_dashboard({"type": "stats_update", "data": get_stats(db)})
    
    return {"message": "Slot forcefully emptied", "slot": slot_id}


@app.post("/api/slots/{slot_id}/reserve")
async def manual_reserve_slot(slot_id: str, request: SlotReserveRequest, db: Session = Depends(get_db)):
    """Manually reserve a slot, optionally logging a plate number."""
    slot = db.query(Slot).filter(Slot.slot_id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    # If the slot is already occupied, we should probably kick out the old car or reject
    if slot.status == "occupied":
        vehicle = db.query(Vehicle).filter(Vehicle.assigned_slot == slot_id, Vehicle.status == "parked").first()
        if vehicle:
            vehicle.status = "exited"
            vehicle.exit_time = datetime.utcnow()
    
    slot.status = "reserved"
    
    # If a plate number is provided, log it as an active vehicle in that slot
    if request.plate_number:
        new_vehicle = Vehicle(
            plate_number=request.plate_number,
            assigned_slot=slot_id,
            status="parked"
        )
        db.add(new_vehicle)
        
    db.commit()
    
    sync_all_slots_to_firebase(db)
    await ws_manager.broadcast_dashboard({"type": "slot_update", "data": {"slot_id": slot_id, "status": "reserved", "plate_number": request.plate_number}})
    await ws_manager.broadcast_dashboard({"type": "stats_update", "data": get_stats(db)})
    
    return {"message": "Slot reserved", "slot": slot_id}


# ── Stats ─────────────────────────────────────────────────────────────────


@app.get("/api/stats")
def parking_stats(db: Session = Depends(get_db)):
    """Return current parking-lot occupancy statistics."""
    return get_stats(db)


# ── Camera management ────────────────────────────────────────────────────


@app.post("/api/cameras")
def add_camera(request: CameraRequest, db: Session = Depends(get_db)):
    """Register a new camera source."""
    existing = db.query(Camera).filter(Camera.camera_id == request.camera_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Camera ID already exists")
    camera = Camera(
        camera_id=request.camera_id,
        source=request.source,
        description=request.description,
    )
    db.add(camera)
    db.commit()
    return {"message": f"Camera {request.camera_id} added"}


@app.get("/api/cameras")
def list_cameras(db: Session = Depends(get_db)):
    """List all registered cameras."""
    cameras = db.query(Camera).all()
    return [
        {
            "camera_id": c.camera_id,
            "source": c.source,
            "description": c.description,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in cameras
    ]


@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    """Delete a camera (also stops its detection thread if running)."""
    camera = db.query(Camera).filter(Camera.camera_id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    detector.stop_camera(camera_id)
    db.delete(camera)
    db.commit()
    return {"message": f"Camera {camera_id} deleted"}


# ── Occupancy detection controls ─────────────────────────────────────────


@app.post("/api/occupancy/start")
def start_occupancy(
    request: OccupancyControlRequest,
    db: Session = Depends(get_db),
):
    """Start real-time occupancy detection for a camera."""
    camera = db.query(Camera).filter(Camera.camera_id == request.camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    slots = db.query(Slot).filter(Slot.camera_id == request.camera_id).all()
    slot_dicts = [
        {"slot_id": s.slot_id, "x1": s.x1, "y1": s.y1, "x2": s.x2, "y2": s.y2}
        for s in slots
    ]
    if not slot_dicts:
        raise HTTPException(
            status_code=400, detail="No slots configured for this camera"
        )

    def on_update(results: list[dict]) -> None:
        """Callback executed in the detection thread — uses its own session."""
        db_session = SessionLocal()
        try:
            for r in results:
                slot = (
                    db_session.query(Slot)
                    .filter(Slot.slot_id == r["slot_id"])
                    .first()
                )
                if slot and slot.status != "reserved":
                    old_status = slot.status
                    new_status = r["status"]
                    if old_status != new_status:
                        slot.status = new_status
                        slot.last_updated = datetime.utcnow()
                        
                        # Auto-exit logic: If the slot becomes vacant, release the vehicle
                        if new_status == "vacant" and old_status == "occupied":
                            vehicle = (
                                db_session.query(Vehicle)
                                .filter(Vehicle.assigned_slot == slot.slot_id, Vehicle.status == "parked")
                                .first()
                            )
                            if vehicle:
                                vehicle.exit_time = datetime.utcnow()
                                vehicle.status = "exited"
                                
                        # We must run the async broadcast in the background since this is a synchronous callback
                        try:
                            # Use asyncio to run the broadcast
                            loop = asyncio.get_event_loop()
                            if loop.is_running():
                                asyncio.ensure_future(ws_manager.broadcast_slot_update({
                                    "slot_id": slot.slot_id,
                                    "status": slot.status
                                }))
                        except Exception as e:
                            print(f"[on_update] Failed to broadcast: {e}")

            db_session.commit()
            
            # Broadcast stats update
            try:
                stats = get_stats(db_session)
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.ensure_future(ws_manager.broadcast_dashboard({"type": "stats_update", "data": stats}))
            except Exception:
                pass
                
        finally:
            db_session.close()

    # Convert numeric string to int for webcam sources
    source: str | int = camera.source
    try:
        source = int(source)
    except (ValueError, TypeError):
        pass

    detector.start_camera(source, request.camera_id, slot_dicts, on_update)
    return {"message": f"Occupancy detection started for {request.camera_id}"}


@app.post("/api/occupancy/stop")
def stop_occupancy(request: OccupancyControlRequest):
    """Stop occupancy detection for a camera."""
    detector.stop_camera(request.camera_id)
    return {"message": f"Occupancy detection stopped for {request.camera_id}"}


# ── File uploads ──────────────────────────────────────────────────────────


@app.post("/api/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    camera_id: str = Form(None),
    db: Session = Depends(get_db),
):
    """Upload an image for one-shot occupancy detection across configured slots."""
    file_path = UPLOAD_DIR / file.filename
    file_path = await save_standardized_image(file, file_path)

    query = db.query(Slot).filter(Slot.x1.isnot(None), Slot.x2.isnot(None))
    if camera_id:
        query = query.filter(Slot.camera_id == camera_id)
        
    slots = query.all()
    slot_dicts = [
        {"slot_id": s.slot_id, "x1": s.x1, "y1": s.y1, "x2": s.x2, "y2": s.y2}
        for s in slots
    ]

    results = detector.process_image(str(file_path), slot_dicts)

    for r in results:
        slot = db.query(Slot).filter(Slot.slot_id == r["slot_id"]).first()
        if slot:
            slot.status = r["status"]
            slot.last_updated = datetime.utcnow()
    db.commit()

    return {"results": results}


@app.post("/api/upload/video")
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a video for occupancy detection (processes synchronously)."""
    file_path = UPLOAD_DIR / file.filename
    file_path = await save_standardized_image(file, file_path)

    slots = (
        db.query(Slot)
        .filter(Slot.x1.isnot(None), Slot.x2.isnot(None))
        .all()
    )
    slot_dicts = [
        {"slot_id": s.slot_id, "x1": s.x1, "y1": s.y1, "x2": s.x2, "y2": s.y2}
        for s in slots
    ]

    results = detector.process_video(str(file_path), slot_dicts)

    for r in results:
        slot = db.query(Slot).filter(Slot.slot_id == r["slot_id"]).first()
        if slot:
            slot.status = r["status"]
            slot.last_updated = datetime.utcnow()
    db.commit()

    return {"results": results}


# ── ANPR from uploaded image ─────────────────────────────────────────────


@app.post("/api/anpr/image")
async def anpr_from_image(file: UploadFile = File(...)):
    """Upload an image and attempt to read a licence plate via ANPR."""
    # Ensure unique filename to prevent concurrent overwrite issues
    safe_filename = f"entry_{datetime.utcnow().timestamp()}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename
    file_path = await save_standardized_image(file, file_path)

    plate, confidence = read_plate_from_image(str(file_path))
    return {"plate_number": plate, "confidence": confidence}


@app.post("/api/anpr/exit")
async def anpr_exit_image(file: UploadFile = File(...)):
    """Upload an image from exit camera, read plate, and automatically process exit."""
    safe_filename = f"exit_{datetime.utcnow().timestamp()}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename
    file_path = await save_standardized_image(file, file_path)

    plate, confidence = read_plate_from_image(str(file_path))
    return {"plate_number": plate, "confidence": confidence}


# ═══════════════════════════════════════════════════════════════════════════
#  WEBSOCKET ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


@app.websocket("/ws/display")
async def websocket_display(websocket: WebSocket):
    """WebSocket for entry-gate display screens."""
    await ws_manager.connect_display(websocket)
    try:
        while True:
            # Display clients typically only receive; keep-alive via receive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_display(websocket)


@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """WebSocket for admin dashboard — sends initial state on connect."""
    await ws_manager.connect_dashboard(websocket)
    try:
        # Push the current state immediately after connection
        db = SessionLocal()
        try:
            stats = get_stats(db)
            slots = db.query(Slot).order_by(Slot.slot_id).all()
            
            parked_vehicles = {
                v.assigned_slot: v.plate_number
                for v in db.query(Vehicle).filter(Vehicle.status == "parked", Vehicle.assigned_slot.isnot(None)).all()
            }
            
            slots_data = [
                {
                    "slot_id": s.slot_id,
                    "status": s.status,
                    "direction": s.direction,
                    "plate_number": parked_vehicles.get(s.slot_id),
                    "last_updated": (
                        s.last_updated.isoformat() if s.last_updated else None
                    ),
                }
                for s in slots
            ]
        finally:
            db.close()

        await websocket.send_json(
            {"type": "initial_state", "data": {"stats": stats, "slots": slots_data}}
        )

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect_dashboard(websocket)
