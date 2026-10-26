import * as THREE from '@nativescript/canvas-three';

/**
 * The corridor's surfaces, painted pixel by pixel into DataTextures: no
 * image files, and no 2D canvas in between. Every texture tiles, so the
 * corridor can run forever.
 */

type Paint = (u: number, v: number, out: number[]) => void;

/** Fills a w×h RGBA texture; `paint` gets u, v in 0..1 (v = 0 is the bottom) and writes [r, g, b, a] 0..1. */
function paint(width: number, height: number, fn: Paint, srgb = true): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const out = [0, 0, 0, 1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[3] = 1;
      fn((x + 0.5) / width, (y + 0.5) / height, out);
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, out[0] * 255));
      data[i + 1] = Math.max(0, Math.min(255, out[1] * 255));
      data[i + 2] = Math.max(0, Math.min(255, out[2] * 255));
      data[i + 3] = Math.max(0, Math.min(255, out[3] * 255));
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  if (srgb) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}


function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise that wraps every `px` × `py` lattice cells, so textures tile. */
function noise(x: number, y: number, px: number, py: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const w = (n: number, p: number) => ((n % p) + p) % p;
  const a = hash(w(ix, px), w(iy, py));
  const b = hash(w(ix + 1, px), w(iy, py));
  const c = hash(w(ix, px), w(iy + 1, py));
  const d = hash(w(ix + 1, px), w(iy + 1, py));
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Tileable fractal noise over u, v in 0..1, `cells` lattice cells across at the first octave. */
function fbm(u: number, v: number, cx: number, cy: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let fx = cx;
  let fy = cy;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(u * fx, v * fy, fx, fy);
    fx *= 2;
    fy *= 2;
    amp *= 0.5;
  }
  return sum;
}

const step = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixColor(out: number[], a: readonly number[], b: readonly number[], t: number) {
  out[0] = mix(a[0], b[0], t);
  out[1] = mix(a[1], b[1], t);
  out[2] = mix(a[2], b[2], t);
}

const rgb = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255] as const;


/** Tile size of the wall texture along the corridor, in metres. */
export const WALL_TILE = 1.5;
/** Tile size of the floor and ceiling textures, in metres. */
export const FLOOR_TILE = 3;

const PAPER = rgb(0x3b1218);
const PAPER_INK = rgb(0x7a5530);
const WOOD_DARK = rgb(0x1c0f08);
const WOOD = rgb(0x3d2414);
const WOOD_LIGHT = rgb(0x5a3820);

/**
 * One wall tile, 1.5 m along the corridor by the full 3 m height: baseboard,
 * wainscot panels, a chair rail, then faded oxblood damask with water stains
 * creeping down from the crown molding.
 */
export function wallTexture(): THREE.DataTexture {
  return paint(128, 256, (u, v, out) => {
    const grime = fbm(u, v, 4, 8);
    if (v < 0.035) {
      // Baseboard.
      mixColor(out, WOOD_DARK, WOOD, 0.25 + grime * 0.3);
    } else if (v < 0.31) {
      // Wainscot: two raised panels per tile.
      const pu = (u * 2) % 1;
      const pv = (v - 0.035) / (0.31 - 0.035);
      const edge = Math.min(pu, 1 - pu, pv * 2.2, (1 - pv) * 2.2);
      const grain = noise(u * 6, v * 90, 6, 90) * 0.5 + fbm(u, v, 8, 2, 3) * 0.5;
      mixColor(out, WOOD, WOOD_LIGHT, grain * 0.6);
      if (edge < 0.06) {
        // The groove around each panel, lit from above.
        const shade = edge < 0.03 ? 0.45 : 1.25;
        out[0] *= shade;
        out[1] *= shade;
        out[2] *= shade;
      }
    } else if (v < 0.335) {
      // Chair rail.
      const bevel = Math.sin(((v - 0.31) / 0.025) * Math.PI);
      mixColor(out, WOOD, WOOD_LIGHT, 0.3 + bevel * 0.6);
    } else if (v > 0.965) {
      // Crown molding.
      mixColor(out, WOOD_DARK, WOOD, 0.3 + Math.sin(((v - 0.965) / 0.035) * Math.PI * 2) * 0.3);
    } else {
      // Damask: a mirrored motif on an offset lattice, four across a tile.
      const gx = u * 4;
      const gy = ((v - 0.335) / 0.63) * 6;
      const row = Math.floor(gy);
      const cx = (gx + (row % 2) * 0.5) % 1;
      const cy = gy - row;
      const ax = Math.abs(cx - 0.5) * 2;
      const ay = cy - 0.5;
      const e = Math.sqrt((ax / 0.62) ** 2 + (ay / 0.4) ** 2);
      const petal = 1 + 0.2 * Math.cos(Math.atan2(ay, ax) * 6);
      const body = step(1.0 * petal, 0.9 * petal, e);
      const hole = step(0.56, 0.48, e);
      const bud = step(0.2, 0.12, e);
      const lattice = step(0.035, 0, Math.abs(ax * 0.5 + Math.abs(ay) - 0.5));
      const motif = Math.min(1, body - hole * 0.75 + bud + lattice * 0.6);
      const stripe = 0.92 + 0.08 * Math.cos(u * Math.PI * 16);
      mixColor(out, PAPER, PAPER_INK, motif * 0.55 * (0.7 + grime * 0.6));
      // Water damage: darker tide marks running down from the ceiling.
      const stain = step(0.55, 0.75, fbm(u, v * 0.6, 3, 3) + (v - 0.6) * 0.9);
      const fade = stripe * (0.75 + grime * 0.45) * (1 - stain * 0.55);
      out[0] *= fade;
      out[1] *= fade * (1 - stain * 0.1);
      out[2] *= fade;
    }
  });
}

/**
 * The floor, 3 m across by 3 m along: a worn red runner with gold borders
 * down the middle, and dark floorboards either side.
 */
export function floorTexture(): THREE.DataTexture {
  const RUNNER = rgb(0x4a0d12);
  const RUNNER_DARK = rgb(0x24060a);
  const GOLD = rgb(0x8a6a2a);
  return paint(256, 256, (u, v, out) => {
    const wear = fbm(u, v, 6, 6);
    const half = Math.abs(u - 0.5);
    if (half < 0.22) {
      // Runner: diamonds between two gold borders, worn pale down the middle.
      if (half > 0.19 && half < 0.205) {
        mixColor(out, GOLD, RUNNER_DARK, wear * 0.5);
      } else {
        const dx = (half / 0.19) * 2;
        const dy = ((v * 6) % 1) * 2 - 1;
        const diamond = step(0.06, 0.0, Math.abs(Math.abs(dx - 1) + Math.abs(dy) - 0.7));
        mixColor(out, RUNNER_DARK, RUNNER, 0.5 + wear * 0.5);
        if (diamond > 0) {
          mixColor(out, out, GOLD, diamond * 0.45);
        }
        const trodden = step(0.12, 0, half) * 0.25;
        out[0] += trodden * 0.08;
        out[1] += trodden * 0.05;
        out[2] += trodden * 0.05;
      }
    } else {
      // Boards 15 cm wide running along the corridor, joints staggered.
      const board = Math.floor(u * 20);
      const along = (v * 2 + hash(board, 3)) % 1;
      const tone = hash(board, 7);
      const grain = noise(u * 160, v * 6, 160, 6) * 0.35 + noise(u * 40, v * 24, 40, 24) * 0.25;
      mixColor(out, WOOD_DARK, WOOD, 0.35 + tone * 0.4 + grain);
      const seam = Math.min((u * 20) % 1, 1 - ((u * 20) % 1));
      const joint = Math.min(along, 1 - along);
      const dark = seam < 0.06 || joint < 0.008 ? 0.35 : 1;
      out[0] *= dark;
      out[1] *= dark;
      out[2] *= dark;
    }
  });
}

/** The ceiling, 3 m by 3 m: cracked, smoke-stained plaster between two beams. */
export function ceilingTexture(): THREE.DataTexture {
  const PLASTER = rgb(0x4a4238);
  const SOOT = rgb(0x15110d);
  return paint(128, 128, (u, v, out) => {
    const stain = fbm(u, v, 4, 4);
    const crack = step(0.02, 0, Math.abs(fbm(u, v, 8, 8, 3) - 0.5));
    mixColor(out, SOOT, PLASTER, 0.35 + stain * 0.6 - crack * 0.4);
    const beam = Math.min((v * 2) % 1, 1 - ((v * 2) % 1));
    if (beam < 0.07) {
      mixColor(out, WOOD_DARK, WOOD, noise(u * 30, v * 4, 30, 4) * 0.4);
    }
  });
}

/** Dark wood for doors, with two sunken panels. */
export function doorTexture(): THREE.DataTexture {
  return paint(64, 128, (u, v, out) => {
    const grain = noise(u * 8, v * 70, 8, 70) * 0.45;
    mixColor(out, WOOD_DARK, WOOD, 0.3 + grain);
    const inPanel = (pu: number, pv: number, w: number, h: number) =>
      Math.min(pu, w - pu, pv, h - pv);
    const top = inPanel(u - 0.15, v - 0.55, 0.7, 0.35);
    const bottom = inPanel(u - 0.15, v - 0.1, 0.7, 0.35);
    const edge = Math.max(top, bottom);
    if (edge > 0 && edge < 0.035) {
      out[0] *= 0.45;
      out[1] *= 0.45;
      out[2] *= 0.45;
    }
  });
}

/**
 * A portrait in oils: a pale sitter against a murky ground. The eye sockets
 * are left for the pupils (separate meshes) to sit in. `variant` changes the
 * hair and clothes.
 */
export function portraitTexture(variant: number): THREE.DataTexture {
  const GROUND = rgb(variant ? 0x18200f : 0x101420);
  const SKIN = rgb(0xb8a68a);
  const HAIR = rgb(variant ? 0x2a1a10 : 0x0d0b0a);
  const CLOTH = rgb(variant ? 0x221018 : 0x0c0c12);
  return paint(128, 160, (u, v, out) => {
    const x = u - 0.5;
    const y = v;
    const murk = fbm(u, v, 3, 4);
    mixColor(out, GROUND, [GROUND[0] * 2, GROUND[1] * 2, GROUND[2] * 2], murk * 0.6);
    // Shoulders.
    const shoulders = step(0.02, 0, (x * x) / 0.16 + ((y - 0.02) * (y - 0.02)) / 0.12 - 1);
    if (y < 0.38 && shoulders > 0) {
      mixColor(out, out, CLOTH, shoulders);
    }
    // Neck and face.
    const face = (x * x) / (0.155 * 0.155) + ((y - 0.6) * (y - 0.6)) / (0.2 * 0.2);
    const neck = Math.abs(x) < 0.07 && y > 0.33 && y < 0.48;
    if (face < 1 || neck) {
      const shade = 0.55 + 0.45 * (1 - face) - x * 0.6;
      mixColor(out, out, [SKIN[0] * shade, SKIN[1] * shade, SKIN[2] * shade], face < 1 ? step(1, 0.85, face) : 1);
      // Sunken sockets where the pupils go.
      for (const ex of [-0.065, 0.065]) {
        const d = ((x - ex) * (x - ex)) / (0.045 * 0.045) + ((y - 0.63) * (y - 0.63)) / (0.022 * 0.022);
        if (d < 1) {
          mixColor(out, out, [0.82, 0.78, 0.66], step(1, 0.6, d));
        } else if (d < 2.4) {
          out[0] *= 0.7;
          out[1] *= 0.66;
          out[2] *= 0.66;
        }
      }
      // A thin, unsmiling mouth.
      if (Math.abs(y - 0.5) < 0.008 && Math.abs(x) < 0.05) {
        out[0] *= 0.5;
        out[1] *= 0.4;
        out[2] *= 0.4;
      }
    }
    // Hair.
    const hair = (x * x) / (0.19 * 0.19) + ((y - 0.66) * (y - 0.66)) / (0.25 * 0.25);
    const hairline = variant ? y > 0.66 + Math.abs(x) * 0.5 : y > 0.7 - Math.abs(x) * 0.2;
    if (hair < 1 && (hairline || face >= 1)) {
      mixColor(out, out, HAIR, step(1, 0.8, hair));
    }
    // Varnish: crackle and a dark vignette.
    const vignette = 1 - Math.min(1, (x * x + (y - 0.55) * (y - 0.55)) * 2.2);
    const crackle = 1 - step(0.015, 0, Math.abs(noise(u * 24, v * 30, 24, 30) - 0.5)) * 0.35;
    out[0] *= vignette * crackle * 1.05;
    out[1] *= vignette * crackle;
    out[2] *= vignette * crackle * 0.85;
  });
}

/** A soft white dot fading to nothing: glows, halos and ectoplasm. */
export function glowTexture(): THREE.DataTexture {
  return paint(
    64,
    64,
    (u, v, out) => {
      const d = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
      const a = Math.pow(1 - d, 2.2);
      out[0] = 1;
      out[1] = 1;
      out[2] = 1;
      out[3] = a;
    },
    false,
  );
}
