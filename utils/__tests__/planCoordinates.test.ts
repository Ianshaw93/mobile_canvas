/**
 * Tests for the pin-alignment fix (grayscale page-size inflation).
 *
 * Contract under test: pin coordinates are stored in
 * `dimensions × displayScale` pixel space, where `dimensions` must equal the
 * actual scale-1.0 page size of the plan's current PDF (plan.url).
 *
 * The grayscale converter historically rebuilt PDFs with the page size taken
 * from a scale-1.5 viewport, inflating page geometry by 1.5× per conversion
 * and breaking that contract for every consumer that divides by stored
 * dimensions (project-page overlay, CSV normalization, backend reports).
 */
import {
  computeDimensionRepair,
  normalizePinCoords,
  grayscalePageGeometry,
  rescueLegacyPin,
  GRAYSCALE_INFLATION_EPOCH_MS,
} from '../planCoordinates';

// A3 landscape in PDF points — the "smaller PDF" case users reported,
// where grayscale conversion succeeds and inflates the page.
const A3 = { width: 1190.55, height: 841.89 };

describe('computeDimensionRepair', () => {
  it('flags a 1.5×-inflated plan and adopts the actual page size', () => {
    const actual = { width: A3.width * 1.5, height: A3.height * 1.5 };
    const result = computeDimensionRepair(actual, A3);
    expect(result.needsRepair).toBe(true);
    expect(result.width).toBeCloseTo(actual.width, 5);
    expect(result.height).toBeCloseTo(actual.height, 5);
  });

  it('flags a 2.25×-inflated plan (migration re-converted an already-converted PDF)', () => {
    const actual = { width: A3.width * 2.25, height: A3.height * 2.25 };
    const result = computeDimensionRepair(actual, A3);
    expect(result.needsRepair).toBe(true);
    expect(result.width).toBeCloseTo(actual.width, 5);
  });

  it('leaves a healthy plan alone (exact match)', () => {
    expect(computeDimensionRepair(A3, A3).needsRepair).toBe(false);
  });

  it('tolerates sub-1% rounding drift between stored and actual size', () => {
    const actual = { width: A3.width * 1.004, height: A3.height * 0.997 };
    expect(computeDimensionRepair(actual, A3).needsRepair).toBe(false);
  });

  it('repairs missing/zero stored dimensions by adopting the actual page size', () => {
    const result = computeDimensionRepair(A3, { width: 0, height: 0 });
    expect(result.needsRepair).toBe(true);
    expect(result.width).toBeCloseTo(A3.width, 5);
    expect(result.height).toBeCloseTo(A3.height, 5);
  });

  it('reconciles even when the actual page is smaller than stored (contract is equality, not inflation)', () => {
    const actual = { width: A3.width / 1.5, height: A3.height / 1.5 };
    const result = computeDimensionRepair(actual, A3);
    expect(result.needsRepair).toBe(true);
    expect(result.width).toBeCloseTo(actual.width, 5);
  });

  it('does not repair when the actual size is unusable (zero/NaN)', () => {
    expect(computeDimensionRepair({ width: 0, height: 0 }, A3).needsRepair).toBe(false);
    expect(computeDimensionRepair({ width: NaN, height: NaN }, A3).needsRepair).toBe(false);
  });
});

describe('normalizePinCoords', () => {
  const dims = { width: A3.width, height: A3.height, displayScale: 1.5 };

  it('maps a pin at the centre of the viewer canvas to (0.5, 0.5)', () => {
    const pin = { x: A3.width * 1.5 * 0.5, y: A3.height * 1.5 * 0.5 };
    const result = normalizePinCoords(pin, dims);
    expect(result.x).toBeCloseTo(0.5, 6);
    expect(result.y).toBeCloseTo(0.5, 6);
  });

  it('maps the bottom-right corner of the viewer canvas to (1, 1), not (1.5, 1.5)', () => {
    // This is the pre-existing CSV bug: dividing by width alone yields 0–1.5.
    const pin = { x: A3.width * 1.5, y: A3.height * 1.5 };
    const result = normalizePinCoords(pin, dims);
    expect(result.x).toBeCloseTo(1, 6);
    expect(result.y).toBeCloseTo(1, 6);
  });

  it('defaults displayScale to 1.5 when absent', () => {
    const pin = { x: A3.width * 1.5, y: A3.height * 1.5 };
    const result = normalizePinCoords(pin, { width: A3.width, height: A3.height });
    expect(result.x).toBeCloseTo(1, 6);
  });

  it('returns 0 for missing plan dimensions instead of dividing by zero', () => {
    const result = normalizePinCoords({ x: 100, y: 100 }, { width: 0, height: 0, displayScale: 1.5 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe('rescueLegacyPin', () => {
  // Pin ids are Date.now().toString() — they carry their creation time.
  const PRE_GRAYSCALE_ID = String(new Date('2025-10-01T12:00:00Z').getTime());
  const POST_GRAYSCALE_ID = String(new Date('2026-04-01T12:00:00Z').getTime());

  it('rescales a pre-grayscale pin on a 1.5×-inflated plan into the current space', () => {
    const pin = { id: PRE_GRAYSCALE_ID, x: 200, y: 300 };
    const result = rescueLegacyPin(pin, 1.5);
    expect(result.needsRescale).toBe(true);
    expect(result.x).toBeCloseTo(300, 6);
    expect(result.y).toBeCloseTo(450, 6);
  });

  it('rescales by 2.25 when the plan was inflated twice', () => {
    const pin = { id: PRE_GRAYSCALE_ID, x: 100, y: 100 };
    const result = rescueLegacyPin(pin, 2.25);
    expect(result.needsRescale).toBe(true);
    expect(result.x).toBeCloseTo(225, 6);
  });

  it('leaves pins created after the grayscale code existed untouched (ambiguous space)', () => {
    const pin = { id: POST_GRAYSCALE_ID, x: 200, y: 300 };
    const result = rescueLegacyPin(pin, 1.5);
    expect(result.needsRescale).toBe(false);
    expect(result.x).toBe(200);
    expect(result.y).toBe(300);
  });

  it('leaves a pin created exactly at the cutoff untouched (cutoff is exclusive)', () => {
    const pin = { id: String(GRAYSCALE_INFLATION_EPOCH_MS), x: 200, y: 300 };
    expect(rescueLegacyPin(pin, 1.5).needsRescale).toBe(false);
  });

  it('leaves pins with non-timestamp ids untouched', () => {
    expect(rescueLegacyPin({ id: 'abc-uuid-123', x: 200, y: 300 }, 1.5).needsRescale).toBe(false);
  });

  it('leaves pins with implausibly small numeric ids untouched', () => {
    // e.g. an imported/sequential id like "42" is not a ms timestamp
    expect(rescueLegacyPin({ id: '42', x: 200, y: 300 }, 1.5).needsRescale).toBe(false);
  });

  it('does nothing when the plan was not inflated (ratio ≈ 1)', () => {
    const pin = { id: PRE_GRAYSCALE_ID, x: 200, y: 300 };
    expect(rescueLegacyPin(pin, 1.0).needsRescale).toBe(false);
    expect(rescueLegacyPin(pin, 1.005).needsRescale).toBe(false);
  });

  it('does nothing for a deflation ratio (< 1) — only inflation is a known failure mode', () => {
    const pin = { id: PRE_GRAYSCALE_ID, x: 200, y: 300 };
    expect(rescueLegacyPin(pin, 1 / 1.5).needsRescale).toBe(false);
  });

  it('accepts a custom cutoff so the window can widen if distribution history firms up', () => {
    const marchCutoff = new Date('2026-03-05T00:00:00Z').getTime();
    const decemberPin = { id: String(new Date('2025-12-15T12:00:00Z').getTime()), x: 100, y: 100 };
    expect(rescueLegacyPin(decemberPin, 1.5).needsRescale).toBe(false);
    expect(rescueLegacyPin(decemberPin, 1.5, marchCutoff).needsRescale).toBe(true);
  });
});

describe('grayscalePageGeometry', () => {
  it('keeps page geometry at the scale-1.0 size while rasterising larger', () => {
    const geo = grayscalePageGeometry(A3.width, A3.height, 1.5);
    // The rebuilt PDF's page (and the placed image) must be the original size…
    expect(geo.pageWidth).toBeCloseTo(A3.width, 5);
    expect(geo.pageHeight).toBeCloseTo(A3.height, 5);
    expect(geo.imageWidth).toBeCloseTo(A3.width, 5);
    expect(geo.imageHeight).toBeCloseTo(A3.height, 5);
    // …while the raster canvas is higher-resolution for quality.
    expect(geo.canvasWidth).toBeCloseTo(A3.width * 1.5, 5);
    expect(geo.canvasHeight).toBeCloseTo(A3.height * 1.5, 5);
  });

  it('is idempotent: converting an already-converted PDF cannot grow the page', () => {
    const first = grayscalePageGeometry(A3.width, A3.height, 1.5);
    const second = grayscalePageGeometry(first.pageWidth, first.pageHeight, 1.5);
    expect(second.pageWidth).toBeCloseTo(first.pageWidth, 5);
    expect(second.pageHeight).toBeCloseTo(first.pageHeight, 5);
  });
});
