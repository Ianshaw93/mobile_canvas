import { hasVisibleColor } from '../planColor';

test('grayscale and white pixels contain no color', () => {
  expect(hasVisibleColor(new Uint8ClampedArray([255,255,255,255,80,80,80,255,0,0,0,255]))).toBe(false);
});
test('small rendering differences do not report color', () => {
  expect(hasVisibleColor(new Uint8ClampedArray([100,102,101,255]))).toBe(false);
});
test('detects even a small colored detail', () => {
  expect(hasVisibleColor(new Uint8ClampedArray([255,255,255,255,200,30,30,255]))).toBe(true);
});
test('ignores invisible colored pixels', () => {
  expect(hasVisibleColor(new Uint8ClampedArray([255,0,0,0]))).toBe(false);
});
