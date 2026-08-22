export default function SlotCard({ slot, onClick }) {
  const getStatusClass = (status) => {
    switch (status) {
      case 'vacant': return 'vacant';
      case 'occupied': return 'occupied';
      case 'reserved': return 'reserved';
      default: return '';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'vacant': return '⎔';
      case 'occupied': return '⚠';
      case 'reserved': return '◬';
      default: return '?';
    }
  };

  return (
    <div
      className={`slot-cell ${getStatusClass(slot.status)} tooltip`}
      data-tooltip={`${slot.slot_id} • ${slot.status.toUpperCase()}`}
      onClick={() => onClick && onClick(slot)}
    >
      <div className="text-xl mb-1">{getStatusIcon(slot.status)}</div>
      <div className="font-mono">{slot.slot_id}</div>
    </div>
  );
}
