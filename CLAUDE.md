# Claude Code Instructions

## Test-Driven Development (TDD) - REQUIRED

**Always write tests BEFORE implementing features or fixing bugs.**

### TDD Workflow

1. **Write Tests First**
   - Before writing implementation code, create tests that define expected behavior
   - For logic/data transformations: write a simple Node.js test script
   - For UI/integration: create a manual test checklist in markdown

2. **Run Tests (Expect Failure)**
   - Verify tests fail initially (proves they're testing the right thing)
   - For Node.js tests: `node test-feature-name.js`

3. **Write Code to Pass Tests**
   - Implement minimal code to make tests pass
   - Don't over-engineer

4. **Verify & Clean Up**
   - Run tests again to confirm they pass
   - Delete temporary test scripts or move to /tests folder

### Logic Tests Example

```javascript
// test-my-feature.js
const myFunction = (input) => { /* copy/mock the function */ };

const result1 = myFunction({ field: 'value' });
console.log('Test 1:', result1.expected === 'value' ? '✅' : '❌');

const result2 = myFunction({ field: undefined });
console.log('Test 2:', result2.expected === 'default' ? '✅' : '❌');

console.log('All passed:', /* condition */ ? '✅' : '❌');
```

Run: `node test-my-feature.js`

### Manual Test Checklists

For features requiring device/UI testing, create `MANUAL_TESTS_*.md`:

```markdown
## Feature: [Name]

### Test Cases
- [ ] Action 1 → Expected result
- [ ] Action 2 → Expected result

### Edge Cases
- [ ] Edge case → Expected result
```

## Development Standards

- Write tests during development, not after
- If fixing a bug, write a test that reproduces it FIRST
- Verify logic with Node.js scripts before device testing
- Keep test scripts simple and focused
- Document complex features with manual test checklists

## Project-Specific Notes

- This is a Capacitor/Next.js mobile app
- Database uses SQLite via @capacitor-community/sqlite
- State management via Zustand
- Cannot run full app tests without a device - use logic tests for verification
