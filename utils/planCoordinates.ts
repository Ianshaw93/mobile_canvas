/**
 * Pure helpers for the pin coordinate-space contract.
 *
 * Contract: pin x/y are stored in `dimensions × displayScale` pixel space,
 * where `dimensions` equals the actual scale-1.0 page size of the plan's
 * current PDF (plan.url). Every consumer that positions pins without
 * re-rendering plan.url (project-page overlay, CSV normalization, backend
 * report generation) relies on this equality.
 */

export type PageSize = { width: number; height: number };

export type PlanDimensions = {
  width: number;
  height: number;
  displayScale?: number;
};

export type DimensionRepairResult = {
  needsRepair: boolean;
  width: number;
  height: number;
};

/**
 * The scale the viewer actually renders plan.url at (PdfViewer.tsx hardcodes
 * 1.5), which defines the pin coordinate space. Any stored displayScale that
 * differs from this is wrong data (e.g. the pull path historically defaulted
 * missing server values to 1) — pins were still placed against a 1.5× render.
 */
export const VIEWER_DISPLAY_SCALE = 1.5;

const DEFAULT_DISPLAY_SCALE = VIEWER_DISPLAY_SCALE;

/**
 * The day the grayscale page-inflation code first existed (commit db2f92a,
 * 2025-11-20). A pin whose creation timestamp precedes this cannot have been
 * placed against an inflated PDF, so rescaling it into the inflated plan's
 * space is provably safe.
 */
export const GRAYSCALE_INFLATION_EPOCH_MS = Date.UTC(2025, 10, 20);

/** Oldest plausible pin timestamp — anything earlier isn't a Date.now() id. */
const PLAUSIBLE_PIN_EPOCH_MS = Date.UTC(2020, 0, 1);

/**
 * Decide whether a pin on an inflated plan is provably pre-inflation and can
 * be rescaled into the plan's current coordinate space.
 *
 * Pin ids created by the app are `Date.now().toString()`, so they carry their
 * creation time. Pins whose id-timestamp predates `cutoffMs` (default: the day
 * the inflating code first existed) were necessarily placed in the
 * pre-inflation space and are scaled by `ratio`. Anything newer, non-timestamp
 * ids, and non-inflated plans (ratio ≈ 1) are left untouched.
 */
export function rescueLegacyPin(
  pin: { id: string; x: number; y: number },
  ratio: number,
  cutoffMs: number = GRAYSCALE_INFLATION_EPOCH_MS
): { needsRescale: boolean; x: number; y: number } {
  const untouched = { needsRescale: false, x: pin.x, y: pin.y };
  if (!Number.isFinite(ratio) || ratio <= 1.02) return untouched;
  if (!/^\d{13}$/.test(pin.id)) return untouched;
  const ts = Number(pin.id);
  if (ts < PLAUSIBLE_PIN_EPOCH_MS || ts >= cutoffMs) return untouched;
  return { needsRescale: true, x: pin.x * ratio, y: pin.y * ratio };
}

/**
 * Compare a plan's stored dimensions against the actual scale-1.0 page size
 * of its current PDF. Returns the dimensions the plan should have.
 *
 * Repairs any mismatch beyond `tolerance` (fractional, default 1%) in either
 * direction — the contract is equality, not just "not inflated". Unusable
 * actual sizes (zero/NaN, e.g. a PDF that failed to parse) never repair.
 */
export function computeDimensionRepair(
  actual: PageSize,
  stored: PageSize,
  tolerance = 0.01
): DimensionRepairResult {
  const actualValid =
    Number.isFinite(actual.width) && Number.isFinite(actual.height) &&
    actual.width > 0 && actual.height > 0;

  if (!actualValid) {
    return { needsRepair: false, width: stored.width, height: stored.height };
  }

  const storedValid =
    Number.isFinite(stored.width) && Number.isFinite(stored.height) &&
    stored.width > 0 && stored.height > 0;

  const mismatch = !storedValid ||
    Math.abs(actual.width - stored.width) / stored.width > tolerance ||
    Math.abs(actual.height - stored.height) / stored.height > tolerance;

  return mismatch
    ? { needsRepair: true, width: actual.width, height: actual.height }
    : { needsRepair: false, width: stored.width, height: stored.height };
}

/**
 * Normalize a stored pin coordinate to the 0–1 range.
 * Pins live in `dimensions × displayScale` space, so both factors are needed.
 */
export function normalizePinCoords(
  point: { x: number; y: number },
  dims: PlanDimensions
): { x: number; y: number } {
  const scale = dims.displayScale || DEFAULT_DISPLAY_SCALE;
  const spaceWidth = dims.width * scale;
  const spaceHeight = dims.height * scale;
  return {
    x: spaceWidth > 0 ? point.x / spaceWidth : 0,
    y: spaceHeight > 0 ? point.y / spaceHeight : 0,
  };
}

export type PageSizeComparison = {
  /** Both axes agree within `tolerance` — pins can be kept as they are. */
  matches: boolean;
  /** Both page sizes are usable, so a ratio rescale is meaningful. */
  canRescale: boolean;
  /** incoming.width / stored.width (1 when a rescale is not meaningful). */
  ratioX: number;
  /** incoming.height / stored.height (1 when a rescale is not meaningful). */
  ratioY: number;
  /** The two ratios agree — a pure scale change that preserves the aspect. */
  uniform: boolean;
};

/**
 * Compare the scale-1.0 page size of a replacement PDF against a plan's
 * stored dimensions, for the "Replace PDF" flow.
 *
 * Replacing a plan's PDF keeps its pins, and pins live in
 * `dimensions x displayScale` space, so they only stay put when the two page
 * sizes agree. When they do not, `ratioX`/`ratioY` are what
 * `rescalePinForPageChange` needs to move pins into the incoming page's
 * space, and `uniform` says whether that rescale can preserve the layout.
 *
 * Unusable sizes (zero/NaN — e.g. a PDF that failed to parse) never match and
 * never offer a rescale.
 */
export function comparePlanPageSize(
  incoming: PageSize,
  stored: PageSize,
  tolerance = 0.01
): PageSizeComparison {
  const usable = (s: PageSize) =>
    Number.isFinite(s.width) && Number.isFinite(s.height) &&
    s.width > 0 && s.height > 0;

  if (!usable(incoming) || !usable(stored)) {
    return { matches: false, canRescale: false, ratioX: 1, ratioY: 1, uniform: false };
  }

  const ratioX = incoming.width / stored.width;
  const ratioY = incoming.height / stored.height;
  const matches =
    Math.abs(incoming.width - stored.width) / stored.width <= tolerance &&
    Math.abs(incoming.height - stored.height) / stored.height <= tolerance;
  const uniform = Math.abs(ratioX - ratioY) / Math.max(ratioX, ratioY) <= tolerance;

  return { matches, canRescale: true, ratioX, ratioY, uniform };
}

/**
 * Move a pin into a replacement page's coordinate space.
 *
 * Unlike `rescueLegacyPin` this is unconditional: the user has explicitly
 * chosen to rescale while replacing the PDF, so every pin moves. Ratios that
 * cannot describe a scale (non-finite, zero, negative) and coordinates that
 * are not finite leave the pin untouched.
 */
export function rescalePinForPageChange(
  pin: { x: number; y: number },
  ratioX: number,
  ratioY: number
): { x: number; y: number } {
  const usableRatio = (r: number) => Number.isFinite(r) && r > 0;
  if (!usableRatio(ratioX) || !usableRatio(ratioY)) return { x: pin.x, y: pin.y };
  return {
    x: Number.isFinite(pin.x) ? pin.x * ratioX : pin.x,
    y: Number.isFinite(pin.y) ? pin.y * ratioY : pin.y,
  };
}

export type GrayscaleGeometry = {
  /** Page size (PDF points) of the rebuilt PDF — must equal the source page. */
  pageWidth: number;
  pageHeight: number;
  /** Placed size of the raster image on that page — fills the page exactly. */
  imageWidth: number;
  imageHeight: number;
  /** Pixel size of the render canvas — larger than the page for quality. */
  canvasWidth: number;
  canvasHeight: number;
};

/**
 * Geometry for rebuilding a PDF as a grayscale raster: the page (and the
 * image placed on it) keeps the source's scale-1.0 size, while the raster is
 * rendered at `rasterScale` for quality. This is what keeps the conversion
 * from inflating page geometry — and makes it idempotent.
 */
export function grayscalePageGeometry(
  scale1Width: number,
  scale1Height: number,
  rasterScale: number
): GrayscaleGeometry {
  return {
    pageWidth: scale1Width,
    pageHeight: scale1Height,
    imageWidth: scale1Width,
    imageHeight: scale1Height,
    canvasWidth: scale1Width * rasterScale,
    canvasHeight: scale1Height * rasterScale,
  };
}
