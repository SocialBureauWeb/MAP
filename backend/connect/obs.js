const OBSWebSocket = require('obs-websocket-js').default;
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const obs = new OBSWebSocket();
let isConnected = false;

const OBS_EXEC_PATH = process.env.OBS_PATH || 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe';
const OBS_WORKING_DIR = path.dirname(OBS_EXEC_PATH);

// Auto-configure OBS WebSocket
function autoConfigureOBS() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const configDir = path.join(appData, 'obs-studio', 'plugin_config', 'obs-websocket');
    const configPath = path.join(configDir, 'config.json');

    let wPort = 4455;
    let wPassword = '';

    try {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        let configData = {};
        if (fs.existsSync(configPath)) {
            configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }

        let updated = false;

        // Force enable WebSocket Server
        if (configData.server_enabled !== true) {
            configData.server_enabled = true;
            updated = true;
        }

        if (configData.server_port) wPort = configData.server_port;
        if (configData.auth_required && configData.server_password) {
            wPassword = configData.server_password;
        } else if (configData.auth_required === undefined) {
            // Default no auth on creation or if undefined to make automation easier locally
            configData.auth_required = false;
            updated = true;
        }

        if (updated) {
            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
            console.log('✅ Auto-configured OBS WebSocket.');
        }

        return { url: `ws://127.0.0.1:${wPort}`, password: wPassword };
    } catch (err) {
        console.error('⚠️ Could not auto-configure OBS socket:', err.message);
        return { url: 'ws://127.0.0.1:4455', password: '' };
    }
}

// Check if OBS is running
function isOBSRunning() {
    return new Promise((resolve) => {
        exec('tasklist', (err, stdout) => {
            if (err) resolve(false);
            resolve(stdout.toLowerCase().includes('obs64.exe'));
        });
    });
}

// Start OBS hidden/minimized
function startOBS() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(OBS_EXEC_PATH)) {
            return reject(new Error(`OBS executable not found at ${OBS_EXEC_PATH}`));
        }
        
        console.log('🚀 Starting OBS in the background...');
        
        const obsProcess = spawn(OBS_EXEC_PATH, ['--minimize-to-tray'], {
            cwd: OBS_WORKING_DIR,
            detached: true,
            stdio: 'ignore' // detach stdio so Node doesn't wait
        });
        
        obsProcess.unref(); // allow main process to exit
        
        // Give OBS a few seconds to initialize websocket plugin
        console.log('⏳ Waiting for OBS to initialize...');
        setTimeout(() => resolve(), 5000);
    });
}

async function connectOBS() {
    const obsConfig = autoConfigureOBS();
    const url = process.env.OBS_URL || obsConfig.url;
    const password = process.env.OBS_PASSWORD || obsConfig.password;

    try {
        const isRunning = await isOBSRunning();
        
        if (!isRunning) {
            console.log('⚠️ OBS is not currently running. Auto-starting...');
            await startOBS();
        } else {
            console.log('✅ OBS is already running.');
        }

        console.log(`🔌 Connecting to OBS at ${url}...`);

        // Retry logic for connection
        let attempts = 0;
        const maxAttempts = 10;
        const delay = 3000;

        while (attempts < maxAttempts) {
            try {
                await obs.connect(url, password);
                console.log('✅ Connected to OBS successfully');
                isConnected = true;
                break;
            } catch (err) {
                attempts++;
                if (attempts === maxAttempts) {
                    throw new Error(`Failed to connect after ${maxAttempts} attempts: ${err.message}`);
                }
                console.log(`📡 [Attempt ${attempts}/${maxAttempts}] OBS not ready yet, retrying in 3s...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        // Set up event listeners
        obs.on('ConnectionOpened', () => {
            console.log('📡 OBS WebSocket: Connection opened');
        });

        obs.on('ConnectionClosed', () => {
            console.log('❌ OBS WebSocket: Connection closed');
            isConnected = false;
        });

    } catch (error) {
        console.error('❌ OBS Connection Failed:', error.message);
        console.log('💡 Note: The backend will keep working, but OBS-dependent features will fail.');
        isConnected = false;
    }
}

function getOBS() {
    if (!isConnected) {
        throw new Error('OBS not connected. Make sure OBS is running and WebSocket Server is enabled.');
    }
    return obs;
}

async function disconnectOBS() {
    if (isConnected) {
        await obs.disconnect();
        isConnected = false;
    }
}

module.exports = {
    connectOBS,
    getOBS,
    disconnectOBS,
    isConnected: () => isConnected
};