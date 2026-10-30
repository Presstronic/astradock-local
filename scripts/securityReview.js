const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const security = fs.readFileSync(path.join(root, 'src', 'electronSecurity.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const failures = [];

function requireMatch(source, pattern, description) {
  if (!pattern.test(source)) failures.push(description);
}

function requireAbsent(source, pattern, description) {
  if (pattern.test(source)) failures.push(description);
}

requireMatch(security, /contextIsolation:\s*true/, 'context isolation must remain enabled');
requireMatch(security, /nodeIntegration:\s*false/, 'renderer Node integration must remain disabled');
requireMatch(security, /sandbox:\s*true/, 'renderer sandbox must remain enabled');
requireMatch(security, /connect-src 'none'/, 'renderer CSP must deny network connections');
requireMatch(security, /contents\.setWindowOpenHandler/, 'new-window policy must be installed');
requireMatch(security, /will-attach-webview/, 'webview attachment must be denied');
requireAbsent(preload, /contextBridge\.exposeInMainWorld\([^,]+,\s*ipcRenderer/, 'raw ipcRenderer must not cross the preload boundary');
requireAbsent(preload, /ipcRenderer\.(send|sendSync)\(/, 'one-way generic IPC must not be exposed');
requireAbsent(main, /fetch\s*\(|axios|node:https|node:http/, 'MVP main process must not provide arbitrary network access');
requireMatch(main, /assertTrustedSender/, 'IPC handlers must validate their sender');
requireMatch(main, /validatePayload/, 'IPC handlers must validate their payload');
requireMatch(packageJson.build ? JSON.stringify(packageJson.build) : '', /"files"/, 'packaging must use an explicit file allowlist');
requireMatch(packageJson.build ? JSON.stringify(packageJson.build) : '', /"asar":true/, 'packaging must keep application files in an archive');

if (failures.length) {
  console.error('Security surface review failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Security surface review passed.');
}
