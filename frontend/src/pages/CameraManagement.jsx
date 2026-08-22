import { useState, useEffect } from 'react';
import api from '../api';

export default function CameraManagement() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [form, setForm] = useState({ camera_id: '', source: '', description: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchCameras();
  }, []);

  const fetchCameras = async () => {
    setLoading(true);
    try {
      const data = await api.getCameras();
      setCameras(data);
    } catch (error) {
      console.error('Failed to fetch cameras:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCamera = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      await api.addCamera(form);
      setForm({ camera_id: '', source: '', description: '' });
      fetchCameras();
    } catch (error) {
      console.error('Failed to add camera:', error);
      alert('Failed to add camera. ID might already exist.');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteCamera = async (cameraId) => {
    if (!confirm(`Delete camera ${cameraId}? This will also stop its detection process.`)) return;
    try {
      await api.deleteCamera(cameraId);
      setCameras(cameras.filter(c => c.camera_id !== cameraId));
    } catch (error) {
      console.error('Failed to delete camera:', error);
    }
  };

  const handleStartDetection = async (cameraId) => {
    try {
      await api.startOccupancy(cameraId);
      alert(`Detection started for ${cameraId}`);
    } catch (error) {
      console.error('Failed to start detection:', error);
      alert('Failed to start detection. Check if slots are configured for this camera.');
    }
  };

  const handleStopDetection = async (cameraId) => {
    try {
      await api.stopOccupancy(cameraId);
      alert(`Detection stopped for ${cameraId}`);
    } catch (error) {
      console.error('Failed to stop detection:', error);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Camera Management</h2>
        <p className="text-[var(--color-text-secondary)] mt-1">Configure IP cameras and webcams for detection</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Add Camera Form */}
        <div className="lg:col-span-1">
          <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4">Add Camera</h3>
            <form onSubmit={handleAddCamera} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Camera ID</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. cam_01" 
                  value={form.camera_id}
                  onChange={(e) => setForm({...form, camera_id: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Source (RTSP URL or Webcam Index)</label>
                <input 
                  type="text" 
                  className="input font-mono text-sm" 
                  placeholder="rtsp://... or 0" 
                  value={form.source}
                  onChange={(e) => setForm({...form, source: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Description</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="e.g. Main Entrance" 
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                />
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={adding}>
                {adding ? 'Adding...' : 'Add Camera'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Col: Camera List */}
        <div className="lg:col-span-2">
          <div className="card table-container">
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="spinner"></div>
              </div>
            ) : cameras.length === 0 ? (
              <div className="text-center p-12 text-[var(--color-text-muted)]">
                No cameras configured. Add one to get started.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Camera Info</th>
                    <th>Source</th>
                    <th>Controls</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map((cam) => (
                    <tr key={cam.camera_id}>
                      <td>
                        <div className="font-bold">{cam.camera_id}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{cam.description}</div>
                      </td>
                      <td className="font-mono text-xs max-w-[200px] truncate" title={cam.source}>
                        {cam.source}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button 
                            className="btn btn-success py-1 px-3 text-xs"
                            onClick={() => handleStartDetection(cam.camera_id)}
                          >
                            ▶ Start
                          </button>
                          <button 
                            className="btn btn-outline py-1 px-3 text-xs"
                            onClick={() => handleStopDetection(cam.camera_id)}
                          >
                            ⏹ Stop
                          </button>
                        </div>
                      </td>
                      <td>
                        <button 
                          className="text-[var(--color-accent-red)] hover:bg-[rgba(239,68,68,0.1)] p-2 rounded transition-colors"
                          onClick={() => handleDeleteCamera(cam.camera_id)}
                          title="Delete Camera"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
