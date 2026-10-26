import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';

/**
 * Everything the pumpkin patch draws, built once from vector Graphics and
 * baked into textures with renderer.generateTexture. Item textures are
 * centred on the body (an invisible square pads the bounds), so anchor 0.5
 * is the middle of the pumpkin or skull and halves split it down the middle.
 */

/** Body radius the item textures are drawn at, in dp. Sprites scale from it. */
export const R0 = 64;

export interface PatchTextures {
  pumpkins: Texture[];
  golden: Texture;
  skull: Texture;
  flame: Texture;
  /** A soft white radial glow, for tinting. */
  glow: Texture;
  seed: Texture;
  goo: Texture;
  bone: Texture;
  splat: Texture;
  bat: [Texture, Texture];
  destroy(): void;
}

type Palette = { ribs: [number, number, number, number]; outline: number; face: number; core: number; cavity: number };

const ORANGE: Palette = {
  ribs: [0x9a3412, 0xc2410c, 0xea580c, 0xf97316],
  outline: 0x431407,
  face: 0xffc94a,
  core: 0xfff3b0,
  cavity: 0x5a1a06,
};

const GOLD: Palette = {
  ribs: [0x854d0e, 0xa16207, 0xca8a04, 0xfacc15],
  outline: 0x3f2a05,
  face: 0xfffbe6,
  core: 0xffffff,
  cavity: 0x5c3d06,
};

/** Pads the bounds to a square around the origin so the texture centre is (0, 0). */
function frame(g: Graphics, half: number) {
  g.rect(-half, -half, half * 2, half * 2).fill({ color: 0x000000, alpha: 0.001 });
}

function pumpkin(palette: Palette, face: 0 | 1 | 2): Graphics {
  const g = new Graphics();
  const R = R0;
  frame(g, R + 12);

  // Stem first, so the body overlaps its foot.
  g.roundRect(-R * 0.09, -R * 1.02, R * 0.18, R * 0.36, R * 0.06).fill(0x3f4a1c);
  g.moveTo(R * 0.06, -R * 0.98)
    .quadraticCurveTo(R * 0.35, -R * 1.12, R * 0.3, -R * 0.84)
    .stroke({ width: 3, color: 0x2f3a14, cap: 'round' });

  // Ribs: outer ones darker, the middle one brightest.
  const ribs: [number, number, number][] = [
    [-0.5, 0.5, palette.ribs[0]],
    [0.5, 0.5, palette.ribs[0]],
    [-0.28, 0.48, palette.ribs[1]],
    [0.28, 0.48, palette.ribs[1]],
    [0, 0.44, palette.ribs[2]],
  ];
  for (const [x, rx, color] of ribs) {
    g.ellipse(x * R, 0, rx * R, R * 0.8).fill(color).stroke({ width: 2.5, color: palette.outline, alpha: 0.7 });
  }
  // Sheen along the middle rib.
  g.ellipse(-R * 0.08, -R * 0.42, R * 0.1, R * 0.22).fill({ color: palette.ribs[3], alpha: 0.55 });
  g.ellipse(R * 0.45, -R * 0.3, R * 0.06, R * 0.2).fill({ color: palette.ribs[3], alpha: 0.35 });

  // The carved face: a dark cut edge, the candle glow, and a hot core.
  const shapes = faceShapes(face);
  for (const [layer, color, inset] of [
    [0, palette.cavity, 0],
    [1, palette.face, 0.04],
    [2, palette.core, 0.12],
  ] as const) {
    for (const points of shapes) {
      g.poly(shrink(points, inset, layer === 0 ? 0.03 : 0).map((v) => v * R)).fill(color);
    }
  }
  return g;
}

/** Face cut-outs in body units: eyes, nose, mouth. */
function faceShapes(variant: 0 | 1 | 2): number[][] {
  const mouthWide = [
    -0.56, 0.16, -0.38, 0.24, -0.3, 0.16, -0.18, 0.28, -0.06, 0.18, 0.06, 0.3, 0.18, 0.18, 0.3, 0.28, 0.4, 0.17, 0.56, 0.14,
    0.42, 0.44, 0.22, 0.38, 0.14, 0.5, 0.0, 0.42, -0.14, 0.52, -0.24, 0.4, -0.42, 0.44,
  ];
  switch (variant) {
    case 0: // Classic triangles and a toothy grin.
      return [
        [-0.46, -0.04, -0.14, -0.04, -0.3, -0.34],
        [0.14, -0.04, 0.46, -0.04, 0.3, -0.34],
        [-0.08, 0.1, 0.08, 0.1, 0, -0.04],
        mouthWide,
      ];
    case 1: // Angry slanted eyes, jagged frown.
      return [
        [-0.5, -0.3, -0.12, -0.12, -0.42, 0.02],
        [0.5, -0.3, 0.12, -0.12, 0.42, 0.02],
        [-0.06, 0.12, 0.06, 0.12, 0, 0.0],
        [-0.5, 0.42, -0.36, 0.2, -0.22, 0.32, -0.08, 0.18, 0.08, 0.32, 0.22, 0.18, 0.36, 0.32, 0.5, 0.42, 0.3, 0.5, 0.1, 0.4, -0.1, 0.5, -0.3, 0.4],
      ];
    default: // Crooked: one big eye, one squint, a lopsided leer.
      return [
        [-0.46, -0.02, -0.12, -0.06, -0.26, -0.38],
        [0.16, -0.12, 0.46, -0.18, 0.38, -0.02, 0.2, 0.0],
        [-0.04, 0.12, 0.1, 0.08, 0.0, -0.02],
        [-0.5, 0.22, -0.2, 0.3, 0.1, 0.24, 0.5, 0.06, 0.38, 0.32, 0.12, 0.48, -0.16, 0.48, -0.38, 0.38],
      ];
  }
}

/** Pulls a polygon toward its centroid by `inset`, and nudges it down by `drop`. */
function shrink(points: number[], inset: number, drop: number): number[] {
  let cx = 0;
  let cy = 0;
  const n = points.length / 2;
  for (let i = 0; i < points.length; i += 2) {
    cx += points[i] / n;
    cy += points[i + 1] / n;
  }
  const k = 1 - inset * 2.2;
  return points.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * k : cy + (v - cy) * k + drop));
}

function skull(): Graphics {
  const g = new Graphics();
  const R = R0;
  frame(g, R + 12);
  const bone = 0xe7e2d6;
  const shade = 0xb3a891;
  const hollow = 0x1a0b24;
  // Cranium and jaw.
  g.circle(0, -R * 0.14, R * 0.66).fill(bone);
  g.roundRect(-R * 0.4, R * 0.18, R * 0.8, R * 0.46, R * 0.14).fill(bone);
  g.ellipse(0, R * 0.28, R * 0.5, R * 0.16).fill({ color: shade, alpha: 0.6 });
  g.ellipse(-R * 0.28, -R * 0.5, R * 0.14, R * 0.08).fill({ color: 0xffffff, alpha: 0.45 });
  // Eye sockets with violet pupils.
  g.ellipse(-R * 0.25, -R * 0.06, R * 0.19, R * 0.22).fill(hollow);
  g.ellipse(R * 0.25, -R * 0.06, R * 0.19, R * 0.22).fill(hollow);
  g.circle(-R * 0.24, -R * 0.02, R * 0.07).fill(0xc084fc);
  g.circle(R * 0.24, -R * 0.02, R * 0.07).fill(0xc084fc);
  g.circle(-R * 0.24, -R * 0.02, R * 0.03).fill(0xf5e8ff);
  g.circle(R * 0.24, -R * 0.02, R * 0.03).fill(0xf5e8ff);
  // Nose.
  g.poly([-R * 0.08, R * 0.24, R * 0.08, R * 0.24, 0, R * 0.08]).fill(hollow);
  // Teeth.
  for (let i = -3; i <= 3; i++) {
    g.moveTo(i * R * 0.1, R * 0.34).lineTo(i * R * 0.1, R * 0.58).stroke({ width: 2.5, color: 0x5b4e60 });
  }
  g.moveTo(-R * 0.36, R * 0.46).lineTo(R * 0.36, R * 0.46).stroke({ width: 2, color: 0x5b4e60 });
  // Crack.
  g.moveTo(R * 0.18, -R * 0.78)
    .lineTo(R * 0.1, -R * 0.56)
    .lineTo(R * 0.2, -R * 0.44)
    .lineTo(R * 0.12, -R * 0.3)
    .stroke({ width: 2, color: 0x5b4e60 });
  return g;
}

function flame(): Graphics {
  const g = new Graphics();
  const R = R0;
  frame(g, R * 1.3);
  const layers: [number, number, number][] = [
    [1, 0x6b21a8, 0.7],
    [0.72, 0xa855f7, 0.85],
    [0.42, 0xe9d5ff, 0.95],
  ];
  for (const [s, color, alpha] of layers) {
    g.moveTo(0, -R * 1.25 * s)
      .bezierCurveTo(R * 0.35 * s, -R * 0.6 * s, R * 0.75 * s, -R * 0.1 * s, R * 0.55 * s, R * 0.35 * s)
      .bezierCurveTo(R * 0.4 * s, R * 0.7 * s, -R * 0.4 * s, R * 0.7 * s, -R * 0.55 * s, R * 0.35 * s)
      .bezierCurveTo(-R * 0.75 * s, -R * 0.1 * s, -R * 0.2 * s, -R * 0.5 * s, 0, -R * 1.25 * s)
      .fill({ color, alpha });
  }
  return g;
}

/** Concentric translucent discs: a cheap radial falloff. */
function glow(): Graphics {
  const g = new Graphics();
  const R = R0;
  const steps = 22;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    g.circle(0, 0, R * (1 - t)).fill({ color: 0xffffff, alpha: 0.045 + t * 0.02 });
  }
  return g;
}

function splat(): Graphics {
  const g = new Graphics();
  const R = R0;
  frame(g, R * 1.3);
  g.circle(0, 0, R * 0.45).fill(0xffffff);
  // Fixed seed-like offsets so the shape is the same every build.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.3;
    const d = R * (0.45 + ((i * 37) % 5) * 0.09);
    const r = R * (0.1 + ((i * 53) % 4) * 0.05);
    g.circle(Math.cos(a) * d, Math.sin(a) * d, r).fill(0xffffff);
    g.moveTo(0, 0)
      .lineTo(Math.cos(a) * d, Math.sin(a) * d)
      .stroke({ width: r * 0.9, color: 0xffffff, cap: 'round' });
  }
  for (let i = 0; i < 6; i++) {
    const a = i * 1.7;
    g.circle(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05, R * 0.06).fill(0xffffff);
  }
  return g;
}

function bat(up: boolean): Graphics {
  const g = new Graphics();
  const c = 0x0a0510;
  frame(g, 34);
  const wy = up ? -18 : 10;
  for (const side of [-1, 1]) {
    g.poly([
      side * 4, -2,
      side * 16, wy - 2,
      side * 30, wy + 2,
      side * 24, wy + 6,
      side * 20, wy + 4,
      side * 15, wy + 9,
      side * 10, wy + 6,
      side * 4, 4,
    ]).fill(c);
  }
  g.ellipse(0, 0, 6, 8).fill(c);
  g.poly([-5, -6, -3, -12, -1, -6]).fill(c);
  g.poly([5, -6, 3, -12, 1, -6]).fill(c);
  g.circle(-2, -2, 1).fill(0xff4d4d);
  g.circle(2, -2, 1).fill(0xff4d4d);
  return g;
}

export function makeTextures(renderer: Renderer, resolution: number): PatchTextures {
  const bake = (g: Graphics) => {
    const texture = renderer.generateTexture({ target: g, resolution, antialias: true });
    g.destroy();
    return texture;
  };
  const textures = {
    pumpkins: [0, 1, 2].map((face) => bake(pumpkin(ORANGE, face as 0 | 1 | 2))),
    golden: bake(pumpkin(GOLD, 0)),
    skull: bake(skull()),
    flame: bake(flame()),
    glow: bake(glow()),
    seed: bake(new Graphics().ellipse(0, 0, 3, 5.5).fill(0xfef3c7)),
    goo: bake(new Graphics().circle(0, 0, 6).fill(0xffffff)),
    bone: bake(new Graphics().poly([-5, -3, 4, -5, 6, 2, -2, 5, -6, 1]).fill(0xe7e2d6)),
    splat: bake(splat()),
    bat: [bake(bat(true)), bake(bat(false))] as [Texture, Texture],
  };
  return {
    ...textures,
    destroy() {
      const all = [...textures.pumpkins, textures.golden, textures.skull, textures.flame, textures.glow, textures.seed, textures.goo, textures.bone, textures.splat, ...textures.bat];
      for (const t of all) {
        t.destroy(true);
      }
    },
  };
}

/** The left and right halves of an item texture, sharing its source. */
export function halves(texture: Texture): [Texture, Texture] {
  const f = texture.frame;
  const w = f.width / 2;
  return [
    new Texture({ source: texture.source, frame: new Rectangle(f.x, f.y, w, f.height) }),
    new Texture({ source: texture.source, frame: new Rectangle(f.x + w, f.y, w, f.height) }),
  ];
}


const SKY: [number, number][] = [
  [0, 0x07030f],
  [0.45, 0x1f0b31],
  [0.75, 0x45193f],
  [1, 0x6e2a2f],
];

function mix(a: number, b: number, t: number) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function skyColor(t: number) {
  for (let i = 1; i < SKY.length; i++) {
    if (t <= SKY[i][0]) {
      const [t0, c0] = SKY[i - 1];
      const [t1, c1] = SKY[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return SKY[SKY.length - 1][1];
}

/** A deterministic pseudo-random sequence, so resizes redraw the same patch. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface MoonSpot {
  x: number;
  y: number;
  r: number;
}

/**
 * Sky, stars and moon into `sky`; far hills dotted with distant lanterns
 * into `hills`; the crooked fence and vines into `fence`. Returns where the
 * moon is, for its glow sprite.
 */
export function drawBackdrop(sky: Graphics, hills: Graphics, fence: Graphics, w: number, h: number): MoonSpot {
  const random = seeded(1031);
  sky.clear();
  hills.clear();
  fence.clear();

  // Sky in thin bands (smooth enough at this darkness, and no gradient texture needed).
  const bands = 72;
  const skyH = h * 0.8;
  for (let i = 0; i < bands; i++) {
    sky.rect(0, (i * skyH) / bands, w, skyH / bands + 1).fill(skyColor(i / (bands - 1)));
  }
  sky.rect(0, skyH, w, h - skyH).fill(SKY[SKY.length - 1][1]);

  for (let i = 0; i < 90; i++) {
    const y = random() * h * 0.55;
    sky.circle(random() * w, y, 0.4 + random() * 1.1).fill({ color: 0xfff7e6, alpha: 0.25 + random() * 0.6 * (1 - y / (h * 0.55)) });
  }

  // A low harvest moon.
  const moon = { x: w * 0.72, y: h * 0.2, r: Math.min(w, h) * 0.13 };
  sky.circle(moon.x, moon.y, moon.r).fill(0xf3dfae);
  sky.circle(moon.x + moon.r * 0.15, moon.y + moon.r * 0.1, moon.r * 0.92).fill({ color: 0xe9c98a, alpha: 0.5 });
  for (const [dx, dy, r] of [
    [-0.35, -0.2, 0.18],
    [0.25, 0.3, 0.14],
    [0.4, -0.35, 0.09],
    [-0.1, 0.45, 0.1],
    [-0.5, 0.2, 0.07],
  ]) {
    sky.circle(moon.x + dx * moon.r, moon.y + dy * moon.r, r * moon.r).fill({ color: 0xc9a66b, alpha: 0.45 });
  }

  // Far hills, then a nearer ridge.
  const ridge = (base: number, amp: number, phase: number, color: number) => {
    const points: number[] = [0, h];
    for (let x = 0; x <= w + 8; x += 8) {
      const y = base + Math.sin(x * 0.006 + phase) * amp + Math.sin(x * 0.017 + phase * 2) * amp * 0.35;
      points.push(x, y);
    }
    points.push(w + 8, h);
    hills.poly(points).fill(color);
  };
  ridge(h * 0.62, h * 0.035, 1.3, 0x1b0b28);
  // Distant jack-o'-lanterns on the far ridge.
  for (let i = 0; i < 14; i++) {
    const x = random() * w;
    const y = h * 0.62 + Math.sin(x * 0.006 + 1.3) * h * 0.035 + Math.sin(x * 0.017 + 2.6) * h * 0.012 + 4 + random() * h * 0.05;
    hills.circle(x, y, 4 + random() * 3).fill({ color: 0xfb923c, alpha: 0.12 });
    hills.circle(x, y, 1.6 + random()).fill({ color: 0xffb35c, alpha: 0.85 });
  }
  ridge(h * 0.72, h * 0.03, 4.1, 0x12071c);
  hills.rect(0, h * 0.8, w, h * 0.2).fill(0x0b0412);

  // The crooked fence along the near ridge.
  const fenceY = h * 0.76;
  const posts = Math.ceil(w / 26) + 1;
  const tops: { x: number; y: number }[] = [];
  for (let i = 0; i < posts; i++) {
    const x = i * 26 + random() * 6;
    const tilt = (random() - 0.5) * 0.22;
    const height = h * (0.07 + random() * 0.035);
    const topX = x + Math.sin(tilt) * height;
    const topY = fenceY - height;
    fence.poly([x - 3, fenceY + 8, x + 3, fenceY + 8, topX + 3, topY + 4, topX, topY - 3, topX - 3, topY + 4]).fill(0x060209);
    tops.push({ x: topX, y: topY });
  }
  for (const k of [0.3, 0.7]) {
    fence.moveTo(0, fenceY - h * 0.08 * (1 - k));
    for (let i = 0; i < tops.length; i++) {
      const p = tops[i];
      fence.lineTo(p.x, fenceY + (p.y - fenceY) * k + Math.sin(i * 1.7) * 2);
    }
    fence.stroke({ width: 4, color: 0x060209 });
  }

  // Curling vines with leaves.
  for (let v = 0; v < 5; v++) {
    let x = random() * w;
    let y = fenceY + 6;
    fence.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      const nx = x + (random() - 0.5) * 70;
      const ny = y - 10 - random() * 22;
      fence.quadraticCurveTo(x + (random() - 0.5) * 50, (y + ny) / 2, nx, ny);
      x = nx;
      y = ny;
    }
    fence.stroke({ width: 2.5, color: 0x0d1608 });
  }
  for (let i = 0; i < 26; i++) {
    const x = random() * w;
    const y = fenceY - random() * h * 0.08;
    fence.ellipse(x, y, 5 + random() * 4, 3 + random() * 2).fill(0x0d1608);
  }
  fence.rect(0, fenceY + 6, w, h - fenceY).fill(0x0a0410);

  return moon;
}
