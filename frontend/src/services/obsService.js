import axios from 'axios';
import BASE_URL from '../utils/url';

// OBS Instance Connection
export const getStreamStatus = () => axios.get(`${BASE_URL}/obs/status`);
export const startStream = () => axios.post(`${BASE_URL}/obs/start`);
export const stopStream = () => axios.post(`${BASE_URL}/obs/stop`);
export const getScenes = () => axios.get(`${BASE_URL}/obs/scenes`);
export const switchScene = (sceneName) => axios.post(`${BASE_URL}/obs/scene`, { sceneName });
export const updateText = (text) => axios.post(`${BASE_URL}/obs/text`, { text });

// OBS Source Transformations (Crop/Scale/Rotate)
export const cropVideo = (sourceName, cropLeft, cropRight, cropTop, cropBottom) => 
    axios.post(`${BASE_URL}/obs/crop`, { sourceName, cropLeft, cropRight, cropTop, cropBottom });

export const scaleSource = (sourceName, scaleX, scaleY, positionX, positionY) => 
    axios.post(`${BASE_URL}/obs/scale`, { sourceName, scaleX, scaleY, positionX, positionY });

export const rotateSource = (sourceName, rotation) => 
    axios.post(`${BASE_URL}/obs/rotate`, { sourceName, rotation });

// Media Uploads
export const uploadVideo = (formData) => 
    axios.post(`${BASE_URL}/obs/upload-video`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

export const uploadLogo = (formData) => 
    axios.post(`${BASE_URL}/obs/upload-logo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

// ===== YouTube LIVE (FFmpeg RTMP) =====
export const startYouTubeLive = (videoFile, logoFile, durationHours, autoReconnect, loopCount, cameraName, micName, sourceType) =>
    axios.post(`${BASE_URL}/obs/live/start`, { videoFile, logoFile, durationHours, autoReconnect, loopCount, cameraName, micName, sourceType });

export const stopYouTubeLive = () =>
    axios.post(`${BASE_URL}/obs/live/stop`);

export const getLiveStatus = () =>
    axios.get(`${BASE_URL}/obs/live/status`);

export const getUploadedVideos = () =>
    axios.get(`${BASE_URL}/obs/live/videos`);

export const getCameraDevices = () =>
    axios.get(`${BASE_URL}/obs/live/devices`);
