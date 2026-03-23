// const express = require('express');
// require('dotenv').config();
// const cors = require('cors');

// const { connectOBS } = require('./connect/obs');
// const routes = require('./route');

// const app = express();

// // ✅ enable CORS
// app.use(cors({
//   origin: 'http://localhost:3000'
// }));

// app.use(express.json());

// // connect OBS once
// connectOBS();

// // routes
// app.use('/', routes);

// app.get('/', (req, res) => {
//   res.send('API running 🚀');
// });

// app.listen(5000, () => {
//   console.log('Server running on http://localhost:5000');
// });


const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { connectOBS } = require('./connect/obs');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads')));
app.use('/hls', express.static(path.join(__dirname, '../storage/hls')));

// ===== CONNECT TO OBS =====
connectOBS().catch(err => {
  console.error('Failed to connect to OBS:', err.message);
  console.log('⚠️  OBS will be required for streaming features');
});

// ===== ROUTES =====
const mainRoutes = require('./route/index');
app.use('/', mainRoutes);

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Stream Control Backend is running' });
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);

  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }

  res.status(500).json({
    error: err.message || 'Internal server error',
    path: req.path,
    method: req.method
  });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'POST /obs/start',
      'POST /obs/stop',
      'POST /obs/scene',
      'POST /obs/text',
      'GET /obs/scenes',
      'GET /obs/status',
      'POST /obs/upload-video',
      'POST /obs/upload-logo',
      'POST /obs/youtube/create-broadcast',
      'POST /obs/youtube/start-broadcast',
      'POST /obs/youtube/stop-broadcast'
    ]
  });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🎬 Stream Control Center - Backend    ║
╠════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}  ║
║  Environment: ${process.env.NODE_ENV || 'development'}                ║
║  OBS URL: ${process.env.OBS_URL || 'ws://127.0.0.1:4455'}            ║
╚════════════════════════════════════════╝
    `);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📢 SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📢 SIGINT signal received: closing HTTP server');
  process.exit(0);
});