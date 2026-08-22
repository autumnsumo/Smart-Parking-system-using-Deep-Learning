import { useState, useEffect } from 'react';
import api from '../api';

export default function VehicleLog() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    fetchVehicles();
  }, [page]); // Re-fetch on page change

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const data = await api.getVehicles({ search, page, limit });
      setVehicles(data.vehicles);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchVehicles();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vehicle log?')) return;
    try {
      await api.deleteVehicleLog(id);
      fetchVehicles();
    } catch (error) {
      alert('Failed to delete vehicle log.');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('WARNING: Are you sure you want to permanently clear ALL vehicle logs?')) return;
    try {
      await api.deleteAllVehicleLogs();
      fetchVehicles();
    } catch (error) {
      alert('Failed to clear vehicle logs.');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold">Vehicle Log</h2>
          <p className="text-[var(--color-text-secondary)] mt-1">History of entries and exits</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search plate..."
              className="input bg-[var(--color-bg-primary)] py-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary py-2 px-4 shadow-[0_0_10px_rgba(0,243,255,0.2)]">Search</button>
          </form>
          <button onClick={handleDeleteAll} className="btn bg-[rgba(255,0,60,0.1)] text-[var(--color-accent-red)] border border-[var(--color-accent-red)] py-2 px-4 shadow-[0_0_10px_rgba(255,0,60,0.2)] hover:bg-[rgba(255,0,60,0.2)]">
            CLEAR ALL LOGS
          </button>
        </div>
      </div>

      <div className="card table-container">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="spinner"></div>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center p-12 text-[var(--color-text-muted)]">
            No vehicles found
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th>Plate Number</th>
                <th>Assigned Slot</th>
                <th>Status</th>
                <th>Entry Time</th>
                <th>Exit Time</th>
                <th>Duration</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <td className="font-mono font-bold text-[var(--color-accent-cyan)] drop-shadow-[0_0_5px_rgba(0,243,255,0.4)]">
                    {v.plate_number}
                  </td>
                  <td className="font-mono opacity-80">{v.assigned_slot || '-'}</td>
                  <td>
                    <span className={`badge ${v.status}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="opacity-80">{v.entry_time ? new Date(v.entry_time).toLocaleString() : '-'}</td>
                  <td className="opacity-80">{v.exit_time ? new Date(v.exit_time).toLocaleString() : '-'}</td>
                  <td className="font-mono text-sm opacity-80">{v.duration ? v.duration.split('.')[0] : '-'}</td>
                  <td className="text-right">
                    <button 
                      onClick={() => handleDelete(v.id)}
                      className="text-[var(--color-accent-red)] hover:text-red-400 opacity-60 hover:opacity-100 transition-opacity p-1"
                      title="Delete Log"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex items-center justify-between mt-6 px-4">
          <div className="text-sm text-[var(--color-text-secondary)]">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} entries
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-outline py-1 px-3"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <span className="flex items-center px-4 font-mono text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              className="btn btn-outline py-1 px-3"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
