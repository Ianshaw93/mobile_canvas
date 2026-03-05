/**
 * Playwright E2E test: Pull project from server and verify images are available
 */

const { chromium } = require('playwright');

const APP_URL = 'http://localhost:3001';
const TIMEOUT = 60000;
const SCREENSHOT_DIR = 'C:/Users/IanShaw/localProgramming/fd/mobile_canvas - Copy/test-screenshots';
// Target project with pins but NO images (pushed before image upload existed)
const TARGET_PROJECT_NAME = '0002 BHL JK March 2026';

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(msg) { console.log(`  PASS: ${msg}`); passed++; }
function fail(msg) { console.log(`  FAIL: ${msg}`); failed++; }
function skip(msg) { console.log(`  SKIP: ${msg}`); skipped++; }
function info(msg) { console.log(`  INFO: ${msg}`); }

async function screenshot(page, name) {
  const path = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  info(`Screenshot: ${path}`);
}

(async () => {
  let browser;

  // Ensure screenshot dir exists
  require('fs').mkdirSync(SCREENSHOT_DIR, { recursive: true });

  try {
    console.log('Launching Chromium...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 414, height: 896 },
    });
    const page = await context.newPage();

    // Collect console logs
    const consoleLogs = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    // Collect uncaught page errors
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // ================================================================
    // TEST 1: App loads without WASM crash
    // ================================================================
    console.log('\n--- Test 1: App loads without WASM errors ---');
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });

    const jeepDefined = await page.evaluate(() =>
      customElements.whenDefined('jeep-sqlite').then(() => true).catch(() => false)
    );

    const wasmErrors = pageErrors.filter(e =>
      e.includes('LinkError') || e.includes('WebAssembly') || e.includes('function import requires a callable')
    );

    wasmErrors.length === 0 ? pass('No WASM errors') : fail(`WASM errors: ${wasmErrors[0]}`);
    jeepDefined ? pass('jeep-sqlite custom element defined') : fail('jeep-sqlite not defined');

    // ================================================================
    // TEST 2: SQLite initializes
    // ================================================================
    console.log('\n--- Test 2: SQLite initialization ---');
    await page.waitForTimeout(4000);

    consoleLogs.find(l => l.includes('[DB] Web store initialized'))
      ? pass('Web database store initialized')
      : fail('Web database store did NOT initialize');

    consoleLogs.find(l => l.includes('[App] App initialization completed'))
      ? pass('App initialization completed')
      : fail('App initialization did not complete');

    await screenshot(page, '01-app-loaded');

    // ================================================================
    // TEST 3: Create a project so SyncButton appears
    // ================================================================
    console.log('\n--- Test 3: Create project to expose Pull button ---');

    // Type a project name first
    const projectNameInput = page.locator('input[aria-label="New Project Name"]');
    if (await projectNameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectNameInput.fill('Test Pull Project');
      info('Typed project name');

      // Click Add Project
      const addBtn = page.locator('button:has-text("Add Project")');
      await addBtn.click();
      info('Clicked Add Project');

      await page.waitForTimeout(2000);
      await screenshot(page, '02-project-created');

      // Now check if Pull button appeared
      const pullBtn = page.locator('button:has-text("Pull from Server")');
      const pullVisible = await pullBtn.isVisible({ timeout: 5000 }).catch(() => false);
      pullVisible ? pass('Pull from Server button visible') : fail('Pull button still not visible');
    } else {
      fail('Project name input not found');
    }

    // ================================================================
    // TEST 4: Pull from server
    // ================================================================
    console.log('\n--- Test 4: Pull project from server ---');

    const pullButton = page.locator('button:has-text("Pull from Server")');
    if (!(await pullButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      skip('Pull button not visible - cannot test pull');
    } else {
      await pullButton.click();
      info('Clicked Pull from Server');

      // Wait for modal
      const modal = page.locator('.fixed.inset-0');
      await page.waitForTimeout(1000);
      await screenshot(page, '03-pull-modal-loading');

      if (!(await modal.isVisible({ timeout: 5000 }).catch(() => false))) {
        fail('Pull modal did not appear');
      } else {
        pass('Pull modal opened');

        // Wait for project list to load from API
        info('Waiting for server project list...');
        let projectsLoaded = false;
        for (let i = 0; i < 15; i++) {
          await page.waitForTimeout(1000);
          const noProjects = await page.locator('text=No projects found on server').isVisible().catch(() => false);
          const projectCount = await page.locator('.fixed.inset-0 button.w-full.text-left').count();
          if (noProjects || projectCount > 0) {
            projectsLoaded = true;
            break;
          }
        }

        await screenshot(page, '04-pull-modal-projects');

        const noProjects = await page.locator('text=No projects found on server').isVisible().catch(() => false);
        const projectButtons = page.locator('.fixed.inset-0 button.w-full.text-left');
        const projectCount = await projectButtons.count();

        if (noProjects) {
          skip('No projects on server - cannot test pull');
        } else if (projectCount > 0) {
          pass(`Found ${projectCount} project(s) on server`);

          // Find the target project with attachments
          let targetButton = null;
          for (let i = 0; i < projectCount; i++) {
            const btn = projectButtons.nth(i);
            const name = await btn.locator('.font-medium').textContent().catch(() => '');
            if (name.includes(TARGET_PROJECT_NAME)) {
              targetButton = btn;
              break;
            }
          }
          // Fall back to first project if target not found
          const projectToClick = targetButton || projectButtons.first();
          const projectName = await projectToClick.locator('.font-medium').textContent().catch(() => 'unknown');
          info(`Selecting: "${projectName}"${targetButton ? ' (target with attachments)' : ' (fallback)'}`);
          await projectToClick.click();
          await page.waitForTimeout(500);

          await screenshot(page, '05-pull-options');

          // Check pull options screen
          const optionsVisible = await page.locator('text=What to include').isVisible().catch(() => false);
          optionsVisible ? pass('Pull options screen shown') : fail('Pull options screen did not appear');

          if (optionsVisible) {
            // Verify "Everything" is default
            const everythingRadio = page.locator('input[name="include"]').first();
            (await everythingRadio.isChecked()) ? pass('"Everything" selected by default') : info('Everything not checked');

            // Click Pull Project
            await page.locator('button:has-text("Pull Project")').click();
            info('Pulling...');

            // Monitor progress
            let pullComplete = false;
            let lastProgress = '';
            for (let i = 0; i < 120; i++) {
              await page.waitForTimeout(1000);

              const progressMsg = await page.locator('.text-xs.text-gray-600').first().textContent().catch(() => '');
              if (progressMsg && progressMsg !== lastProgress) {
                info(`Progress: ${progressMsg}`);
                lastProgress = progressMsg;
              }

              // Check for completion
              if (!(await modal.isVisible().catch(() => false))) {
                pullComplete = true;
                break;
              }

              // Screenshot at key moments
              if (i === 5) await screenshot(page, '06-pull-progress');

              // Check for error
              const errEl = page.locator('.text-red-500');
              if (await errEl.isVisible().catch(() => false)) {
                const errText = await errEl.textContent().catch(() => '');
                if (errText) { fail(`Pull error: ${errText}`); break; }
              }
            }

            pullComplete ? pass('Pull completed (modal closed)') : fail('Pull did not complete within 120s');
            await screenshot(page, '07-after-pull');

            // Log merge stats
            const mergeLog = consoleLogs.find(l => l.includes('Merge completed'));
            if (mergeLog) info(`Console: ${mergeLog}`);
          }
        } else {
          skip('No selectable projects found in modal');
          const html = await modal.innerHTML().catch(() => 'N/A');
          info('Modal HTML: ' + html.substring(0, 300));
        }
      }
    }

    // ================================================================
    // TEST 5: Verify images in local SQLite DB
    // ================================================================
    console.log('\n--- Test 5: Verify images in local SQLite DB ---');
    await page.waitForTimeout(2000);

    // Use page.evaluate to run queries through the already-loaded webpack modules
    // We need to access CapacitorSQLite which is already imported in the page bundle
    const sqlResult = await page.evaluate(async () => {
      try {
        // Access the CapacitorSQLite that's already loaded in the webpack runtime
        // It's available as part of the @capacitor-community/sqlite bundle
        // We can access it through the window or through webpack's module system

        // Approach: call the database singleton's methods via the store
        // The zustand store has already imported database, so we can call through it

        // First, let's try to find the database module in webpack's internal modules
        const modules = window.__NEXT_DATA__;

        // Alternative: use the fact that CapacitorSQLite is on window via Capacitor plugin system
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite) {
          const sqlite = window.Capacitor.Plugins.CapacitorSQLite;

          const res = await sqlite.query({
            database: 'mobile_canvas_db',
            statement: 'SELECT COUNT(*) as cnt FROM images',
            values: [],
          });
          const imageCount = res.values?.[0]?.cnt ?? 0;

          const projRes = await sqlite.query({
            database: 'mobile_canvas_db',
            statement: 'SELECT COUNT(*) as cnt FROM projects',
            values: [],
          });

          const planRes = await sqlite.query({
            database: 'mobile_canvas_db',
            statement: 'SELECT COUNT(*) as cnt FROM plans',
            values: [],
          });

          const pinRes = await sqlite.query({
            database: 'mobile_canvas_db',
            statement: 'SELECT COUNT(*) as cnt FROM points',
            values: [],
          });

          let imgDetails = [];
          if (imageCount > 0) {
            const imgRes = await sqlite.query({
              database: 'mobile_canvas_db',
              statement: 'SELECT id, point_id, LENGTH(url) as url_len, SUBSTR(url, 1, 40) as url_prefix, comment FROM images LIMIT 10',
              values: [],
            });
            imgDetails = imgRes.values || [];
          }

          return {
            projects: projRes.values?.[0]?.cnt ?? 0,
            plans: planRes.values?.[0]?.cnt ?? 0,
            pins: pinRes.values?.[0]?.cnt ?? 0,
            images: imageCount,
            imageDetails: imgDetails,
          };
        }

        return { error: 'CapacitorSQLite not available on window.Capacitor.Plugins' };
      } catch (e) {
        return { error: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') };
      }
    }).catch(e => ({ error: `evaluate failed: ${e.message}` }));

    if (sqlResult.error) {
      info(`SQL query failed: ${sqlResult.error}`);

      // Fallback: parse console logs for merge stats
      const mergeLog = consoleLogs.find(l => l.includes('Merge completed'));
      if (mergeLog) {
        info(`From logs: ${mergeLog}`);
        const attachMatch = mergeLog.match(/attachments:\s*(\d+)/);
        if (attachMatch) {
          const count = parseInt(attachMatch[1]);
          count > 0
            ? pass(`${count} attachment(s) downloaded per merge logs`)
            : info('0 attachments in merge (server project may have none)');
        }
      }

      // Also check for individual download logs
      const downloadLogs = consoleLogs.filter(l => l.includes('Downloading image'));
      if (downloadLogs.length > 0) {
        pass(`${downloadLogs.length} image download(s) logged`);
        downloadLogs.forEach(l => info(`  ${l}`));
      }
    } else {
      info(`DB: ${sqlResult.projects} projects, ${sqlResult.plans} plans, ${sqlResult.pins} pins, ${sqlResult.images} images`);

      if (sqlResult.images > 0) {
        pass(`${sqlResult.images} image(s) in local SQLite after pull!`);
        sqlResult.imageDetails.forEach((img, i) => {
          info(`  Image ${i + 1}: id=${img.id}, size=${img.url_len} chars, prefix="${img.url_prefix}", comment=${img.comment || 'none'}`);
        });
      } else if (sqlResult.pins > 0) {
        info('Pins exist but no images - server project may have no attachments');
      } else if (sqlResult.plans > 0) {
        info('Plans exist but no pins - expected if server has only plans');
      } else if (sqlResult.projects > 0) {
        info('Project exists but empty - pull may have only created project record');
      }
    }

    // ================================================================
    // TEST 6: Warning toast for missing images
    // ================================================================
    console.log('\n--- Test 6: Warning for pins without images ---');

    // Check console logs for the warning about older version
    const warningLog = consoleLogs.find(l => l.includes('pin(s) have no images') || l.includes('older app version'));
    const mergeLogFinal = consoleLogs.find(l => l.includes('Merge completed'));

    if (mergeLogFinal) {
      const pinsMatch = mergeLogFinal.match(/pins:\s*(\d+)/);
      const attachMatch = mergeLogFinal.match(/attachments:\s*(\d+)/);
      const pinsWithoutMatch = mergeLogFinal.match(/pinsWithoutImages:\s*(\d+)/);

      const pinCount = pinsMatch ? parseInt(pinsMatch[1]) : 0;
      const attachCount = attachMatch ? parseInt(attachMatch[1]) : 0;
      const pinsWithout = pinsWithoutMatch ? parseInt(pinsWithoutMatch[1]) : -1;

      info(`Merge stats: pins=${pinCount}, attachments=${attachCount}, pinsWithoutImages=${pinsWithout}`);

      if (pinCount > 0 && attachCount === 0) {
        if (pinsWithout > 0) {
          pass(`pinsWithoutImages=${pinsWithout} correctly detected (all ${pinCount} pins have no images)`);
        } else if (pinsWithout === -1) {
          info('pinsWithoutImages not in log format - checking toast instead');
        }
      }
    }

    // Check if the warning banner appeared in the DOM
    await page.waitForTimeout(2000);
    await screenshot(page, '09-after-pull-state');

    const warningBanner = page.locator('text=Some pins have no images');
    const bannerVisible = await warningBanner.isVisible({ timeout: 5000 }).catch(() => false);

    if (bannerVisible) {
      pass('Warning banner displayed for missing images');
      await screenshot(page, '10-warning-banner');

      // Click the banner to open detail modal
      await warningBanner.click();
      await page.waitForTimeout(500);

      const detailModal = page.locator('text=Missing Images');
      const detailVisible = await detailModal.isVisible({ timeout: 3000 }).catch(() => false);
      if (detailVisible) {
        pass('Warning detail modal opens on tap');
        await screenshot(page, '11-warning-detail-modal');

        // Check the detail text mentions re-push
        const rePushText = await page.locator('text=Re-push from the original device').isVisible().catch(() => false);
        rePushText ? pass('Detail modal explains re-push fix') : info('Re-push text not found in modal');

        // Close the modal
        await page.locator('button:has-text("OK")').click();
        await page.waitForTimeout(300);
        pass('Warning detail modal closed');
      } else {
        fail('Warning detail modal did not appear');
      }
    } else {
      fail('Warning banner not displayed after pulling project with missing images');
    }

    // ================================================================
    // Dump relevant logs
    // ================================================================
    console.log('\n--- Sync console logs ---');
    consoleLogs
      .filter(l => l.includes('[SyncService]') || l.includes('Merge completed') || l.includes('Downloading image') || l.includes('Failed to'))
      .forEach(l => console.log(`  ${l}`));

    if (pageErrors.length > 0) {
      console.log('\n--- Page errors ---');
      pageErrors.forEach(e => console.log(`  ${e}`));
    }

    await screenshot(page, '08-final');

    // ================================================================
    // Summary
    // ================================================================
    console.log('\n================================');
    console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log(failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
    console.log('================================\n');

  } catch (err) {
    console.error('Test script error:', err);
    failed++;
  } finally {
    if (browser) await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
