/** Small numeric helpers the rites share. */

export const clamp = (v: number, min = 0, max = 1) => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** Frame-rate independent smoothing: moves `current` toward `target` at `rate` per second. */
export const approach = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp((-rate * dt) / 1000));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Stars for a score: 1 for winning, plus one for each threshold reached. */
export function starsFor(won: boolean, score: number, two: number, three: number) {
  if (!won) {
    return 0;
  }
  return score >= three ? 3 : score >= two ? 2 : 1;
}

/** `12345` → `"12,345"`. `toLocaleString()` currently throws on Windows. */
export function formatCount(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Calls `fn` at most every `ms`. The last call in a burst still lands, so a
 * throttled HUD never ends on a stale value.
 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let pending: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
      return;
    }
    pending = args;
    timer ??= setTimeout(() => {
      timer = null;
      last = Date.now();
      if (pending) {
        fn(...pending);
        pending = null;
      }
    }, ms - (now - last));
  };
}
