/**
 * Tests for the "Replace PDF" pin-alignment guard.
 *
 * Replacing a plan's PDF keeps its pins. Pins live in
 * `dimensions x displayScale` pixel space, so they only stay put if the
 * incoming PDF's scale-1.0 page size matches the stored dimensions. These
 * helpers decide whether the sizes match and, when the user opts to rescale,
 * move a pin into the incoming page's space.
 */

import {
  comparePlanPageSize,
  rescalePinForPageChange,
} from '../planCoordinates';

describe('comparePlanPageSize', () => {
  it('matches an identical page size', () => {
    const r = comparePlanPageSize({ width: 841.89, height: 595.28 }, { width: 841.89, height: 595.28 });
    expect(r.matches).toBe(true);
    expect(r.canRescale).toBe(true);
    expect(r.ratioX).toBeCloseTo(1);
    expect(r.ratioY).toBeCloseTo(1);
    expect(r.uniform).toBe(true);
  });

  it('matches a sub-tolerance difference (re-export jitter)', () => {
    // 0.5% larger in both axes, inside the default 1% tolerance.
    const r = comparePlanPageSize({ width: 846, height: 598.25 }, { width: 841.89, height: 595.28 });
    expect(r.matches).toBe(true);
  });

  it('flags a 1.5x inflated page and reports a uniform ratio', () => {
    const r = comparePlanPageSize({ width: 1262.84, height: 892.92 }, { width: 841.89, height: 595.28 });
    expect(r.matches).toBe(false);
    expect(r.canRescale).toBe(true);
    expect(r.ratioX).toBeCloseTo(1.5, 3);
    expect(r.ratioY).toBeCloseTo(1.5, 3);
    expect(r.uniform).toBe(true);
  });

  it('flags a shrunken page (A1 plan replaced with A3)', () => {
    const r = comparePlanPageSize({ width: 1190.55, height: 841.89 }, { width: 2383.94, height: 1683.78 });
    expect(r.matches).toBe(false);
    expect(r.ratioX).toBeCloseTo(0.4994, 3);
    expect(r.uniform).toBe(true);
  });

  it('reports a non-uniform ratio when the aspect ratio changed', () => {
    // Portrait stored, landscape incoming: rescaling cannot preserve layout.
    const r = comparePlanPageSize({ width: 841.89, height: 595.28 }, { width: 595.28, height: 841.89 });
    expect(r.matches).toBe(false);
    expect(r.uniform).toBe(false);
  });

  it('refuses to rescale against unusable stored dimensions', () => {
    const r = comparePlanPageSize({ width: 841.89, height: 595.28 }, { width: 0, height: 0 });
    expect(r.matches).toBe(false);
    expect(r.canRescale).toBe(false);
    expect(r.ratioX).toBe(1);
    expect(r.ratioY).toBe(1);
  });

  it('refuses to rescale against an unreadable incoming page', () => {
    const r = comparePlanPageSize({ width: NaN, height: NaN }, { width: 841.89, height: 595.28 });
    expect(r.matches).toBe(false);
    expect(r.canRescale).toBe(false);
  });

  it('honours a caller-supplied tolerance', () => {
    const incoming = { width: 850, height: 601 }; // ~0.96% larger
    expect(comparePlanPageSize(incoming, { width: 841.89, height: 595.28 }).matches).toBe(true);
    expect(comparePlanPageSize(incoming, { width: 841.89, height: 595.28 }, 0.001).matches).toBe(false);
  });
});

describe('rescalePinForPageChange', () => {
  it('scales both axes by their own ratio', () => {
    expect(rescalePinForPageChange({ x: 100, y: 200 }, 1.5, 1.5)).toEqual({ x: 150, y: 300 });
  });

  it('handles independent axis ratios', () => {
    expect(rescalePinForPageChange({ x: 100, y: 200 }, 2, 0.5)).toEqual({ x: 200, y: 100 });
  });

  it('shrinks pins when the new page is smaller', () => {
    const r = rescalePinForPageChange({ x: 1000, y: 500 }, 0.5, 0.5);
    expect(r.x).toBeCloseTo(500);
    expect(r.y).toBeCloseTo(250);
  });

  it('leaves a pin untouched for a non-finite ratio', () => {
    expect(rescalePinForPageChange({ x: 100, y: 200 }, NaN, 1.5)).toEqual({ x: 100, y: 200 });
    expect(rescalePinForPageChange({ x: 100, y: 200 }, 1.5, Infinity)).toEqual({ x: 100, y: 200 });
  });

  it('leaves a pin untouched for a zero or negative ratio', () => {
    expect(rescalePinForPageChange({ x: 100, y: 200 }, 0, 1)).toEqual({ x: 100, y: 200 });
    expect(rescalePinForPageChange({ x: 100, y: 200 }, 1, -1)).toEqual({ x: 100, y: 200 });
  });

  it('passes a non-finite coordinate through while scaling the other axis', () => {
    expect(rescalePinForPageChange({ x: NaN, y: 200 }, 1.5, 1.5)).toEqual({ x: NaN, y: 300 });
  });
});
