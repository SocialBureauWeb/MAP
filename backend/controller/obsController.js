// const { getOBS } = require('../connect/obs');

// const obsController = {

//     startStream: async (req, res) => {
//         try {
//             const obs = getOBS();
//             await obs.call('StartStream');
//             res.json({ message: 'Stream started' });
//         } catch (err) {
//             res.status(500).json({ error: err.message });
//         }
//     },

//     stopStream: async (req, res) => {
//         try {
//             const obs = getOBS();
//             await obs.call('StopStream');
//             res.json({ message: 'Stream stopped' });
//         } catch (err) {
//             res.status(500).json({ error: err.message });
//         }
//     },

//     switchScene: async (req, res) => {
//         try {
//             const { sceneName } = req.body;
//             const obs = getOBS();

//             await obs.call('SetCurrentProgramScene', {
//                 sceneName
//             });

//             res.json({ message: `Switched to ${sceneName}` });
//         } catch (err) {
//             res.status(500).json({ error: err.message });
//         }
//     },

//     updateText: async (req, res) => {
//         try {
//             const { text } = req.body;
//             const obs = getOBS();

//             await obs.call('SetInputSettings', {
//                 inputName: 'Title', // must match OBS source name
//                 inputSettings: {
//                     text
//                 }
//             });

//             res.json({ message: 'Text updated' });
//         } catch (err) {
//             res.status(500).json({ error: err.message });
//         }
//     },

//     goLive: async (req, res) => {
//         try {
//             const obs = getOBS();

//             // starting screen
//             await obs.call('SetCurrentProgramScene', {
//                 sceneName: 'Starting Soon'
//             });

//             await new Promise(r => setTimeout(r, 1000));

//             // switch to live
//             await obs.call('SetCurrentProgramScene', {
//                 sceneName: 'Live'
//             });

//             // start streaming
//             await obs.call('StartStream');

//             res.json({
//                 message: '🚀 LIVE STARTED',
//                 live_link: 'http://localhost:8080/hls/stream.m3u8'
//             });

//         } catch (err) {
//             res.status(500).json({ error: err.message });
//         }
//     }

// };

// module.exports = obsController;


const { getOBS } = require('../connect/obs');

const obsController = {

    // Get all scenes
    getScenes: async (req, res) => {
        try {
            const obs = getOBS();
            const scenes = await obs.call('GetSceneList');
            res.json(scenes.scenes || []);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Start stream
    startStream: async (req, res) => {
        try {
            const obs = getOBS();
            const response = await obs.call('StartStream');
            res.json({ message: '✅ Stream started', response });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Stop stream
    stopStream: async (req, res) => {
        try {
            const obs = getOBS();
            const response = await obs.call('StopStream');
            res.json({ message: '⏹ Stream stopped', response });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Switch scene
    switchScene: async (req, res) => {
        try {
            const { sceneName } = req.body;

            if (!sceneName) {
                return res.status(400).json({ error: 'Scene name is required' });
            }

            const obs = getOBS();
            await obs.call('SetCurrentProgramScene', { sceneName });
            res.json({ message: `✅ Switched to ${sceneName}` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Update text source
    updateText: async (req, res) => {
        try {
            const { text, sourceName = 'Title' } = req.body;

            if (!text) {
                return res.status(400).json({ error: 'Text is required' });
            }

            const obs = getOBS();

            await obs.call('SetInputSettings', {
                inputName: sourceName,
                inputSettings: { text }
            });

            res.json({ message: '✅ Text updated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Get current stream status
    getStreamStatus: async (req, res) => {
        try {
            const obs = getOBS();
            const status = await obs.call('GetStreamStatus');
            res.json(status);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Crop/Cut video
    cropVideo: async (req, res) => {
        try {
            const { sourceName, cropLeft, cropRight, cropTop, cropBottom } = req.body;

            const obs = getOBS();

            // Get current scene
            const scene = await obs.call('GetCurrentProgramScene');
            const sceneName = scene.currentProgramSceneName;

            // Get scene item ID
            const sceneItem = await obs.call('GetSceneItemId', {
                sceneName,
                sourceName: sourceName || 'UploadedVideo'
            });

            // Set crop transform
            await obs.call('SetSceneItemTransform', {
                sceneName,
                sceneItemId: sceneItem.sceneItemId,
                sceneItemTransform: {
                    cropLeft: cropLeft || 0,
                    cropRight: cropRight || 0,
                    cropTop: cropTop || 0,
                    cropBottom: cropBottom || 0,
                }
            });

            res.json({ message: '✅ Video cropped' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Scale/Resize source
    scaleSource: async (req, res) => {
        try {
            const { sourceName, scaleX = 1, scaleY = 1, positionX, positionY } = req.body;

            const obs = getOBS();
            const scene = await obs.call('GetCurrentProgramScene');
            const sceneName = scene.currentProgramSceneName;

            const sceneItem = await obs.call('GetSceneItemId', {
                sceneName,
                sourceName: sourceName || 'UploadedVideo'
            });

            const transform = { scaleX, scaleY };
            if (positionX !== undefined) transform.positionX = positionX;
            if (positionY !== undefined) transform.positionY = positionY;

            await obs.call('SetSceneItemTransform', {
                sceneName,
                sceneItemId: sceneItem.sceneItemId,
                sceneItemTransform: transform
            });

            res.json({ message: '✅ Source scaled' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Rotate source
    rotateSource: async (req, res) => {
        try {
            const { sourceName, rotation } = req.body;

            if (rotation === undefined) {
                return res.status(400).json({ error: 'Rotation angle is required' });
            }

            const obs = getOBS();
            const scene = await obs.call('GetCurrentProgramScene');
            const sceneName = scene.currentProgramSceneName;

            const sceneItem = await obs.call('GetSceneItemId', {
                sceneName,
                sourceName: sourceName || 'UploadedVideo'
            });

            await obs.call('SetSceneItemTransform', {
                sceneName,
                sceneItemId: sceneItem.sceneItemId,
                sceneItemTransform: { rotation }
            });

            res.json({ message: '✅ Source rotated' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

module.exports = obsController;