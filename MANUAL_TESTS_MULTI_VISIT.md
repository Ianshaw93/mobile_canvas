# Multi-Visit Feature - Manual Test Checklists

## Test Documentation
This file contains manual test checklists for each iteration of the multi-visit feature.
Follow TDD principles: Write tests FIRST (RED), implement (GREEN), verify results.

---

## Iteration 1: Site Visit Switcher + Indicator

### Setup
- [ ] Build app: `npm run build`
- [ ] Deploy to device: `npx cap sync android && npx cap open android`
- [ ] Launch app on device
- [ ] Create or select a test project

### Feature 1: Plan Filtering by Site Visit

#### Test Case 1.1: Initial State - All Plans in Visit 1
**Expected**: After database migration, all existing plans should be in Visit 1
- [ ] Open a project that existed before migration
- [ ] Verify project's site visit number is 1
- [ ] Verify all plans are visible
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 1.2: Plans Filtered by Current Visit
**Expected**: Only plans matching current visit number are displayed
- [ ] Create project or select existing project
- [ ] Add 2 plans while in Visit 1
- [ ] Note the plan names: ____________ and ____________
- [ ] Change project's site visit number to 2
- [ ] Add 1 new plan in Visit 2
- [ ] Note the plan name: ____________
- [ ] Verify only Visit 2 plan is visible
- [ ] Switch back to Visit 1
- [ ] Verify only Visit 1 plans are visible (2 plans)
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 1.3: New Plans Assigned to Current Visit
**Expected**: New plans automatically get project's current site visit number
- [ ] Switch to Visit 2
- [ ] Add a new PDF plan
- [ ] Switch to Visit 1
- [ ] Verify new plan is NOT visible in Visit 1
- [ ] Switch back to Visit 2
- [ ] Verify new plan IS visible in Visit 2
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

### Feature 2: Site Visit Switcher UI

#### Test Case 2.1: Switcher Buttons Display
**Expected**: UI shows buttons for each available visit + New Visit button
- [ ] Navigate to PdfPicker (home/project view)
- [ ] Verify "Visit 1", "Visit 2"... buttons are visible
- [ ] Verify "New Visit" button is visible
- [ ] Current visit button is highlighted/active
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 2.2: Switching Between Visits
**Expected**: Clicking visit button changes project's current visit
- [ ] Click "Visit 1" button
- [ ] Verify plans change to Visit 1 plans
- [ ] Verify indicator updates (see Test Case 3.1)
- [ ] Click "Visit 2" button
- [ ] Verify plans change to Visit 2 plans
- [ ] Verify indicator updates
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 2.3: New Visit Button
**Expected**: "New Visit" button increments to next available number
- [ ] Note current highest visit number: ____
- [ ] Click "New Visit" button
- [ ] Verify project switches to new visit (e.g., Visit 3)
- [ ] Verify no plans are displayed (empty visit)
- [ ] Verify new visit button appears in switcher
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 2.4: Visit Numbers with Gaps
**Expected**: System allows gaps in visit numbers (1, 3, 5 is valid)
- [ ] Create Visit 1, 2, 3
- [ ] Delete all plans from Visit 2
- [ ] Verify Visit 1 and Visit 3 buttons still work
- [ ] Clicking "New Visit" should create Visit 4 (not fill gap)
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

### Feature 3: "Currently Viewing Visit X" Indicator

#### Test Case 3.1: Indicator Displays Current Visit
**Expected**: Clear visual indicator shows which visit is active
- [ ] Switch to Visit 1
- [ ] Verify indicator shows "Currently viewing: Visit 1" (or similar)
- [ ] Switch to Visit 2
- [ ] Verify indicator updates to "Currently viewing: Visit 2"
- [ ] Indicator is visually distinct (color/badge)
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 3.2: Indicator Updates Immediately
**Expected**: Indicator changes instantly when switching visits
- [ ] Rapidly click between Visit 1 and Visit 2 buttons
- [ ] Verify indicator updates without delay
- [ ] No flickering or incorrect display
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

### Edge Cases & Regressions

#### Test Case E1: Empty Visit
**Expected**: App handles visit with no plans gracefully
- [ ] Switch to a new visit with no plans
- [ ] Verify message like "No plans in this visit" or empty state
- [ ] Can still add new plans via file picker
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case E2: Existing Features Still Work
**Expected**: No regressions in existing functionality
- [ ] Can still create/edit/delete plans
- [ ] Can still add pins to plans
- [ ] Can still add images to pins
- [ ] Plan reordering still works
- [ ] Export/import still works (may not preserve visits yet)
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case E3: App Restart Persistence
**Expected**: Visit number persists after app restart
- [ ] Switch to Visit 2
- [ ] Force close app
- [ ] Reopen app
- [ ] Open same project
- [ ] Verify still on Visit 2 with correct plans displayed
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

---

## Iteration 1 Test Results

**Date Tested**: ________________
**Device**: ________________
**Android Version**: ________________
**Build**: ________________

### Summary
- Total Test Cases: 12
- Passed: ____
- Failed: ____
- Blocked: ____

### Issues Found
1. ________________
2. ________________
3. ________________

### Fixes Applied
1. ________________
2. ________________
3. ________________

### Screenshots
(Attach or describe key screenshots)
- ________________
- ________________

### Status
- [ ] All tests pass
- [ ] Ready for Iteration 2
- [ ] Issues need fixing

---

## Iteration 2: Individual Pin Reassignment

### Setup
- [ ] Build app: `npm run build`
- [ ] Deploy to device
- [ ] Launch app on device
- [ ] Open project with multiple visits containing pins

### Feature: Pin Reassignment Dropdown in PinPopup

#### Test Case 4.1: Dropdown Displays Available Visits
**Expected**: Dropdown shows all visits with data
- [ ] Create pins in Visit 1 and Visit 2
- [ ] Open a pin from Visit 1
- [ ] Locate site visit dropdown in pin detail view
- [ ] Verify dropdown shows Visit 1 (current) and Visit 2
- [ ] Current visit is pre-selected
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 4.2: Reassign Pin to Different Visit
**Expected**: Pin moves to new visit, cascades to images
- [ ] Open a pin in Visit 1 with 2 images attached
- [ ] Note pin ID/comment: ____________
- [ ] Change dropdown to Visit 2
- [ ] Close pin popup
- [ ] Verify pin is no longer visible in Visit 1 plan
- [ ] Switch to Visit 2
- [ ] Verify pin now appears in Visit 2 plan
- [ ] Open pin, verify both images are still attached
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 4.3: Reassignment Updates Immediately
**Expected**: UI updates without manual refresh
- [ ] Reassign pin from Visit 1 to Visit 2
- [ ] Close pin popup
- [ ] Verify plan view updates immediately
- [ ] No need to manually refresh or reload
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

---

## Iteration 2 Test Results

**Date Tested**: ________________
**Test Cases Passed**: ____ / 3

---

## Iteration 3: Multi-Select Bulk Reassignment

### Setup
- [ ] Build app: `npm run build`
- [ ] Deploy to device
- [ ] Open project with 5+ pins in Visit 1

### Feature: Multi-Select and Bulk Reassignment

#### Test Case 5.1: Enable Multi-Select Mode
**Expected**: Toggle activates selection mode
- [ ] Navigate to pin list view
- [ ] Locate "Multi-Select" or "Select" button
- [ ] Click to enable
- [ ] Verify checkboxes appear next to each pin
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 5.2: Select Multiple Pins
**Expected**: Can check/uncheck multiple pins
- [ ] Enable multi-select mode
- [ ] Select 3 pins by tapping checkboxes
- [ ] Verify all 3 are checked
- [ ] Uncheck 1 pin
- [ ] Verify only 2 remain checked
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 5.3: Bulk Reassignment UI Appears
**Expected**: Reassignment controls appear when pins selected
- [ ] Select 2+ pins
- [ ] Verify "Reassign to Visit" dropdown appears
- [ ] Verify "Reassign Selected" button appears
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 5.4: Bulk Reassign Multiple Pins
**Expected**: All selected pins move to new visit together
- [ ] In Visit 1, select 3 pins
- [ ] Choose "Visit 2" from dropdown
- [ ] Click "Reassign Selected"
- [ ] Verify confirmation or immediate action
- [ ] Verify all 3 pins are gone from Visit 1 view
- [ ] Switch to Visit 2
- [ ] Verify all 3 pins now appear in Visit 2
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 5.5: Exit Multi-Select Mode
**Expected**: Can exit mode and return to normal view
- [ ] Click "Multi-Select" button again to disable
- [ ] Verify checkboxes disappear
- [ ] Verify pins remain clickable normally
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

---

## Iteration 3 Test Results

**Date Tested**: ________________
**Test Cases Passed**: ____ / 5

---

## Iteration 4: Import/Export Visit Number Preservation

### Setup
- [ ] Build app: `npm run build`
- [ ] Deploy to device
- [ ] Create project with Visit 1 and Visit 2 data

### Feature: Export with Visit Numbers

#### Test Case 6.1: Export CSV Contains Visit Numbers
**Expected**: Exported CSV includes site_visit_number column
- [ ] Create project with:
  - 2 plans in Visit 1
  - 1 plan in Visit 2
  - Pins in both visits
- [ ] Export project
- [ ] Extract and open CSV file
- [ ] Verify CSV has `site_visit_number` column
- [ ] Verify plans/pins have correct visit numbers (1 or 2)
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

### Feature: Import Preserves Visit Numbers

#### Test Case 6.2: Import Restores Visit Numbers
**Expected**: Importing project restores all visits correctly
- [ ] Export project with multi-visit data
- [ ] Delete project from app
- [ ] Import the exported ZIP
- [ ] Verify project has Visit 1 and Visit 2 buttons
- [ ] Switch to Visit 1, verify Visit 1 plans are visible
- [ ] Switch to Visit 2, verify Visit 2 plans are visible
- [ ] Open pins, verify they're in correct visits
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

#### Test Case 6.3: Import Without Visit Numbers (Backward Compatibility)
**Expected**: Old exports without visit numbers default to Visit 1
- [ ] Create old-style export (if available) or manually edit CSV to remove site_visit_number column
- [ ] Import the project
- [ ] Verify all plans/pins are assigned to Visit 1
- [ ] Verify no errors or crashes
- [ ] **Result**: PASS / FAIL
- **Notes**: ________________

---

## Iteration 4 Test Results

**Date Tested**: ________________
**Test Cases Passed**: ____ / 3

---

## Final End-to-End Verification

### Complete Workflow Test
- [ ] Create new project
- [ ] Add 2 plans in Visit 1
- [ ] Add pins and images to Visit 1 plans
- [ ] Switch to Visit 2
- [ ] Add 1 plan in Visit 2
- [ ] Add pins and images to Visit 2 plan
- [ ] Reassign 1 pin from Visit 1 to Visit 2 (individual)
- [ ] Reassign 2 pins from Visit 1 to Visit 2 (bulk)
- [ ] Export project
- [ ] Import project to new project
- [ ] Verify all data is correct in both visits

**Result**: PASS / FAIL

---

## Overall Test Status

**Multi-Visit Feature**: ✅ READY FOR PRODUCTION / ❌ NEEDS WORK

**Total Iterations Completed**: ____ / 4
**Total Test Cases Executed**: ____
**Total Issues Found**: ____
**All Critical Issues Resolved**: YES / NO

**Sign-off**: ________________
**Date**: ________________
