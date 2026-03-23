import { useState, useEffect, useRef } from 'react';
import { getUploadedVideos, getCameraDevices } from '../services/obsService';

export default function YouTubeLive({ 
  onStartLive, 
  onStopLive, 
  isLive, 
  liveStatus, 
  uploadedVideoName, 
  onPreview, 
  onSourceTypeChange 
}) {
  const [videos, setVideos] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [sourceType, setSourceType] = useState('file'); // 'file' or 'camera'
  const [cameraName, setCameraName] = useState('');
  const [micName, setMicName] = useState('');
  const [duration, setDuration] = useState(24);
  const [loopMode, setLoopMode] = useState('hours'); 
  const [loopCount, setLoopCount] = useState(10);
  const [autoReconnect, setAutoReconnect] = useState(true);
  
  useEffect(() => {
    loadVideos();
    loadCameras();
  }, [uploadedVideoName]);

  useEffect(() => {
    if (isLive && liveStatus && liveStatus.sourceType) {
      setSourceType(liveStatus.sourceType);
      if (liveStatus.sourceType === 'camera') {
        setCameraName(liveStatus.cameraName || '');
        setMicName(liveStatus.micName || '');
      } else {
        setSelectedVideo(liveStatus.videoFile || '');
      }
    }
  }, [isLive, liveStatus]);

  useEffect(() => {
    if (onSourceTypeChange) onSourceTypeChange(sourceType);
  }, [sourceType]);

  const loadVideos = async () => {
    try {
      const res = await getUploadedVideos();
      setVideos(res.data);
      if (res.data.length > 0 && !selectedVideo) {
        handleVideoSelect(res.data[0].name);
      }
    } catch (err) { console.error(err); }
  };

  const loadCameras = async () => {
    try {
      const res = await getCameraDevices();
      const videoDevices = res.data.filter(d => d.type === 'video');
      const audioDevices = res.data.filter(d => d.type === 'audio');
      
      setCameras(videoDevices);
      setMics(audioDevices);

      if (videoDevices.length > 0 && !cameraName) {
        setCameraName(videoDevices[0].name);
      }
      if (audioDevices.length > 0 && !micName) {
        setMicName(audioDevices[0].name);
      }
    } catch (err) { console.error(err); }
  };

  const handleVideoSelect = (videoName) => {
    setSelectedVideo(videoName);
    if (onPreview && sourceType === 'file') {
      onPreview(videoName);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSourceAction = () => {
    onStartLive(
      sourceType === 'file' ? selectedVideo : null, 
      duration, 
      autoReconnect, 
      loopCount, 
      sourceType === 'camera' ? cameraName : null,
      sourceType === 'camera' ? micName : null,
      sourceType
    );
  };

  return (
    <div style={{
      backgroundColor: '#1e293b',
      padding: '24px',
      borderRadius: '16px',
      border: '1px solid #334155',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0 }}>📺 YouTube Broadcaster</h3>
        {isLive && <span style={{
          background: '#dc2626',
          padding: '4px 12px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 'bold',
          animation: 'pulse 1.5s infinite'
        }}>🔴 LIVE</span>}
      </div>

      {/* Source Toggle - Always available to switch */}
      <div style={{ display: 'flex', gap: '5px', background: '#0f172a', padding: '4px', borderRadius: '8px', marginBottom: '20px' }}>
        <button 
          onClick={() => setSourceType('file')}
          style={{
            flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
            backgroundColor: sourceType === 'file' ? '#334155' : 'transparent',
            color: sourceType === 'file' ? 'white' : '#64748b', cursor: 'pointer', fontSize: '12px'
          }}>📁 Video File</button>
        <button 
          onClick={() => setSourceType('camera')}
          style={{
            flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
            backgroundColor: sourceType === 'camera' ? '#334155' : 'transparent',
            color: sourceType === 'camera' ? 'white' : '#64748b', cursor: 'pointer', fontSize: '12px'
          }}>📹 Live Camera</button>
      </div>

      {sourceType === 'file' ? (
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '5px', display: 'block' }}>Choose File</label>
          {videos.length > 0 ? (
            <select
              value={selectedVideo}
              onChange={(e) => handleVideoSelect(e.target.value)}
              style={{
                width: '100%', padding: '12px', backgroundColor: '#0f172a', border: '1px solid #334155',
                color: '#e2e8f0', borderRadius: '8px', boxSizing: 'border-box'
              }}
            >
              <option value="">-- Select Video --</option>
              {videos.map(v => (
                <option key={v.name} value={v.name}>{v.name} ({formatSize(v.size)})</option>
              ))}
            </select>
          ) : (
            <div style={{ color: '#f59e0b', fontSize: '12px', padding: '10px', backgroundColor: '#451a03', borderRadius: '8px' }}>
              ⚠️ Upload a video to start.
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '5px', display: 'block' }}>Camera</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={cameraName}
                onChange={(e) => setCameraName(e.target.value)}
                style={{
                  flex: 1, padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155',
                  color: '#e2e8f0', borderRadius: '8px', fontSize: '13px'
                }}
              >
                <option value="">-- Generic Device --</option>
                {cameras.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button 
                onClick={loadCameras}
                style={{ backgroundColor: '#334155', color: '#94a3b8', border: 'none', padding: '0 12px', borderRadius: '8px', cursor: 'pointer' }}
              >🔄</button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '5px', display: 'block' }}>Microphone</label>
            <select
              value={micName}
              onChange={(e) => setMicName(e.target.value)}
              style={{
                width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155',
                color: '#e2e8f0', borderRadius: '8px', fontSize: '13px'
              }}
            >
              <option value="">-- Silent Audio --</option>
              {mics.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
         <div>
            <label style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', display: 'block' }}>{sourceType === 'file' ? 'Hours/Loops' : 'Duration (Hours)'}</label>
            <input 
              type="number" value={loopMode === 'hours' ? duration : loopCount} 
              onChange={(e) => loopMode === 'hours' ? setDuration(Number(e.target.value)) : setLoopCount(Number(e.target.value))}
              min="1"
              style={{
                width: '100%', padding: '10px', backgroundColor: '#0f172a', border: '1px solid #334155',
                color: '#e2e8f0', borderRadius: '8px'
              }}
            />
         </div>
         <div style={{ display: 'flex', alignItems: 'center', paddingTop: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px', color: '#94a3b8' }}>
              <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} style={{ marginRight: '8px' }} />
              Auto-Reconnect
            </label>
         </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSourceAction}
          disabled={sourceType === 'file' ? !selectedVideo : !cameraName}
          style={{
            flex: 2,
            background: isLive && liveStatus?.sourceType === sourceType 
              ? '#334155' 
              : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: 'white', padding: '16px', borderRadius: '10px', border: 'none',
            cursor: (sourceType === 'file' ? !selectedVideo : !cameraName) ? 'not-allowed' : 'pointer', 
            fontSize: '14px', fontWeight: 'bold', boxShadow: '0 8px 16px rgba(220, 38, 38, 0.3)',
            opacity: (sourceType === 'file' ? !selectedVideo : !cameraName) ? 0.5 : 1
          }}
        >
          {isLive 
            ? (liveStatus?.sourceType === sourceType ? '🔄 RESTART CURRENT' : `🔀 SWITCH TO ${(sourceType || 'file').toUpperCase()}`) 
            : `🚀 START ${(sourceType || 'file').toUpperCase()} BROADCAST`}
        </button>

        {isLive && (
          <button
            onClick={onStopLive}
            style={{
              flex: 1, backgroundColor: '#475569', color: 'white', padding: '14px', borderRadius: '10px',
              border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold'
            }}
          >⏹ STOP</button>
        )}
      </div>

      {isLive && liveStatus && (
        <div style={{ 
          marginTop: '15px', 
          backgroundColor: '#0f172a', 
          padding: '10px', 
          borderRadius: '8px', 
          border: '1px solid #334155',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#10b981', fontWeight: 'bold' }}>
            🔴 ON-AIR: {liveStatus.sourceType === 'camera' ? `Camera (${liveStatus.cameraName})` : `File (${liveStatus.videoFile})`}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#64748b' }}>
            Started: {new Date(liveStatus.startedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}