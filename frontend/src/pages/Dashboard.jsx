import { useState, useEffect } from 'react';
import {
  startStream,
  stopStream,
  getScenes,
  switchScene,
  uploadVideo,
  uploadLogo,
  getStreamStatus,
  updateText,
  startYouTubeLive,
  stopYouTubeLive,
  getLiveStatus
} from '../services/obsService';
import Controls from '../components/Controls';
import TextEditor from '../components/TextEditor';
import VideoEditor from '../components/VideoEditor';
import YouTubeLive from '../components/YouTubeLive';
import Player from '../components/Player';

export default function Dashboard() {
  const [scenes, setScenes] = useState([]);
  const [currentScene, setCurrentScene] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [liveLink, setLiveLink] = useState('http://localhost:8080/hls/stream.m3u8');
  const [liveStatus, setLiveStatus] = useState(null);
  const [uploadedVideoName, setUploadedVideoName] = useState('');
  const [uploadedLogoName, setUploadedLogoName] = useState('');

  useEffect(() => {
    loadScenes();
    checkLiveStatus();
    const interval = setInterval(checkLiveStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadScenes = async () => {
    try {
      const response = await getScenes();
      setScenes(response.data);
      if (response.data.length > 0) {
        setCurrentScene(response.data[0].sceneName);
      }
    } catch (err) {
      console.log('OBS not connected — YouTube live streaming still works without OBS.');
    }
  };

  const checkLiveStatus = async () => {
    try {
      const response = await getLiveStatus();
      setIsLive(response.data.isLive || false);
      setLiveStatus(response.data);
    } catch (err) {
      // ignore
    }
  };

  const handleStart = async () => {
    try {
      setError('');
      await startStream();
      setIsLive(true);
    } catch (err) {
      setError('Failed to start OBS stream: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleStop = async () => {
    try {
      setError('');
      await stopStream();
      setIsLive(false);
    } catch (err) {
      setError('Failed to stop OBS stream: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleScene = async (sceneName) => {
    try {
      setError('');
      await switchScene(sceneName);
      setCurrentScene(sceneName);
    } catch (err) {
      setError('Failed to switch scene: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdateText = async (text) => {
    try {
      setError('');
      await updateText(text);
      setUploadStatus('✅ Text updated');
      setTimeout(() => setUploadStatus(''), 2000);
    } catch (err) {
      setError('Failed to update text: ' + (err.response?.data?.error || err.message));
    }
  };

  // ===== YouTube LIVE =====
  const handleStartLive = async (videoFile) => {
    try {
      setError('');
      setUploadStatus('🚀 Starting YouTube live stream...');
      const res = await startYouTubeLive(videoFile, uploadedLogoName || null);
      setIsLive(true);
      if (res.data.videoFile) {
        setLiveLink(`http://localhost:5000/uploads/${res.data.videoFile}`);
      }
      setUploadStatus('🔴 ' + res.data.message);
      setTimeout(() => setUploadStatus(''), 5000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start live stream');
      setUploadStatus('');
    }
  };

  const handleStopLive = async () => {
    try {
      setError('');
      await stopYouTubeLive();
      setIsLive(false);
      setUploadStatus('⏹ Stream stopped');
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Failed to stop live stream: ' + (err.response?.data?.error || err.message));
    }
  };

  // ===== UPLOADS =====
  const onVideoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('video', file);

    try {
      setUploadStatus('📹 Uploading video...');
      setError('');
      const res = await uploadVideo(formData);
      setUploadedVideoName(res.data.filename);
      setLiveLink(`http://localhost:5000/uploads/${res.data.filename}`); // show video locally
      setUploadStatus(`✅ Video uploaded: ${res.data.filename}`);
      // Hack to ask YouTubeLive to refresh if needed (can be handled elsewhere)
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Failed to upload video: ' + (err.response?.data?.error || err.message));
      setUploadStatus('');
    }
  };

  const onLogoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    try {
      setUploadStatus('🎨 Uploading logo...');
      setError('');
      const res = await uploadLogo(formData);
      setUploadedLogoName(res.data.filename);
      setUploadStatus(`✅ Logo uploaded: ${res.data.filename}`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Failed to upload logo: ' + (err.response?.data?.error || err.message));
      setUploadStatus('');
    }
  };

  return (
    <div style={{
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Error Banner */}
      {error && (
        <div style={{
          backgroundColor: '#7f1d1d',
          border: '1px solid #ef4444',
          color: '#fca5a5',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{
            background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '18px'
          }}>✕</button>
        </div>
      )}

      <h1 style={{
        textAlign: 'center',
        marginBottom: '40px',
        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontSize: '32px',
        fontWeight: 'bold'
      }}>🎬 Stream Control Center</h1>

      {/* Upload Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' }}>
        <div style={{
          backgroundColor: '#1e293b',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #334155'
        }}>
          <h3 style={{ marginTop: 0 }}>📹 Upload Video</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '10px' }}>
            Upload a video to stream live on YouTube
          </p>
          <input
            type="file"
            accept="video/*"
            onChange={onVideoFileChange}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              boxSizing: 'border-box'
            }}
          />
          {uploadedVideoName && (
            <p style={{ color: '#22c55e', fontSize: '12px', marginTop: '8px' }}>
              ✅ Ready: {uploadedVideoName}
            </p>
          )}
        </div>

        <div style={{
          backgroundColor: '#1e293b',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #334155'
        }}>
          <h3 style={{ marginTop: 0 }}>🎨 Upload Logo</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '10px' }}>
            Logo will overlay on your live stream
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={onLogoFileChange}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#e2e8f0',
              boxSizing: 'border-box'
            }}
          />
          {uploadedLogoName && (
            <p style={{ color: '#22c55e', fontSize: '12px', marginTop: '8px' }}>
              ✅ Ready: {uploadedLogoName}
            </p>
          )}
        </div>
      </div>

      {/* Main Control Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '40px' }}>

        {/* Left Sidebar */}
        <div>
          {/* YouTube Live — THIS IS THE MAIN FEATURE */}
          <YouTubeLive
            onStartLive={handleStartLive}
            onStopLive={handleStopLive}
            isLive={isLive}
            liveStatus={liveStatus}
            uploadedVideoName={uploadedVideoName}
          />

          {/* OBS Controls (optional, works when OBS is connected) */}
          <div style={{
            backgroundColor: '#1e293b',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #334155',
            marginTop: '20px'
          }}>
            <h3 style={{ marginTop: 0 }}>⚡ OBS Controls <span style={{ fontSize: '11px', color: '#64748b' }}>(optional)</span></h3>
            <Controls onStart={handleStart} onStop={handleStop} />
          </div>

          {/* Scene Selector */}
          {scenes.length > 0 && (
            <div style={{
              backgroundColor: '#1e293b',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #334155',
              marginTop: '20px'
            }}>
              <h3 style={{ marginTop: 0 }}>🎥 Scenes</h3>
              <select
                value={currentScene}
                onChange={(e) => handleScene(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#e2e8f0',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              >
                {scenes.map(scene => (
                  <option key={scene.sceneName} value={scene.sceneName}>
                    {scene.sceneName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Text Editor */}
          <div style={{
            backgroundColor: '#1e293b',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #334155',
            marginTop: '20px'
          }}>
            <h3 style={{ marginTop: 0 }}>🔤 Overlay Text</h3>
            <TextEditor onUpdate={handleUpdateText} />
          </div>
        </div>

        {/* Right Side */}
        <div>
          {/* Live Preview */}
          <div style={{
            backgroundColor: '#1e293b',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid #334155',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>📺 Live Preview</h3>
              <span style={{
                background: isLive ? '#dc2626' : '#334155',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {isLive ? '🔴 LIVE' : 'OFFLINE'}
              </span>
            </div>
            <Player url={liveLink} />
          </div>

          {/* Video Editor */}
          <VideoEditor />

          {/* Upload Status */}
          {uploadStatus && (
            <div style={{
              marginTop: '20px',
              backgroundColor: '#064e3b',
              padding: '12px',
              borderRadius: '8px',
              color: '#34d399',
              border: '1px solid #065f46',
              textAlign: 'center'
            }}>
              {uploadStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}