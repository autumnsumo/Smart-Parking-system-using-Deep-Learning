import { useState, useEffect } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import api from '../api';
import StatsBar from '../components/StatsBar';
import SlotCard from '../components/SlotCard';

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, vacant: 0, occupied: 0, reserved: 0 });
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [anprFileUrl, setAnprFileUrl] = useState(null);
  const [anprLoading, setAnprLoading] = useState(false);
  const [anprResult, setAnprResult] = useState(null);
  const [anprAssignedSlot, setAnprAssignedSlot] = useState(null);

  const [exitFileUrl, setExitFileUrl] = useState(null);
  const [exitLoading, setExitLoading] = useState(false);
  const [exitResult, setExitResult] = useState(null);
  const [exitFreedSlot, setExitFreedSlot] = useState(null);
  
  const [reservePlate, setReservePlate] = useState('');

  const { lastMessage, isConnected } = useWebSocket('/ws/dashboard');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'initial_state') {
      setStats(lastMessage.data.stats);
      setSlots(lastMessage.data.slots.sort((a, b) => a.slot_id.localeCompare(b.slot_id, undefined, { numeric: true })));
      setLoading(false);
    } else if (lastMessage.type === 'stats_update') {
      setStats(lastMessage.data);
    } else if (lastMessage.type === 'slot_update') {
      const updatedSlot = lastMessage.data;
      setSlots((prev) => 
        prev.map((s) => s.slot_id === updatedSlot.slot_id ? { ...s, status: updatedSlot.status, plate_number: updatedSlot.plate_number } : s)
      );
      // Also update selected slot if it matches
      setSelectedSlot((prev) => 
        prev?.slot_id === updatedSlot.slot_id ? { ...prev, status: updatedSlot.status, plate_number: updatedSlot.plate_number } : prev
      );
    }
  }, [lastMessage]);

  const fetchInitialData = async () => {
    try {
      const [statsData, slotsData] = await Promise.all([
        api.getStats(),
        api.getSlots()
      ]);
      setStats(statsData);
      setSlots(slotsData.sort((a, b) => a.slot_id.localeCompare(b.slot_id, undefined, { numeric: true })));
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    }
  };

  const handleSlotClick = (slot) => {
    setSelectedSlot(slot);
  };

  const handleForceEmpty = async (slotId) => {
    try {
      await api.forceEmptySlot(slotId);
      setSelectedSlot(null);
    } catch (err) {
      alert('Failed to force empty slot.');
    }
  };

  const handleReserveSlot = async (slotId) => {
    try {
      await api.reserveSlot(slotId, reservePlate || 'RESERVED');
      setReservePlate('');
    } catch (err) {
      alert('Failed to reserve slot.');
    }
  };

  const handleAnprUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAnprFileUrl(URL.createObjectURL(file));
    setAnprLoading(true);
    setAnprResult(null);
    setAnprAssignedSlot(null);
    try {
      const anprRes = await api.anprFromImage(file);
      if (anprRes.plate_number && anprRes.plate_number !== "UNKNOWN") {
        setAnprResult(anprRes.plate_number);
        // Automatically trigger entry
        const entryRes = await api.vehicleEntry(anprRes.plate_number);
        setAnprAssignedSlot(entryRes.assigned_slot);
        alert(`Detected plate: ${anprRes.plate_number}\nVehicle entered and assigned slot ${entryRes.assigned_slot} successfully.`);
      } else {
        alert('Could not read plate from image.');
        setAnprResult('UNKNOWN');
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to process entry. Check console.');
    } finally {
      setAnprLoading(false);
    }
  };

  const handleExitUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
      setExitFileUrl(URL.createObjectURL(file));
      setExitLoading(true);
      setExitResult(null);
      setExitFreedSlot(null);
      try {
        const exitRes = await api.anprExit(file);
        if (exitRes.plate_number && exitRes.plate_number !== "UNKNOWN") {
          setExitResult(exitRes.plate_number);
          // Automatically trigger exit
          const res = await api.vehicleExit(exitRes.plate_number);
          setExitFreedSlot(res.slot);
          alert(`Detected plate: ${exitRes.plate_number}\nVehicle exited successfully. Slot ${res.slot} freed. Fee: $${res.fee}`);
        } else {
          alert('Could not read plate from image.');
        setExitResult('UNKNOWN');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to process exit. Vehicle may not be found. Check console.');
    } finally {
      setExitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8 relative">
        <div className="relative">
          <h2 className="text-3xl font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-purple)] drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]">
            Live HUD
          </h2>
          <p className="text-[var(--color-accent-cyan)] mt-1 font-mono text-sm tracking-widest opacity-80 uppercase">
            // Global Occupancy Matrix //
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm font-mono text-[var(--color-accent-cyan)] uppercase tracking-wider border border-[var(--color-accent-cyan)] bg-[rgba(0,243,255,0.1)] px-4 py-2 rounded shadow-[0_0_15px_rgba(0,243,255,0.2)]">
          <span className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
          {isConnected ? 'System Online' : 'Link Offline'}
        </div>
      </div>

      <StatsBar stats={stats} />

      <div className="grid grid-cols-1 xl:grid-cols-2 force-gap-8 force-mb-10">
        {/* Entry Gate (Camera 1) Simulation */}
        <div className="card force-p-8 flex flex-col h-full border-t-4 border-t-[var(--color-accent-cyan)] border-b-4 border-b-[var(--color-accent-cyan)]">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl text-[var(--color-accent-cyan)]">⎔</span>
            <h3 className="text-xl font-bold font-mono uppercase tracking-widest text-[var(--color-accent-cyan)]">Entry Protocol</h3>
          </div>
          <p className="text-[var(--color-text-secondary)] font-mono text-sm mb-8 flex-1 leading-relaxed opacity-80">
            &gt; AWAITING INPUT_
            <br />&gt; INITIATE OCR SCAN TO ASSIGN VECTOR...
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <label className="btn btn-primary">
              {anprLoading ? 'SCANNING...' : 'UPLOAD IMAGE'}
              <input type="file" accept="image/*" className="hidden" onChange={handleAnprUpload} disabled={anprLoading} />
            </label>
            
            {anprFileUrl && (
              <div className="flex items-center gap-4 w-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] shadow-inner" style={{ padding: '0.75rem' }}>
                <img src={anprFileUrl} alt="Car" className="h-14 w-20 object-cover rounded-md border border-[var(--color-border)] shadow-sm" />
                {anprResult && (
                  <div className="flex flex-col ml-auto">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-1">Extracted Plate</span>
                    <span className="font-mono text-lg font-bold text-yellow-400 bg-black rounded-md border border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]" style={{ padding: '0.25rem 0.75rem' }}>
                      {anprResult}
                    </span>
                  </div>
                )}
                {anprAssignedSlot && (
                  <div className="flex flex-col ml-4 border-l border-[var(--color-border)] pl-4">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-1">Assigned Vector</span>
                    <span className="font-mono text-lg font-bold text-[var(--color-accent-cyan)] bg-black rounded-md border border-[var(--color-accent-cyan)] shadow-[0_0_10px_rgba(0,243,255,0.2)]" style={{ padding: '0.25rem 0.75rem' }}>
                      {anprAssignedSlot}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Exit Gate Simulation */}
        <div className="card force-p-8 flex flex-col h-full border-t-4 border-t-[var(--color-accent-purple)] border-b-4 border-b-[var(--color-accent-purple)]">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl text-[var(--color-accent-purple)]">⎈</span>
            <h3 className="text-xl font-bold font-mono uppercase tracking-widest text-[var(--color-accent-purple)]">Exit Protocol</h3>
          </div>
          <p className="text-[var(--color-text-secondary)] font-mono text-sm mb-8 flex-1 leading-relaxed opacity-80">
            &gt; AWAITING DEPARTURE_
            <br />&gt; INITIATE SCAN TO FREE NODE RESOURCE...
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <label className="btn btn-secondary">
              {exitLoading ? 'SCANNING...' : 'UPLOAD IMAGE'}
              <input type="file" accept="image/*" className="hidden" onChange={handleExitUpload} disabled={exitLoading} />
            </label>
            
            {exitFileUrl && (
              <div className="flex items-center gap-4 w-full bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] shadow-inner" style={{ padding: '0.75rem' }}>
                <img src={exitFileUrl} alt="Car" className="h-14 w-20 object-cover rounded-md border border-[var(--color-border)] shadow-sm" />
                {exitResult && (
                  <div className="flex flex-col ml-auto">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-1">Extracted Plate</span>
                    <span className="font-mono text-lg font-bold text-yellow-400 bg-black rounded-md border border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]" style={{ padding: '0.25rem 0.75rem' }}>
                      {exitResult}
                    </span>
                  </div>
                )}
                {exitFreedSlot && (
                  <div className="flex flex-col ml-4 border-l border-[var(--color-border)] pl-4">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-1">Freed Node</span>
                    <span className="font-mono text-lg font-bold text-[var(--color-accent-purple)] bg-black rounded-md border border-[var(--color-accent-purple)] shadow-[0_0_10px_rgba(188,19,254,0.2)]" style={{ padding: '0.25rem 0.75rem' }}>
                      {exitFreedSlot}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row force-gap-8">
        <div className="flex-1 card force-p-8 border-l-4 border-l-[var(--color-accent-cyan)]">
          <div className="flex justify-between items-center mb-6 border-b border-[var(--color-border)] pb-4">
            <h3 className="text-2xl font-black font-mono tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-text-primary)]">
              [ NODE MAP ]
            </h3>
            <span className="text-xs font-mono text-[var(--color-accent-cyan)] uppercase tracking-[0.2em] animate-pulse">SELECT SECTOR FOR TELEMETRY</span>
          </div>
          {slots.length === 0 ? (
            <div className="text-center py-16 text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)] border border-dashed border-[var(--color-border)] rounded-xl">
              No slots configured. Go to <a href="/setup" className="text-[var(--color-primary)] hover:underline">Setup</a> to add slots.
            </div>
          ) : (
            <div className="slot-grid gap-4">
              {slots.map((slot) => (
                <SlotCard key={slot.slot_id} slot={slot} onClick={handleSlotClick} />
              ))}
            </div>
          )}
        </div>

        {/* Slot Details Sidebar */}
        <div className="w-full xl:w-96 flex-shrink-0">
          <div className="card force-p-8 sticky top-8 border-r-4 border-r-[var(--color-accent-purple)]">
            <h3 className="text-xl font-black font-mono tracking-widest uppercase text-[var(--color-accent-purple)] mb-6 border-b border-[var(--color-border)] pb-4">
              [ TELEMETRY ]
            </h3>
            {selectedSlot ? (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)] mb-1">Slot ID</p>
                  <p className="font-mono text-xl">{selectedSlot.slot_id}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-muted)] mb-1">Status</p>
                  <span className={`badge ${selectedSlot.status}`}>
                    {selectedSlot.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-[var(--color-text-muted)] mb-1">Direction</p>
                  <p className="text-sm bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]" style={{ padding: '0.75rem' }}>
                    {selectedSlot.direction || 'No direction set'}
                  </p>
                </div>
                {selectedSlot.plate_number && (
                  <div>
                    <p className="text-sm text-[var(--color-text-muted)] mb-1">Parked Vehicle</p>
                    <p className="font-mono text-xl text-yellow-400 font-bold bg-black inline-block rounded border border-yellow-500" style={{ padding: '0.25rem 0.5rem' }}>
                      {selectedSlot.plate_number}
                    </p>
                  </div>
                )}
                {selectedSlot.last_updated && (
                  <div>
                    <p className="text-sm text-[var(--color-text-muted)] mb-1">Last Updated</p>
                    <p className="text-sm">{new Date(selectedSlot.last_updated).toLocaleString()}</p>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
                  <h4 className="text-sm font-bold font-mono tracking-wider uppercase text-[var(--color-accent-red)] mb-4">
                    [ OVERRIDE CONTROLS ]
                  </h4>
                  
                  {(selectedSlot.status === 'occupied' || selectedSlot.status === 'reserved') && (
                    <button 
                      onClick={() => handleForceEmpty(selectedSlot.slot_id)}
                      className="btn w-full bg-[rgba(255,0,60,0.1)] text-[var(--color-accent-red)] border border-[var(--color-accent-red)] shadow-[0_0_10px_rgba(255,0,60,0.2)] hover:bg-[rgba(255,0,60,0.2)]"
                    >
                      FORCE EMPTY NODE
                    </button>
                  )}
                  
                  {selectedSlot.status === 'vacant' && (
                    <div className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="Plate Number (Optional)" 
                        className="input w-full bg-black border-[var(--color-border)] text-sm"
                        value={reservePlate}
                        onChange={(e) => setReservePlate(e.target.value.toUpperCase())}
                      />
                      <button 
                        onClick={() => handleReserveSlot(selectedSlot.slot_id)}
                        className="btn w-full btn-secondary border border-[var(--color-accent-purple)] shadow-[0_0_10px_rgba(188,19,254,0.2)]"
                      >
                        RESERVE NODE
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">
                Click a slot on the map to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
