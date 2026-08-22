import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import EntryDisplay from './pages/EntryDisplay';
import VehicleLog from './pages/VehicleLog';
import Setup from './pages/Setup';
import CameraManagement from './pages/CameraManagement';
import ExitDisplay from './pages/ExitDisplay';

function Layout({ children }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-[var(--color-bg-primary)]">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[var(--color-bg-glass)] backdrop-blur-xl border-r border-[var(--color-border)] flex flex-col shadow-[var(--shadow-glow)] relative overflow-hidden">
        {/* Glow Line */}
        <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-transparent via-[var(--color-accent-cyan)] to-transparent opacity-50"></div>
        
        <div className="p-6 border-b border-[var(--color-border)]">
          <h1 className="text-2xl font-black font-mono tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-purple)] drop-shadow-[0_0_10px_rgba(0,243,255,0.3)] animate-pulse">
            NEURO-PARK
          </h1>
          <p className="text-xs font-mono text-[var(--color-accent-cyan)] mt-1 uppercase tracking-[0.2em] opacity-80">// Admin Matrix</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 font-mono text-sm tracking-wider uppercase">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 ${
                isActive
                  ? 'bg-[rgba(0,243,255,0.1)] text-[var(--color-accent-cyan)] shadow-[inset_4px_0_0_var(--color-accent-cyan)] drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent-cyan)] hover:bg-[rgba(0,243,255,0.05)]'
              }`
            }
          >
            <span className="text-lg opacity-80">⎔</span> [ LIVE MAP ]
          </NavLink>
          <NavLink
            to="/vehicles"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 ${
                isActive
                  ? 'bg-[rgba(0,243,255,0.1)] text-[var(--color-accent-cyan)] shadow-[inset_4px_0_0_var(--color-accent-cyan)] drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent-cyan)] hover:bg-[rgba(0,243,255,0.05)]'
              }`
            }
          >
            <span className="text-lg opacity-80">⎈</span> [ VEHICLE LOG ]
          </NavLink>
          <NavLink
            to="/setup"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 ${
                isActive
                  ? 'bg-[rgba(0,243,255,0.1)] text-[var(--color-accent-cyan)] shadow-[inset_4px_0_0_var(--color-accent-cyan)] drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent-cyan)] hover:bg-[rgba(0,243,255,0.05)]'
              }`
            }
          >
            <span className="text-lg opacity-80">🛠</span> [ ROI SETUP ]
          </NavLink>
          <NavLink
            to="/cameras"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded transition-all duration-200 ${
                isActive
                  ? 'bg-[rgba(0,243,255,0.1)] text-[var(--color-accent-cyan)] shadow-[inset_4px_0_0_var(--color-accent-cyan)] drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent-cyan)] hover:bg-[rgba(0,243,255,0.05)]'
              }`
            }
          >
            <span className="text-lg opacity-80">📹</span> [ CAMERAS ]
          </NavLink>
        </nav>
        <div className="p-4 border-t border-[var(--color-border)]">
          <ul className="space-y-1">
            <li>
              <a
                href="/display"
                target="_blank"
                className="flex items-center px-4 py-3 rounded-lg text-[var(--color-accent-blue)] hover:bg-[var(--color-bg-card)] transition-colors"
              >
                Entry Display <span className="ml-2 opacity-50">↗</span>
              </a>
            </li>
            <li>
              <a 
                href="/exit-display" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center px-4 py-3 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-white transition-all font-medium border border-transparent"
              >
                Exit Display <span className="ml-2 opacity-50">↗</span>
              </a>
            </li>
          </ul>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-[var(--color-bg-primary)] p-8 relative z-10">
        <div className="w-full h-full page-enter" key={location.pathname}>
          {children}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/display" element={<EntryDisplay />} />
      <Route path="/exit-display" element={<ExitDisplay />} />
      <Route
        path="/*"
        element={
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/vehicles" element={<VehicleLog />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/cameras" element={<CameraManagement />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}

export default App;
