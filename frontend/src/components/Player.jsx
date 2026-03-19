import ReactPlayer from 'react-player';

export default function Player({ url }) {
  if (!url) {
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
        Waiting for active stream...
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
        stopOnUnmount={false}
      />
    </div>
  );
}