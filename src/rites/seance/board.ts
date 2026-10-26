import type { CanvasRenderingContext2D } from '@nativescript/canvas';
import { noise1 } from '../../game/noise';

/**
 * The spirit board, drawn with Canvas 2D in board units (a 1000 × 680 board).
 * Letters are laid out from the font's own measurements, so where a glyph is
 * drawn, where the planchette stops and where a touch lands are the same
 * numbers.
 */

export const BOARD_W = 1000;
export const BOARD_H = 680;

export interface Mark {
  key: string;
  x: number;
  y: number;
  /** Rotation of the glyph along its arc, radians. */
  angle: number;
  /** Font size, board units. */
  size: number;
}

export const WORDS: Record<'YES' | 'NO' | 'GOODBYE' | 'REST', Mark> = {
  YES: { key: 'YES', x: 165, y: 150, angle: 0, size: 60 },
  NO: { key: 'NO', x: 835, y: 150, angle: 0, size: 60 },
  GOODBYE: { key: 'GOODBYE', x: 500, y: 612, angle: 0, size: 50 },
  // Where the planchette waits between words: the middle of the board.
  REST: { key: 'REST', x: 500, y: 450, angle: 0, size: 0 },
};

export interface BoardLayout {
  letters: Mark[];
  digits: Mark[];
  markFor(key: string): Mark;
  /** The letter nearest a touch (board units), or null if none is close. */
  letterAt(x: number, y: number): Mark | null;
}

const ARC_CENTRE = { x: 500, y: 1180 };

/** `measure(text, size)` is the text's advance width at that font size. */
export function layoutBoard(measure: (text: string, size: number) => number): BoardLayout {
  const arc = (letters: string, radius: number, spread: number): Mark[] => {
    const chars = [...letters];
    // Fit the row to its arc: widths scale with the size, tracking with it too.
    const unit = chars.reduce((sum, c) => sum + measure(c, 100) / 100, 0) + 0.18 * (chars.length - 1);
    const size = (spread * radius) / unit;
    const tracking = 0.18 * size;
    const widths = chars.map((c) => measure(c, size));
    const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
    let run = -total / 2;
    return chars.map((key, i) => {
      const centre = run + widths[i] / 2;
      run += widths[i] + tracking;
      const a = centre / radius;
      return { key, x: ARC_CENTRE.x + radius * Math.sin(a), y: ARC_CENTRE.y - radius * Math.cos(a), angle: a, size };
    });
  };
  const letters = [...arc('ABCDEFGHIJKLM', 890, 0.86), ...arc('NOPQRSTUVWXYZ', 750, 0.92)];

  const digitSize = 46;
  const digitWidths = [...'1234567890'].map((c) => measure(c, digitSize));
  const gap = 26;
  const digitsTotal = digitWidths.reduce((a, b) => a + b, 0) + gap * 9;
  let run = 500 - digitsTotal / 2;
  const digits = [...'1234567890'].map((key, i) => {
    const x = run + digitWidths[i] / 2;
    run += digitWidths[i] + gap;
    return { key, x, y: 548, angle: 0, size: digitSize };
  });

  const marks = new Map<string, Mark>([...letters, ...digits].map((m) => [m.key, m]));
  return {
    letters,
    digits,
    markFor: (key) => marks.get(key) ?? WORDS[key as keyof typeof WORDS] ?? WORDS.REST,
    letterAt(x, y) {
      let best: Mark | null = null;
      let bestD = 62;
      for (const m of letters) {
        const d = Math.hypot(m.x - x, m.y - y);
        if (d < bestD) {
          best = m;
          bestD = d;
        }
      }
      return best;
    },
  };
}

const INK = '#e6d6b0';

/** A repeatable random sequence, so the board's wear is the same every time. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Paints the board in board units (set the transform first): charred wood,
 * burns, claw marks, a crack, dried blood and wax, an eye that watches, and
 * pale carved letters, some nearly worn away.
 */
export function paintBoard(g: CanvasRenderingContext2D, layout: BoardLayout, font: string) {
  const r = seeded(13);
  const between = (a: number, b: number) => a + r() * (b - a);

  // The wood.
  const wood = g.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  wood.addColorStop(0, '#5a3a22');
  wood.addColorStop(0.5, '#3f2614');
  wood.addColorStop(1, '#21130a');
  roundRect(g, 6, 6, 988, 668, 70);
  g.fillStyle = wood;
  g.fill();
  g.save();
  roundRect(g, 6, 6, 988, 668, 70);
  g.clip();

  g.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  for (let i = 0; i < 16; i++) {
    const y = 30 + i * 41;
    g.lineWidth = i % 3 ? 2 : 4;
    g.beginPath();
    g.moveTo(20, y);
    g.bezierCurveTo(250, y - 14, 420, y + 18, 620, y - 6);
    g.bezierCurveTo(780, y - 18, 900, y + 12, 980, y - 4);
    g.stroke();
  }

  // Scorch marks: soft dark blooms.
  for (let i = 0; i < 6; i++) {
    const cx = between(80, 920);
    const cy = between(200, 600);
    const rx = between(50, 110);
    g.save();
    g.translate(cx, cy);
    g.scale(1, between(0.45, 0.8));
    const burn = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    burn.addColorStop(0, 'rgba(5, 2, 1, 0.55)');
    burn.addColorStop(0.6, 'rgba(20, 10, 4, 0.25)');
    burn.addColorStop(1, 'rgba(20, 10, 4, 0)');
    g.fillStyle = burn;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }

  // Inner borders and small marks around them.
  g.strokeStyle = INK;
  g.globalAlpha = 0.32;
  g.lineWidth = 2.5;
  roundRect(g, 34, 34, 932, 612, 52);
  g.stroke();
  g.globalAlpha = 0.22;
  g.lineWidth = 1;
  roundRect(g, 44, 44, 912, 592, 46);
  g.stroke();
  g.globalAlpha = 0.4;
  g.lineWidth = 2.2;
  for (let i = 0; i < 18; i++) {
    const x = 50 + (i / 17) * 900;
    const y = i % 2 === 0 ? 20 : 662;
    g.beginPath();
    if (i % 3 === 0) {
      // An inverted cross.
      g.moveTo(x, y - 8);
      g.lineTo(x, y + 8);
      g.moveTo(x - 5, y + 3);
      g.lineTo(x + 5, y + 3);
    } else if (i % 3 === 1) {
      g.arc(x, y, 5, 0, Math.PI * 2);
    } else {
      g.moveTo(x, y - 6);
      g.lineTo(x + 6, y + 5);
      g.lineTo(x - 6, y + 5);
      g.closePath();
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  // A crack running in from the left edge.
  g.strokeStyle = '#030100';
  g.lineJoin = 'round';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(8, 250);
  for (const [x, y] of [[70, 262], [96, 300], [150, 306], [176, 352], [214, 360], [236, 404]]) {
    g.lineTo(x, y);
  }
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(96, 300);
  g.lineTo(120, 330);
  g.lineTo(118, 372);
  g.stroke();

  // Four claw marks dragged across the lower right.
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = 660 + i * 24;
    g.strokeStyle = 'rgba(12, 5, 3, 0.8)';
    g.lineWidth = 7 - i;
    g.beginPath();
    g.moveTo(x, 300 + i * 6);
    g.bezierCurveTo(x + 30, 360, x + 50, 420, x + 90, 500 - i * 8);
    g.stroke();
    g.strokeStyle = 'rgba(183, 146, 106, 0.3)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x + 3, 302 + i * 6);
    g.bezierCurveTo(x + 33, 362, x + 53, 422, x + 92, 498 - i * 8);
    g.stroke();
  }

  // Dried blood: a smear under GOODBYE, drops, and a hand pressed flat.
  g.fillStyle = 'rgba(74, 7, 7, 0.85)';
  g.beginPath();
  g.moveTo(360, 640);
  g.bezierCurveTo(420, 622, 520, 648, 560, 636);
  g.bezierCurveTo(600, 624, 650, 646, 616, 660);
  g.bezierCurveTo(560, 676, 470, 662, 420, 668);
  g.bezierCurveTo(370, 674, 330, 652, 360, 640);
  g.fill();
  for (const [x, y, rad] of [[660, 650, 9], [690, 640, 5], [330, 646, 6]]) {
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.save();
  g.translate(890, 470);
  g.rotate(-0.31);
  g.fillStyle = 'rgba(92, 10, 10, 0.5)';
  g.beginPath();
  g.ellipse(0, 0, 34, 40, 0, 0, Math.PI * 2);
  g.fill();
  for (const [x, h] of [[-28, 44], [-12, 52], [4, 54], [20, 48]]) {
    roundRect(g, x, -66 - (h - 44), 12, h, 6);
    g.fill();
  }
  g.rotate(0.7);
  roundRect(g, 26, -10, 12, 36, 6);
  g.fill();
  g.restore();

  // Wax from a candle held too close.
  g.fillStyle = 'rgba(233, 223, 201, 0.85)';
  g.beginPath();
  g.moveTo(40, 40);
  g.bezierCurveTo(70, 34, 96, 44, 92, 60);
  g.bezierCurveTo(90, 72, 70, 70, 66, 86);
  g.bezierCurveTo(62, 96, 52, 92, 54, 80);
  g.bezierCurveTo(56, 66, 34, 66, 40, 40);
  g.fill();
  g.beginPath();
  g.arc(104, 74, 6, 0, Math.PI * 2);
  g.fill();

  // The watcher: an eye with rays, over "the dead speak".
  g.save();
  g.translate(500, 84);
  g.strokeStyle = 'rgba(230, 214, 176, 0.45)';
  g.lineWidth = 2.5;
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + (i * Math.PI) / 12;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 72, Math.sin(a) * 48);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-62, 0);
  g.bezierCurveTo(-30, -34, 30, -34, 62, 0);
  g.bezierCurveTo(30, 34, -30, 34, -62, 0);
  g.fillStyle = '#0d0604';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#7a1010';
  g.beginPath();
  g.arc(0, 0, 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(0, 0, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.7)';
  g.beginPath();
  g.arc(-5, -6, 3, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = INK;
  g.globalAlpha = 0.65;
  g.font = `26px ${font}`;
  g.fillText('M O R T U I   ·   L O Q U U N T U R', 500, 150);
  g.globalAlpha = 1;

  // A skull by YES, a crescent moon with a face by NO.
  g.save();
  g.translate(165, 64);
  g.fillStyle = INK;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.moveTo(-30, 4);
  g.bezierCurveTo(-30, -30, 30, -30, 30, 4);
  g.bezierCurveTo(30, 18, 20, 20, 18, 30);
  g.lineTo(-18, 30);
  g.bezierCurveTo(-20, 20, -30, 18, -30, 4);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#0d0604';
  g.beginPath();
  g.ellipse(-12, 2, 8, 9, 0, 0, Math.PI * 2);
  g.ellipse(12, 2, 8, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(0, 10);
  g.lineTo(-4, 18);
  g.lineTo(4, 18);
  g.fill();
  g.strokeStyle = '#0d0604';
  g.lineWidth = 3;
  for (const x of [-14, -5, 5, 14]) {
    g.beginPath();
    g.moveTo(x, 30);
    g.lineTo(x, 38);
    g.stroke();
  }
  g.restore();
  g.save();
  g.translate(835, 64);
  g.fillStyle = INK;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.arc(0, 0, 34, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#3a2414';
  g.beginPath();
  g.arc(16, -10, 32, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0d0604';
  g.beginPath();
  g.arc(-18, -6, 3.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#0d0604';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-26, 12);
  g.bezierCurveTo(-20, 18, -14, 18, -10, 12);
  g.stroke();
  g.restore();

  // Carved glyphs: a dark cut below, the pale letter on top, unevenly worn.
  const carve = (m: Mark, wear: boolean) => {
    g.save();
    g.translate(m.x, m.y);
    g.rotate(m.angle);
    g.font = `${m.size.toFixed(1)}px ${font}`;
    g.fillStyle = 'rgba(0, 0, 0, 0.75)';
    g.fillText(m.key, 0, 3);
    g.fillStyle = INK;
    g.globalAlpha = wear ? between(0.55, 0.95) : 0.95;
    g.fillText(m.key, 0, 0);
    g.restore();
  };
  layout.letters.forEach((m) => carve(m, true));
  layout.digits.forEach((m) => carve(m, true));
  carve(WORDS.YES, false);
  carve(WORDS.NO, false);
  carve(WORDS.GOODBYE, false);

  // Age darkens the edges.
  const age = g.createRadialGradient(500, 330, 200, 500, 330, 640);
  age.addColorStop(0, 'rgba(0, 0, 0, 0)');
  age.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  g.fillStyle = age;
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.restore();

  g.strokeStyle = '#0a0503';
  g.lineWidth = 10;
  roundRect(g, 6, 6, 988, 668, 70);
  g.stroke();
}

/** The planchette's size, and where its window sits within it (board units). */
export const PLANCHETTE = { w: 150, h: 187, windowX: 75, windowY: 88 };

/**
 * Paints the planchette with its window at (0, 0): bone-pale, cracked, with
 * an eye behind the glass that drifts about (noise) and blinks.
 *
 * `lens` draws what the glass shows when the planchette rests on a mark (the
 * board beneath, magnified) in board units centred on the window, with the
 * lens' radius; `eye` (0..1) is how much of the eye shows over it. On a real
 * spirit board you read the letter through the window; here the eye only
 * stares out while the planchette moves.
 */
const planchetteFills = new WeakMap<object, { bone: any; glass: any }>();

export function paintPlanchette(
  g: CanvasRenderingContext2D,
  time: number,
  view: { eye: number; lens?: (g: CanvasRenderingContext2D, radius: number) => void } = { eye: 1 },
) {
  const s = PLANCHETTE.w / 120;
  // Its gradients live in its own coordinates: made once per context, reused.
  let fills = planchetteFills.get(g);
  if (!fills) {
    const bone = g.createLinearGradient(0, 0, 120, 150);
    bone.addColorStop(0, '#ece2cc');
    bone.addColorStop(1, '#9a8b70');
    const glass = g.createRadialGradient(54, 62, 0, 60, 70, 20);
    glass.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    glass.addColorStop(1, 'rgba(159, 214, 255, 0)');
    fills = { bone, glass };
    planchetteFills.set(g, fills);
  }
  g.save();
  g.scale(s, s);
  g.translate(-60, -70);

  // Shadow on the board.
  g.fillStyle = 'rgba(0, 0, 0, 0.45)';
  g.beginPath();
  g.ellipse(66, 86, 52, 66, 0, 0, Math.PI * 2);
  g.fill();

  g.beginPath();
  g.moveTo(60, 6);
  g.bezierCurveTo(92, 32, 116, 72, 112, 106);
  g.bezierCurveTo(108, 136, 84, 146, 60, 146);
  g.bezierCurveTo(36, 146, 12, 136, 8, 106);
  g.bezierCurveTo(4, 72, 28, 32, 60, 6);
  g.closePath();
  g.fillStyle = fills.bone;
  g.fill();
  g.strokeStyle = '#2a1a10';
  g.lineWidth = 4;
  g.stroke();

  g.strokeStyle = 'rgba(59, 42, 30, 0.7)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(36, 30);
  g.lineTo(44, 46);
  g.lineTo(40, 58);
  g.moveTo(84, 120);
  g.lineTo(92, 112);
  g.lineTo(96, 124);
  g.stroke();
  g.strokeStyle = 'rgba(92, 10, 10, 0.5)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(60, 6);
  g.bezierCurveTo(70, 20, 74, 26, 70, 40);
  g.stroke();

  // The lens: a brass rim, and an eye behind it.
  g.fillStyle = '#1a0c06';
  g.strokeStyle = '#8a6f3a';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(60, 70, 24, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.save();
  g.beginPath();
  g.arc(60, 70, 20, 0, Math.PI * 2);
  g.clip();
  if (view.lens && view.eye < 1) {
    g.save();
    g.translate(60, 70);
    g.scale(1 / s, 1 / s);
    view.lens(g, 20 * s);
    g.restore();
  }
  g.globalAlpha = view.eye;
  g.fillStyle = '#f1e9dc';
  g.fillRect(36, 46, 48, 48);
  const lookX = (noise1(time * 0.0006) - 0.5) * 14;
  const lookY = (noise1(time * 0.0005 + 9) - 0.5) * 6;
  g.fillStyle = '#7a1010';
  g.beginPath();
  g.arc(60 + lookX, 70 + lookY, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(60 + lookX, 70 + lookY, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.8)';
  g.beginPath();
  g.arc(57 + lookX, 67 + lookY, 2, 0, Math.PI * 2);
  g.fill();
  // A blink every few seconds: the lids meet in the middle.
  const phase = (time / 4300) % 1;
  const lid = Math.max(0, 1 - Math.abs(phase - 0.94) / 0.04) * 22;
  if (lid > 0) {
    g.fillStyle = '#2a1a10';
    g.fillRect(36, 48, 48, lid);
    g.fillRect(36, 92 - lid, 48, lid);
  }
  g.globalAlpha = 1;
  g.restore();
  g.fillStyle = fills.glass;
  g.beginPath();
  g.arc(60, 70, 20, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#2a1a10';
  for (const [x, y] of [[60, 128], [26, 112], [94, 112]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
