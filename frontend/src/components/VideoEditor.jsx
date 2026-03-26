
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { uploadVideo } from '../services/obsService';

function VideoEditor({
  selectedSource,
  onTransform,
  onStartLive,
  isLive,
  onPlayheadUpdate,
  timelineClips,
  setTimelineClips,
  tracks,
  setTracks,
  externalIsPlaying,
  onIsPlayingChange
}) {
  const [activeClipId, setActiveClipId] = useState(null);
  const [playheadPos, setPlayheadPos] = useState(0);
  const [isPlayingInternal, setIsPlayingInternal] = useState(false);
  const [dragType, setDragType] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [thumbnails, setThumbnails] = useState({});
  const [activeUploadTrack, setActiveUploadTrack] = useState(null);
  const [zoom, setZoom] = useState(1); // px per second (1px = 1s * zoom)

  const timelineRef = useRef(null);
  const playbackRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);

  // Derived: use external play state if provided, else internal
  const isPlaying = externalIsPlaying !== undefined ? externalIsPlaying : isPlayingInternal;
  const setIsPlaying = useCallback((val) => {
    const v = typeof val === 'function' ? val(isPlaying) : val;
    setIsPlayingInternal(v);
    if (onIsPlayingChange) onIsPlayingChange(v);
  }, [isPlaying, onIsPlayingChange]);

  const activeClip = useMemo(() =>
    timelineClips.find(c => c.id === activeClipId),
    [timelineClips, activeClipId]
  );

  // ── Thumbnail generation ──────────────────────────────────────────────────
  const generateThumbnail = useCallback(async (name) => {
    if (!name || thumbnails[name]) return;
    const url = `http://localhost:5000/uploads/${name}`;

    if (/\.(jpeg|jpg|gif|png|webp)$/i.test(name)) {
      setThumbnails(prev => ({ ...prev, [name]: url }));
      return;
    }

    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.src = url;
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration * 0.05);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 160, 90);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        setThumbnails(prev => ({ ...prev, [name]: dataUrl }));
        video.src = '';
      };

      video.onerror = () => {
        setThumbnails(prev => ({ ...prev, [name]: null }));
      };
    } catch (e) {
      console.warn('Thumb error:', e);
    }
  }, [thumbnails]);

  useEffect(() => {
    timelineClips.forEach(clip => {
      if (clip.name && !thumbnails[clip.name]) generateThumbnail(clip.name);
    });
  }, [timelineClips]); // eslint-disable-line

  // ── Playback ticker ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      playbackRef.current = setInterval(() => {
        setPlayheadPos(prev => {
          const maxPos = Math.max(0, ...timelineClips.map(c => c.start + c.duration)) + 200;
          if (prev >= maxPos) { setIsPlaying(false); return 0; }
          return prev + 1;
        });
      }, 33);
    } else {
      clearInterval(playbackRef.current);
    }
    return () => clearInterval(playbackRef.current);
  }, [isPlaying]); // eslint-disable-line

  // Sync preview with playhead — deferred to avoid setState-during-render
  useEffect(() => {
    if (!onPlayheadUpdate) return;

    // Find active clips for EACH track
    const layers = {};
    tracks.forEach(t => {
      const clip = timelineClips.find(c =>
        c.track === t && playheadPos >= c.start && playheadPos < (c.start + c.duration)
      );
      if (clip) {
        layers[t] = {
          ...clip,
          currentTime: (playheadPos - clip.start) * 0.033,
          isPlaying
        };
      }
    });

    // Provide the combined layers state to Dashboard
    queueMicrotask(() => {
      onPlayheadUpdate(layers, isPlaying);
      // For legacy sync or specific video track updates
      if (isLive && layers.Video) {
        onTransform(layers.Video.transform);
      }
    });
  }, [playheadPos, isPlaying, timelineClips, tracks]); // eslint-disable-line

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await uploadVideo(formData);
      const serverName = res.data.filename;

      let track = activeUploadTrack || 'Video';
      let color = '#6366f1';
      if (file.type.startsWith('audio') || track === 'Audio') { track = 'Audio'; color = '#22c55e'; }
      else if (file.type.startsWith('image') || track === 'Graphics') { track = 'Graphics'; color = '#a855f7'; }

      // Place after the last clip on this track
      const trackClips = timelineClips.filter(c => c.track === track);
      const lastEnd = trackClips.length > 0
        ? Math.max(...trackClips.map(c => c.start + c.duration))
        : 0;

      const newClip = {
        id: `clip_${Date.now()}`,
        track,
        name: serverName,
        start: lastEnd + 2,
        duration: 300,
        color,
        transform: { crop: { L: 0, R: 0, T: 0, B: 0 }, scale: 1, rotation: 0 }
      };

      setTimelineClips(prev => [...prev, newClip]);
      setActiveClipId(newClip.id);
      generateThumbnail(serverName);
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setActiveUploadTrack(null);
  };

  // ── Timeline mouse interactions ───────────────────────────────────────────
  const HEADER_W = 120;

  const getTimlineX = (e) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (e.clientX - rect.left) - HEADER_W + (scrollRef.current?.scrollLeft || 0);
  };

  const handleTrackClick = (e) => {
    const x = getTimlineX(e);
    if (x < 0) return;
    setPlayheadPos(Math.max(0, x));
  };

  const handleClipMouseDown = (e, clipId, mode = 'move') => {
    e.stopPropagation();
    const x = getTimlineX(e);
    const clip = timelineClips.find(c => c.id === clipId);
    if (!clip) return;
    setDragType(mode);
    setActiveClipId(clipId);
    if (mode === 'move') setDragOffset(x - clip.start);
    else if (mode === 'right') setDragOffset(x - (clip.start + clip.duration));
    else if (mode === 'left') setDragOffset(x - clip.start);
  };

  const handleMouseMove = (e) => {
    if (!dragType || !activeClipId) return;
    const x = getTimlineX(e);
    setTimelineClips(prev => prev.map(clip => {
      if (clip.id !== activeClipId) return clip;
      if (dragType === 'move') {
        return { ...clip, start: Math.max(0, x - dragOffset) };
      } else if (dragType === 'right') {
        const newDur = Math.max(10, x - clip.start);
        return { ...clip, duration: newDur };
      } else if (dragType === 'left') {
        const newStart = Math.max(0, Math.min(x, clip.start + clip.duration - 10));
        const newDur = (clip.start + clip.duration) - newStart;
        return { ...clip, start: newStart, duration: Math.max(10, newDur) };
      }
      return clip;
    }));
  };

  // ── Editing actions ───────────────────────────────────────────────────────
  const cutAtPlayhead = () => {
    if (!activeClipId) return;
    const clip = timelineClips.find(c => c.id === activeClipId);
    if (!clip) return;
    const cut = playheadPos;
    if (cut <= clip.start || cut >= clip.start + clip.duration) {
      alert('Place the playhead ▼ inside the selected clip to cut it.');
      return;
    }
    const left = { ...clip, duration: cut - clip.start };
    const right = {
      ...clip,
      id: `clip_${Date.now()}`,
      start: cut,
      duration: (clip.start + clip.duration) - cut
    };
    setTimelineClips(prev => {
      const filtered = prev.filter(c => c.id !== activeClipId);
      return [...filtered, left, right].sort((a, b) => a.start - b.start);
    });
    setActiveClipId(right.id);
  };

  const deleteClip = () => {
    if (!activeClipId) return;
    setTimelineClips(prev => prev.filter(c => c.id !== activeClipId));
    setActiveClipId(null);
  };

  const duplicateClip = () => {
    if (!activeClipId) return;
    const clip = timelineClips.find(c => c.id === activeClipId);
    if (!clip) return;
    const copy = { ...clip, id: `clip_${Date.now()}`, start: clip.start + clip.duration + 2 };
    setTimelineClips(prev => [...prev, copy]);
    setActiveClipId(copy.id);
  };

  const rippleDelete = () => {
    if (!activeClipId) return;
    const clip = timelineClips.find(c => c.id === activeClipId);
    if (!clip) return;
    const gap = clip.duration + 2;
    setTimelineClips(prev =>
      prev
        .filter(c => c.id !== activeClipId)
        .map(c => c.start > clip.start ? { ...c, start: Math.max(0, c.start - gap) } : c)
    );
    setActiveClipId(null);
  };

  const updateTransform = (field, value) => {
    if (!activeClipId) return;
    setTimelineClips(prev => prev.map(c => {
      if (c.id !== activeClipId) return c;
      const t = { ...c.transform };
      if (field === 'crop') t.crop = { ...t.crop, ...value };
      else t[field] = value;
      if (onTransform) onTransform(t);
      return { ...c, transform: t };
    }));
  };

  const addTrack = () => {
    const name = prompt('Track name:', `Layer ${tracks.length + 1}`);
    if (name) setTracks(prev => [...prev, name]);
  };

  const pushToLive = () => {
    const clip = activeClip || timelineClips.find(c =>
      playheadPos >= c.start && playheadPos < c.start + c.duration
    );
    if (!clip || !clip.name) return;
    onStartLive(clip.name, 24, true, 1, 'Default', 'Default', 'file', clip.transform);
  };

  const TRACK_H = 72;
  const PX_PER_SEC = 30 * zoom; // 30px = 1 second at zoom 1
  const totalWidth = Math.max(6000, ...timelineClips.map(c => c.start + c.duration + 500));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#18181b', userSelect: 'none', fontFamily: 'Inter, sans-serif' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input ref={fileInputRef} type="file" accept="video/*,audio/*,image/*" onChange={handleFileUpload} style={{ display: 'none' }} />

      {/* ── Transport Bar ── */}
      <div style={{ height: '40px', backgroundColor: '#111113', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '6px', flexShrink: 0 }}>

        {/* Playback */}
        <button title="To Start (Home)" onClick={() => setPlayheadPos(0)}
          style={btnStyle}>⏮</button>
        <button title="Step Back" onClick={() => setPlayheadPos(p => Math.max(0, p - 30))}
          style={btnStyle}>◀◀</button>
        <button title={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying(!isPlaying)}
          style={{ ...btnStyle, backgroundColor: isPlaying ? '#dc2626' : '#6366f1', color: 'white', padding: '3px 14px', fontWeight: '700', fontSize: '12px', borderRadius: '5px' }}>
          {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
        </button>
        <button title="Step Forward" onClick={() => setPlayheadPos(p => p + 30)}
          style={btnStyle}>▶▶</button>
        <button title="To End" onClick={() => {
          const end = Math.max(0, ...timelineClips.map(c => c.start + c.duration));
          setPlayheadPos(end);
        }} style={btnStyle}>⏭</button>

        <div style={{ width: '1px', height: '20px', backgroundColor: '#3f3f46', margin: '0 4px' }} />

        {/* Timecode */}
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#6366f1', fontWeight: '700', minWidth: '70px' }}>
          {formatTime(playheadPos * 0.033)}
        </span>

        <div style={{ width: '1px', height: '20px', backgroundColor: '#3f3f46', margin: '0 4px' }} />

        {/* Edit Actions */}
        <button title="✂️ Cut at playhead (select a clip first)" onClick={cutAtPlayhead}
          style={{ ...btnStyle, color: '#fbbf24' }}>✂️ CUT</button>
        <button title="🗑️ Delete selected clip" onClick={deleteClip}
          style={{ ...btnStyle, color: '#f87171' }}>🗑️ DEL</button>
        <button title="⧉ Duplicate clip" onClick={duplicateClip}
          style={{ ...btnStyle, color: '#a3e635' }}>⧉ DUP</button>
        <button title="⊏ Ripple delete (shift all after)" onClick={rippleDelete}
          style={{ ...btnStyle, color: '#fb923c' }}>⊏ RIPPLE</button>

        <div style={{ width: '1px', height: '20px', backgroundColor: '#3f3f46', margin: '0 4px' }} />

        {/* Zoom */}
        <span style={{ fontSize: '10px', color: '#71717a' }}>ZOOM</span>
        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} style={btnStyle}>−</button>
        <span style={{ fontSize: '10px', color: '#a1a1aa', minWidth: '30px', textAlign: 'center' }}>{zoom.toFixed(1)}x</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} style={btnStyle}>+</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button title="+ Add Track" onClick={addTrack}
            style={{ ...btnStyle, border: '1px solid #52525b', padding: '3px 10px' }}>+ TRACK</button>
          <button onClick={pushToLive}
            style={{ ...btnStyle, backgroundColor: isLive ? '#7f1d1d' : '#dc2626', color: 'white', padding: '3px 12px', fontWeight: '700', borderRadius: '5px' }}>
            {isLive ? '🔴 LIVE' : '🚀 PUSH LIVE'}
          </button>
        </div>
      </div>

      {/* ── Clip Inspector (shown when a clip is selected) ── */}
      {activeClip && (
        <div style={{ backgroundColor: '#0c0c0e', borderBottom: '1px solid #27272a', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '16px', minHeight: '36px', flexShrink: 0, overflowX: 'auto' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#6366f1', whiteSpace: 'nowrap' }}>
            🎬 {activeClip.name || '(empty)'}
          </span>
          <span style={{ fontSize: '9px', color: '#52525b', whiteSpace: 'nowrap' }}>
            {(activeClip.duration * 0.033).toFixed(1)}s
          </span>
          <div style={{ width: '1px', height: '14px', backgroundColor: '#27272a' }} />
          <label style={inspectorLabel}>
            <span>SCALE</span>
            <input type="range" min="0.1" max="3" step="0.05" value={activeClip.transform.scale}
              onChange={e => updateTransform('scale', +e.target.value)} style={sliderStyle} />
            <span style={{ color: '#6366f1', minWidth: '30px', fontSize: '9px' }}>{activeClip.transform.scale.toFixed(2)}x</span>
          </label>
          <label style={inspectorLabel}>
            <span>ROT</span>
            <input type="range" min="0" max="360" value={activeClip.transform.rotation}
              onChange={e => updateTransform('rotation', +e.target.value)} style={sliderStyle} />
            <span style={{ color: '#6366f1', minWidth: '28px', fontSize: '9px' }}>{activeClip.transform.rotation}°</span>
          </label>
          <label style={inspectorLabel}>
            <span>CROP-L</span>
            <input type="range" min="0" max="800" value={activeClip.transform.crop.L}
              onChange={e => updateTransform('crop', { L: +e.target.value })} style={sliderStyle} />
            <span style={{ color: '#6366f1', minWidth: '22px', fontSize: '9px' }}>{activeClip.transform.crop.L}</span>
          </label>
          <label style={inspectorLabel}>
            <span>CROP-R</span>
            <input type="range" min="0" max="800" value={activeClip.transform.crop.R}
              onChange={e => updateTransform('crop', { R: +e.target.value })} style={sliderStyle} />
            <span style={{ color: '#6366f1', minWidth: '22px', fontSize: '9px' }}>{activeClip.transform.crop.R}</span>
          </label>
          <label style={inspectorLabel}>
            <span>CROP-T</span>
            <input type="range" min="0" max="800" value={activeClip.transform.crop.T}
              onChange={e => updateTransform('crop', { T: +e.target.value })} style={sliderStyle} />
            <span style={{ color: '#6366f1', minWidth: '22px', fontSize: '9px' }}>{activeClip.transform.crop.T}</span>
          </label>
          <label style={inspectorLabel}>
            <span>CROP-B</span>
            <input type="range" min="0" max="800" value={activeClip.transform.crop.B}
              onChange={e => updateTransform('crop', { B: +e.target.value })} style={sliderStyle} />
            <span style={{ color: '#6366f1', minWidth: '22px', fontSize: '9px' }}>{activeClip.transform.crop.B}</span>
          </label>
        </div>
      )}

      {/* ── Timeline Area ── */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }}
      >
        <div
          ref={timelineRef}
          style={{ position: 'relative', minWidth: `${totalWidth + HEADER_W}px` }}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDragType(null)}
          onMouseLeave={() => setDragType(null)}
        >
          {/* Time Ruler */}
          <div
            style={{ height: '24px', backgroundColor: '#0c0c0e', borderBottom: '1px solid #222', display: 'flex', position: 'sticky', top: 0, zIndex: 50 }}
            onClick={handleTrackClick}
          >
            <div style={{ width: `${HEADER_W}px`, flexShrink: 0, backgroundColor: '#111113', borderRight: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '9px', color: '#52525b', letterSpacing: '1px' }}>TRACKS</span>
            </div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {Array.from({ length: Math.ceil(totalWidth / 100) }, (_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${i * 100}px`, height: '100%', borderLeft: '1px solid #222', paddingLeft: '3px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '9px', color: '#3f3f46', whiteSpace: 'nowrap' }}>{formatTime(i * 100 * 0.033)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Playhead Overlay */}
          <div
            style={{
              position: 'absolute',
              left: `${playheadPos + HEADER_W}px`,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: '#ef4444',
              zIndex: 200,
              pointerEvents: 'none',
              boxShadow: '0 0 6px rgba(239,68,68,0.9)'
            }}
          >
            <div style={{ width: '10px', height: '10px', backgroundColor: '#ef4444', position: 'absolute', top: 0, left: '-4px', clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }} />
          </div>

          {/* Tracks */}
          {tracks.map((track) => (
            <div key={track} style={{ display: 'flex', height: `${TRACK_H}px`, borderBottom: '1px solid #111' }}>
              {/* Track Header */}
              <div style={{
                width: `${HEADER_W}px`, flexShrink: 0, backgroundColor: '#1c1c20',
                borderRight: '2px solid #111', display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'flex-start', padding: '6px 10px',
                position: 'sticky', left: 0, zIndex: 20, gap: '4px'
              }}>
                <span style={{ fontSize: '10px', fontWeight: '700', color: '#e4e4e7', letterSpacing: '0.5px' }}>
                  {track === 'Video' ? '🎬' : track === 'Audio' ? '🎵' : '🎨'} {track.toUpperCase()}
                </span>
                {track === 'Video' && (
                    <button
                      onClick={() => {
                        const newClip = {
                          id: Date.now(),
                          name: 'Live Camera',
                          start: playheadPos,
                          duration: 300, // 10 seconds default
                          originalDuration: 300,
                          color: '#3b82f6',
                          track: track,
                          type: 'camera'
                        };
                        setTimelineClips([...timelineClips, newClip]);
                      }}
                      style={{ backgroundColor: '#1d4ed8', color: 'white', border: 'none', padding: '2px 6px', fontSize: '9px', cursor: 'pointer', borderRadius: '3px', fontWeight: '700' }}
                    >+ CAMERA</button>
                  )}
                <button
                  onClick={() => { setActiveUploadTrack(track); fileInputRef.current.click(); }}
                  style={{ backgroundColor: 'transparent', color: '#60a5fa', border: '1px solid #3f3f46', padding: '2px 6px', fontSize: '9px', cursor: 'pointer', borderRadius: '3px', fontWeight: '600' }}
                >+ SOURCE</button>
              </div>

              {/* Clip Lane */}
              <div
                style={{ flex: 1, position: 'relative', backgroundColor: '#18181b', cursor: 'crosshair', minWidth: `${totalWidth}px` }}
                onClick={handleTrackClick}
                onMouseMove={handleMouseMove}
              >
                {/* Grid lines */}
                {Array.from({ length: Math.ceil(totalWidth / 100) }, (_, i) => (
                  <div key={i} style={{ position: 'absolute', left: `${i * 100}px`, top: 0, bottom: 0, width: '1px', backgroundColor: '#222', zIndex: 0 }} />
                ))}

                {timelineClips.filter(c => c.track === track).map(clip => {
                  const isActive = clip.id === activeClipId;
                  const thumb = thumbnails[clip.name];

                  return (
                    <div
                      key={clip.id}
                      onMouseDown={(e) => handleClipMouseDown(e, clip.id, 'move')}
                      onClick={(e) => { e.stopPropagation(); setActiveClipId(clip.id); }}
                      style={{
                        position: 'absolute',
                        left: `${clip.start}px`,
                        top: '4px',
                        height: `${TRACK_H - 8}px`,
                        width: `${clip.duration}px`,
                        backgroundColor: thumb ? 'transparent' : (clip.color + '33'),
                        border: isActive ? '2px solid #fff' : `1px solid ${clip.color}`,
                        borderRadius: '3px',
                        overflow: 'hidden',
                        cursor: 'grab',
                        zIndex: isActive ? 10 : 2,
                        boxShadow: isActive ? `0 0 0 1px ${clip.color}, 0 4px 12px rgba(0,0,0,0.6)` : '0 2px 6px rgba(0,0,0,0.4)'
                      }}
                    >
                      {/* Filmstrip thumbnails repeating */}
                      {thumb && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          backgroundImage: `url(${thumb})`,
                          backgroundSize: 'auto 100%',
                          backgroundRepeat: 'repeat-x',
                          backgroundPosition: 'left center',
                          zIndex: 0
                        }} />
                      )}

                      {/* Dark overlay for readability */}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.5) 100%)', zIndex: 1 }} />

                      {/* Left trim handle */}
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); handleClipMouseDown(e, clip.id, 'left'); }}
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '7px', backgroundColor: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)', cursor: 'ew-resize', zIndex: 20 }}
                      />

                      {/* Clip label */}
                      <div style={{ position: 'absolute', top: 0, left: '8px', right: '8px', zIndex: 5, fontSize: '10px', color: '#fff', fontWeight: '600', textShadow: '0 1px 3px rgba(0,0,0,.8)', paddingTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {clip.name || '(empty)'}
                      </div>

                      {/* Duration label */}
                      <div style={{ position: 'absolute', bottom: '2px', right: '8px', zIndex: 5, fontSize: '9px', color: 'rgba(255,255,255,0.6)', textShadow: '0 1px 2px rgba(0,0,0,.8)' }}>
                        {(clip.duration * 0.033).toFixed(1)}s
                      </div>

                      {/* Right trim handle */}
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); handleClipMouseDown(e, clip.id, 'right'); }}
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '7px', backgroundColor: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)', cursor: 'ew-resize', zIndex: 20 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(secs) {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const btnStyle = {
  backgroundColor: 'transparent',
  border: 'none',
  color: '#a1a1aa',
  cursor: 'pointer',
  padding: '3px 7px',
  fontSize: '12px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  whiteSpace: 'nowrap'
};

const inspectorLabel = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: '9px',
  color: '#71717a',
  whiteSpace: 'nowrap'
};

const sliderStyle = {
  width: '56px',
  cursor: 'pointer',
  accentColor: '#6366f1'
};

export default React.memo(VideoEditor);