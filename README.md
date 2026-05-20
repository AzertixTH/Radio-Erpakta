<<<<<<< HEAD
# RadioErpakta
A synchronized 24/7 web radio built with Node.js, Express, WebSocket and React. Streams audio files   in real-time to all connected listeners simultaneously. 
=======
# 🎵 SLECHTSTE MUZIEK FM

Een 24/7 synchronized radio stream waar je eigen audio files kunt uploaden en gelijktijdig met collega's kunt beluisteren. Retro FM-radio vibes met moderne web tech.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm of yarn
- Fedora Linux (of Linux/Mac/Windows)

### Installation

```bash
# 1. Clone/download en ga naar folder
cd slechtste-muziek-fm

# 2. Backend setup
cd backend
npm install
cp .env.example .env  # (optioneel, maar handig voor config)

# 3. Frontend setup  
cd ../frontend
npm install
```

### Running

**Terminal 1 - Backend (port 3001):**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend (port 5173):**
```bash
cd frontend
npm run dev
```

**Browser:**
```
http://localhost:5173
```

## 📁 Project Structure

```
slechtste-muziek-fm/
├── backend/
│   ├── server.js           # Express + WebSocket server
│   ├── package.json
│   ├── uploads/            # 🎵 Je audio files hier!
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx         # Main React component
    │   ├── App.css         # Retro FM styling
    │   └── main.jsx        # Entry point
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## 🎵 How to Add Music

### Method 1: Web Interface
1. Click **⬆** button in the radio interface
2. Drag & drop audio files OR click to browse
3. Supported formats: MP3, WAV, OGG, FLAC

### Method 2: Direct Upload (SSH/SFTP)
```bash
# Copy files to backend/uploads/ folder
scp your-song.mp3 user@server:/path/to/slechtste-muziek-fm/backend/uploads/
```

### Method 3: Via API
```bash
curl -X POST http://localhost:3001/api/upload \
  -F "file=@your-song.mp3"
```

## 🌐 Deploying to Your Home Server

### 1. Clone op je thuisserver
```bash
git clone <repo> /opt/slechtste-muziek-fm
cd /opt/slechtste-muziek-fm
```

### 2. Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install && npm run build
```

### 3. Setup systemd service (auto-start op reboot)

**Create `/etc/systemd/system/slechtste-muziek.service`:**
```ini
[Unit]
Description=Slechtste Muziek FM Radio Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/slechtste-muziek-fm/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

Environment="NODE_ENV=production"
Environment="PORT=3001"

[Install]
WantedBy=multi-user.target
```

**Start service:**
```bash
sudo systemctl enable slechtste-muziek.service
sudo systemctl start slechtste-muziek.service
sudo systemctl status slechtste-muziek.service
```

### 4. Serve frontend (nginx recommended)

**Create nginx config `/etc/nginx/sites-available/slechtste-muziek`:**
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Je domein hier

    # Redirect HTTP to HTTPS (optioneel)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    root /opt/slechtste-muziek-fm/frontend/dist;
    
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
    }

    # WebSocket upgrade
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Allow uploads (increase if needed)
    client_max_body_size 50M;
}
```

**Enable and start nginx:**
```bash
sudo ln -s /etc/nginx/sites-available/slechtste-muziek /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. SSL Certificate (via Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
```

## 🔒 Security Tips

1. **Firewall:** Only expose port 80/443, block 3001 directly
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 22/tcp  # SSH
   ```

2. **File Upload Limits:** Default is 50MB, change in `backend/server.js` if needed

3. **CORS:** Update `backend/server.js` if hosting on different domain:
   ```javascript
   app.use(cors({
     origin: 'https://your-domain.com'
   }));
   ```

4. **Environment Variables:** Create `.env` in backend:
   ```
   PORT=3001
   NODE_ENV=production
   MAX_FILE_SIZE=52428800
   ```

## 📊 API Reference

### Endpoints

**GET /api/current-track**
```json
{
  "id": "uuid",
  "title": "Song Name",
  "url": "/uploads/filename.mp3",
  "position": 45,
  "isPlaying": true,
  "trackIndex": 2,
  "totalTracks": 42
}
```

**GET /api/queue**
```json
[
  { "id": "uuid", "title": "Next Song 1", "position": 1 },
  { "id": "uuid", "title": "Next Song 2", "position": 2 }
]
```

**POST /api/upload**
- Multipart form data
- Field: `file` (audio file)
- Returns uploaded track info

**POST /api/next**
- Skip to next track
- Broadcasts to all clients

**POST /api/toggle-play**
- Pause/resume playback
- Broadcasts to all clients

### WebSocket Messages

**current-track**
```json
{
  "type": "current-track",
  "data": { /* same as /api/current-track */ }
}
```

**playlist-update**
```json
{
  "type": "playlist-update",
  "data": { "playlist": [ /* all tracks */ ] }
}
```

## 🛠 Development

### Local Testing with Mock Data

```bash
# Add test audio files
cd backend/uploads
# Voeg hier MP3/WAV files toe

npm start
```

### Debugging

```bash
# Check server logs
journalctl -u slechtste-muziek.service -f

# Check nginx logs
sudo tail -f /var/log/nginx/error.log
```

## 🎨 Customization

### Change Colors/Styling
Edit `frontend/src/App.css` - all colors are defined at the top

### Change API URL (for production)
Update in `frontend/src/App.jsx`:
```javascript
const API_URL = 'https://your-domain.com';
const WS_URL = 'wss://your-domain.com';  // WebSocket secure
```

## 🚨 Troubleshooting

**"Cannot connect to server"**
- Check if backend is running: `curl http://localhost:3001/api/current-track`
- Check firewall rules
- Check CORS settings if frontend/backend on different hosts

**"No audio plays"**
- Check browser console for errors (F12)
- Ensure audio files are in `backend/uploads/`
- Check audio format compatibility

**"Upload fails"**
- Check file size (max 50MB default)
- Check permissions on `backend/uploads/` folder
- Check available disk space

**"WebSocket connection fails"**
- Ensure WebSocket port is open
- Check proxy configuration if behind nginx/apache

## 📝 Future Features

- [ ] Persistent database (SQLite/PostgreSQL)
- [ ] User authentication
- [ ] Playlist management (create playlists)
- [ ] Chat functionality
- [ ] Listening statistics
- [ ] Beautiful album art display
- [ ] Volume control
- [ ] EQ settings

## 📄 License

MIT - Use freely! 

---

**Made with 🎵 for the slechtste muziek collective** 🎸
>>>>>>> master
