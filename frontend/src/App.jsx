import React, { useState, useEffect, useRef } from 'react';
import './App.css';


function App() {
  const [track, setTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [listenerCount, setListenerCount] = useState(0);
  const [volume, setVolume] = useState(75);
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [needsTap, setNeedsTap] = useState(!localStorage.getItem('erpakta_started'));

  const wsRef = useRef(null);
  const audioRef = useRef(new Audio());
  const activeTrackIdRef = useRef(null);
  const isPlayingRef = useRef(false);
  const positionRef = useRef(0);
  const trackDurationRef = useRef(0);
  const progressElRef = useRef(null);

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
  const WS_URL = import.meta.env.VITE_WS_URL || (import.meta.env.DEV ? 'ws://localhost:3001' : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`);

  // Set initial volume
  useEffect(() => {
    audioRef.current.volume = volume / 100;
  }, []);

  // Progress bar tick — direct DOM update, no React re-render
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPlayingRef.current) return;
      positionRef.current += 1;
      if (progressElRef.current && trackDurationRef.current > 0) {
        const pct = Math.min(100, (positionRef.current / trackDurationRef.current) * 100);
        progressElRef.current.style.width = `${pct}%`;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function applyTrack(t) {
    if (!t.id) return;
    const isNew = activeTrackIdRef.current !== t.id;

    if (isNew) {
      activeTrackIdRef.current = t.id;
      positionRef.current = t.position;
      trackDurationRef.current = t.duration || 0;
      setTrack({
        id: t.id,
        songTitle: t.songTitle || t.title,
        artist: t.artist || '',
        duration: t.duration || 0,
        trackIndex: t.trackIndex,
        totalTracks: t.totalTracks,
      });
      setIsPlaying(t.isPlaying);
      isPlayingRef.current = t.isPlaying;

      loadQueue();

      const audio = audioRef.current;
      audio.src = API_URL + t.url;
      audio.currentTime = t.position;
      if (t.isPlaying) audio.play().catch(() => setNeedsTap(true));

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: t.songTitle || t.title,
          artist: t.artist || 'Radio Erpakta',
        });
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      }
    } else {
      if (isPlayingRef.current !== t.isPlaying) {
        isPlayingRef.current = t.isPlaying;
        setIsPlaying(t.isPlaying);
        if (t.isPlaying) audioRef.current.play().catch(() => setNeedsTap(true));
        else audioRef.current.pause();
      }
    }
  }

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    let intentionalClose = false;

    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      if (type === 'current-track') applyTrack(data);
      else if (type === 'listener-count') setListenerCount(data.count);
      else if (type === 'playlist-update') loadQueue();
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      if (!intentionalClose) setTimeout(() => window.location.reload(), 3000);
    };

    // Heartbeat om verbinding levend te houden op Render
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);

    return () => {
      intentionalClose = true;
      clearInterval(heartbeat);
      ws.close();
    };
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/current-track`)
      .then(r => r.json())
      .then(data => { if (activeTrackIdRef.current === null) applyTrack(data); })
      .catch(() => {});
    loadQueue();
  }, []);

  function loadQueue() {
    fetch(`${API_URL}/api/queue`)
      .then(r => r.json())
      .then(setQueue)
      .catch(() => {});
  }

  function handleVolumeChange(e) {
    const val = Number(e.target.value);
    setVolume(val);
    audioRef.current.volume = val / 100;
    if (muted) {
      setMuted(false);
      audioRef.current.muted = false;
    }
  }

  function handleMute() {
    const next = !muted;
    setMuted(next);
    audioRef.current.muted = next;
  }

  function handleTap() {
    localStorage.setItem('erpakta_started', '1');
    setNeedsTap(false);
    fetch(`${API_URL}/api/current-track`)
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          const audio = audioRef.current;
          audio.src = API_URL + data.url;
          audio.currentTime = data.position;
          audio.play().catch(() => {});
        }
      })
      .catch(() => {});
  }

  return (
    <div className="container">
      <div className="card">

        <div className="header">
          <img src="/RadioErpakta.jpg" alt="Radio Erpakta" className="station-logo" />
          <h1>Radio Erpakta</h1>
          <p className="tagline">Want alles is voorbij</p>
        </div>

        <div className="now-playing-box">
          <span className="now-playing-label">Nu afspelend:</span>
          {track ? (
            <>
              <h2 className="song-title">{track.songTitle}</h2>
              {track.artist && <p className="artist-name">{track.artist}</p>}
              <div className="progress-bar">
                <div className="progress-fill" ref={progressElRef}/>
              </div>
              <p className="track-duration">{formatTime(track.duration)}</p>
            </>
          ) : (
            <p className="no-tracks">Geen nummers beschikbaar</p>
          )}
        </div>

        {needsTap && (
          <div className="tap-to-listen">
            <button className="tap-btn" onClick={handleTap}>▶</button>
            <span className="tap-label">Tik om te luisteren</span>
          </div>
        )}

        <div className="volume-control">
          <svg onClick={handleMute} className="volume-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={muted ? '#f43f5e' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer', flexShrink: 0 }}>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            {muted ? (
              <>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </>
            ) : (
              <>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </>
            )}
          </svg>
          <input
            type="range"
            min="0" max="100"
            value={volume}
            onChange={handleVolumeChange}
            className="volume-slider"
            style={{ background: `linear-gradient(to right, #111827 ${volume}%, #e5e7eb ${volume}%)` }}
          />
          <span className="volume-pct">{volume}%</span>
        </div>

        <div className="divider"/>

        <div className="queue-section">
          <h3>Next up:</h3>
          {queue.length > 0 ? (
            queue.slice(0, 3).map((t, i) => (
              <div key={t.id}>
                <div className="queue-item">
                  <div className="queue-info">
                    <span className="queue-title">{t.songTitle || t.title}</span>
                    {t.artist && <span className="queue-artist">{t.artist}</span>}
                  </div>
                  <span className="queue-duration">{formatTime(t.duration)}</span>
                </div>
                {i < 2 && <div className="queue-divider"/>}
              </div>
            ))
          ) : (
            <p className="empty-queue">Geen nummers in wachtrij</p>
          )}
        </div>

        <div className="footer">
          <span className="listener-dot"/>
          <span className="listener-num">{listenerCount} {listenerCount === 1 ? 'luisteraar' : 'luisteraars'}</span>
        </div>

      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default App;
