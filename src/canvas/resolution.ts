/**
 * Caps a 2D surface's backing store at `max` pixels per dp and returns the
 * scale to draw with. The runners size a canvas at the full screen scale;
 * full-screen 2D work (compositing, big drawImage calls) costs per pixel, and
 * a dark, foggy scene loses nothing at a lower density. No imports, so a
 * Worker can use it too. Call it again from `resize`.
 */
export function capResolution(
  canvas: { width: number; height: number },
  size: { width: number; height: number; scale: number },
  max: number,
): number {
  const scale = Math.min(size.scale, max);
  canvas.width = Math.max(1, Math.round(size.width * scale));
  canvas.height = Math.max(1, Math.round(size.height * scale));
  return scale;
}
