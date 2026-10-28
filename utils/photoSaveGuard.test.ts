import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  requireConvertedPhotoData,
  requireProjectId,
} from './photoSaveGuard.ts';

test('requireProjectId throws when no project is selected', () => {
  assert.throws(
    () => requireProjectId(null),
    { message: 'No project selected. Select a project before taking a photo.' }
  );
});

test('requireProjectId throws when project id is empty', () => {
  assert.throws(
    () => requireProjectId(''),
    { message: 'No project selected. Select a project before taking a photo.' }
  );
});

test('requireProjectId returns the id when present', () => {
  assert.equal(requireProjectId('proj-1'), 'proj-1');
});

test('requireConvertedPhotoData throws when conversion produced nothing', () => {
  assert.throws(
    () => requireConvertedPhotoData(null),
    { message: 'Failed to convert photo to base64' }
  );
  assert.throws(
    () => requireConvertedPhotoData(undefined),
    { message: 'Failed to convert photo to base64' }
  );
  assert.throws(
    () => requireConvertedPhotoData(''),
    { message: 'Failed to convert photo to base64' }
  );
});

test('requireConvertedPhotoData returns the data URL when present', () => {
  const data = 'data:image/jpeg;base64,abc';
  assert.equal(requireConvertedPhotoData(data), data);
});
