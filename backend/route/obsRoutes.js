const express = require('express');
const obsRoutes = express.Router();
const obsController = require('../controller/obsController');
const videoController = require('../controller/videoController');
const liveStreamController = require('../controller/livestreamController');

// ===== OBS BASIC CONTROLS =====
obsRoutes.post('/start', obsController.startStream);
obsRoutes.post('/stop', obsController.stopStream);
obsRoutes.post('/scene', obsController.switchScene);
obsRoutes.post('/text', obsController.updateText);
obsRoutes.get('/scenes', obsController.getScenes);
obsRoutes.get('/status', obsController.getStreamStatus);

// ===== OBS EDITING FEATURES =====
obsRoutes.post('/crop', obsController.cropVideo);
obsRoutes.post('/scale', obsController.scaleSource);
obsRoutes.post('/rotate', obsController.rotateSource);

// ===== VIDEO & MEDIA UPLOADS =====
obsRoutes.post('/upload-video', videoController.uploadVideo, videoController.handleVideoUpload);
obsRoutes.post('/upload-logo', videoController.uploadLogo, videoController.handleLogoUpload);
obsRoutes.post('/remove-source', videoController.removeSource);
obsRoutes.post('/update-media', videoController.updateMediaSettings);

// ===== YOUTUBE LIVE (FFmpeg RTMP) =====
obsRoutes.post('/live/start', liveStreamController.startLive);
obsRoutes.post('/live/stop', liveStreamController.stopLive);
obsRoutes.get('/live/status', liveStreamController.getStreamStatus);
obsRoutes.get('/live/videos', liveStreamController.getUploadedVideos);
obsRoutes.get('/live/devices', liveStreamController.listDevices);

module.exports = obsRoutes;