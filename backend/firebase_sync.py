"""
firebase_sync.py — Optional Firebase / Firestore synchronisation.

The Smart Parking system works perfectly without Firebase.  Every public
function in this module is a silent no-op when Firebase is not configured.

Set the environment variable ``FIREBASE_CREDENTIALS_PATH`` to the path of
your Firebase service-account JSON file to enable synchronisation.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

firebase_enabled: bool = False
_firestore_client: Any = None  # google.cloud.firestore.Client when available

SLOTS_COLLECTION = "parking_slots"


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

def init_firebase() -> bool:
    """Initialise Firebase Admin SDK + Firestore client.

    Returns ``True`` if Firebase was successfully initialised, ``False``
    otherwise.  Never raises.
    """
    global firebase_enabled, _firestore_client

    cred_path = os.environ.get("FIREBASE_CREDENTIALS_PATH", "").strip()

    if not cred_path:
        print("[firebase_sync] FIREBASE_CREDENTIALS_PATH not set — Firebase disabled.")
        firebase_enabled = False
        return False

    if not os.path.isfile(cred_path):
        print(
            f"[firebase_sync] Credentials file not found: {cred_path} — Firebase disabled."
        )
        firebase_enabled = False
        return False

    try:
        import firebase_admin  # type: ignore[import-untyped]
        from firebase_admin import credentials, firestore  # type: ignore[import-untyped]

        # Avoid double-initialisation if called more than once
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)

        _firestore_client = firestore.client()
        firebase_enabled = True
        print("[firebase_sync] Firebase initialised successfully.")
        return True

    except ImportError:
        print(
            "[firebase_sync] firebase-admin package not installed — Firebase disabled."
        )
        firebase_enabled = False
        return False
    except Exception as exc:  # noqa: BLE001
        print(f"[firebase_sync] Firebase init failed: {exc} — Firebase disabled.")
        firebase_enabled = False
        return False


# ---------------------------------------------------------------------------
# Slot helpers
# ---------------------------------------------------------------------------

def update_slot_firebase(slot_id: str, status: str, **kwargs: Any) -> None:
    """Push a single slot update to Firestore.

    Additional keyword arguments (e.g. ``plate_number``) are merged into the
    document.  Does nothing when Firebase is disabled.
    """
    if not firebase_enabled or _firestore_client is None:
        return

    try:
        doc_ref = _firestore_client.collection(SLOTS_COLLECTION).document(slot_id)
        data: dict[str, Any] = {
            "status": status,
            "last_updated": datetime.utcnow().isoformat(),
            **kwargs,
        }
        doc_ref.set(data, merge=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[firebase_sync] Failed to update slot {slot_id}: {exc}")


def get_vacant_slots_firebase() -> list[dict[str, Any]]:
    """Return a list of vacant-slot dicts from Firestore.

    Returns an empty list when Firebase is disabled.
    """
    if not firebase_enabled or _firestore_client is None:
        return []

    try:
        docs = (
            _firestore_client.collection(SLOTS_COLLECTION)
            .where("status", "==", "vacant")
            .stream()
        )
        return [{"slot_id": doc.id, **doc.to_dict()} for doc in docs]
    except Exception as exc:  # noqa: BLE001
        print(f"[firebase_sync] Failed to query vacant slots: {exc}")
        return []


def get_all_slots_firebase() -> list[dict[str, Any]]:
    """Return all slot documents from Firestore.

    Returns an empty list when Firebase is disabled.
    """
    if not firebase_enabled or _firestore_client is None:
        return []

    try:
        docs = _firestore_client.collection(SLOTS_COLLECTION).stream()
        return [{"slot_id": doc.id, **doc.to_dict()} for doc in docs]
    except Exception as exc:  # noqa: BLE001
        print(f"[firebase_sync] Failed to query all slots: {exc}")
        return []


def sync_all_slots_to_firebase(db_session: Any) -> None:
    """Bulk-sync every slot from the SQLite database to Firestore.

    ``db_session`` is expected to be a SQLAlchemy ``Session``.  This is a
    no-op when Firebase is disabled.
    """
    if not firebase_enabled or _firestore_client is None:
        return

    try:
        # Import here to avoid circular dependency at module level
        from database import Slot  # noqa: WPS433

        slots = db_session.query(Slot).all()
        batch = _firestore_client.batch()
        for slot in slots:
            doc_ref = _firestore_client.collection(SLOTS_COLLECTION).document(
                slot.slot_id
            )
            batch.set(
                doc_ref,
                {
                    "status": slot.status,
                    "direction": slot.direction or "",
                    "camera_id": slot.camera_id or "",
                    "last_updated": (
                        slot.last_updated.isoformat() if slot.last_updated else None
                    ),
                },
                merge=True,
            )
        batch.commit()
        print(f"[firebase_sync] Synced {len(slots)} slots to Firestore.")
    except Exception as exc:  # noqa: BLE001
        print(f"[firebase_sync] Bulk sync failed: {exc}")
