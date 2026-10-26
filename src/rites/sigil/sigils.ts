/**
 * The five sigils, as the order the finger must pass through their nodes.
 * Coordinates are in the shader's `centered()` space: the short side of the
 * canvas spans -1..1 and y points up. A path may return to an earlier node
 * (closing a shape); the nodes sit at radius 0.6, outside the portal and
 * inside the ring of candles, and no stroke passes close to a node it isn't
 * meant to touch.
 */

export interface Sigil {
  name: string;
  path: [number, number][];
  /** Seconds of candle wax. */
  time: number;
}

const R = 0.6;

/** `count` points on the circle, starting at the top and going clockwise. */
function ring(count: number): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.PI / 2 - (i * Math.PI * 2) / count;
    return [Math.cos(a) * R, Math.sin(a) * R] as [number, number];
  });
}

function trace(points: [number, number][], order: number[]): [number, number][] {
  return order.map((i) => points[i]);
}

const s = R * 0.72;

export const SIGILS: Sigil[] = [
  // A plain triangle, closed.
  { name: 'The Ward', path: trace(ring(3), [0, 1, 2, 0]), time: 12 },
  // An hourglass: two diagonals crossing over the portal.
  {
    name: 'The Binding',
    path: [
      [-s, s],
      [s, -s],
      [-s, -s],
      [s, s],
      [-s, s],
    ],
    time: 13,
  },
  // The pentagram, {5/2}.
  { name: 'The Star', path: trace(ring(5), [0, 2, 4, 1, 3, 0]), time: 14 },
  // A hexagonal seal: chords and diameters, one stroke.
  { name: 'The Seal', path: trace(ring(6), [0, 2, 5, 3, 1, 4, 0]), time: 15 },
  // The octagram, {8/3}: the door itself.
  { name: 'The Door', path: trace(ring(8), [0, 3, 6, 1, 4, 7, 2, 5, 0]), time: 18 },
];

/** Longest path, which sizes the shader's uniform array. */
export const MAX_PATH = 10;
