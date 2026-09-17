/** Inspect source rendering pixels before the display-only CSS filter. */
export function hasVisibleColor(rgba: Uint8ClampedArray): boolean {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    // Allow tiny channel differences from rendering/compression of gray images.
    if (Math.max(r, g, b) - Math.min(r, g, b) > 3) return true;
  }
  return false;
}
