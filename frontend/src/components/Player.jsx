import React, { useRef, useEffect, useState, useCallback } from 'react';

export default function Player({ url, transform, currentTime, playing, isLive }) {
  const videoRef = useRef(null);
  const [displayTime, setDisplayTime] = useState('00:00:00');
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const playReqRef = useRef(null); // track play() promise to avoid abort errors

  // ── Helpers ─────────────────────────────────────────────────────────────
  const fmt = (secs) => {
    if (!secs || isNaN(secs)) return '00:00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  // ── Load new URL ─────────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setReady(false);
    if (url) {
      vid.src = url;
      vid.load();
    } else {
      vid.removeAttribute('src');
      vid.load();
    }
  }, [url]);

  // ── Play / Pause — safe, promise-aware ──────────────────────────────────
  const safePlay = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid || !vid.src || vid.src === window.location.href) return;
    try {
      // Cancel any pending pause so the browser doesn't throw AbortError
      if (playReqRef.current) {
        await playReqRef.current.catch(() => {});
      }
      playReqRef.current = vid.play();
      await playReqRef.current;
      playReqRef.current = null;
    } catch (err) {
      playReqRef.current = null;
      if (err.name !== 'AbortError' && !err.message?.includes('interrupted')) {
        console.warn('Player play error:', err.message);
      }
    }
  }, []);

  const safePause = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (playReqRef.current) {
      // Wait for pending play() before pausing
      await playReqRef.current.catch(() => {});
      playReqRef.current = null;
    }
    try { vid.pause(); } catch (_) {}
  }, []);

  // ── React to playing prop ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (playing) safePlay();
    else safePause();
  }, [playing, ready, safePlay, safePause]);

  // ── Seek when paused ─────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !ready || currentTime === undefined) return;
    if (!playing) {
      // Only seek if meaningfully different (1-frame tolerance)
      if (Math.abs(vid.currentTime - currentTime) > 0.04) {
        vid.currentTime = currentTime;
      }
    } else {
      // While playing, only correct large drift
      if (Math.abs(vid.currentTime - currentTime) > 0.6) {
        vid.currentTime = currentTime;
      }
    }
  }, [currentTime, playing, ready]);

  // ── CSS transform from crop/scale/rotation ────────────────────────────────
  const videoStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block'
  };
  if (transform) {
    const { crop, scale, rotation } = transform;
    if (crop && (crop.T || crop.R || crop.B || crop.L)) {
      videoStyle.clipPath = `inset(${crop.T||0}px ${crop.R||0}px ${crop.B||0}px ${crop.L||0}px)`;
    }
    if (scale && scale !== 1) videoStyle.transform = `scale(${scale})${rotation ? ` rotate(${rotation}deg)` : ''}`;
    else if (rotation) videoStyle.transform = `rotate(${rotation}deg)`;
  }

  const isImage = url && /\.(jpeg|jpg|gif|png|webp)$/i.test(url);

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>

      {/* No Media */}
      {!url && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#374151', gap: '10px' }}>
          <div style={{ fontSize: '40px' }}>🎬</div>
          <div style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '2px', color: '#4b5563' }}>NO MEDIA</div>
          <div style={{ fontSize: '11px', color: '#374151' }}>Add a clip to the Video track and press ▶ PLAY</div>
        </div>
      )}

      {/* Image */}
      {url && isImage && (
        <img src={url} alt="media" style={{ ...videoStyle, position: 'absolute', inset: 0 }} />
      )}

      {/* Video — native <video> for full reliability */}
      {url && !isImage && (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          style={{ ...videoStyle, position: 'absolute', inset: 0 }}
          onLoadedMetadata={() => {
            const vid = videoRef.current;
            if (vid) { setDuration(vid.duration); setReady(true); }
          }}
          onTimeUpdate={() => {
            const vid = videoRef.current;
            if (vid) setDisplayTime(fmt(vid.currentTime));
          }}
          onError={() => {}}
        />
      )}

      {/* HUD overlay */}
      {url && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
          padding: '12px 12px 6px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '10px', color: '#94a3b8', pointerEvents: 'none'
        }}>
          <span style={{ fontWeight: '700', color: isLive ? '#22c55e' : (playing ? '#f59e0b' : '#6366f1') }}>
            {isLive ? '🔴 LIVE' : (playing ? '▶ PLAYING' : '⏸ PAUSED')}
          </span>
          <span style={{ fontFamily: 'monospace', color: '#6366f1' }}>
            {displayTime} / {fmt(duration)}
          </span>
          {transform && (transform.scale !== 1 || transform.rotation !== 0) && (
            <span style={{ color: '#a855f7', fontSize: '9px' }}>
              ✕{(transform.scale || 1).toFixed(2)} ↻{transform.rotation || 0}°
            </span>
          )}
        </div>
      )}
    </div>
  );
}