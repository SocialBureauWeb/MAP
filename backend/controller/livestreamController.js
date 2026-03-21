const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Store the running FFmpeg process so we can stop it
let ffmpegProcess = null;
let currentStreamInfo = {
    isLive: false,
    videoFile: null,
    platform: null,
    startedAt: null
};

// Path to ffmpeg
const FFMPEG_PATH = path.join(__dirname, '../../tools/ffmpeg/ffmpeg.exe');

const liveStreamController = {

    // Start streaming uploaded video to YouTube via RTMP
    startLive: async (req, res) => {
        try {
            const { videoFile, logoFile, autoRestart = true, durationHours, loopCount } = req.body;

            const streamKey = process.env.YOUTUBE_STREAM_KEY;
            const rtmpUrl = process.env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2';

            if (!streamKey) {
                return res.status(400).json({
                    error: 'YOUTUBE_STREAM_KEY is not set in .env file.'
                });
            }

            // Find video file
            const uploadDir = path.join(__dirname, '../../storage/uploads');
            let videoPath;

            if (videoFile) {
                videoPath = path.join(uploadDir, videoFile);
            } else {
                const files = fs.readdirSync(uploadDir).filter(f => /\.(mp4|mkv|avi|mov|webm)$/i.test(f));
                if (files.length === 0) return res.status(400).json({ error: 'No video files uploaded.' });
                videoPath = path.join(uploadDir, files[0]);
            }

            if (!fs.existsSync(videoPath)) {
                return res.status(400).json({ error: `File not found: ${videoPath}` });
            }

            // Kill existing FFmpeg process
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
                ffmpegProcess = null;
            }

            const youtubeRtmp = `${rtmpUrl}/${streamKey}`;
            const localRtmp = 'rtmp://localhost/live/stream';

            console.log(`🚀 SIGNAL: Initializing Broadcast...`);
            
            // Build arguments
            let args = [];
            
            // 1. Loop settings (must be BEFORE input)
            if (loopCount && !isNaN(loopCount)) {
                args.push('-stream_loop', loopCount.toString());
            } else {
                args.push('-stream_loop', '-1'); // Always loop infinitely for duration mode
            }
            
            // 2. Main Input
            args.push('-re', '-i', videoPath);

            // 3. Logo Overlay (optional)
            if (logoFile) {
                const logoPath = path.join(uploadDir, logoFile);
                if (fs.existsSync(logoPath)) {
                    args.push('-stream_loop', '-1', '-i', logoPath);
                    args.push('-filter_complex', '[1:v]scale=120:120[logo];[0:v][logo]overlay=W-w-20:20');
                }
            }

            // 4. Encoding settings
            args.push(
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-maxrate', '3000k',
                '-bufsize', '6000k',
                '-pix_fmt', 'yuv420p',
                '-g', '60',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '44100'
            );

            // 5. RESILIENT DUAL OUTPUT (TEE MUXER)
            // Added 'onfail=ignore' to the local rtmp so the YouTube stream keeps running if Nginx is down
            // Added '?' to maps to prevent errors if audio is missing
            args.push('-f', 'tee', '-map', '0:v', '-map', '0:a?', `[f=flv]${youtubeRtmp}|[f=flv:onfail=ignore]${localRtmp}`);

            let isStoppingManually = false;

            const runFfmpeg = () => {
                ffmpegProcess = spawn(FFMPEG_PATH, args);

                ffmpegProcess.stderr.on('data', (data) => {
                    const msg = data.toString();
                    if (!msg.includes('frame=') && !msg.includes('speed=')) {
                        console.log(`FFmpeg: ${msg.trim()}`);
                    }
                });

                ffmpegProcess.on('close', (code) => {
                    console.log(`FFmpeg process exited with code ${code}`);
                    ffmpegProcess = null;
                    if (!isStoppingManually && autoRestart) {
                        console.log('🔄 Reconnecting signal in 5s...');
                        setTimeout(() => { if (!isStoppingManually) runFfmpeg(); }, 5000);
                    } else {
                        currentStreamInfo.isLive = false;
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    console.error('CRITICAL ERROR starting FFmpeg:', err);
                    ffmpegProcess = null;
                    currentStreamInfo.isLive = false;
                });
            };

            runFfmpeg();

            currentStreamInfo.stop = () => {
                isStoppingManually = true;
                if (ffmpegProcess) ffmpegProcess.kill('SIGTERM');
            };

            if (durationHours && !isNaN(durationHours) && !loopCount) {
                setTimeout(() => {
                    if (currentStreamInfo.isLive) {
                        console.log(`⏰ Time reached (${durationHours}h). Stopping Signal.`);
                        currentStreamInfo.stop();
                    }
                }, durationHours * 60 * 60 * 1000);
            }

            currentStreamInfo = {
                ...currentStreamInfo,
                isLive: true,
                videoFile: path.basename(videoPath),
                platform: 'youtube',
                startedAt: new Date().toISOString(),
                durationLimit: loopCount ? `${loopCount}x loops` : (durationHours ? `${durationHours}h` : 'Indefinite')
            };

            res.json({
                success: true,
                message: loopCount 
                    ? `🔴 Signal active (Looping ${loopCount} times)` 
                    : (durationHours ? `🔴 Signal active (${durationHours}h duration)` : '🔴 Signal active (Continuous)'),
                videoFile: path.basename(videoPath)
            });

        } catch (err) {
            console.error('Broadcasting logic error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    stopLive: async (req, res) => {
        try {
            if (currentStreamInfo.stop) {
                currentStreamInfo.stop();
                currentStreamInfo.isLive = false;
                res.json({ success: true, message: '⏹ Signal terminated' });
            } else if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
                ffmpegProcess = null;
                currentStreamInfo.isLive = false;
                res.json({ success: true, message: '⏹ Signal terminated' });
            } else {
                res.json({ message: 'No active signal' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    getStreamStatus: async (req, res) => {
        res.json({ ...currentStreamInfo, ffmpegRunning: ffmpegProcess !== null });
    },

    getUploadedVideos: async (req, res) => {
        try {
            const uploadDir = path.join(__dirname, '../../storage/uploads');
            if (!fs.existsSync(uploadDir)) return res.json([]);
            const files = fs.readdirSync(uploadDir).filter(f => /\.(mp4|mkv|avi|mov|webm)$/i.test(f)).map(f => {
                const stat = fs.statSync(path.join(uploadDir, f));
                return { name: f, size: stat.size, uploadedAt: stat.mtime };
            }).sort((a,b) => b.uploadedAt - a.uploadedAt);
            res.json(files);
        } catch (err) { res.status(500).json({ error: err.message }); }
    }
};

module.exports = liveStreamController;