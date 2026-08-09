import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';

const ADB_PATH = process.env.ADB_PATH || 'C:\\Users\\acer\\AppData\\Local\\Android\\platform-tools\\adb.exe';
const isWin = process.platform === 'win32';

console.log('\n======================================================');
console.log('  🚀 AUTOMATION CONTROL — ONE-CLICK ALL-IN-ONE LAUNCHER');
console.log('======================================================\n');

// 1. Auto Pre-Flight Port Cleanup (Clears 3000 & 3001 ports if occupied)
console.log('🧹 Preparing system ports (clearing stale processes)...');
if (isWin) {
  try {
    execSync('powershell -Command "Get-NetTCPConnection -LocalPort 3001,3000 -ErrorAction SilentlyContinue | ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
    console.log('✅ Ports 3000 & 3001 ready and clear.');
  } catch {
    /* ignore */
  }
}

// 2. Check ADB Devices
console.log('\n📱 Checking connected Android ADB devices...');
try {
  const adbBin = existsSync(ADB_PATH) ? `"${ADB_PATH}"` : 'adb';
  const adbOutput = execSync(`${adbBin} devices -l`, { encoding: 'utf8' });
  const lines = adbOutput.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('List of'));
  if (lines.length > 0) {
    console.log(`✅ Found ${lines.length} connected Android phone(s):`);
    lines.forEach((line) => console.log(`   - ${line}`));
  } else {
    console.log('⚠️  No ADB devices currently attached via USB/Wi-Fi');
  }
} catch (err) {
  console.log('⚠️  ADB check warning:', err.message || err);
}

console.log('\n------------------------------------------------------');
console.log('⚡ Starting Backend API, Web Dashboard & Device Agents...');
console.log('------------------------------------------------------\n');

// 3. Spawn Turbo Dev Server
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const mainProcess = spawn(npmCmd, ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
});

// Auto-open browser after 5 seconds
setTimeout(() => {
  console.log('\n🌐 Opening Web Dashboard at http://localhost:3000/devices ...\n');
  const openCmd = isWin ? 'start http://localhost:3000/devices' : 'open http://localhost:3000/devices';
  try {
    execSync(openCmd, { shell: true });
  } catch {
    /* ignore */
  }
}, 5000);

mainProcess.on('exit', (code) => {
  console.log(`\n🛑 System process exited with code ${code}`);
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  mainProcess.kill('SIGINT');
  process.exit(0);
});
