import { useState, useEffect, useRef } from 'react';
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
  const [liveLink, setLiveLink] = useState('http://localhost:5000/hls/stream.m3u8');
  const [liveStatus, setLiveStatus] = useState(null);
  const [uploadedVideoName, setUploadedVideoName] = useState('');
  const [uploadedLogoName, setUploadedLogoName] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState('file');
  const [localStream, setLocalStream] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let stream = null;
    
    async function startPreview() {
      // Only start preview if source type matches and we're NOT live
      if (selectedSourceType === 'camera' && !isLive) {
        try {
          // Request both video AND audio to ensure full device access
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            setLocalStream(stream);

            // Manual play trigger with fail-safe error handling for transitions
            const safePlay = async () => {
              try {
                if (videoRef.current && videoRef.current.srcObject) {
                  await videoRef.current.play();
                }
              } catch (playErr) {
                // Silently ignore interruption errors as they are common when switching sources
                if (playErr.name !== 'AbortError' && !playErr.message.includes('interrupted')) {
                  console.warn('Stage preview notice:', playErr.message);
                }
              }
            };
            safePlay();
          }
        } catch (err) {
          console.warn('Media permission failed (Camera/Mic):', err.message);
          // Only show error if we're actually trying to use the camera
          if (selectedSourceType === 'camera') {
             setError('Cannot access camera/mic: Please check your browser permissions.');
          }
        }
      }
    }

    startPreview();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedSourceType, isLive]);


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
      // Auto-switch to live HLS preview if live
      if (response.data.isLive) {
        setLiveLink('http://localhost:5000/hls/stream.m3u8');
      }
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
  const handleStartLive = async (videoFile, durationHours, autoReconnect, loopCount, cameraName, micName, sourceType) => {
    try {
      setError('');
      
      // CRITICAL: Stop the browser's local preview tracks before starting backend broadcast
      // This releases the camera/mic resource so FFmpeg (backend) can open them.
      if (sourceType === 'camera' && localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        // We don't null srcObject here synchronously to avoid interrupting the browser's internal playback state 
        // aggressively, which can cause the "Removed from document" error popup.
      }

      // Small delay to let the browser release hardware before calling FFmpeg
      await new Promise(r => setTimeout(r, 500));

      setUploadStatus(sourceType === 'camera' ? '🎥 Initializing live camera signal...' : '🚀 Initializing broadcast signal...');
      const res = await startYouTubeLive(videoFile, uploadedLogoName || null, durationHours, autoReconnect, loopCount, cameraName, micName, sourceType);
      setIsLive(true);
      setLiveLink('http://localhost:5000/hls/stream.m3u8');
      setUploadStatus('🔴 Signal: ' + res.data.message);
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
      setUploadStatus('⏹ SIGNAL STOPPED');
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Failed to stop live stream: ' + (err.response?.data?.error || err.message));
    }
  };

  const handlePreviewSelection = (videoName) => {
    if (!isLive) {
      setLiveLink(`http://localhost:5000/uploads/${videoName}`);
    }
  };

  const handleSourceTypeChange = (type) => {
    setSelectedSourceType(type);
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
      // Instant Preview
      setLiveLink(`http://localhost:5000/uploads/${res.data.filename}`); 
      setUploadStatus(`✅ Ready for broadcast: ${res.data.filename}`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Upload failed: ' + (err.response?.data?.error || err.message));
      setUploadStatus('');
    }
  };

  const onLogoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    try {
      setUploadStatus('🎨 Processing logo...');
      setError('');
      const res = await uploadLogo(formData);
      setUploadedLogoName(res.data.filename);
      setUploadStatus(`✅ Logo attached: ${res.data.filename}`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Logo upload failed: ' + (err.response?.data?.error || err.message));
      setUploadStatus('');
    }
  };

  return (
    <div style={{
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      minHeight: '100vh',
      padding: '40px',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Error Banner */}
      {error && (
        <div style={{
          backgroundColor: '#7f1d1d',
          borderLeft: '4px solid #ef4444',
          color: '#fca5a5',
          padding: '16px',
          borderRadius: '4px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.4)'
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
        fontSize: '40px',
        fontWeight: '900',
        letterSpacing: '-1px'
      }}>🎬 SIGNAL CONTROL CENTER</h1>

      {/* Upload Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px' }}>
        <div style={{
          backgroundColor: '#1e293b',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #334155'
        }}>
          <h3 style={{ marginTop: 0, color: '#f8fafc' }}>📹 Source Library</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '15px' }}>
            Upload high-quality video files to loop.
          </p>
          <input
            type="file"
            accept="video/*"
            onChange={onVideoFileChange}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#94a3b8',
              boxSizing: 'border-box'
            }}
          />
          {uploadedVideoName && (
            <p style={{ color: '#10b981', fontSize: '12px', marginTop: '10px', fontWeight: 'bold' }}>
              ✓ LOADED: {uploadedVideoName}
            </p>
          )}
        </div>

        <div style={{
          backgroundColor: '#1e293b',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid #334155'
        }}>
          <h3 style={{ marginTop: 0, color: '#f8fafc' }}>🎨 Overlay Graphics</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '15px' }}>
            Brand your stream with a logo (PNG/JPG).
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={onLogoFileChange}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#94a3b8',
              boxSizing: 'border-box'
            }}
          />
          {uploadedLogoName && (
            <p style={{ color: '#10b981', fontSize: '12px', marginTop: '10px', fontWeight: 'bold' }}>
              ✓ ATTACHED: {uploadedLogoName}
            </p>
          )}
        </div>
      </div>

      {/* Main Control Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '40px' }}>

        {/* Left Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <YouTubeLive
            onStartLive={handleStartLive}
            onStopLive={handleStopLive}
            onPreview={handlePreviewSelection}
            onSourceTypeChange={handleSourceTypeChange}
            isLive={isLive}
            liveStatus={liveStatus}
            uploadedVideoName={uploadedVideoName}
          />

          <div style={{
            backgroundColor: '#1e293b',
            padding: '24px',
            borderRadius: '16px',
            border: '1px solid #334155'
          }}>
            <h3 style={{ marginTop: 0 }}>⚡ OBS INTERFACE</h3>
            <Controls onStart={handleStart} onStop={handleStop} />
          </div>

          <div style={{
            backgroundColor: '#1e293b',
            padding: '24px',
            borderRadius: '16px',
            border: '1px solid #334155'
          }}>
            <h3 style={{ marginTop: 0 }}>🔤 DYNAMIC GRAPHICS</h3>
            <TextEditor onUpdate={handleUpdateText} />
          </div>
        </div>

        {/* Right Side */}
        <div>
          {/* Monitoring Desk */}
          <div style={{
            backgroundColor: '#1e293b',
            padding: '24px',
            borderRadius: '20px',
            border: '1px solid #334155',
            marginBottom: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontWeight: '900', letterSpacing: '0.1em', fontSize: '14px', color: '#64748b' }}>
                MONITORING DESK
              </h3>
              <div style={{
                background: isLive ? '#dc2626' : '#334155',
                color: 'white',
                padding: '6px 16px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '900',
                letterSpacing: '0.05em'
              }}>
                {isLive ? '🔴 LIVE ON-AIR' : '⚪ OFF AIR'}
              </div>
            </div>
            <div style={{ overflow: 'hidden', borderRadius: '12px', position: 'relative', height: '450px', backgroundColor: '#000', border: '1px solid #334155' }}>
              
              {/* STAGE PREVIEW (CAMERA) - Keep mounted to avoid AbortError */}
              <div key="camera-stage-preview" style={{ display: (selectedSourceType === 'camera' && !isLive) ? 'block' : 'none', width: '100%', height: '100%' }}>
                    <video 
                      muted 
                      playsInline 
                      ref={videoRef} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                   <div style={{ position: 'absolute', top: '20px', left: '20px', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', color: '#94a3b8', zIndex: 10 }}>
                     📹 STAGE PREVIEW
                   </div>
              </div>

              {/* LIVE STREAM PLAYER - Keep mounted to avoid AbortError */}
              <div key="live-stream-player" style={{ display: (isLive || selectedSourceType !== 'camera') ? 'block' : 'none', width: '100%', height: '100%' }}>
                  <Player url={liveLink} />
                  
                  {isLive && !liveStatus?.ffmpegRunning && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: 'rgba(0,0,0,0.85)', color: '#ef4444',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      padding: '20px', textAlign: 'center', zIndex: 20
                    }}>
                      
                      <button 
                        onClick={() => handleStopLive()}
                        style={{ background: '#334155', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', marginTop: '20px', fontWeight: 'bold' }}
                      >RESET BROADCASTER</button>
                    </div>
                  )}
              </div>
            </div>
          </div>

          <VideoEditor />

          {/* Toast Message */}
          {uploadStatus && (
            <div style={{
              marginTop: '20px',
              backgroundColor: '#065f46',
              padding: '16px',
              borderRadius: '8px',
              color: '#34d399',
              fontWeight: 'bold',
              border: '1px solid #059669',
              textAlign: 'center',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
              {uploadStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}