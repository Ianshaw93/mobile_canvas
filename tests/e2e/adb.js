// Thin adb helpers for the Android emulator e2e run.
//
// The Android WebView exposes Chrome DevTools over an abstract unix socket
// named `webview_devtools_remote_<pid>` (debuggable builds only). We find it
// in /proc/net/unix, `adb forward` it to a local TCP port, and Playwright
// connects over CDP - no Playwright browser download needed.
const { execFileSync, spawnSync } = require('child_process');

const SERIAL = process.env.ANDROID_SERIAL;

function adb(args, opts = {}) {
  const full = SERIAL ? ['-s', SERIAL, ...args] : args;
  return execFileSync('adb', full, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function adbQuiet(args) {
  const full = SERIAL ? ['-s', SERIAL, ...args] : args;
  return spawnSync('adb', full, { encoding: 'utf8' });
}

/**
 * Pick the WebView DevTools socket out of `cat /proc/net/unix` output.
 * Lines look like:
 *   0000000000000000: 00000002 00000000 00010000 0001 01 12345 @webview_devtools_remote_6789
 * Returns the socket name (without the leading '@') for `pid`, or the first
 * webview socket when no pid is given; null when none is listening.
 */
function findWebviewSocket(procNetUnix, pid) {
  const names = [];
  for (const line of procNetUnix.split('\n')) {
    const m = line.match(/@(webview_devtools_remote_(\d+))\s*$/);
    if (m) names.push({ name: m[1], pid: m[2] });
  }
  if (pid !== undefined) {
    const hit = names.find(n => n.pid === String(pid));
    return hit ? hit.name : null;
  }
  return names.length ? names[0].name : null;
}

function appPid(pkg) {
  const r = adbQuiet(['shell', 'pidof', pkg]);
  const pid = (r.stdout || '').trim().split(/\s+/)[0];
  return pid ? Number(pid) : null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(desc, fn, { timeout = 60000, interval = 1000 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${desc}`);
    await sleep(interval);
  }
}

/** Launch (or relaunch) the app and forward its DevTools socket to `port`. */
async function launchAndForward(pkg, activity, port) {
  adb(['shell', 'am', 'start', '-W', '-n', `${pkg}/${activity}`]);
  const pid = await waitFor(`${pkg} process`, () => appPid(pkg), { timeout: 30000 });
  const sock = await waitFor('WebView devtools socket', () =>
    findWebviewSocket(adb(['shell', 'cat', '/proc/net/unix']), pid), { timeout: 60000 });
  adbQuiet(['forward', '--remove', `tcp:${port}`]);
  adb(['forward', `tcp:${port}`, `localabstract:${sock}`]);
  return { pid, sock };
}

module.exports = { adb, adbQuiet, findWebviewSocket, appPid, launchAndForward, waitFor, sleep };
