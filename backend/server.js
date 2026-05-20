const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const mm = require('music-metadata');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 52428800 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/flac'];
    allowedMimes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid audio format'));
  }
});

let playlist = [];
let currentTrackIndex = 0;
let playbackStartTime = Date.now();
let isPlaying = true;
let autoAdvanceTimer = null;

function parseTrackMeta(filename) {
  const base = path.basename(filename, path.extname(filename));
  const idx = base.indexOf(' - ');
  if (idx !== -1) return { artist: base.substring(0, idx).trim(), songTitle: base.substring(idx + 3).trim() };
  return { artist: '', songTitle: base };
}

async function loadPlaylistFromDisk() {
  try {
    const files = fs.readdirSync(uploadsDir).filter(file =>
      ['.mp3', '.wav', '.ogg', '.webm', '.flac'].includes(path.extname(file).toLowerCase())
    );

    const tracks = await Promise.all(files.map(async file => {
      const filepath = path.join(uploadsDir, file);
      let duration = 180;
      try {
        const metadata = await mm.parseFile(filepath, { duration: true });
        if (metadata.format.duration) duration = Math.ceil(metadata.format.duration);
      } catch {}
      const { artist, songTitle } = parseTrackMeta(file);
      return {
        id: uuidv4(),
        title: path.basename(file, path.extname(file)),
        artist,
        songTitle,
        filename: file,
        url: `/uploads/${file}`,
        duration,
        uploadedAt: new Date()
      };
    }));

    playlist = tracks;

    // Fisher-Yates shuffle
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }

    if (playlist.length === 0) {
      console.log('⚠️  Geen audio files gevonden in uploads folder');
    } else {
      console.log(`✅ ${playlist.length} nummers geladen`);
      playlist.forEach(t => console.log(`   ${t.title} (${formatDuration(t.duration)})`));
    }
  } catch (err) {
    console.error('Fout bij laden playlist:', err);
  }
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function scheduleAutoAdvance() {
  if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  if (!isPlaying || playlist.length === 0) return;

  const track = playlist[currentTrackIndex % playlist.length];
  const elapsed = (Date.now() - playbackStartTime) / 1000;
  const remaining = Math.max(0, track.duration - elapsed);

  console.log(`⏱  Next track in ${Math.round(remaining)}s`);

  autoAdvanceTimer = setTimeout(() => {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playbackStartTime = Date.now();
    console.log(`▶  Auto-advancing to: ${playlist[currentTrackIndex].title}`);
    broadcastCurrentTrack();
    scheduleAutoAdvance();
  }, remaining * 1000);
}

// API Endpoints

app.get('/api/current-track', (req, res) => {
  if (playlist.length === 0) {
    return res.json({ id: null, title: 'Geen nummers beschikbaar', url: null, position: 0, isPlaying: false });
  }

  const currentTrack = playlist[currentTrackIndex % playlist.length];
  const elapsedSeconds = Math.floor((Date.now() - playbackStartTime) / 1000);

  res.json({
    id: currentTrack.id,
    title: currentTrack.title,
    url: currentTrack.url,
    duration: currentTrack.duration,
    position: elapsedSeconds,
    isPlaying,
    trackIndex: currentTrackIndex,
    totalTracks: playlist.length
  });
});

app.get('/api/queue', (req, res) => {
  if (playlist.length === 0) return res.json([]);

  const queue = [];
  for (let i = 1; i <= Math.min(10, playlist.length); i++) {
    const idx = (currentTrackIndex + i) % playlist.length;
    queue.push({ id: playlist[idx].id, title: playlist[idx].title, artist: playlist[idx].artist, songTitle: playlist[idx].songTitle, duration: playlist[idx].duration, position: i });
  }
  res.json(queue);
});

app.get('/api/playlist', (req, res) => res.json(playlist));

app.post('/api/next', (req, res) => {
  if (playlist.length === 0) return res.status(400).json({ error: 'Lege playlist' });

  currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
  playbackStartTime = Date.now();

  broadcastCurrentTrack();
  scheduleAutoAdvance();

  res.json({ success: true, currentTrack: playlist[currentTrackIndex] });
});

app.post('/api/toggle-play', (req, res) => {
  isPlaying = !isPlaying;

  if (isPlaying) {
    playbackStartTime = Date.now();
    scheduleAutoAdvance();
  } else {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  }

  broadcastCurrentTrack();
  res.json({ success: true, isPlaying });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Geen file geupload' });

  const newTrack = {
    id: uuidv4(),
    title: path.basename(req.file.filename, path.extname(req.file.filename)),
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    duration: 180,
    uploadedAt: new Date()
  };

  playlist.push(newTrack);
  broadcastPlaylistUpdate();

  res.json({ success: true, track: newTrack, message: `✅ '${newTrack.title}' toegevoegd!` });
});

// HTTP Server + WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

wss.on('connection', (ws) => {
  console.log('🔗 Client verbonden');
  clients.push(ws);

  if (playlist.length > 0) {
    const currentTrack = playlist[currentTrackIndex];
    const elapsedSeconds = Math.floor((Date.now() - playbackStartTime) / 1000);
    ws.send(JSON.stringify({
      type: 'current-track',
      data: {
        id: currentTrack.id,
        title: currentTrack.title,
        url: currentTrack.url,
        duration: currentTrack.duration,
        position: elapsedSeconds,
        isPlaying,
        trackIndex: currentTrackIndex,
        totalTracks: playlist.length
      }
    }));
  }

  broadcastListenerCount();

  ws.on('close', () => {
    console.log('❌ Client verbroken');
    clients = clients.filter(c => c !== ws);
    broadcastListenerCount();
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

function broadcastCurrentTrack() {
  if (playlist.length === 0) return;

  const currentTrack = playlist[currentTrackIndex];
  const elapsedSeconds = Math.floor((Date.now() - playbackStartTime) / 1000);

  const message = JSON.stringify({
    type: 'current-track',
    data: {
      id: currentTrack.id,
      title: currentTrack.title,
      artist: currentTrack.artist,
      songTitle: currentTrack.songTitle,
      url: currentTrack.url,
      duration: currentTrack.duration,
      position: elapsedSeconds,
      isPlaying,
      trackIndex: currentTrackIndex,
      totalTracks: playlist.length
    }
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function broadcastPlaylistUpdate() {
  const message = JSON.stringify({ type: 'playlist-update', data: { playlist } });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function broadcastListenerCount() {
  const count = clients.filter(c => c.readyState === WebSocket.OPEN).length;
  const message = JSON.stringify({ type: 'listener-count', data: { count } });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Serve frontend in production
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// Boot: read durations first, then start server
loadPlaylistFromDisk().then(() => {
  scheduleAutoAdvance();
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║        🎵 RADIO ERPAKTA 🎵            ║
║      Nu draaiend op port ${PORT}       ║
╚════════════════════════════════════════╝

📡 WebSocket: ws://localhost:${PORT}
🌐 API:       http://localhost:${PORT}/api
📁 Uploads:   ${uploadsDir}
🎶 ${playlist.length} nummers geladen

Ready to stream! 🚀
    `);
  });
});
