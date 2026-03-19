const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../storage/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
        'video/webm', 'video/avi', 'video/mpeg',
        'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

const videoController = {

    // Upload video - just save the file, no OBS needed
    uploadVideo: upload.single('video'),

    handleVideoUpload: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No video file uploaded' });
            }

            console.log(`📹 Video uploaded: ${req.file.filename}`);
            console.log(`📂 Path: ${req.file.path}`);
            console.log(`📦 Size: ${(req.file.size / (1024 * 1024)).toFixed(2)} MB`);

            // Optional OBS integration - add video to OBS if connected
            try {
                const { getOBS } = require('../connect/obs');
                const obs = getOBS();
                try { await obs.call('RemoveInput', { inputName: 'UploadedVideo' }); } catch (e) { }
                const scene = await obs.call('GetCurrentProgramScene');
                await obs.call('CreateInput', {
                    sceneName: scene.currentProgramSceneName,
                    inputName: 'UploadedVideo',
                    inputKind: 'ffmpeg_source',
                    inputSettings: { local_file: req.file.path, looping: true, is_local_file: true }
                });
                console.log('✅ Added video to OBS source "UploadedVideo"');
            } catch (obsErr) {
                console.log('⚠️ OBS not connected — skipped adding video to OBS scenes');
            }

            res.json({
                success: true,
                message: '✅ Video uploaded successfully',
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                size: req.file.size
            });

        } catch (err) {
            console.error('Video upload error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // Upload logo/image - just save the file, no OBS needed
    uploadLogo: upload.single('logo'),

    handleLogoUpload: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No logo file uploaded' });
            }

            console.log(`🎨 Logo uploaded: ${req.file.filename}`);

            // Optional OBS integration - add logo to OBS if connected
            try {
                const { getOBS } = require('../connect/obs');
                const obs = getOBS();
                try { await obs.call('RemoveInput', { inputName: 'LogoOverlay' }); } catch (e) { }
                const scene = await obs.call('GetCurrentProgramScene');
                const sceneName = scene.currentProgramSceneName;
                await obs.call('CreateInput', {
                    sceneName: sceneName,
                    inputName: 'LogoOverlay',
                    inputKind: 'image_source',
                    inputSettings: { file: req.file.path }
                });
                
                // Position and scale logo
                const sceneItemId = (await obs.call('GetSceneItemId', {
                    sceneName: sceneName,
                    sourceName: 'LogoOverlay'
                })).sceneItemId;

                await obs.call('SetSceneItemTransform', {
                    sceneName: sceneName,
                    sceneItemId: sceneItemId,
                    sceneItemTransform: {
                        positionX: 1800,
                        positionY: 50,
                        scaleX: 0.15,
                        scaleY: 0.15
                    }
                });
                console.log('✅ Added logo to OBS');
            } catch (obsErr) {
                console.log('⚠️ OBS not connected — skipped adding logo to OBS scenes');
            }

            res.json({
                success: true,
                message: '✅ Logo uploaded successfully',
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                size: req.file.size
            });

        } catch (err) {
            console.error('Logo upload error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // Remove source from OBS (optional, only works when OBS connected)
    removeSource: async (req, res) => {
        try {
            const { getOBS } = require('../connect/obs');
            const { sourceName } = req.body;
            if (!sourceName) {
                return res.status(400).json({ error: 'Source name is required' });
            }
            const obs = getOBS();
            await obs.call('RemoveInput', { inputName: sourceName });
            res.json({ message: `✅ ${sourceName} removed` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Update media source settings (optional, only works when OBS connected)
    updateMediaSettings: async (req, res) => {
        try {
            const { getOBS } = require('../connect/obs');
            const { sourceName = 'UploadedVideo', looping = true } = req.body;
            const obs = getOBS();
            await obs.call('SetInputSettings', {
                inputName: sourceName,
                inputSettings: { looping, restart_on_activate: true }
            });
            res.json({ message: '✅ Media settings updated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

module.exports = videoController;