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
            const { videoFile, logoFile } = req.body;

            const streamKey = process.env.YOUTUBE_STREAM_KEY;
            const rtmpUrl = process.env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2';

            if (!streamKey) {
                return res.status(400).json({
                    error: 'YOUTUBE_STREAM_KEY is not set in .env file. Get it from YouTube Studio → Go Live → Stream Key'
                });
            }

            // Find video file
            const uploadDir = path.join(__dirname, '../../storage/uploads');
            let videoPath;

            if (videoFile) {
                videoPath = path.join(uploadDir, videoFile);
            } else {
                // Use the most recently uploaded video
                const files = fs.readdirSync(uploadDir)
                    .filter(f => /\.(mp4|mkv|avi|mov|webm)$/i.test(f))
                    .map(f => ({
                        name: f,
                        time: fs.statSync(path.join(uploadDir, f)).mtime.getTime()
                    }))
                    .sort((a, b) => b.time - a.time);

                if (files.length === 0) {
                    return res.status(400).json({ error: 'No video file found. Please upload a video first.' });
                }
                videoPath = path.join(uploadDir, files[0].name);
            }

            if (!fs.existsSync(videoPath)) {
                return res.status(400).json({ error: `Video file not found: ${videoPath}` });
            }

            // Kill existing FFmpeg process if running
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
                ffmpegProcess = null;
            }

            const fullRtmpUrl = `${rtmpUrl}/${streamKey}`;
            console.log(`🚀 Starting YouTube Live Stream...`);
            console.log(`📹 Video: ${videoPath}`);
            console.log(`📡 RTMP: ${rtmpUrl}/****`);

            // Build FFmpeg command
            let ffmpegArgs;

            if (logoFile) {
                const logoPath = path.join(uploadDir, logoFile);
                if (fs.existsSync(logoPath)) {
                    // Stream with logo overlay
                    ffmpegArgs = [
                        '-re',
                        '-stream_loop', '-1',
                        '-i', videoPath,
                        '-i', logoPath,
                        '-filter_complex', '[1:v]scale=120:120[logo];[0:v][logo]overlay=W-w-20:20',
                        '-c:v', 'libx264',
                        '-preset', 'veryfast',
                        '-maxrate', '3000k',
                        '-bufsize', '6000k',
                        '-pix_fmt', 'yuv420p',
                        '-g', '60',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-ar', '44100',
                        '-f', 'flv',
                        fullRtmpUrl
                    ];
                } else {
                    // No logo file found, stream without
                    ffmpegArgs = [
                        '-re',
                        '-stream_loop', '-1',
                        '-i', videoPath,
                        '-c:v', 'libx264',
                        '-preset', 'veryfast',
                        '-maxrate', '3000k',
                        '-bufsize', '6000k',
                        '-pix_fmt', 'yuv420p',
                        '-g', '60',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-ar', '44100',
                        '-f', 'flv',
                        fullRtmpUrl
                    ];
                }
            } else {
                // Stream video only
                ffmpegArgs = [
                    '-re',
                    '-stream_loop', '-1',
                    '-i', videoPath,
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-maxrate', '3000k',
                    '-bufsize', '6000k',
                    '-pix_fmt', 'yuv420p',
                    '-g', '60',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ar', '44100',
                    '-f', 'flv',
                    fullRtmpUrl
                ];
            }

            ffmpegProcess = spawn(FFMPEG_PATH, ffmpegArgs);

            ffmpegProcess.stdout.on('data', (data) => {
                console.log(`FFmpeg: ${data}`);
            });

            ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                // FFmpeg sends progress info to stderr
                if (msg.includes('frame=') || msg.includes('speed=')) {
                    // Normal progress — don't flood console
                } else {
                    console.log(`FFmpeg: ${msg}`);
                }
            });

            ffmpegProcess.on('close', (code) => {
                console.log(`FFmpeg process exited with code ${code}`);
                ffmpegProcess = null;
                currentStreamInfo.isLive = false;
            });

            ffmpegProcess.on('error', (err) => {
                console.error('FFmpeg error:', err);
                ffmpegProcess = null;
                currentStreamInfo.isLive = false;
            });

            currentStreamInfo = {
                isLive: true,
                videoFile: path.basename(videoPath),
                platform: 'youtube',
                startedAt: new Date().toISOString()
            };

            res.json({
                success: true,
                message: '🔴 LIVE on YouTube!',
                videoFile: path.basename(videoPath),
                youtubeUrl: 'https://youtube.com/dashboard → Live tab to see your stream'
            });

        } catch (err) {
            console.error('Start live error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    // Stop streaming
    stopLive: async (req, res) => {
        try {
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
                ffmpegProcess = null;
                currentStreamInfo.isLive = false;

                res.json({ success: true, message: '⏹ Stream stopped' });
            } else {
                res.json({ message: 'No active stream to stop' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Get stream status
    getStreamStatus: async (req, res) => {
        res.json({
            ...currentStreamInfo,
            ffmpegRunning: ffmpegProcess !== null
        });
    },

    // List uploaded videos available for streaming
    getUploadedVideos: async (req, res) => {
        try {
            const uploadDir = path.join(__dirname, '../../storage/uploads');
            if (!fs.existsSync(uploadDir)) {
                return res.json([]);
            }

            const files = fs.readdirSync(uploadDir)
                .filter(f => /\.(mp4|mkv|avi|mov|webm)$/i.test(f))
                .map(f => {
                    const stat = fs.statSync(path.join(uploadDir, f));
                    return {
                        name: f,
                        size: stat.size,
                        uploadedAt: stat.mtime
                    };
                })
                .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

            res.json(files);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
};

module.exports = liveStreamController;