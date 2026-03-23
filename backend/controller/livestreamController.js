const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Store the running FFmpeg process so we can stop it
let ffmpegProcess = null;
let currentStreamInfo = {
    isLive: false,
    videoFile: null,
    cameraName: null,
    sourceType: null, // 'file' or 'camera'
    platform: null,
    startedAt: null
};

// Path to ffmpeg
const FFMPEG_PATH = path.join(__dirname, '../../tools/ffmpeg/ffmpeg.exe');

const liveStreamController = {

    // List available DirectShow devices (Cameras/Mics)
    listDevices: async (req, res) => {
        try {
            // ffmpeg -list_devices true -f dshow -i dummy 2>&1
            const cmd = `"${FFMPEG_PATH}" -list_devices true -f dshow -i dummy`;
            
            exec(cmd, (error, stdout, stderr) => {
                // FFmpeg output for list_devices is always in stderr
                const output = stderr || stdout;
                const devices = [];
                
                // Parse lines like: [dshow @ ...]  "Integrated Camera" (video)
                const lines = output.split('\n');
                let capturingVideo = false;
                for (const line of lines) {
                    const isVideoLine = line.includes('(video)');
                    const isAudioLine = line.includes('(audio)');
                    
                    if (line.includes('DirectShow video devices')) capturingVideo = true;
                    if (line.includes('DirectShow audio devices')) {
                        capturingVideo = false;
                        // For older format we'd need another flag but we can just use (audio) check too
                    }
                    
                    if (capturingVideo || isVideoLine || isAudioLine) {
                        const match = line.match(/"([^"]+)"/);
                        if (match) {
                            const name = match[1];
                            const type = (isAudioLine || (!capturingVideo && line.includes('DirectShow audio devices'))) ? 'audio' : 'video';
                            
                            // Avoid duplicates
                            if (!devices.some(d => d.name === name && d.type === type)) {
                                devices.push({ name, type });
                            }
                        }
                    }
                }
                
                res.json(devices);
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // Start streaming to YouTube (File loop or Live Camera)
    startLive: async (req, res) => {
        try {
            const { videoFile, logoFile, autoReconnect = true, durationHours, loopCount, cameraName, micName, sourceType: reqSourceType } = req.body;
            const sourceType = reqSourceType || (cameraName ? 'camera' : 'file');

            const streamKey = process.env.YOUTUBE_STREAM_KEY;
            const rtmpUrl = process.env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2';

            if (!streamKey) {
                return res.status(400).json({ error: 'YOUTUBE_STREAM_KEY not set in .env' });
            }

            // Kill existing process
            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
                ffmpegProcess = null;
            }

            const youtubeRtmp = `${rtmpUrl}/${streamKey}`;
            const hlsPlaylist = path.join(__dirname, '../../storage/hls/stream.m3u8').replace(/\\/g, '/');

            // Ensure HLS dir exists
            const hlsDir = path.dirname(hlsPlaylist);
            if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

            let args = [];
            let videoPath;
            const uploadDir = path.join(__dirname, '../../storage/uploads');
            if (sourceType === 'camera') {
                console.log(`🎥 SIGNAL: Starting Camera broadcast ("${cameraName}") with mic ("${micName || 'Silent'}")...`);
                
                // Separate inputs are often more reliable on Windows for different hardware logical devices
                args.push('-f', 'dshow', '-rtbufsize', '512M', '-i', `video=${cameraName}`);
                
                if (micName) {
                    args.push('-f', 'dshow', '-i', `audio=${micName}`);
                } else {
                    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
                }
            } else {
                if (!fs.existsSync(uploadDir)) return res.status(400).json({ error: 'Upload directory not found.' });

                if (videoFile) {
                    videoPath = path.join(uploadDir, videoFile);
                } else {
                    // Strictly exclude known corrupted patterns and tiny files
                    const files = fs.readdirSync(uploadDir)
                        .filter(f => /\.(mp4|mkv|avi|mov|webm)$/i.test(f))
                        .filter(f => !f.includes('biqk5e')) // Hard blacklist corrupted file
                        .map(f => ({ name: f, stat: fs.statSync(path.join(uploadDir, f)) }))
                        .filter(f => f.stat.size > 1.5 * 1024 * 1024) // Require > 1.5MB for auto-selection
                        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

                    if (files.length === 0) return res.status(400).json({ error: 'No valid video files uploaded (minimum 1.5MB required).' });
                    videoPath = path.join(uploadDir, files[0].name);
                }

                if (!fs.existsSync(videoPath)) return res.status(400).json({ error: 'File not found.' });

                console.log(`🚀 SIGNAL: Starting Video Loop broadcast (${path.basename(videoPath)})...`);
                
                if (loopCount && !isNaN(loopCount)) {
                    args.push('-stream_loop', loopCount.toString());
                } else {
                    args.push('-stream_loop', '-1');
                }
                args.push('-re', '-i', videoPath);
            }

            let logoInputIndex = -1;
            if (logoFile) {
                const logoPath = path.join(uploadDir, logoFile);
                if (fs.existsSync(logoPath)) {
                    // logo is in input 1 if sourceType=file
                    // logo is in input 2 if sourceType=camera (because index 0=video, 1=audio)
                    logoInputIndex = sourceType === 'camera' ? 2 : 1; 
                    args.push('-stream_loop', '-1', '-i', logoPath);
                }
            }

            if (logoInputIndex > 0) {
                args.push('-filter_complex', `[${logoInputIndex}:v]scale=120:120[logo];[0:v][logo]overlay=W-w-20:20[v]`);
            }

            // Encoding Settings
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

            // Dynamic mapping based on input setup
            const videoMap = logoInputIndex > 0 ? '[v]' : '0:v';
            
            // For camera, audio is always in input 1 (mic or anullsrc). 
            // For file, audio is usually part of input 0.
            const audioMap = sourceType === 'camera' ? '1:a' : '0:a?';
            
            const mapArgs = ['-map', videoMap, '-map', audioMap];

            // Output to YouTube (FLV) and Local FS (HLS)
            args.push(
                '-f', 'tee', 
                ...mapArgs, 
                `[f=flv]${youtubeRtmp}|[f=hls:hls_time=4:hls_list_size=5:hls_flags=delete_segments:onfail=ignore]${hlsPlaylist}`
            );

            let isStoppingManually = false;
            let lastStartTime = 0;
            let failureCount = 0;
            let hadRecentCorruption = false;

            const runFfmpeg = () => {
                if (isStoppingManually) return;

                const now = Date.now();
                // Reset failure count only if it ran for more than 5 minutes successfully
                if (now - lastStartTime > 300000) {
                    failureCount = 0;
                }

                if (failureCount > 5) {
                    console.error('❌ FFmpeg reached maximum restart attempts. Please check your source file or connection.');
                    currentStreamInfo.isLive = false;
                    return;
                }

                lastStartTime = now;
                hadRecentCorruption = false;
                
                console.log(`🎬 Spawning FFmpeg [${sourceType}]...`);
                ffmpegProcess = spawn(FFMPEG_PATH, args);
                
                ffmpegProcess.stderr.on('data', (data) => {
                    const msg = data.toString();
                    if (msg.includes('Packet corrupt') || msg.includes('Decoding error') || msg.includes('Invalid NAL unit')) {
                        if (!hadRecentCorruption) {
                            console.error('⚠️ Detected stream corruption! This file might be broken.');
                            hadRecentCorruption = true;
                            failureCount++; // Treat corruption as a failure immediately
                        }
                    }
                    if (!msg.includes('frame=') && !msg.includes('speed=')) {
                        // Only log important stuff to keep terminal clean
                        if (msg.length < 200) console.log(`FFmpeg: ${msg.trim()}`);
                    }
                });

                ffmpegProcess.on('close', (code) => {
                    console.log(`FFmpeg [${sourceType}] exited (${code})`);
                    ffmpegProcess = null;
                    
                    if (!isStoppingManually && autoReconnect) {
                        if (code !== 0) failureCount++;
                        
                        const delay = Math.min(10000 * (failureCount + 1), 60000); 
                        console.log(`🔄 Reattempting in ${delay/1000}s... (Failures: ${failureCount}/5)`);
                        setTimeout(() => { if (!isStoppingManually) runFfmpeg(); }, delay);
                    } else { 
                        currentStreamInfo.isLive = false; 
                    }
                });
            };

            runFfmpeg();

            currentStreamInfo = {
                stop: () => {
                    isStoppingManually = true;
                    if (ffmpegProcess) {
                        ffmpegProcess.kill('SIGTERM');
                        console.log('🛑 Signal manually terminated.');
                    }
                },
                isLive: true,
                sourceType,
                videoFile: sourceType === 'file' ? path.basename(videoPath) : null,
                cameraName: sourceType === 'camera' ? cameraName : null,
                micName: sourceType === 'camera' ? micName : null,
                startedAt: new Date().toISOString()
            };

            res.json({
                success: true,
                message: sourceType === 'camera' ? `🔴 Live Camera Active: ${cameraName}${micName ? ` / ${micName}` : ''}` : `🔴 Video Broadcast Active`,
                sourceType
            });

        } catch (err) {
            console.error('Signal error:', err);
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
            } else { res.json({ message: 'No active signal' }); }
        } catch (err) { res.status(500).json({ error: err.message }); }
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