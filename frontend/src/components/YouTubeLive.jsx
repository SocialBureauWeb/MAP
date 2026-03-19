import { useState, useEffect } from 'react';
import { getUploadedVideos } from '../services/obsService';

export default function YouTubeLive({ onStartLive, onStopLive, isLive, liveStatus, uploadedVideoName }) {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState('');

  useEffect(() => {
    loadVideos();
  }, [uploadedVideoName]);

  const loadVideos = async () => {
    try {
      const res = await getUploadedVideos();
      setVideos(res.data);
      if (res.data.length > 0) {
        setSelectedVideo(res.data[0].name);
      }
    } catch (err) {
      console.error('Failed to load videos:', err);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{
      backgroundColor: '#1e293b',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #334155'
    }}>
      <h3 style={{ marginTop: 0 }}>
        📺 YouTube Live
        {isLive && <span style={{
          marginLeft: '10px',
          background: '#dc2626',
          padding: '2px 10px',
          borderRadius: '12px',
          fontSize: '11px',
          animation: 'pulse 1.5s infinite'
        }}>🔴 LIVE</span>}
      </h3>

      {!isLive ? (
        <>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '15px' }}>
            Select an uploaded video → Click "Go Live" → Streams directly to YouTube.
          </p>

          {/* Video Selection */}
          {videos.length > 0 ? (
            <select
              value={selectedVideo}
              onChange={(e) => setSelectedVideo(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                color: '#e2e8f0',
                borderRadius: '6px',
                marginBottom: '15px',
                boxSizing: 'border-box'
              }}
            >
              {videos.map(v => (
                <option key={v.name} value={v.name}>
                  {v.name} ({formatSize(v.size)})
                </option>
              ))}
            </select>
          ) : (
            <p style={{ color: '#f59e0b', fontSize: '13px' }}>
              ⚠️ No videos uploaded yet. Upload a video first.
            </p>
          )}

          <button
            onClick={() => onStartLive(selectedVideo)}
            disabled={videos.length === 0}
            style={{
              width: '100%',
              background: videos.length > 0
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : '#334155',
              color: 'white',
              padding: '14px',
              borderRadius: '8px',
              border: 'none',
              cursor: videos.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '16px',
              fontWeight: 'bold',
              boxShadow: videos.length > 0 ? '0 4px 12px rgba(239, 68, 68, 0.4)' : 'none'
            }}
          >
            🚀 GO LIVE ON YOUTUBE
          </button>

          <button
            onClick={loadVideos}
            style={{
              width: '100%',
              marginTop: '10px',
              background: 'transparent',
              color: '#94a3b8',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            🔄 Refresh Video List
          </button>
        </>
      ) : (
        <>
          <div style={{
            backgroundColor: '#7f1d1d',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '15px',
            textAlign: 'center'
          }}>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              🔴 STREAMING LIVE TO YOUTUBE
            </p>
            {liveStatus && (
              <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#fca5a5' }}>
                Video: {liveStatus.videoFile} • Started: {new Date(liveStatus.startedAt).toLocaleTimeString()}
              </p>
            )}
          </div>

          <button
            onClick={onStopLive}
            style={{
              width: '100%',
              backgroundColor: '#6b7280',
              color: 'white',
              padding: '14px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            ⏹ STOP STREAM
          </button>
        </>
      )}
    </div>
  );
}