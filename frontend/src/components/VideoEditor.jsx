
import { useState } from 'react';
import { cropVideo, scaleSource, rotateSource } from '../services/obsService';
 
export function VideoEditor() {
  const [cropL, setCropL] = useState(0);
  const [cropR, setCropR] = useState(0);
  const [cropT, setCropT] = useState(0);
  const [cropB, setCropB] = useState(0);
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [rotation, setRotation] = useState(0);
 
  const handleCrop = async () => {
    await cropVideo('UploadedVideo', cropL, cropR, cropT, cropB);
    alert('✅ Video cropped');
  };
 
  const handleScale = async () => {
    await scaleSource('UploadedVideo', scaleX, scaleY);
    alert('✅ Video scaled');
  };
 
  const handleRotate = async () => {
    await rotateSource('UploadedVideo', rotation);
    alert('✅ Video rotated');
  };
 
  return (
    <div style={{
      backgroundColor: '#1e293b',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #334155'
    }}>
      <h3>✂️ Video Editor (Real-time)</h3>
 
      {/* Crop Controls */}
      <div style={{ marginBottom: '20px' }}>
        <h4>Crop</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label>Left:</label>
            <input type="range" min="0" max="500" value={cropL} onChange={(e) => setCropL(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div>
            <label>Right:</label>
            <input type="range" min="0" max="500" value={cropR} onChange={(e) => setCropR(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div>
            <label>Top:</label>
            <input type="range" min="0" max="500" value={cropT} onChange={(e) => setCropT(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <div>
            <label>Bottom:</label>
            <input type="range" min="0" max="500" value={cropB} onChange={(e) => setCropB(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
        </div>
        <button onClick={handleCrop} style={{
          width: '100%',
          marginTop: '10px',
          backgroundColor: '#f59e0b',
          color: 'white',
          padding: '10px',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer'
        }}>
          Apply Crop
        </button>
      </div>
 
      {/* Scale Controls */}
      <div style={{ marginBottom: '20px' }}>
        <h4>Scale</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label>Scale X:</label>
            <input type="range" min="0.1" max="5" step="0.1" value={scaleX} onChange={(e) => setScaleX(Number(e.target.value))} style={{ width: '100%' }} />
            <span>{scaleX.toFixed(2)}x</span>
          </div>
          <div>
            <label>Scale Y:</label>
            <input type="range" min="0.1" max="5" step="0.1" value={scaleY} onChange={(e) => setScaleY(Number(e.target.value))} style={{ width: '100%' }} />
            <span>{scaleY.toFixed(2)}x</span>
          </div>
        </div>
        <button onClick={handleScale} style={{
          width: '100%',
          marginTop: '10px',
          backgroundColor: '#06b6d4',
          color: 'white',
          padding: '10px',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer'
        }}>
          Apply Scale
        </button>
      </div>
 
      {/* Rotation Controls */}
      <div>
        <h4>Rotate</h4>
        <input type="range" min="0" max="360" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} style={{ width: '100%' }} />
        <span>{rotation}°</span>
        <button onClick={handleRotate} style={{
          width: '100%',
          marginTop: '10px',
          backgroundColor: '#8b5cf6',
          color: 'white',
          padding: '10px',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer'
        }}>
          Apply Rotation
        </button>
      </div>
    </div>
  );
}
 

export default VideoEditor;