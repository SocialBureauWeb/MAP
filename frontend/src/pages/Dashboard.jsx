import { useState, useEffect, useRef } from 'react';
import {
  uploadVideo,
  uploadLogo,
  startYouTubeLive,
  stopYouTubeLive,
  getLiveStatus,
} from '../services/obsService';
import VideoEditor from '../components/VideoEditor';
import YouTubeLive from '../components/YouTubeLive';
import Player from '../components/Player';

export default function Dashboard() {
  const [isLive, setIsLive] = useState(false);
  const [prepTransform, setPrepTransform] = useState({ x: 50, y: 50, scale: 1, width: 20, height: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [liveLink, setLiveLink] = useState('http://localhost:5000/hls/stream.m3u8');
  const [liveStatus, setLiveStatus] = useState(null);
  const [uploadedVideoName, setUploadedVideoName] = useState('');
  const [uploadedLogoName, setUploadedLogoName] = useState('');
  const [showOverlay, setShowOverlay] = useState(true);
  const [selectedSourceType, setSelectedSourceType] = useState('file');
  const [localStream, setLocalStream] = useState(null);
  const [stageLink, setStageLink] = useState(''); // Local preview (Stage)
  const [stagePlaying, setStagePlaying] = useState(false);
  const [timelineIsPlaying, setTimelineIsPlaying] = useState(false);
  const [streamParams, setStreamParams] = useState({ 
    transform: { crop: {L:0, R:0, T:0, B:0}, scale: 1, rotation: 0 },
    currentTime: 0,
    isPlaying: false
  }); 
  const [activeTimelineLayers, setActiveTimelineLayers] = useState({});
  const [userScenes, setUserScenes] = useState(() => {
    const saved = localStorage.getItem('broadcaster_scenes');
    return saved ? JSON.parse(saved) : Array.from({ length: 5 }, (_, i) => ({ 
      id: i + 1, name: `SCENE ${i + 1}`, config: null 
    }));
  });

  const [timelineClips, setTimelineClips] = useState([]);

  const [tracks, setTracks] = useState(['Graphics', 'Video', 'Audio']);

  const videoRef = useRef(null);
  const streamRef = useRef(null); // Stable stream reference for play/pause logic
  const playPromiseRef = useRef(null); // Track pending play requests

  useEffect(() => {
    async function startPreview() {
      // Only start preview if source type matches and we're NOT live
      if (selectedSourceType === 'camera' && !isLive) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
            setLocalStream(stream);

            // Manual play trigger with fail-safe error handling for transitions
            const safePlay = async () => {
              try {
                if (videoRef.current && videoRef.current.srcObject) {
                  const playPromise = videoRef.current.play();
                  playPromiseRef.current = playPromise;
                  await playPromise;
                  playPromiseRef.current = null;
                }
              } catch (playErr) {
                playPromiseRef.current = null;
                // Silently ignore interruption errors
                if (playErr.name !== 'AbortError' && !playErr.message.includes('interrupted')) {
                  console.warn('Stage preview notice:', playErr.message);
                }
              }
            };
            safePlay();
          }
        } catch (err) {
          console.warn('Media permission failed (Camera/Mic):', err.message);
          if (selectedSourceType === 'camera') {
            setError('Cannot access camera/mic: Please check your browser permissions.');
          }
        }
      } else {
        // Clear camera safely
        const cleanup = async () => {
            if (playPromiseRef.current) {
                try { await playPromiseRef.current; } catch (e) { /* ignore */ }
            }
            if (streamRef.current) {
               streamRef.current.getTracks().forEach(track => track.stop());
               streamRef.current = null;
            }
            if (videoRef.current) {
              videoRef.current.srcObject = null;
              try { videoRef.current.pause(); } catch (e) { /* ignore */ }
            }
        };
        cleanup();
      }
    }

    startPreview();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedSourceType, isLive]);


  useEffect(() => {
    checkLiveStatus();
    const interval = setInterval(checkLiveStatus, 5000);
    return () => clearInterval(interval);
  }, []);



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


  // ===== YouTube LIVE =====
  const handleStartLive = async (videoFile, logoFile, audioFile, sourceType, transform, logoTransform, cameraName, micName, durationHours, loopCount, autoReconnect) => {
    try {
      setError('');

      // Stop browser tracks to release hardware
      if (sourceType === 'camera' && localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }

      await new Promise(r => setTimeout(r, 600));
      setUploadStatus(sourceType === 'camera' ? '🎥 SIGNAL: Initializing camera broadcast...' : '🚀 SIGNAL: Initializing file broadcast...');
      
      const finalLogo = logoFile || (showOverlay ? (uploadedLogoName || null) : null);
      
      const res = await startYouTubeLive(videoFile, finalLogo, audioFile, durationHours, autoReconnect, loopCount, cameraName, micName, sourceType, transform, logoTransform);
      setIsLive(true);
      setLiveLink('http://localhost:5000/hls/stream.m3u8');
      setUploadStatus('🔴 Signal Active: ' + (res.data.message || 'Streaming'));
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
    setStageLink(`http://localhost:5000/uploads/${videoName}`);
  };

  const handleSourceTypeChange = (type) => {
    setSelectedSourceType(type);
  };

  const handleUpdateLive = async (updatedShowOverlay = null, customParams = null) => {
    if (!isLive && !customParams) return;
    try {
      const params = customParams || streamParams;
      const actualShow = updatedShowOverlay !== null ? updatedShowOverlay : showOverlay;
      
      setUploadStatus(`🔀 SWITCHING SCENE: ${params.sourceType.toUpperCase()}...`);
      
      const res = await startYouTubeLive(
        params.videoFile, 
        actualShow ? (uploadedLogoName || null) : null, 
        params.durationHours, 
        params.autoReconnect, 
        params.loopCount, 
        params.cameraName, 
        params.micName, 
        params.sourceType,
        params.transform
      );
      
      setStreamParams(params);
      setIsLive(true);
      setUploadStatus(`✅ LIVE ON: ${res.data.message}`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      setError('Scene switch failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const saveToScene = (id) => {
    if (timelineClips.length === 0) {
       setError("Timeline is empty. Please add media to the timeline before saving.");
       return;
    }
    const newScenes = userScenes.map(s => s.id === id ? { 
      ...s, 
      config: { ...streamParams, showOverlay, uploadedLogoName, timelineClips, tracks } 
    } : s);
    setUserScenes(newScenes);
    localStorage.setItem('broadcaster_scenes', JSON.stringify(newScenes));
    setUploadStatus(`💾 Configuration saved to SCENE ${id}`);
    setTimeout(() => setUploadStatus(''), 2000);
  };

  const recallScene = async (scene) => {
    if (!scene.config) {
      setTimelineClips([]);
      setTracks(['Graphics', 'Video', 'Audio']);
      setStreamParams({ 
        transform: { crop: {L:0, R:0, T:0, B:0}, scale: 1, rotation: 0 },
        currentTime: 0,
        isPlaying: false
      });
      setStageLink('');
      setUploadStatus(`✨ NEW SCENE READY: Start adding media to timeline`);
      return;
    }
    
    const { videoFile, sourceType, showOverlay: sceneOverlay, uploadedLogoName: sceneLogo, timelineClips: sceneTimeline, tracks: sceneTracks } = scene.config;
    
    // Update local UI state
    setShowOverlay(sceneOverlay);
    if (sceneLogo) setUploadedLogoName(sceneLogo);
    setSelectedSourceType(sourceType);
    if (sourceType === 'file' && videoFile) setStageLink(`http://localhost:5000/uploads/${videoFile}`);
    if (sceneTimeline) setTimelineClips(sceneTimeline);
    if (sceneTracks) setTracks(sceneTracks);
    
    // Switch live if already live
    if (isLive) {
      handleUpdateLive(sceneOverlay, scene.config);
    } else {
      setStreamParams(scene.config);
      setUploadStatus(`⚡ SCENE ${scene.id} READY FOR BROADCAST`);
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
      backgroundColor: '#1a1b1e',
      color: '#e4e4e7',
      height: '100vh',
      fontFamily: 'Inter, Outfit, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>

      {/* ── Top Nav Bar ── */}
      <div style={{
        backgroundColor: '#111113',
        padding: '0 16px',
        height: '44px',
        borderBottom: '1px solid #2a2a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '13px', color: 'white' }}>M</div>
            <span style={{ fontWeight: '800', fontSize: '15px', letterSpacing: '-0.5px' }}>SIGNAL <span style={{ color: '#6366f1' }}>MAP</span></span>
          </div>
          {['Library', 'Live', 'Studio'].map(t => (
            <button key={t} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '13px', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px' }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isLive && <span style={{ backgroundColor: '#dc2626', color: 'white', fontSize: '11px', fontWeight: 'bold', padding: '3px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'blink 1s infinite' }} />LIVE
          </span>}
          <span style={{ fontSize: '11px', color: '#71717a' }}>{new Date().toLocaleTimeString()}</span>
          <button onClick={handleStopLive} style={{ background: isLive ? '#7f1d1d' : '#27272a', color: isLive ? '#fca5a5' : '#a1a1aa', border: 'none', padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>{isLive ? '⏹ END STREAM' : '⚪ STANDBY'}</button>
        </div>
      </div>

      {/* ── Main Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ─── LEFT: Scene Bank ─── */}
        <div style={{ width: '150px', backgroundColor: '#111113', borderRight: '1px solid #2a2a2e', display: 'flex', flexDirection: 'column', flexShrink: 0, padding: '10px 8px', gap: '5px', overflowY: 'auto' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: '#52525b', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px', paddingLeft: '4px' }}>Scenes</div>
          {userScenes.map(scene => (
            <button
              key={scene.id}
              onClick={() => recallScene(scene)}
              onContextMenu={(e) => { e.preventDefault(); saveToScene(scene.id); }}
              title="Click to load • Right-click to save current state"
              style={{
                backgroundColor: scene.config ? '#1c1c20' : '#18181b',
                border: `1px solid ${scene.config ? '#3f3f46' : '#27272a'}`,
                borderRadius: '6px', padding: '8px',
                color: scene.config ? '#e4e4e7' : '#52525b',
                fontSize: '11px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
              }}
            >
              <div style={{ fontWeight: '700', marginBottom: '2px' }}>SCENE {scene.id}</div>
              <div style={{ fontSize: '9px', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {scene.config ? (scene.config.videoFile || 'camera') : '—'}
              </div>
            </button>
          ))}
          <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #27272a' }}>
            <button
              onClick={() => { const n = !showOverlay; setShowOverlay(n); if (isLive) handleUpdateLive(n); }}
              style={{ width: '100%', backgroundColor: showOverlay ? '#450a0a' : '#1c2f23', color: showOverlay ? '#fca5a5' : '#86efac', border: `1px solid ${showOverlay ? '#7f1d1d' : '#14532d'}`, borderRadius: '6px', padding: '6px', fontSize: '10px', fontWeight: '700', cursor: 'pointer' }}
            >{showOverlay ? '✂️ OVERLAY ON' : '➕ OVERLAY OFF'}</button>
          </div>
        </div>

        {/* ─── CENTER: Video + Timeline ─── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#1a1b1e' }}>

          {/* Big Video Player */}
          <div style={{ flex: 1, position: 'relative', backgroundColor: '#000', overflow: 'hidden', minHeight: 0 }}
            onMouseMove={(e) => {
              if (!isDragging) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setPrepTransform(prev => ({
                ...prev,
                x: ((e.clientX - rect.left) / rect.width) * 100,
                y: ((e.clientY - rect.top) / rect.height) * 100
              }));
            }}
            onMouseUp={() => setIsDragging(false)}
          >
            {/* Player Layer (Video) */}
            <div style={{ position: 'absolute', inset: 0 }}>
              {selectedSourceType === 'camera' ? (
                <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Player
                  url={activeTimelineLayers.Video ? `http://localhost:5000/uploads/${activeTimelineLayers.Video.name}` : stageLink}
                  transform={activeTimelineLayers.Video ? activeTimelineLayers.Video.transform : (streamParams?.transform)}
                  currentTime={activeTimelineLayers.Video ? activeTimelineLayers.Video.currentTime : (streamParams?.currentTime)}
                  playing={stagePlaying}
                  isLive={false}
                />
              )}
            </div>

            {/* Graphics Layer Overlay */}
            {activeTimelineLayers.Graphics && (
              <div
                style={{
                  position: 'absolute',
                  top: `${activeTimelineLayers.Graphics.transform?.prepY || 50}%`,
                  left: `${activeTimelineLayers.Graphics.transform?.prepX || 50}%`,
                  width: `${activeTimelineLayers.Graphics.transform?.scale * 20 || 20}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  pointerEvents: 'none'
                }}
              >
                <img 
                  src={`http://localhost:5000/uploads/${activeTimelineLayers.Graphics.name}`} 
                  alt="Overlay" 
                  style={{ 
                    width: '100%', 
                    display: 'block',
                    clipPath: activeTimelineLayers.Graphics.transform?.crop ? `inset(${activeTimelineLayers.Graphics.transform.crop.T}px ${activeTimelineLayers.Graphics.transform.crop.R}px ${activeTimelineLayers.Graphics.transform.crop.B}px ${activeTimelineLayers.Graphics.transform.crop.L}px)` : 'none',
                    transform: `rotate(${activeTimelineLayers.Graphics.transform?.rotation || 0}deg)`
                  }} 
                />
              </div>
            )}

            {/* Audio Layer (Hidden Player) */}
            {activeTimelineLayers.Audio && (
               <div style={{ display: 'none' }}>
                  <Player 
                    url={`http://localhost:5000/uploads/${activeTimelineLayers.Audio.name}`}
                    currentTime={activeTimelineLayers.Audio.currentTime}
                    playing={stagePlaying}
                  />
               </div>
            )}

            {/* Draggable Logo Overlay (Legacy/Manual) */}
            {uploadedLogoName && showOverlay && !activeTimelineLayers.Graphics && (
              <div
                onMouseDown={(e) => { e.stopPropagation(); setIsDragging(true); }}
                style={{
                  position: 'absolute',
                  top: `${prepTransform.y - prepTransform.height / 2}%`,
                  left: `${prepTransform.x - prepTransform.width / 2}%`,
                  width: `${prepTransform.width}%`,
                  zIndex: 10, cursor: 'move',
                  border: isDragging ? '2px solid #6366f1' : '1px dashed rgba(255,255,255,0.3)'
                }}
              >
                <img src={`http://localhost:5000/uploads/${uploadedLogoName}`} alt="Overlay" style={{ width: '100%', display: 'block', pointerEvents: 'none' }} />
              </div>
            )}

            {/* Top-left badges */}
            <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px', zIndex: 20 }}>
              {isLive && (
                <div style={{ backgroundColor: '#dc2626', color: 'white', fontWeight: '800', fontSize: '11px', padding: '3px 10px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'blink 1s infinite' }} />LIVE
                </div>
              )}
            </div>

            {/* Transport controls overlaid at bottom */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
              padding: '32px 20px 14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* PLAY / PAUSE — this is the main control that drives the timeline */}
                <button
                  onClick={() => setTimelineIsPlaying(p => !p)}
                  style={{
                    width: '38px', height: '38px', borderRadius: '50%',
                    backgroundColor: timelineIsPlaying ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.15)',
                    border: `2px solid ${timelineIsPlaying ? '#ef4444' : 'rgba(255,255,255,0.3)'}`,
                    color: 'white', fontSize: '16px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(4px)', transition: 'all 0.15s'
                  }}
                >
                  {timelineIsPlaying ? '⏸' : '▶'}
                </button>

                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', cursor: 'pointer' }}>⏮</button>
                <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '18px', cursor: 'pointer' }}>⏭</button>

                <div style={{ height: '18px', width: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }} />

                <span style={{ fontFamily: 'monospace', fontSize: '15px', color: 'white', fontWeight: '700', letterSpacing: '1px' }}>
                  {new Date(Math.max(0, (streamParams?.currentTime || 0)) * 1000).toISOString().substr(11, 8)}
                </span>

                <div style={{ flex: 1 }} />

                {/* Source switches */}
                <button onClick={() => setSelectedSourceType('camera')} style={{ background: selectedSourceType === 'camera' ? 'rgba(99,102,241,0.3)' : 'rgba(0,0,0,0.4)', border: `1px solid ${selectedSourceType === 'camera' ? '#6366f1' : 'rgba(255,255,255,0.2)'}`, color: 'white', padding: '5px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>📷 CAM</button>
                <button onClick={() => setSelectedSourceType('file')} style={{ background: selectedSourceType === 'file' ? 'rgba(99,102,241,0.3)' : 'rgba(0,0,0,0.4)', border: `1px solid ${selectedSourceType === 'file' ? '#6366f1' : 'rgba(255,255,255,0.2)'}`, color: 'white', padding: '5px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>🎬 FILE</button>

                {/* GO LIVE */}
                <button
                  onClick={() => {
                    const videoClip = activeTimelineLayers.Video;
                    const graphicsClip = activeTimelineLayers.Graphics;
                    const audioClip = activeTimelineLayers.Audio;
                    if (videoClip) {
                      handleStartLive(
                        videoClip.name, 
                        graphicsClip ? graphicsClip.name : null,
                        audioClip ? audioClip.name : null,
                        videoClip.name === 'Live Camera' ? 'camera' : 'file', 
                        videoClip.transform,
                        graphicsClip ? graphicsClip.transform : null,
                        'Default', 'Default', 
                        24, 1, true
                      );
                    }
                  }}
                  style={{ backgroundColor: isLive ? '#7f1d1d' : '#dc2626', color: 'white', border: 'none', padding: '8px 22px', borderRadius: '6px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}
                >
                  {isLive ? '🔴 LIVE' : '🚀 GO LIVE'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: '10px', paddingRight: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: isLive ? '#f87171' : '#6366f1' }}>
                  {isLive ? '🔴 PROGRAM ON-AIR' : '🛠️ PREVIEW (STAGE)'}
                </span>
                {isLive && liveLink && (
                  <a href={liveLink} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#60a5fa', textDecoration: 'none', marginLeft: '12px', border: '1px solid #1d4ed8', padding: '2px 8px', borderRadius: '4px' }}>
                    🔗 VIEW LIVE STREAM
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ─── Film-Strip Timeline ─── */}
          <div style={{ height: '350px', flexShrink: 0, borderTop: '2px solid #111113', backgroundColor: '#18181b' }}>
            <VideoEditor
              selectedSource={selectedSourceType === 'file' ? uploadedVideoName : 'Live Camera'}
              timelineClips={timelineClips}
              setTimelineClips={setTimelineClips}
              tracks={tracks}
              setTracks={setTracks}
              externalIsPlaying={timelineIsPlaying}
              onIsPlayingChange={setTimelineIsPlaying}
              onTransform={(data) => setStreamParams(prev => ({ ...prev, transform: data }))}
              onStartLive={handleStartLive}
              onPlayheadUpdate={(layers, isPlaying) => {
                setActiveTimelineLayers(layers);
                setStagePlaying(isPlaying);
                
                if (layers.Video) {
                  const v = layers.Video;
                  setStreamParams(prev => ({ ...prev, transform: v.transform, currentTime: v.currentTime }));
                  if (v.name === 'Live Camera') {
                    setSelectedSourceType('camera');
                  } else {
                    setSelectedSourceType('file');
                    const newLink = `http://localhost:5000/uploads/${v.name}`;
                    setStageLink(prev => prev !== newLink ? newLink : prev);
                  }
                }
              }}
              isLive={isLive}
            />
          </div>
        </div>

        {/* ─── RIGHT: Media Library ─── */}
        <div style={{ width: '270px', backgroundColor: '#111113', borderLeft: '1px solid #2a2a2e', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#e4e4e7' }}>Media Library</span>
          </div>

          <div style={{ padding: '8px', display: 'flex', gap: '6px', borderBottom: '1px solid #27272a' }}>
            <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px', fontSize: '11px', color: '#a1a1aa', cursor: 'pointer' }}>
              📹 Video <input type="file" accept="video/*" onChange={onVideoFileChange} hidden />
            </label>
            <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', backgroundColor: '#27272a', border: '1px solid #3f3f46', borderRadius: '6px', padding: '7px', fontSize: '11px', color: '#a1a1aa', cursor: 'pointer' }}>
              🖼️ Image <input type="file" accept="image/*" onChange={onLogoFileChange} hidden />
            </label>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {uploadedVideoName && (
              <div
                onClick={() => { setStageLink(`http://localhost:5000/uploads/${uploadedVideoName}`); setStagePlaying(false); setSelectedSourceType('file'); }}
                style={{ display: 'flex', gap: '10px', padding: '8px', borderRadius: '6px', backgroundColor: '#1c1c20', border: '1px solid #3f3f46', cursor: 'pointer', alignItems: 'center' }}
              >
                <div style={{ width: '56px', height: '36px', backgroundColor: '#27272a', borderRadius: '4px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🎬</div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadedVideoName}</div>
                  <div style={{ fontSize: '9px', color: '#52525b' }}>VIDEO</div>
                </div>
              </div>
            )}
            {uploadedLogoName && (
              <div style={{ display: 'flex', gap: '10px', padding: '8px', borderRadius: '6px', backgroundColor: '#1c1c20', border: '1px solid #3f3f46', alignItems: 'center' }}>
                <div style={{ width: '56px', height: '36px', borderRadius: '4px', flexShrink: 0, backgroundImage: `url(http://localhost:5000/uploads/${uploadedLogoName})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#27272a' }} />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadedLogoName}</div>
                  <div style={{ fontSize: '9px', color: '#52525b' }}>IMAGE / OVERLAY</div>
                </div>
              </div>
            )}
            {!uploadedVideoName && !uploadedLogoName && (
              <div style={{ textAlign: 'center', color: '#3f3f46', paddingTop: '40px', fontSize: '12px' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📂</div>
                Import media above to begin
              </div>
            )}
          </div>

          {/* Broadcast controls */}
          <div style={{ padding: '10px', borderTop: '1px solid #27272a' }}>
            <YouTubeLive
              onStartLive={handleStartLive}
              onStopLive={handleStopLive}
              onPreview={handlePreviewSelection}
              onSourceTypeChange={handleSourceTypeChange}
              isLive={isLive}
              liveStatus={liveStatus}
              uploadedVideoName={uploadedVideoName}
            />
          </div>
        </div>
      </div>

      {/* Status Toast */}
      {(error || uploadStatus) && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {error && <div style={{ backgroundColor: '#7f1d1d', color: '#fca5a5', padding: '10px 20px', borderRadius: '8px', fontSize: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #991b1b' }}>⚠️ {error}</div>}
          {uploadStatus && <div style={{ backgroundColor: '#064e3b', color: '#6ee7b7', padding: '10px 20px', borderRadius: '8px', fontSize: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #065f46' }}>{uploadStatus}</div>}
        </div>
      )}

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #18181b; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
      `}</style>
    </div>
  );
}