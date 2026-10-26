/**
 * Smooth 1D noise for things that flicker and drift: candle flames, failing
 * bulbs, the sway of a ghost. Unlike stacked sine waves it never repeats,
 * and its fractal sum has the gusts and lulls of a real flame.
 *
 * Value noise: random values at the integers, eased between with a quintic
 * curve. No imports, so a Worker can use it too.
 */

const TABLE = new Float32Array(256);
{
  // A fixed seed, so a scene flickers the same way each time it's built.
  let state = 0x9e3779b9;
  for (let i = 0; i < 256; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    TABLE[i] = state / 4294967296;
  }
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Noise in 0..1 at `x`; neighbouring values are close, so it changes smoothly. */
export function noise1(x: number): number {
  const i = Math.floor(x);
  const t = x - i;
  const a = TABLE[i & 255];
  const b = TABLE[(i + 1) & 255];
  return a + (b - a) * fade(t);
}

/**
 * Fractal noise in 0..1: `octaves` layers, each twice as fast and half as
 * strong. Slow swells with quick flutters on top, like a flame in a draught.
 */
export function fbm1(x: number, octaves = 4): number {
  let sum = 0;
  let amplitude = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x) * amplitude;
    norm += amplitude;
    x = x * 2.03 + 17.17;
    amplitude *= 0.5;
  }
  return sum / norm;
}

/**
 * A candle flame's brightness at `time` seconds, roughly 0.35..1, with
 * occasional sudden dips when the flame bows. `seed` keeps candles apart.
 */
export function flameFlicker(time: number, seed: number): number {
  const base = fbm1(time * 1.6 + seed * 31.7, 4);
  const gust = noise1(time * 0.35 + seed * 7.3);
  const dip = gust > 0.82 ? (gust - 0.82) * 2.5 : 0;
  return Math.max(0.2, Math.min(1, 0.35 + base * 0.8 - dip));
}
