const API_BASE = '/api';

/**
 * API client for the Smart Parking backend.
 */
const api = {
  // ─── Slots ───
  async getSlots() {
    const res = await fetch(`${API_BASE}/slots`);
    if (!res.ok) throw new Error('Failed to fetch slots');
    return res.json();
  },

  async getVacantSlots() {
    const res = await fetch(`${API_BASE}/slots/vacant`);
    if (!res.ok) throw new Error('Failed to fetch vacant slots');
    return res.json();
  },

  async saveSlotROI(data) {
    const res = await fetch(`${API_BASE}/slots/roi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save slot ROI');
    return res.json();
  },

  async updateSlot(slotId, data) {
    const res = await fetch(`${API_BASE}/slots/${slotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update slot');
    return res.json();
  },

  async deleteSlot(slotId) {
    const res = await fetch(`${API_BASE}/slots/${slotId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete slot');
    return res.json();
  },

  async deleteAllSlots() {
    const res = await fetch(`${API_BASE}/slots`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete all slots');
    return res.json();
  },

  // ─── Vehicles ───
  async vehicleEntry(plateNumber) {
    const res = await fetch(`${API_BASE}/vehicle/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate_number: plateNumber }),
    });
    if (res.status === 409) throw new Error('Parking lot is full');
    if (res.status === 400) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Bad Request');
    }
    if (!res.ok) throw new Error('Failed to process vehicle entry');
    return res.json();
  },

  async vehicleExit(plateNumber) {
    const res = await fetch(`${API_BASE}/vehicle/exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate_number: plateNumber }),
    });
    if (!res.ok) throw new Error('Failed to process vehicle exit');
    return res.json();
  },

  async getVehicles({ search, dateFrom, dateTo, page = 1, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    params.set('page', page);
    params.set('limit', limit);
    const res = await fetch(`${API_BASE}/vehicles?${params}`);
    if (!res.ok) throw new Error('Failed to fetch vehicles');
    return res.json();
  },

  // ─── Stats ───
  async getStats() {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  // ─── Cameras ───
  async getCameras() {
    const res = await fetch(`${API_BASE}/cameras`);
    if (!res.ok) throw new Error('Failed to fetch cameras');
    return res.json();
  },

  async addCamera(data) {
    const res = await fetch(`${API_BASE}/cameras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to add camera');
    return res.json();
  },

  async deleteCamera(cameraId) {
    const res = await fetch(`${API_BASE}/cameras/${cameraId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete camera');
    return res.json();
  },

  // ─── Occupancy Control ───
  async startOccupancy(cameraId) {
    const res = await fetch(`${API_BASE}/occupancy/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_id: cameraId }),
    });
    if (!res.ok) throw new Error('Failed to start occupancy detection');
    return res.json();
  },

  async stopOccupancy(cameraId) {
    const res = await fetch(`${API_BASE}/occupancy/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_id: cameraId }),
    });
    if (!res.ok) throw new Error('Failed to stop occupancy detection');
    return res.json();
  },

  // ─── File Uploads ───
  async uploadImage(file, cameraId = null) {
    const formData = new FormData();
    formData.append('file', file);
    if (cameraId) {
      formData.append('camera_id', cameraId);
    }
    const res = await fetch(`${API_BASE}/upload/image`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload image');
    return res.json();
  },

  async uploadVideo(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload/video`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload video');
    return res.json();
  },

  async anprFromImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/anpr/image`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to process ANPR image');
    return res.json();
  },

  async anprExit(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/anpr/exit`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to process Exit ANPR image');
    return res.json();
  },

  // "?"?"? Manual Overrides "?"?"?
  async deleteVehicleLog(vehicleId) {
    const res = await fetch(`${API_BASE}/vehicles/${vehicleId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete vehicle log');
    return res.json();
  },

  async deleteAllVehicleLogs() {
    const res = await fetch(`${API_BASE}/vehicles`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete all vehicle logs');
    return res.json();
  },

  async forceEmptySlot(slotId) {
    const res = await fetch(`${API_BASE}/slots/${slotId}/empty`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to force empty slot');
    return res.json();
  },

  async reserveSlot(slotId, plateNumber = '') {
    const res = await fetch(`${API_BASE}/slots/${slotId}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate_number: plateNumber }),
    });
    if (!res.ok) throw new Error('Failed to reserve slot');
    return res.json();
  }
};

export default api;
