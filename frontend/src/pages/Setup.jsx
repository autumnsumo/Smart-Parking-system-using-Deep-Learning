import { useState, useEffect } from 'react';
import api from '../api';
import ROICanvas from '../components/ROICanvas';

export default function Setup() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [imageSrc, setImageSrc] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [testing, setTesting] = useState(false);
  
  const [slots, setSlots] = useState([]);
  const [newRoi, setNewRoi] = useState(null);
  const [slotForm, setSlotForm] = useState({ slot_id: '', direction: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCameras();
    fetchSlots();
  }, []);

  const fetchCameras = async () => {
    try {
      const data = await api.getCameras();
      setCameras(data);
      if (data.length > 0) setSelectedCamera(data[0].camera_id);
    } catch (error) {
      console.error('Failed to fetch cameras:', error);
    }
  };

  const fetchSlots = async () => {
    try {
      const data = await api.getSlots();
      setSlots(data.sort((a, b) => a.slot_id.localeCompare(b.slot_id, undefined, { numeric: true })));
    } catch (error) {
      console.error('Failed to fetch slots:', error);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setImageFile(file);
    }
  };

  const handleTestDetection = async () => {
    if (!imageFile || !selectedCamera) return;
    setTesting(true);
    try {
      const result = await api.uploadImage(imageFile, selectedCamera);
      alert(`✅ VGG16 Occupancy Detection completed successfully!\n\nAll ROIs have been processed using the VGG16 neural network and updates have been broadcasted to the Live Dashboard.\n\nResults:\n${JSON.stringify(result.results, null, 2)}`);
      // Refresh slots
      fetchSlots();
    } catch (err) {
      alert('Failed to run detection on image.');
    } finally {
      setTesting(false);
    }
  };

  const handleROIComplete = (roi) => {
    setNewRoi(roi);
    // Auto-generate next slot ID (e.g., A-01 -> A-02)
    if (slots.length > 0 && !slotForm.slot_id) {
      const lastSlot = slots[slots.length - 1].slot_id;
      const match = lastSlot.match(/([a-zA-Z]+-)(\d+)/);
      if (match) {
        const nextNum = parseInt(match[2]) + 1;
        setSlotForm(prev => ({ ...prev, slot_id: `${match[1]}${nextNum.toString().padStart(2, '0')}` }));
      }
    }
  };

  const handleSaveSlot = async (e) => {
    e.preventDefault();
    if (!newRoi || !slotForm.slot_id) return;

    setSaving(true);
    try {
      const data = {
        slot_id: slotForm.slot_id,
        camera_id: selectedCamera,
        x1: newRoi.x1,
        y1: newRoi.y1,
        x2: newRoi.x2,
        y2: newRoi.y2,
        direction: slotForm.direction
      };
      
      await api.saveSlotROI(data);
      
      // Add to local state and re-sort
      const updatedSlots = [...slots.filter(s => s.slot_id !== data.slot_id), { ...data, status: 'vacant' }];
      setSlots(updatedSlots.sort((a, b) => a.slot_id.localeCompare(b.slot_id, undefined, { numeric: true })));
      setNewRoi(null);
      setSlotForm({ slot_id: '', direction: '' });
      
      // Auto-detect the saved slot if we have an image
      if (imageFile) {
        try {
          await api.uploadImage(imageFile, selectedCamera);
          fetchSlots(); // Refresh to get the actual VGG16 prediction
        } catch (err) {
          console.error("Auto-detect failed:", err);
        }
      }
      
    } catch (error) {
      console.error('Failed to save slot:', error);
      alert('Failed to save slot. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    if (!confirm(`Delete slot ${slotId}?`)) return;
    try {
      await api.deleteSlot(slotId);
      setSlots(slots.filter(s => s.slot_id !== slotId));
    } catch (error) {
      console.error('Failed to delete slot:', error);
    }
  };

  const handleDeleteAllSlots = async () => {
    if (!confirm('Are you sure you want to delete ALL slots? This cannot be undone.')) return;
    try {
      await api.deleteAllSlots();
      setSlots([]);
      alert('All slots have been successfully deleted.');
    } catch (error) {
      console.error('Failed to delete all slots:', error);
      alert('Failed to delete all slots.');
    }
  };

  // Filter ROIs for the current camera view
  const currentRois = slots.filter(s => s.camera_id === selectedCamera && s.x1 !== null);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">System Setup</h2>
        <p className="text-[var(--color-text-secondary)] mt-1">Configure parking slots and regions of interest</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Canvas */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Camera View</h3>
              <div className="flex gap-4">
                <select 
                  className="input max-w-xs py-1" 
                  value={selectedCamera} 
                  onChange={(e) => setSelectedCamera(e.target.value)}
                >
                  <option value="">Select Camera...</option>
                  {cameras.map(c => (
                    <option key={c.camera_id} value={c.camera_id}>{c.camera_id}</option>
                  ))}
                </select>
                <label className="btn btn-outline py-1 cursor-pointer">
                  Upload Reference Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
                {imageFile && (
                  <button 
                    className="btn btn-primary py-1"
                    onClick={handleTestDetection}
                    disabled={testing}
                  >
                    {testing ? 'Processing...' : 'Test Occupancy Detection (Camera 2)'}
                  </button>
                )}
              </div>
            </div>
            
            <ROICanvas 
              imageSrc={imageSrc} 
              initialRois={currentRois}
              onROIComplete={handleROIComplete}
            />
            <p className="text-sm text-[var(--color-text-muted)] mt-4">
              Tip: Click and drag on the image to draw a new parking slot region.
            </p>
          </div>
        </div>

        {/* Right Col: Setup Form & List */}
        <div className="space-y-6">
          {newRoi && (
            <div className="card p-6 border-[var(--color-accent-blue)] shadow-[var(--shadow-glow)] animate-fade-in-scale">
              <h3 className="text-lg font-semibold mb-4 text-[var(--color-accent-blue)]">New Slot Selection</h3>
              <div className="bg-[var(--color-bg-secondary)] p-3 rounded mb-4 font-mono text-sm">
                X: {newRoi.x1}-{newRoi.x2} | Y: {newRoi.y1}-{newRoi.y2}
              </div>
              
              <form onSubmit={handleSaveSlot} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1">Slot ID</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="e.g. A-01" 
                    value={slotForm.slot_id}
                    onChange={(e) => setSlotForm({...slotForm, slot_id: e.target.value.toUpperCase()})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Direction Text</label>
                  <textarea 
                    className="input min-h-[100px]" 
                    placeholder="e.g. Turn left at pillar 2, 3rd slot on right" 
                    value={slotForm.direction}
                    onChange={(e) => setSlotForm({...slotForm, direction: e.target.value})}
                    required
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="btn btn-primary flex-1" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Slot'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setNewRoi(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="card p-6 max-h-[600px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Configured Slots ({slots.length})</h3>
              {slots.length > 0 && (
                <button
                  onClick={handleDeleteAllSlots}
                  className="text-xs px-3 py-1 bg-[var(--color-accent-red)] text-white font-semibold rounded hover:opacity-80 transition-opacity"
                >
                  DELETE ALL
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 pr-2">
              {slots.map(slot => (
                <div key={slot.slot_id} className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg flex justify-between items-center group" style={{ padding: '0.75rem', marginBottom: '0.5rem' }}>
                  <div>
                    <div className="font-mono font-bold">{slot.slot_id}</div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate max-w-[150px]">
                      {slot.direction || 'No direction'}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteSlot(slot.slot_id)}
                    className="text-[var(--color-accent-red)] opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-[var(--color-bg-primary)] rounded"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
