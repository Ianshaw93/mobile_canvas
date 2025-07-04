# SQL-on-Demand Data Persistence Implementation

Fix data persistence and memory issues using SQL-on-demand pattern: load pin data from SQL when popup opens, work in state during session, save to SQL when popup closes.

## Problem Analysis

**Reference Branch Issues**:
- ✅ Data persistence works perfectly
- ❌ Memory crashes with many images (loads ALL images with full base64 data)
- ❌ Not scalable for production use

**Current SQL Branch Issues**:
- ✅ SQL database provides scalability
- ❌ Incomplete data loading (projects loaded without plans/points/images)
- ❌ Data disappears when popup reopens (stale state)

**SQL-on-Demand Solution**:
- ✅ Solves memory issues (only active pin data in memory)
- ✅ Solves persistence issues (fresh data from SQL on popup open)
- ✅ Maintains fast UI (state-based during session)
- ✅ Scalable for production (constant low memory usage)

## Completed Tasks

- [x] Identified root cause of persistence issues
- [x] Analyzed memory usage patterns
- [x] Designed SQL-on-demand architecture

## Critical Tasks

- [x] **Task 1.1**: Implement popup open data loading (45 min) ✅ COMPLETED
  - ✅ Added getPoint(pointId) method to database.ts
  - ✅ Added loadFreshPinData method to useSiteStore.ts 
  - ✅ Updated CameraLogic useEffect to use SQL-on-demand pattern
  - ✅ Fresh data loaded from SQL + filesystem on popup open
  - ✅ Local component state updated without affecting store

- [ ] **Task 1.2**: Implement popup close data saving (45 min)
  - Save all changes to SQL when popup closes
  - Clear local state to free memory

- [ ] **Task 1.3**: Add missing database methods (30 min)
  - Add getPointById() and related SQL operations
  - Optimize queries for single pin loading

## Important Tasks

- [ ] **Task 2.1**: Update popup lifecycle management (30 min)
  - Hook into popup open/close events
  - Ensure consistent save/load timing

- [ ] **Task 2.2**: Optimize local state during session (20 min)
  - Keep changes in state while popup is open
  - Prevent unnecessary SQL operations

- [ ] **Task 2.3**: Add memory cleanup (15 min)
  - Clear imageArray and related state on popup close
  - Free base64 data from memory

## Future Tasks

- [ ] **Task 3.1**: Add error handling for SQL operations (25 min)
- [ ] **Task 3.2**: Handle edge cases (rapid open/close, offline) (20 min)
- [ ] **Task 3.3**: Test memory usage with large datasets (30 min)
- [ ] **Task 3.4**: Test persistence across app restarts (20 min)
- [ ] **Task 3.5**: Optimize SQL query performance (15 min)

## Implementation Strategy

**Phase 1 (Critical)**: Core SQL-on-demand lifecycle
- Implement load-on-open and save-on-close pattern
- Add required database methods

**Phase 2 (Important)**: State management optimization  
- Optimize popup lifecycle hooks
- Implement proper memory cleanup

**Phase 3 (Polish)**: Error handling and testing
- Add robustness for edge cases
- Verify memory and persistence goals

**Memory Pattern**: Load minimal data → Work in state → Save and clear
**Performance Goal**: Fast popup operations + constant low memory
**Success Criteria**: No memory crashes + 100% data persistence

## Expected Benefits

- **Memory**: Constant low memory usage (no more crashes)
- **Performance**: Fast startup + responsive UI during session
- **Persistence**: 100% reliable data persistence via SQL
- **Scalability**: Can handle unlimited images per pin
- **UX**: Maintains fast, responsive user experience

## Key Files

- `components/CameraLogic.tsx` - Main implementation for load/save pattern
- `components/PinPopup.tsx` - Popup lifecycle management
- `services/database.ts` - SQL operations for pin data
- `store/useSiteStore.ts` - Minimal changes to maintain compatibility

**Expected Timeline**: 1-2 days
**Priority**: Critical (solves both memory and persistence issues)