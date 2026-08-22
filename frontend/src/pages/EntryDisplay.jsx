import { useState, useEffect, useRef } from 'react';
import useWebSocket from '../hooks/useWebSocket';
import api from '../api';

export default function EntryDisplay() {
  const [assignment, setAssignment] = useState(null);
  const [stats, setStats] = useState({ total: 0, vacant: 0 });
  const { lastMessage, isConnected } = useWebSocket('/ws/display');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  // Fetch initial stats on mount
  useEffect(() => {
    api.getStats().then(data => setStats(data)).catch(() => {});
  }, []);

  // Initialize camera
  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setStream(s);
      } catch (err) {
        console.error('Camera access denied:', err);
        setCameraError(err.message);
      }
    }
    startCamera();
    // Cleanup only when the component fully unmounts
    return () => {
      // We'll stop all tracks on unmount
    };
  }, []);

  // Stop tracks on full unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Re-attach stream to video element whenever it re-appears in the DOM
  useEffect(() => {
    if (stream && videoRef.current && !assignment) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, assignment]);

  // Interval for scanning every 3 seconds
  useEffect(() => {
    if (!stream || assignment) return; // Don't scan if showing an assignment

    const intervalId = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Ensure video is ready
      if (video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
        try {
          const anprRes = await api.anprFromImage(file);
          if (anprRes.plate_number && anprRes.plate_number !== "UNKNOWN" && anprRes.plate_number.length >= 4) {
            // Found a valid plate, trigger entry!
            await api.vehicleEntry(anprRes.plate_number);
          }
        } catch (err) {
          // Ignore errors during background scanning (like lot is full)
        }
      }, 'image/jpeg', 0.8);
    }, 3000);

    return () => clearInterval(intervalId);
  }, [stream, assignment]);

  // Auto-hide assignment after 30 seconds
  useEffect(() => {
    if (assignment) {
      const timer = setTimeout(() => {
        setAssignment(null);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [assignment]);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'vehicle_assignment') {
      setAssignment(lastMessage.data);
    } else if (lastMessage.type === 'stats_update') {
      setStats(lastMessage.data);
    }
  }, [lastMessage]);

  return (
    <div className="fixed inset-0 bg-[var(--color-bg-primary)] overflow-hidden flex flex-col font-sans">
      {/* Dynamic Background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-[var(--color-accent-blue)] to-transparent opacity-20 animate-pulse-glow"></div>
        <div className="absolute bottom-0 right-0 w-1/2 h-full bg-gradient-to-t from-[var(--color-accent-purple)] to-transparent opacity-20 animate-pulse-glow" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-8 flex justify-between items-center glass-strong border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--color-accent-blue)] to-[var(--color-accent-purple)] flex items-center justify-center text-3xl shadow-[var(--shadow-glow)]">
            🅿️
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white">SMART PARKING</h1>
            <p className="text-[var(--color-accent-cyan)] font-medium tracking-widest uppercase mt-1">Automatic Guidance System</p>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-[var(--color-text-secondary)] uppercase tracking-wider text-sm font-semibold mb-1">
            Available Slots
          </div>
          <div className="text-5xl font-black font-mono">
            <span className={stats.vacant > 0 ? "text-[var(--color-slot-vacant)]" : "text-[var(--color-slot-occupied)]"}>
              {stats.vacant}
            </span>
            <span className="text-[var(--color-text-muted)] text-3xl"> / {stats.total}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-12">
        {assignment ? (
          /* Active Assignment Screen */
          <div className="w-full max-w-5xl animate-fade-in-scale">
            <div className="glass-strong rounded-3xl p-12 border border-[var(--color-border-glow)] shadow-[var(--shadow-glow-lg)] relative overflow-hidden" style={{ padding: '4rem' }}>
              {/* Highlight strip */}
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[var(--color-accent-blue)] via-[var(--color-accent-cyan)] to-[var(--color-accent-purple)]"></div>
              
              <div className="text-center mb-12" style={{ marginBottom: '6rem' }}>
                <h2 className="text-5xl font-bold mb-4" style={{ marginBottom: '3rem' }}>Welcome!</h2>
                <p className="text-2xl text-[var(--color-text-secondary)]">Please proceed to your assigned slot</p>
              </div>

              <div className="grid grid-cols-2 gap-12" style={{ gap: '4rem' }}>
                {/* Plate */}
                <div className="bg-[var(--color-bg-card)] rounded-2xl p-8 border border-[var(--color-border)] shadow-[var(--shadow-card)] flex flex-col items-center justify-center h-72">
                  <p className="text-xl text-[var(--color-text-muted)] uppercase tracking-widest font-bold mb-6">Your Vehicle</p>
                  <div className="bg-yellow-400 text-black font-black font-mono text-6xl h-32 w-full max-w-[340px] rounded-xl shadow-inner border-4 border-yellow-500 tracking-widest flex items-center justify-center leading-none pt-4">
                    {assignment.plate_number}
                  </div>
                </div>

                {/* Slot */}
                <div className="bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-card-hover)] rounded-2xl p-8 border border-[var(--color-accent-blue)] shadow-[var(--shadow-glow)] flex flex-col items-center justify-center h-72">
                  <p className="text-xl text-[var(--color-accent-blue)] uppercase tracking-widest font-bold mb-6">Assigned Slot</p>
                  <div className="text-7xl font-black font-mono text-white animate-pulse-glow h-32 w-full max-w-[340px] bg-[var(--color-bg-primary)] rounded-xl border border-[var(--color-border-glow)] flex items-center justify-center leading-none pt-4">
                    {assignment.assigned_slot}
                  </div>
                </div>
              </div>

              {/* Directions */}
              <div className="mt-12 bg-[rgba(59,130,246,0.1)] rounded-2xl p-8 border border-[rgba(59,130,246,0.2)] flex items-start gap-6" style={{ marginTop: '6rem', padding: '2.5rem', gap: '2rem' }}>
                <div className="text-5xl animate-float">🗺️</div>
                <div>
                  <h3 className="text-xl text-[var(--color-accent-blue)] font-bold mb-2">Directions</h3>
                  <p className="text-3xl font-medium leading-tight text-white">
                    {assignment.direction}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : stats.total > 0 && stats.vacant === 0 ? (
          /* Parking Full Screen */
          <div className="text-center animate-fade-in">
            <div className="mb-12">
              <span className="inline-block p-8 bg-[rgba(239,68,68,0.1)] border-2 border-[var(--color-accent-red)] rounded-full mb-8 shadow-[var(--shadow-glow)]">
                <svg className="w-24 h-24 text-[var(--color-accent-red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <h2 className="text-7xl font-black mb-6 tracking-tight text-[var(--color-accent-red)] animate-pulse-glow">
                PARKING FULL
              </h2>
              <p className="text-3xl text-[var(--color-text-secondary)] font-medium">
                Please wait for a slot to become available
              </p>
            </div>
          </div>
        ) : (
          /* Idle Screen */
          <div className="text-center animate-fade-in">
            {cameraError ? (
              <div className="mb-8 p-4 bg-[rgba(239,68,68,0.1)] border border-[var(--color-accent-red)] text-[var(--color-accent-red)] rounded-xl max-w-xl mx-auto">
                <p className="font-bold">Camera Access Error</p>
                <p className="text-sm">{cameraError}</p>
                <p className="text-xs mt-2">Please allow camera permissions in your browser to use the automatic scanner.</p>
              </div>
            ) : (
              <div className="mb-8 rounded-xl overflow-hidden border-4 border-[var(--color-accent-blue)] shadow-[var(--shadow-glow)] mx-auto relative inline-block bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-[640px] h-[480px] object-cover" />
                <div className="absolute inset-0 border-2 border-dashed border-[var(--color-accent-cyan)] animate-pulse-glow m-8"></div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <span className="bg-[rgba(0,0,0,0.6)] text-white text-xs px-3 py-1 rounded-full font-mono uppercase tracking-widest backdrop-blur">
                    Scanning for license plates...
                  </span>
                </div>
              </div>
            )}
            <h2 className="text-6xl font-black mb-6 tracking-tight gradient-text">
              Drive in automatically
            </h2>
            <p className="text-3xl text-[var(--color-text-secondary)] font-medium animate-breathe">
              Please pull up to the camera
            </p>
          </div>
        )}
      </main>

      {/* Footer Connection Status */}
      <footer className="absolute bottom-4 right-6 flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <span className={`connection-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
        {isConnected ? 'System Online' : 'Connecting...'}
      </footer>
    </div>
  );
}
