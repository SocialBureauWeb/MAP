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
            const cmd = `"${FFMPEG_PATH}" -list_devices true -f dshow -i dummy`;
            exec(cmd, (error, stdout, stderr) => {
                const output = stderr || stdout;
                const devices = [];
                const lines = output.split('\n');
                let capturingVideo = false;
                for (const line of lines) {
                    const isVideoLine = line.includes('(video)');
                    const isAudioLine = line.includes('(audio)');
                    if (line.includes('DirectShow video devices')) capturingVideo = true;
                    if (line.includes('DirectShow audio devices')) capturingVideo = false;
                    if (capturingVideo || isVideoLine || isAudioLine) {
                        const match = line.match(/"([^"]+)"/);
                        if (match) {
                            const name = match[1];
                            const type = (isAudioLine || (!capturingVideo && line.includes('DirectShow audio devices'))) ? 'audio' : 'video';
                            if (!devices.some(d => d.name === name && d.type === type)) {
                                devices.push({ name, type });
                            }
                        }
                    }
                }
                res.json(devices);
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    },

    // Start streaming to YouTube (File loop or Live Camera)
    startLive: async (req, res) => {
        try {
            const { 
              videoFile, logoFile, audioFile,
              autoReconnect = true, durationHours, loopCount, 
              cameraName, micName, sourceType: reqSourceType, 
              transform, logoTransform 
            } = req.body;
            
            const sourceType = reqSourceType || (cameraName ? 'camera' : 'file');
            const streamKey = process.env.YOUTUBE_STREAM_KEY;
            const rtmpUrl = process.env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2';

            if (!streamKey) return res.status(400).json({ error: 'YOUTUBE_STREAM_KEY not set in .env' });

            if (ffmpegProcess) {
                ffmpegProcess.kill('SIGTERM');
                ffmpegProcess = null;
            }
            // Cleanup orphans on Windows to prevent "file in use" or port conflicts
            try { exec('taskkill /F /IM ffmpeg.exe /T'); } catch(e){}
            await new Promise(r => setTimeout(r, 1000));

            const youtubeRtmp = `${rtmpUrl}/${streamKey}`;
            const hlsPlaylist = path.join(__dirname, '../../storage/hls/stream.m3u8').replace(/\\/g, '/');
            const hlsDir = path.dirname(hlsPlaylist);
            if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

            // ── BUILD FFmpeg ARGS ───────────────────────────────────────────
            let args = ['-hide_banner', '-loglevel', 'info'];
            const uploadDir = path.join(__dirname, '../../storage/uploads');

            // 1. MAIN INPUT
            if (sourceType === 'camera') {
                args.push('-f', 'dshow', '-rtbufsize', '1G', '-i', `video=${cameraName}`);
                if (micName && micName !== 'Default') args.push('-f', 'dshow', '-i', `audio=${micName}`);
                else args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
            } else {
                const videoPath = path.join(uploadDir, videoFile);
                if (!fs.existsSync(videoPath)) return res.status(400).json({ error: 'Video file not found' });
                args.push('-re', '-stream_loop', loopCount === -1 ? '-1' : (loopCount||0).toString(), '-i', videoPath);
            }

            // 2. OVERLAY INPUT
            let logoInputIdx = -1;
            if (logoFile) {
                const logoPath = path.join(uploadDir, logoFile);
                if (fs.existsSync(logoPath)) {
                    logoInputIdx = args.filter(a => a === '-i').length;
                    // Use -loop 1 for images
                    args.push('-loop', '1', '-i', logoPath);
                }
            }

            // 3. AUDIO INPUT
            let audioInputIdx = -1;
            if (audioFile) {
                const audioPath = path.join(uploadDir, audioFile);
                if (fs.existsSync(audioPath)) {
                    audioInputIdx = args.filter(a => a === '-i').length;
                    args.push('-re', '-stream_loop', '-1', '-i', audioPath);
                }
            }

            // ── FILTER COMPLEX ───────────────────────────────────────────────
            let filterComplex = '';
            let vMap = '0:v';
            let aMap = (sourceType === 'camera' ? '1:a' : '0:a?');

            // Video Filters
            let vFilters = [];
            if (transform) {
                const { crop, scale, rotation } = transform;
                if (crop && (crop.L||crop.R||crop.T||crop.B)) vFilters.push(`crop=in_w-${crop.L||0}-${crop.R||0}:in_h-${crop.T||0}-${crop.B||0}:${crop.L||0}:${crop.T||0}`);
                if (scale && scale !== 1) vFilters.push(`scale=iw*${scale}:-1`);
                if (rotation && rotation !== 0) vFilters.push(`rotate=${rotation}*PI/180:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
            }

            if (vFilters.length > 0) {
                filterComplex += `[0:v]${vFilters.join(',')}[vtransformed]`;
                vMap = '[vtransformed]';
            }

            // Logo Overlay
            if (logoInputIdx > 0) {
                const lScale = (logoTransform?.scale || 1) * 200;
                const lX = logoTransform?.prepX ? `(W*${logoTransform.prepX/100})-(w/2)` : 'W-w-20';
                const lY = logoTransform?.prepY ? `(H*${logoTransform.prepY/100})-(h/2)` : '20';
                filterComplex += (filterComplex ? ';' : '') + `[${logoInputIdx}:v]scale=${lScale}:-1[logo];${vMap}[logo]overlay=${lX}:${lY}:shortest=1[vfinal]`;
                vMap = '[vfinal]';
            }

            // Audio Mixing
            if (audioInputIdx > 0) {
                const mainA = (sourceType === 'camera' ? '1:a' : '0:a');
                filterComplex += (filterComplex ? ';' : '') + `[${mainA}][${audioInputIdx}:a]amix=inputs=2:duration=first[amixed]`;
                aMap = '[amixed]';
            }

            if (filterComplex) args.push('-filter_complex', filterComplex);

            // Final Mapping & Encoding
            args.push(
                '-map', vMap, '-map', aMap,
                '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k', '-maxrate', '3000k', '-bufsize', '6000k',
                '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100'
            );

            args.push('-f', 'tee', `[f=flv]${youtubeRtmp}|[f=hls:hls_time=2:hls_list_size=3:hls_flags=delete_segments]${hlsPlaylist}`);

            console.log(`🚀 FFmpeg Command: ${FFMPEG_PATH} ${args.join(' ')}`);

            // EXECUTION
            let isStopping = false;
            const run = () => {
                if (isStopping) return;
                ffmpegProcess = spawn(FFMPEG_PATH, args);
                ffmpegProcess.stderr.on('data', d => {
                    const m = d.toString();
                    if (!m.includes('frame=') && m.length < 200) console.log(`FFmpeg: ${m.trim()}`);
                });
                ffmpegProcess.on('close', code => {
                    console.log(`FFmpeg exited (${code})`);
                    if (!isStopping && autoReconnect) setTimeout(run, 5000);
                    else currentStreamInfo.isLive = false;
                });
            };
            run();

            currentStreamInfo = {
                stop: () => { isStopping = true; if(ffmpegProcess) ffmpegProcess.kill('SIGTERM'); },
                isLive: true,
                sourceType,
                videoFile: path.basename(videoPath || 'camera'),
                startedAt: new Date().toISOString()
            };

            res.json({ success: true, message: '🔴 Broadcast Active', sourceType });

        } catch (err) {
            console.error('Signal error:', err);
            res.status(500).json({ error: err.message });
        }
    },

    stopLive: async (req, res) => {
        if (currentStreamInfo.stop) currentStreamInfo.stop();
        else if (ffmpegProcess) ffmpegProcess.kill('SIGTERM');
        currentStreamInfo.isLive = false;
        res.json({ success: true, message: '⏹ Signal terminated' });
    },

    getStreamStatus: async (req, res) => res.json({ ...currentStreamInfo, ffmpegRunning: !!ffmpegProcess }),

    getUploadedVideos: async (req, res) => {
        try {
            const up = path.join(__dirname, '../../storage/uploads');
            if (!fs.existsSync(up)) return res.json([]);
            const f = fs.readdirSync(up).filter(x => /\.(mp4|mkv|avi|mov|webm)$/i.test(x)).map(x => {
                const s = fs.statSync(path.join(up, x));
                return { name: x, size: s.size, uploadedAt: s.mtime };
            }).sort((a, b) => b.uploadedAt - a.uploadedAt);
            res.json(f);
        } catch (e) { res.status(500).json({ error: e.message }); }
    }
};

module.exports = liveStreamController;