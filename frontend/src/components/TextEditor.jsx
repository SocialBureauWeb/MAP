// import { useState } from 'react';

// export default function TextEditor({ onUpdate }) {
//   const [text, setText] = useState('');

//   return (
//     <div>
//       <h2>Overlay</h2>
//       <input
//         value={text}
//         onChange={(e) => setText(e.target.value)}
//       />
//       <button onClick={() => onUpdate(text)}>Update</button>
//     </div>
//   );
// }

import { useState } from 'react';
 
export function TextEditor({ onUpdate }) {
  const [text, setText] = useState('');
 
  const handleUpdate = () => {
    onUpdate(text);
    setText('');
  };
 
  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text..."
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          color: '#e2e8f0',
          borderRadius: '6px',
          marginBottom: '10px'
        }}
      />
      <button onClick={handleUpdate} style={{
        width: '100%',
        backgroundColor: '#6366f1',
        color: 'white',
        padding: '10px',
        borderRadius: '6px',
        border: 'none',
        cursor: 'pointer'
      }}>
        Update Text
      </button>
    </div>
  );
}

export default TextEditor;
