"""
websocket_manager.py — WebSocket connection manager for the Smart Parking System.

Manages two pools of WebSocket clients:
  • **display** connections — entry-gate screens that show slot assignments.
  • **dashboard** connections — admin UIs that show real-time occupancy stats.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    """Manages WebSocket connections and broadcasts for display & dashboard clients."""

    def __init__(self) -> None:
        self.display_connections: list[WebSocket] = []
        self.dashboard_connections: list[WebSocket] = []

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    async def connect_display(self, websocket: WebSocket) -> None:
        """Accept and register a *display* WebSocket client."""
        await websocket.accept()
        self.display_connections.append(websocket)
        print(
            f"[WebSocketManager] Display client connected. "
            f"Total display: {len(self.display_connections)}"
        )

    async def connect_dashboard(self, websocket: WebSocket) -> None:
        """Accept and register a *dashboard* WebSocket client."""
        await websocket.accept()
        self.dashboard_connections.append(websocket)
        print(
            f"[WebSocketManager] Dashboard client connected. "
            f"Total dashboard: {len(self.dashboard_connections)}"
        )

    def disconnect_display(self, websocket: WebSocket) -> None:
        """Remove a *display* WebSocket client."""
        if websocket in self.display_connections:
            self.display_connections.remove(websocket)
        print(
            f"[WebSocketManager] Display client disconnected. "
            f"Total display: {len(self.display_connections)}"
        )

    def disconnect_dashboard(self, websocket: WebSocket) -> None:
        """Remove a *dashboard* WebSocket client."""
        if websocket in self.dashboard_connections:
            self.dashboard_connections.remove(websocket)
        print(
            f"[WebSocketManager] Dashboard client disconnected. "
            f"Total dashboard: {len(self.dashboard_connections)}"
        )

    # ------------------------------------------------------------------
    # Broadcasting helpers
    # ------------------------------------------------------------------

    async def _broadcast(
        self, connections: list[WebSocket], data: dict[str, Any]
    ) -> None:
        """Send *data* as JSON to every connection in the list.

        Dead connections are silently removed so they don't block future
        broadcasts.
        """
        dead: list[WebSocket] = []
        message = json.dumps(data)
        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            if ws in connections:
                connections.remove(ws)

    async def broadcast_display(self, data: dict[str, Any]) -> None:
        """Broadcast *data* to all connected display clients."""
        await self._broadcast(self.display_connections, data)

    async def broadcast_dashboard(self, data: dict[str, Any]) -> None:
        """Broadcast *data* to all connected dashboard clients."""
        await self._broadcast(self.dashboard_connections, data)

    async def broadcast_slot_update(self, slot_data: dict[str, Any]) -> None:
        """Push a slot-status change to all dashboard clients.

        Wraps *slot_data* in a ``{"type": "slot_update", "data": ...}``
        envelope.
        """
        await self.broadcast_dashboard({"type": "slot_update", "data": slot_data})

    async def broadcast_vehicle_assignment(
        self, assignment_data: dict[str, Any]
    ) -> None:
        """Push a new vehicle-assignment notification to all display clients.

        Wraps *assignment_data* in a
        ``{"type": "vehicle_assignment", "data": ...}`` envelope.
        """
        await self.broadcast_display(
            {"type": "vehicle_assignment", "data": assignment_data}
        )
