/**
 * End-to-end check of the plan-colour work, driven through a real browser.
 *
 * The app runs on web (jeep-sqlite backs SQLite in the browser), so the parts
 * that logic tests cannot reach - PDF import, pin placement, Replace PDF and
 * its page-size prompt - can be exercised for real.
 *
 * Usage:
 *   npm run dev            # in one terminal
 *   npx playwright install chromium   # once
 *   npm run test:e2e       # in another
 *
 * E2E_BASE_URL overrides the app URL; E2E_CHROMIUM points at a Chromium
 * binary when Playwright's own download is not the one to use.
 *
 * Pin dots in the plan list are positioned at `left/top = pin coordinate as a
 * percentage of the plan's coordinate space`, which makes them the
 * user-visible proof of alignment: if a replacement keeps a pin over the same
 * feature, its percentage is unchanged.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { writeFixtures } = require('./fixtures');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n          ' + detail : ''}`);
  cond ? pass++ : fail++;
};

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-e2e-'));
  const fx = writeFixtures(dir);

  const browser = await chromium.launch(
    process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
  // The plan renders at 1.5x (1263x893 for A4); the viewport must fit it or
  // clicks meant for pins land outside the window and are swallowed.
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  // pdf.js fetches its worker from a CDN at runtime. Serve the copy from
  // node_modules instead so this run is deterministic and works offline.
  const worker = require.resolve('pdfjs-dist/build/pdf.worker.min.js');
  await page.route('**/cdnjs.cloudflare.com/**pdf.worker*', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript',
      body: fs.readFileSync(worker, 'utf8') }));

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 250)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  const pins = () => page.$$eval('span.rounded-full.bg-blue-500', els =>
    els.map(e => `${parseFloat(e.style.left).toFixed(2)},${parseFloat(e.style.top).toFixed(2)}`).sort());
  const thumb = () => page.$eval('img[alt="Level 00"]', i => i.src.length + ':' + i.src.slice(-40));
  const home = async () => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.innerText.includes('Add Project'), { timeout: 30000 });
    await page.waitForTimeout(3500);
  };
  const manage = async () => {
    const b = await page.$('button[aria-label="Manage Plans"]');
    if (b) { await b.click(); await page.waitForTimeout(800); }
  };
  // Go through the button, not the hidden input: the handler only runs for a
  // plan the button has nominated.
  const replaceWith = async (file) => {
    await manage();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      page.click('button[aria-label="Replace Plan PDF"]'),
    ]);
    await chooser.setFiles(file);
  };

  await home();
  console.log('\n== setup: project + colour plan ==');
  await page.fill('input[placeholder="New Project Name"]', 'E2E Colour');
  await page.click('button:has-text("Add Project")');
  await page.waitForTimeout(2500);
  await page.setInputFiles('input[aria-label="Upload PDF"]', fx.a4);
  await page.waitForSelector('input[aria-label="Plan name"]', { timeout: 30000 });
  await page.fill('input[aria-label="Plan name"]', 'Level 00');
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(3500);

  console.log('\n== place pins ==');
  await page.click('img[alt="Level 00"]');
  await page.waitForSelector('#pdf-container canvas', { timeout: 30000 });
  await page.waitForTimeout(4500);
  const box = await (await page.$('#pdf-container canvas')).boundingBox();
  for (const [fxr, fyr] of [[0.20, 0.25], [0.50, 0.65], [0.80, 0.35]]) {
    await page.mouse.dblclick(box.x + box.width * fxr, box.y + box.height * fyr);
    await page.waitForTimeout(1800);
    const c = await page.$('button[aria-label="Close"]');
    if (c) { await c.click(); await page.waitForTimeout(900); }
  }

  await home();
  const before = await pins();
  const thumb0 = await thumb();
  check('pins placed', before.length === 3, `${before.length} pins: ${JSON.stringify(before)}`);

  console.log('\n== replace with a same-size PDF ==');
  await replaceWith(fx.a4v2);
  await page.waitForTimeout(7000);
  check('no page-size prompt when sizes match', !(await page.$('h3:has-text("Page size differs")')));
  check('replace committed (thumbnail regenerated)', (await thumb()) !== thumb0);
  check('pins unchanged', JSON.stringify(await pins()) === JSON.stringify(before), JSON.stringify(await pins()));

  console.log('\n== replace with A3 (uniform 1.414x), choose Rescale ==');
  await replaceWith(fx.a3);
  await page.waitForSelector('h3:has-text("Page size differs")', { timeout: 30000 });
  const modal = (await page.locator('.fixed .bg-white').first().innerText()).replace(/\n+/g, ' | ');
  check('prompt reports both sizes and the scale',
    /842 . 595/.test(modal) && /1191 . 842/.test(modal) && /1\.414/.test(modal), modal.slice(0, 160));
  await page.click('button:has-text("Rescale pins")');
  await page.waitForTimeout(7000);
  const rescaled = await pins();
  check('pins hold the same relative position after rescale',
    JSON.stringify(rescaled) === JSON.stringify(before), JSON.stringify(rescaled));

  console.log('\n== replace with portrait (non-uniform), then Cancel ==');
  await replaceWith(fx.portrait);
  await page.waitForSelector('h3:has-text("Page size differs")', { timeout: 30000 });
  check('aspect-change warning shown', !!(await page.$('text=/proportions changed/')));
  const thumbB = await thumb();
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(2500);
  check('cancel leaves plan and pins untouched',
    (await thumb()) === thumbB && JSON.stringify(await pins()) === JSON.stringify(rescaled));

  console.log('\n== reload ==');
  await home();
  check('pins survive a reload', JSON.stringify(await pins()) === JSON.stringify(rescaled));

  // React StrictMode double-invokes effects in `next dev`, so two concurrent
  // store initializations race and the first logs "database not opened".
  // The production build initializes once; ignore it here.
  const unexpected = errs.filter(e => !e.includes('database not opened'));
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  if (unexpected.length) console.log('unexpected console errors:\n  ' + unexpected.slice(0, 5).join('\n  '));

  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fail || unexpected.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
