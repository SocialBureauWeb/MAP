const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OBS_EXEC_PATH = 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe';
const OBS_WORKING_DIR = 'C:\\Program Files\\obs-studio\\bin\\64bit';

console.log('Checking if OBS exec exists:', fs.existsSync(OBS_EXEC_PATH));

const obsProcess = spawn(OBS_EXEC_PATH, ['--minimize-to-tray'], {
    cwd: OBS_WORKING_DIR,
    detached: true,
    stdio: 'inherit' // let's see any errors
});

obsProcess.on('error', (err) => {
    console.error('Spawn error:', err);
});

console.log('Spawned with PID:', obsProcess.pid);
setTimeout(() => {
    console.log('Finished wait.');
    process.exit(0);
}, 10000);
