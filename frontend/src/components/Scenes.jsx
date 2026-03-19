export default function Controls({ onStart, onStop }) {
  return (
    <div>
      <h2>Stream</h2>
      <button onClick={onStart}>▶️ Start</button>
      <button onClick={onStop}>⏹ Stop</button>
    </div>
  );
}
