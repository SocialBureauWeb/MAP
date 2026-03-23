import ReactPlayer from 'react-player';
import { useState, useEffect } from 'react';

export default function Player({ url }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(false);
    const timer = setTimeout(() => setShow(true), 800);
    return () => clearTimeout(timer);
  }, [url]);

  if (!url || !show) {
    return (
      <div style={{
        width: '100%',
        height: '450px',
        backgroundColor: '#000',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        border: '1px solid #334155'
      }}>
        Initializing stream player...
      </div>
    );
  }

  return (
    <div className='player-wrapper' style={{ borderRadius: '12px', overflow: 'hidden' }}>
      <ReactPlayer
        url={url}
        className='react-player'
        playing
        muted
        controls
        width='100%'
        height='450px'
        stopOnUnmount={true}
        onError={(e) => {
          // Suppress AbortError which is harmless but noisy
          if (e?.name !== 'AbortError') console.warn('Stream Player Notice:', e);
        }}
        config={{
          file: {
            attributes: {
              onContextMenu: e => e.preventDefault(),
              controlsList: 'nodownload'
            }
          }
        }}
      />
    </div>
  );
}