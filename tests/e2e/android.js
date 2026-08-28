/**
 * End-to-end run of the real Android build on an emulator (or a USB device).
 *
 * The browser e2e (replace-pdf.js) exercises the UI but every
 * `Capacitor.getPlatform() === 'web'` branch takes the web path: jeep-sqlite
 * instead of the native SQLite plugin, IndexedDB instead of @capacitor/filesystem,
 * localStorage instead of Preferences. This run drives the shipped APK through
 * Chrome DevTools on the WebView so those native code paths are what's tested.
 *
 * What it proves:
 *   - the APK installs and the WebView boots on the native platform
 *   - the native SQLite store initialises and a project + plan can be created
 *   - a PDF imports through the app's own pipeline (pdf.js + native file storage)
 *   - pins placed on the plan survive the process being killed and relaunched,
 *     i.e. native SQLite + Filesystem persistence actually round-trips
 *   - no unexpected console errors on the native side
 *
 * Requirements: `adb` on PATH with one booted device/emulator attached, a
 * *debuggable* APK (the debug build; release builds have WebView debugging off),
 * and `npm ci` done (Playwright is used only as a CDP client - no browser download).
 *
 *   E2E_APK         path to the APK (default android/app/build/outputs/apk/debug/app-debug.apk)
 *   E2E_OUT         directory for screenshots + logcat (default e2e-out)
 *   E2E_CDP_PORT    local port forwarded to the WebView (default 9222)
 *   ANDROID_SERIAL  pick a device when several are attached
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, _android } = require('playwright');
const { writeFixtures } = require('./fixtures');
const { adb, adbQuiet, launchAndForward, waitFor, sleep } = require('./adb');

const PKG = 'com.example.app';
const ACTIVITY = '.MainActivity';
const APK = process.env.E2E_APK || 'android/app/build/outputs/apk/debug/app-debug.apk';
const OUT = process.env.E2E_OUT || 'e2e-out';
const PORT = Number(process.env.E2E_CDP_PORT || 9222);

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n          ' + detail : ''}`);
  cond ? pass++ : fail++;
};

const errs = [];
let shot = 0;

let device = null; // Playwright AndroidDevice, reused across relaunches

// Preferred: Playwright's Android support talks to the WebView's abstract
// socket through adb itself and is the path Playwright tests against WebView.
async function connectViaPlaywrightAndroid() {
  if (!device) {
    const devices = await _android.devices();
    device = devices.find(d => !process.env.ANDROID_SERIAL || d.serial() === process.env.ANDROID_SERIAL);
    if (!device) throw new Error(`no Android device found (have: ${devices.map(d => d.serial()).join(', ') || 'none'})`);
    device.setDefaultTimeout(60000);
  }
  const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
  const page = await webview.page();
  return { page, close: async () => { try { await page.context().close(); } catch {} } };
}

// Fallback: forward the socket to TCP and use plain CDP. Errors are logged so
// a failure in CI says why instead of just timing out.
async function connectViaCdp() {
  const { sock } = await launchAndForward(PKG, ACTIVITY, PORT);
  console.log(`  forwarded tcp:${PORT} -> localabstract:${sock}`);
  let lastErr = null;
  const browser = await waitFor('CDP connection', async () => {
    try { return await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 5000 }); }
    catch (e) { if (String(e) !== String(lastErr)) console.log(`  cdp: ${String(e).split('\n')[0]}`); lastErr = e; return null; }
  }, { timeout: 45000, interval: 2000 }).catch(async (e) => {
    for (const ep of ['/json/version', '/json/list']) {
      try { console.log(`  ${ep}: ${(await (await fetch(`http://127.0.0.1:${PORT}${ep}`)).text()).slice(0, 600)}`); }
      catch (fe) { console.log(`  ${ep}: ${fe.message}`); }
    }
    throw e;
  });
  const page = await waitFor('app page in WebView', async () => {
    const pages = browser.contexts().flatMap(c => c.pages());
    return pages.find(p => /^https?:\/\/localhost/.test(p.url())) || null;
  }, { timeout: 30000 });
  return { page, close: async () => { try { await browser.close(); } catch {} } };
}

async function connect() {
  adb(['shell', 'am', 'start', '-W', '-n', `${PKG}/${ACTIVITY}`]);
  let conn;
  try {
    conn = await connectViaPlaywrightAndroid();
    console.log('  connected via playwright _android');
  } catch (e) {
    console.log(`  playwright _android failed: ${String(e).split('\n')[0]}`);
    conn = await connectViaCdp();
    console.log('  connected via CDP');
  }
  const { page } = conn;
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 250)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  const snap = async (label) => {
    try { await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, '0')}-${label}.png`) }); }
    catch (e) { console.log(`  (screenshot ${label} failed: ${e.message})`); }
  };
  return { browser: conn, page, snap };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-android-'));
  const fx = writeFixtures(tmp);
  const pdf = { name: 'level00.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(fx.a4) };

  console.log(`== install ${APK} ==`);
  if (!fs.existsSync(APK)) throw new Error(`APK not found: ${APK}`);
  console.log(adb(['install', '-r', '-g', APK]).trim());
  adbQuiet(['shell', 'pm', 'clear', PKG]);
  adbQuiet(['logcat', '-c']);

  console.log('\n== first launch ==');
  let { browser, page, snap } = await connect();
  const home = async () => {
    await page.waitForFunction(() => document.body.innerText.includes('Add Project'), { timeout: 60000 });
    await page.waitForTimeout(3000);
  };
  await home();
  await snap('home');

  const platform = await page.evaluate(() => window.Capacitor && window.Capacitor.getPlatform());
  check('running on the native platform', platform === 'android', `Capacitor.getPlatform() = ${platform}`);
  check('native SQLite plugin present',
    await page.evaluate(() => !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite)));
  const ua = await page.evaluate(() => navigator.userAgent);
  console.log(`  webview: ${(ua.match(/Chrome\/[\d.]+/) || ['?'])[0]}  ${(ua.match(/Android [\d.]+/) || ['?'])[0]}`);

  console.log('\n== project + plan ==');
  await page.fill('input[placeholder="New Project Name"]', 'E2E Android');
  await page.click('button:has-text("Add Project")');
  await page.waitForTimeout(2500);
  await page.setInputFiles('input[aria-label="Upload PDF"]', pdf);
  await page.waitForSelector('input[aria-label="Plan name"]', { timeout: 60000 });
  await page.fill('input[aria-label="Plan name"]', 'Level 00');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(4000);
  await snap('plan-added');
  const thumbLoaded = () =>
    page.$eval('img[alt="Level 00"]', i => i.complete && i.naturalWidth > 0).catch(() => false);
  check('plan thumbnail rendered from native storage', await thumbLoaded());

  console.log('\n== place pins ==');
  await page.click('img[alt="Level 00"]');
  await page.waitForSelector('#pdf-container canvas', { timeout: 60000 });
  await page.waitForTimeout(5000);
  // The plan renders larger than a phone/tablet viewport; only double-click
  // inside the part of the canvas that is actually on screen.
  const rect = await page.$eval('#pdf-container canvas', c => {
    c.scrollIntoView({ block: 'start', inline: 'start' });
    const r = c.getBoundingClientRect();
    return {
      x0: Math.max(r.left, 0), y0: Math.max(r.top, 0),
      x1: Math.min(r.right, window.innerWidth), y1: Math.min(r.bottom, window.innerHeight),
    };
  });
  const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
  check('canvas visible in viewport', w > 100 && h > 100, JSON.stringify(rect));
  for (const [fxr, fyr] of [[0.2, 0.25], [0.5, 0.6], [0.8, 0.35]]) {
    await page.mouse.dblclick(rect.x0 + w * fxr, rect.y0 + h * fyr);
    await page.waitForTimeout(1800);
    const c = await page.$('button[aria-label="Close"]');
    if (c) { await c.click(); await page.waitForTimeout(900); }
  }
  await snap('pins-placed');

  const pins = () => page.$$eval('span.rounded-full.bg-blue-500', els =>
    els.map(e => `${parseFloat(e.style.left).toFixed(2)},${parseFloat(e.style.top).toFixed(2)}`).sort());
  await page.goto('http://localhost/');
  await home();
  const before = await pins();
  check('pins placed', before.length === 3, `${before.length} pins: ${JSON.stringify(before)}`);
  await snap('home-with-pins');

  console.log('\n== kill the process and relaunch ==');
  await browser.close().catch(() => {});
  adb(['shell', 'am', 'force-stop', PKG]);
  await sleep(2000);
  ({ browser, page, snap } = await connect());
  await home();
  await snap('after-relaunch');
  const after = await pins();
  check('project survives relaunch',
    await page.evaluate(() => document.body.innerText.includes('E2E Android')));
  check('pins survive relaunch (native SQLite + Filesystem)',
    JSON.stringify(after) === JSON.stringify(before), `after: ${JSON.stringify(after)}`);
  check('plan thumbnail reloads from native storage', await thumbLoaded());

  const unexpected = errs.filter(e => !e.includes('database not opened'));
  check('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 5).join('\n          '));

  await browser.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  return fail === 0;
}

function finish(ok) {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'logcat.txt'), adbQuiet(['logcat', '-d', '-v', 'time']).stdout || '');
  } catch {}
  adbQuiet(['forward', '--remove', `tcp:${PORT}`]);
  process.exit(ok ? 0 : 1);
}

main()
  .then(ok => finish(ok))
  .catch(e => { console.error(e); finish(false); });
