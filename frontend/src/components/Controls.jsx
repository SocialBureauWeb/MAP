export function Controls({ onStart, onStop }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <button onClick={onStart} style={{
          backgroundColor: '#22c55e',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px'
        }}>
          ▶️ Start
        </button>
        <button onClick={onStop} style={{
          backgroundColor: '#ef4444',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px'
        }}>
          ⏹ Stop
        </button>
      </div>
    </div>
  );
}

export default Controls;