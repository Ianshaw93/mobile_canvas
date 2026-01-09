# Multi-Visit Database Changes - Test Plan

## Overview
This test plan verifies that the database schema changes for multi-visit support are working correctly.

## Changes Made
- Added `site_visit_number` field to Plans, Points, and Images tables
- Created Migration 5 to backfill existing data
- Updated all create/update operations to include site_visit_number
- Added filtering and reassignment methods

## Pre-Test Setup

### Build Status
✅ **Build completed successfully** with no TypeScript errors
- Fixed tsconfig.json by adding `downlevelIteration: true`
- All warnings are pre-existing and non-critical

### Database Version
- Updated from DB_VERSION 5 → 6
- Migration 5 will run automatically on first app launch

---

## Test 1: Build and Initial Launch ✅

### Steps
1. Build the app: `npm run build` ✅ PASSED
2. Deploy to Android device/emulator
3. Launch the app for the first time after update

### Expected Results
- ✅ App builds without TypeScript errors
- App starts without crashes
- No visible errors in UI

### Console Log Verification
Look for these migration success messages in logcat:
```
[DB Migration] Adding site_visit_number to plans, points, and images
[DB Migration] Successfully added site_visit_number to plans, points, and images
```

### How to Check Logs
```bash
# Android
adb logcat | grep "DB Migration"

# Or view all logs
adb logcat -s "Capacitor"
```

---

## Test 2: Database Schema Verification (Optional - Requires DB Access)

If you have access to the SQLite database, you can verify the schema directly.

### Using Android Debug Bridge (adb)
```bash
# Pull the database from device
adb shell "run-as com.example.app cat /data/data/com.example.app/databases/mobile_canvas_db" > mobile_canvas_db.sqlite

# Open with sqlite3
sqlite3 mobile_canvas_db.sqlite
```

### SQL Queries to Run
```sql
-- Check plans table schema
PRAGMA table_info(plans);
-- Look for: site_visit_number | INTEGER | 0 | 1 | 0

-- Check points table schema
PRAGMA table_info(points);
-- Look for: site_visit_number | INTEGER | 0 | 1 | 0

-- Check images table schema
PRAGMA table_info(images);
-- Look for: site_visit_number | INTEGER | 0 | 1 | 0

-- Verify backfill worked (all existing data should have site_visit_number = 1)
SELECT COUNT(*) as total_plans,
       COUNT(CASE WHEN site_visit_number = 1 THEN 1 END) as backfilled_plans
FROM plans;

SELECT COUNT(*) as total_points,
       COUNT(CASE WHEN site_visit_number = 1 THEN 1 END) as backfilled_points
FROM points;

SELECT COUNT(*) as total_images,
       COUNT(CASE WHEN site_visit_number = 1 THEN 1 END) as backfilled_images
FROM images;
```

### Expected Results
- All tables should have `site_visit_number INTEGER DEFAULT 1` column
- All existing records should have `site_visit_number = 1`
- Counts should match: total = backfilled (100% backfill success)

---

## Test 3: Existing Data Integrity

### Steps
1. Open an existing project (if you have one)
2. View existing plans
3. View existing pins
4. View existing images

### Expected Results
- All existing plans are visible
- All existing pins are visible on their plans
- All existing images are attached to their pins
- No data loss or corruption
- App behavior is unchanged (backward compatible)

### What to Look For
- ❌ Missing plans/pins/images
- ❌ Errors when viewing data
- ❌ Crashes when opening existing projects
- ✅ Everything loads normally

---

## Test 4: New Data Creation

### Steps
1. Open a project (or create a new one)
2. Add a new plan (upload a PDF)
3. Add a new pin to the plan
4. Add an image to the pin

### Expected Results
- New plan has `site_visit_number = 1` (project's current visit)
- New pin has `site_visit_number = 1`
- New image has `site_visit_number = 1`

### Verification Method
Add console logs or check database:
```sql
-- Check most recent plan
SELECT * FROM plans ORDER BY created_at DESC LIMIT 1;

-- Check most recent point
SELECT * FROM points ORDER BY created_at DESC LIMIT 1;

-- Check most recent image
SELECT * FROM images ORDER BY created_at DESC LIMIT 1;
```

All should have `site_visit_number = 1`

---

## Test 5: CRUD Operations Still Work

### Steps
1. **Create**: Add new plan/pin/image (covered in Test 4)
2. **Read**: View plans, pins, images in app
3. **Update**:
   - Edit a pin comment
   - Move a pin to new location
   - Update a plan name
4. **Delete**:
   - Delete an image
   - Delete a pin
   - Delete a plan

### Expected Results
- All CRUD operations work without errors
- Data persists after app restart
- No crashes or data loss

---

## Test 6: App Restart Persistence

### Steps
1. Perform some actions (add plan, add pin, add image)
2. Force close the app
3. Reopen the app
4. Verify all data is still there

### Expected Results
- All data created before restart is visible
- No data loss
- site_visit_number values are preserved

---

## Test 7: New Database Methods (Code Review)

Verify these new methods exist and are accessible:

### Filtering Methods
- ✅ `getPlan(id)`
- ✅ `getPlansByProjectAndVisit(projectId, siteVisitNumber)`
- ✅ `getPointsByPlanAndVisit(planId, siteVisitNumber)`
- ✅ `getImagesByPointAndVisit(pointId, siteVisitNumber)`
- ✅ `getAvailableSiteVisits(projectId)`

### Reassignment Methods
- ✅ `reassignPointVisit(pointId, newSiteVisitNumber)`
- ✅ `reassignMultiplePointsVisit(pointIds[], newSiteVisitNumber)`
- ✅ `reassignPlanVisit(planId, newSiteVisitNumber)`

These will be tested when UI is implemented.

---

## Test 8: Store Integration

### Steps
1. Create a new plan → Check console logs
2. Create a new pin → Check console logs
3. Add an image to pin → Check console logs

### Console Logs to Look For
```
[Store] Adding plan: { projectId: ..., plan: ... }
✅ Plan saved to SQL database: <plan-id>

[Store] Adding point: { planId: ..., point: ... }
✅ Point saved to SQL database: <point-id>

📍 Store addImageToPin called: { planId: ..., pointId: ..., image: ... }
```

### Expected Results
- All console logs appear
- No errors in logs
- Data is saved to database with correct site_visit_number

---

## Critical Issues to Watch For

### 🚨 High Priority
- [ ] App crashes on launch
- [ ] Migration fails (no success message in logs)
- [ ] Existing data is not visible
- [ ] Cannot create new plans/pins/images
- [ ] Data doesn't persist after restart

### ⚠️ Medium Priority
- [ ] Console errors (but app still works)
- [ ] Slow performance
- [ ] Incorrect site_visit_number values

### ℹ️ Low Priority
- [ ] Minor UI glitches
- [ ] Warning messages in logs

---

## Test Results Template

Copy this and fill in as you test:

```
## Test Results - [Date]

### Test 1: Build and Initial Launch
- [ ] Build successful
- [ ] App starts without crash
- [ ] Migration logs appear
- Notes: _______________

### Test 2: Database Schema (Optional)
- [ ] Schema verified
- [ ] Backfill successful
- Notes: _______________

### Test 3: Existing Data Integrity
- [ ] All existing data visible
- [ ] No data loss
- Notes: _______________

### Test 4: New Data Creation
- [ ] New plan created successfully
- [ ] New pin created successfully
- [ ] New image created successfully
- Notes: _______________

### Test 5: CRUD Operations
- [ ] Create works
- [ ] Read works
- [ ] Update works
- [ ] Delete works
- Notes: _______________

### Test 6: App Restart
- [ ] Data persists after restart
- Notes: _______________

### Test 8: Store Integration
- [ ] Console logs appear correctly
- [ ] No errors
- Notes: _______________

### Overall Status
- [ ] All tests passed - Ready to continue with UI
- [ ] Some issues found - Need fixes before continuing
- [ ] Major issues - Need to rollback and investigate

### Issues Found
1. _______________
2. _______________

### Next Steps
_______________
```

---

## Success Criteria

✅ All tests pass
✅ No data loss
✅ No crashes
✅ Migration logs appear
✅ Existing functionality unchanged
✅ New data has site_visit_number = 1

If all criteria are met, we can proceed with UI implementation:
- Site visit switcher in PdfPicker
- Pin reassignment UI
- Multi-select bulk reassignment
- Visit indicator

---

## Troubleshooting

### If migration doesn't run:
- Uninstall app completely
- Reinstall fresh build
- Check DB_VERSION is 6 in database.ts

### If data is missing:
- Check database directly with adb/sqlite3
- Look for foreign key constraint errors in logs
- Verify migration SQL queries are correct

### If app crashes:
- Check logcat for stack trace
- Look for SQL syntax errors
- Verify all column names are correct (snake_case in SQL)

---

## Files Changed

**Database Layer** (services/database.ts:57, 25-47, 241-296, 355-633):
- DB_VERSION: 5 → 6
- Added site_visit_number to DBPlan, DBPoint, DBImage interfaces
- Updated all table CREATE statements
- Added Migration 5 with backfill logic
- Updated all CRUD methods
- Added new filtering and reassignment methods

**Store Layer** (store/useSiteStore.ts:1074-1103, 457-488, 574-600):
- Updated addPlan to auto-assign project's site_visit_number
- Updated addPoint to auto-assign project's site_visit_number
- Updated addImageToPin to auto-assign project's site_visit_number

**Configuration** (tsconfig.json:20):
- Added downlevelIteration: true (for Map iteration fix)
