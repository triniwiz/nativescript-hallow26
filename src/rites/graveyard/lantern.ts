import type {
  CanvasRenderingContext2D,
  OffscreenCanvas as OffscreenCanvasClass,
} from '@nativescript/canvas';
import { capResolution } from '../../canvas/resolution';
import { sfx, type Heartbeat, type Loop } from '../../core/audio';
import { CANVAS_FONTS } from '../../core/fonts';
import { haptic, lightningTorch } from '../../core/native';
import type { GameFactory, GameInstance } from '../../game/types';
import { approach, clamp, pick, rand, starsFor } from '../../game/util';

declare const OffscreenCanvas: typeof OffscreenCanvasClass;

/**
 * Rite I, The Graveyard, in plain Canvas 2D.
 *
 * The light is built with compositing on one canvas each frame:
 *   1. clear to transparent and paint the light (lantern pool, torch beam,
 *      lightning) as alpha, from textures painted once per pixel;
 *   2. `source-in` the lit graveyard: it shows only where light falls;
 *   3. `source-atop` the ghosts: they exist only in the light too;
 *   4. `destination-over` the moonlit graveyard behind everything;
 *   5. `lighter` / `source-over` for what shows in the dark: auras, eyes,
 *      ectoplasm, dust in the beam, mist and the frame effects.
 * Both graveyards are painted once into OffscreenCanvases at the canvas'
 * resolution, so a frame is a handful of full-screen drawImage calls.
 */

const DURATION = 75;
const MAX_LIVES = 3;
/** Half the beam's burning width, in radians. The beam texture fades past it. */
const BEAM_HALF_ANGLE = 0.3;
const DRAIN = 0.13;
const RECHARGE = 0.085;
const REVIVE_AT = 0.3;
const RISE_TIME = 1.1;
const DIE_TIME = 0.6;
/** The beam texture: its length, and half its width at the far end, in px. */
const COOKIE_LENGTH = 512;
const COOKIE_HALF = 300;

type Kind = 'wisp' | 'wraith' | 'mourner' | 'banshee';

const KINDS: Record<Kind, { radius: number; hp: number; speed: number; points: number; hue: number; light: number }> = {
  wisp: { radius: 20, hp: 0.75, speed: 30, points: 10, hue: 150, light: 88 },
  wraith: { radius: 17, hp: 0.5, speed: 58, points: 15, hue: 190, light: 90 },
  mourner: { radius: 24, hp: 1.9, speed: 46, points: 30, hue: 260, light: 72 },
  banshee: { radius: 28, hp: 1.6, speed: 24, points: 40, hue: 320, light: 86 },
};

type GhostState = 'rising' | 'hunting' | 'dying';

interface Ghost {
  kind: Kind;
  state: GhostState;
  /** Seconds in the current state. */
  t: number;
  x: number;
  y: number;
  /** Smoothed velocity, for leaning into the motion. */
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: number;
  /** How hard the beam is burning it this frame, 0..1+. */
  burning: number;
  /** 0..1: fades in when it drifts in from the edge. */
  presence: number;
  screamed: boolean;
  frozen: boolean;
  /** Mourners move in jumps: time to the next one. */
  hop: number;
  /** Recent positions, for afterimages. */
  trail: { x: number; y: number }[];
  trailTimer: number;
  moteTimer: number;
  /** Set once it reaches the keeper, so dying doesn't score it. */
  struck: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  sprite: number;
  /** Turns its velocity this many radians a second: banished souls spiral up. */
  swirl: number;
  /** Downward pull, for clods of earth. */
  gravity: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
}

const angleDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const lantern: GameFactory = (hooks) => (canvas, size) => {
  const ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
  let { width, height } = size;
  // Dark and foggy: a low density is plenty, and the full-screen compositing
  // below costs per pixel.
  const DENSITY = 1;
  const scale = capResolution(canvas, size, DENSITY);

  let litLayer: OffscreenCanvasClass | null = null;
  let darkLayer: OffscreenCanvasClass | null = null;
  let vignette: OffscreenCanvasClass | null = null;
  /** The red that bleeds in from the edges when a ghost reaches you. */
  let wound: OffscreenCanvasClass | null = null;
  /** Where the headstones stand: ghosts rise out of them. */
  let graves: { x: number; y: number }[] = [];

  function glowSprite(hue: number, sat = 100, lightness = 70) {
    const n = 64;
    const sprite = new OffscreenCanvas(n, n);
    const g = sprite.getContext('2d') as CanvasRenderingContext2D;
    const gradient = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gradient.addColorStop(0, `hsla(${hue}, ${sat}%, 96%, 1)`);
    gradient.addColorStop(0.2, `hsla(${hue}, ${sat}%, ${lightness}%, 0.8)`);
    gradient.addColorStop(0.5, `hsla(${hue}, ${sat}%, ${lightness - 15}%, 0.2)`);
    gradient.addColorStop(1, `hsla(${hue}, ${sat}%, 50%, 0)`);
    g.fillStyle = gradient;
    g.fillRect(0, 0, n, n);
    return sprite;
  }
  // Embers, the four ghost colours, a red eye glint, and earth.
  const sprites = [
    glowSprite(30),
    glowSprite(150),
    glowSprite(190),
    glowSprite(260, 70),
    glowSprite(320),
    glowSprite(0),
    glowSprite(28, 40, 30),
  ];
  const EMBER = 0;
  const EYE = 5;
  const EARTH = 6;
  const spriteFor: Record<Kind, number> = { wisp: 1, wraith: 2, mourner: 3, banshee: 4 };

  function mistSprite() {
    const n = 256;
    const sprite = new OffscreenCanvas(n, n);
    const g = sprite.getContext('2d') as CanvasRenderingContext2D;
    for (let i = 0; i < 26; i++) {
      const x = n / 2 + rand(-60, 60);
      const y = n / 2 + rand(-60, 60);
      const r = rand(30, 70);
      const gradient = g.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(170, 165, 200, 0.12)');
      gradient.addColorStop(1, 'rgba(170, 165, 200, 0)');
      g.fillStyle = gradient;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return sprite;
  }
  const mist = mistSprite();

  /**
   * Paints a light texture pixel by pixel: `alpha(x, y)` is 0..1, and the
   * colour is white, since the light only masks. Gradients can't make a
   * torch's shape (a hot spot, a soft cone, rings from the reflector).
   */
  function lightTexture(w: number, h: number, alpha: (x: number, y: number) => number) {
    const texture = new OffscreenCanvas(w, h);
    const g = texture.getContext('2d') as CanvasRenderingContext2D;
    const image = g.createImageData(w, h);
    const data = image.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(clamp(alpha(x, y)) * 255);
      }
    }
    g.putImageData(image, 0, 0);
    return texture;
  }

  /** The torch beam, pointing right from the middle of its left edge. */
  const beamCookie = lightTexture(COOKIE_LENGTH, COOKIE_HALF * 2, (x, y) => {
    const dy = y - COOKIE_HALF;
    const r = Math.hypot(x, dy) / COOKIE_LENGTH;
    if (r >= 1) {
      return 0;
    }
    const theta = Math.atan2(dy, x);
    // A soft cone, a wide faint spill around it, and a hot spot down the middle.
    const cone = Math.exp(-Math.pow(theta / 0.28, 2));
    const spill = 0.18 * Math.exp(-Math.pow(theta / 0.55, 2));
    const hotspot = 0.45 * Math.exp(-Math.pow(theta / 0.08, 2)) * Math.exp(-Math.pow((r - 0.3) / 0.25, 2));
    // Faint rings from the reflector, fading with distance; dimmer far away.
    const rings = 1 + 0.07 * Math.sin(r * 46) * (1 - r);
    const falloff = Math.pow(1 - r, 1.3) * clamp(r / 0.04);
    return (cone + spill + hotspot) * rings * falloff;
  });

  /** The lantern's pool of light: bright, then a long soft edge. */
  const pool = lightTexture(256, 256, (x, y) => {
    const r = Math.hypot(x - 128, y - 128) / 128;
    return r >= 1 ? 0 : Math.pow(1 - r * r, 2.2);
  });

  /** The graveyard by torchlight: grass, a path, headstones, crosses, leaves. */
  function paintGraveyard() {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const lit = new OffscreenCanvas(w, h);
    const g = lit.getContext('2d') as CanvasRenderingContext2D;
    g.setTransform(scale, 0, 0, scale, 0, 0);

    g.fillStyle = '#1f2a1c';
    g.fillRect(0, 0, width, height);
    // Grass: thousands of little strokes in mossy greens and browns.
    const blades = Math.min(9000, Math.round(width * height * 0.03));
    for (let i = 0; i < blades; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const hue = rand(70, 115);
      g.fillStyle = `hsla(${hue}, ${rand(18, 40)}%, ${rand(12, 30)}%, 0.6)`;
      g.fillRect(x, y, rand(1, 2.2), rand(2, 5));
    }
    // A winding dirt path past the middle.
    g.strokeStyle = 'rgba(70, 54, 40, 0.85)';
    g.lineWidth = 46;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(width * 0.2, -40);
    g.bezierCurveTo(width * 0.75, height * 0.3, width * 0.1, height * 0.62, width * 0.62, height + 40);
    g.stroke();
    g.strokeStyle = 'rgba(95, 76, 58, 0.5)';
    g.lineWidth = 30;
    g.stroke();
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${rand(60, 120)}, ${rand(50, 90)}, ${rand(40, 70)}, 0.5)`;
      const t = Math.random();
      const x = width * (0.2 + 0.4 * t) + rand(-30, 30) + Math.sin(t * 6) * width * 0.18;
      g.fillRect(x, t * height, rand(1, 3), rand(1, 3));
    }

    // Headstones, kept clear of the keeper in the middle.
    graves = [];
    const count = Math.round((width * height) / 8500);
    for (let i = 0; i < count; i++) {
      const x = rand(10, width - 10);
      const y = rand(20, height - 10);
      if (Math.hypot(x - player.x, y - player.y) < 90) {
        continue;
      }
      graves.push({ x, y });
      const sw = rand(20, 32);
      const sh = rand(26, 42);
      g.save();
      g.translate(x, y);
      g.rotate(rand(-0.12, 0.12));
      // Shadow toward the moon's opposite side.
      g.fillStyle = 'rgba(0, 0, 0, 0.45)';
      g.beginPath();
      g.ellipse(6, 4, sw * 0.7, sh * 0.22, 0.2, 0, Math.PI * 2);
      g.fill();
      // A sunken mound of earth in front of the stone.
      g.fillStyle = 'rgba(52, 40, 30, 0.75)';
      g.beginPath();
      g.ellipse(0, 9, sw * 0.6, 7, 0, 0, Math.PI * 2);
      g.fill();
      const stone = g.createLinearGradient(-sw / 2, -sh, sw / 2, 0);
      const tone = rand(85, 125);
      stone.addColorStop(0, `rgb(${tone + 25}, ${tone + 22}, ${tone + 30})`);
      stone.addColorStop(1, `rgb(${tone - 40}, ${tone - 40}, ${tone - 30})`);
      g.fillStyle = stone;
      const cross = Math.random() < 0.22;
      g.beginPath();
      if (cross) {
        g.rect(-3.5, -sh, 7, sh);
        g.rect(-sw / 2.4, -sh * 0.78, (sw / 2.4) * 2, 7);
      } else {
        g.moveTo(-sw / 2, 0);
        g.lineTo(-sw / 2, -sh + sw / 2);
        g.arc(0, -sh + sw / 2, sw / 2, Math.PI, 0);
        g.lineTo(sw / 2, 0);
        g.closePath();
      }
      g.fill();
      if (!cross) {
        // Worn inscription, a crack, and moss.
        g.strokeStyle = 'rgba(30, 28, 36, 0.55)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(-sw * 0.25, -sh * 0.62);
        g.lineTo(sw * 0.25, -sh * 0.62);
        g.moveTo(-sw * 0.3, -sh * 0.47);
        g.lineTo(sw * 0.3, -sh * 0.47);
        g.moveTo(-sw * 0.2, -sh * 0.34);
        g.lineTo(sw * 0.2, -sh * 0.34);
        g.stroke();
        if (Math.random() < 0.5) {
          g.strokeStyle = 'rgba(15, 12, 18, 0.8)';
          g.beginPath();
          g.moveTo(rand(-sw / 3, sw / 3), -sh + 4);
          g.lineTo(rand(-sw / 4, sw / 4), -sh * 0.6);
          g.lineTo(rand(-sw / 3, sw / 3), -sh * 0.3);
          g.stroke();
        }
      }
      for (let m = 0; m < 14; m++) {
        g.fillStyle = `hsla(${rand(80, 110)}, 40%, ${rand(20, 35)}%, 0.8)`;
        g.fillRect(rand(-sw / 2, sw / 2), rand(-sh * 0.25, 0), rand(1, 3), rand(1, 3));
      }
      g.restore();
    }

    // Fallen leaves.
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `hsla(${rand(10, 40)}, 70%, ${rand(22, 38)}%, 0.85)`;
      g.save();
      g.translate(Math.random() * width, Math.random() * height);
      g.rotate(Math.random() * Math.PI);
      g.beginPath();
      g.ellipse(0, 0, rand(2, 4), rand(1, 2), 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // The same graveyard by moonlight: cold, dark, nearly black.
    const dark = new OffscreenCanvas(w, h);
    const d = dark.getContext('2d') as CanvasRenderingContext2D;
    d.drawImage(lit, 0, 0);
    d.globalCompositeOperation = 'multiply';
    d.fillStyle = '#1c2340';
    d.fillRect(0, 0, w, h);
    d.globalCompositeOperation = 'source-over';
    d.fillStyle = 'rgba(2, 2, 8, 0.55)';
    d.fillRect(0, 0, w, h);

    litLayer = lit;
    darkLayer = dark;
    const edge = (color: string) => {
      const layer = new OffscreenCanvas(w, h);
      const c = layer.getContext('2d') as CanvasRenderingContext2D;
      c.setTransform(scale, 0, 0, scale, 0, 0);
      const gradient = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, color);
      c.fillStyle = gradient;
      c.fillRect(0, 0, width, height);
      return layer;
    };
    vignette = edge('rgba(0,0,0,0.55)');
    wound = edge('rgba(150, 10, 10, 0.85)');
  }

  const player = { x: width / 2, y: height * 0.56 };
  let aim = -Math.PI / 2;
  let targetAim = aim;
  let aiming = false;
  let battery = 1;
  let dead = false;
  let flicker = 1;

  let ghosts: Ghost[] = [];
  const particles: Particle[] = [];
  const popups: Popup[] = [];
  const mists = Array.from({ length: 4 }, () => ({ x: rand(0, 1), y: rand(0, 1), s: rand(0.8, 1.4), v: rand(4, 10) }));
  // Dust hanging in the air: only the light shows it.
  const dust = Array.from({ length: 40 }, () => ({ x: rand(0, 1), y: rand(0, 1), phase: rand(0, 6.28), size: rand(0.8, 2.2) }));

  let started = false;
  let paused = false;
  let over = false;
  let endIn = -1;
  let won = false;

  let clock = DURATION;
  let spawnIn = 1.5;
  let lives = MAX_LIVES;
  let invulnerable = 0;
  let hurt = 0;
  let lightning = 0;
  let nextStrike = rand(5, 9);
  let strikes = 0;

  let score = 0;
  let banished = 0;
  let chain = 0;
  let chainTimer = 0;
  let bestChain = 0;
  let wave = 0;
  let bannerTimer = 0;
  let hudTimer = 0;
  let heartTimer = 0;

  const wind: Loop = sfx.wind(0.35);
  const rain: Loop = sfx.rain(0.22);
  let drone: Loop | null = null;
  const sizzle: Loop = sfx.sizzle(0.4);
  const heart: Heartbeat = sfx.heartbeat();

  paintGraveyard();
  hooks.hud({ score: 0, lives, maxLives: MAX_LIVES, time: DURATION, totalTime: DURATION, meter: 1, meterLabel: 'Battery' });

  function emit(p: Partial<Particle> & { x: number; y: number }) {
    if (particles.length >= 260) {
      return;
    }
    particles.push({ vx: 0, vy: 0, life: 0, max: 1, size: 6, sprite: EMBER, swirl: 0, gravity: 0, ...p });
  }

  function spawn() {
    const elapsed = DURATION - clock;
    const kinds: Kind[] = ['wisp', 'wisp'];
    if (elapsed > 12) kinds.push('wraith', 'wraith');
    if (elapsed > 26) kinds.push('mourner');
    if (elapsed > 42) kinds.push('banshee', 'wraith');
    const kind = pick(kinds);
    const spec = KINDS[kind];
    const ghost: Ghost = {
      kind,
      state: 'hunting',
      t: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: spec.hp,
      maxHp: spec.hp,
      phase: Math.random() * Math.PI * 2,
      burning: 0,
      presence: 0,
      screamed: false,
      frozen: false,
      hop: 0,
      trail: [],
      trailTimer: 0,
      moteTimer: 0,
      struck: false,
    };

    // Most rise out of a grave far enough away; the rest drift in from the dark.
    const near = Math.max(170, Math.min(320, Math.min(width, height) * 0.42));
    const candidates = graves.filter((g) => Math.hypot(g.x - player.x, g.y - player.y) > near);
    if (candidates.length && Math.random() < 0.7) {
      const grave = pick(candidates);
      ghost.x = grave.x;
      ghost.y = grave.y + 8;
      ghost.state = 'rising';
      ghost.presence = 1;
      for (let i = 0; i < 14; i++) {
        emit({ x: ghost.x + rand(-10, 10), y: ghost.y, vx: rand(-50, 50), vy: rand(-110, -40), max: rand(0.5, 0.9), size: rand(2, 5), sprite: EARTH, gravity: 260 });
      }
      sfx.grind(clamp((ghost.x - width / 2) / (width / 2), -1, 1), 0.35);
    } else {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.hypot(width, height) * 0.5 + 30;
      ghost.x = player.x + Math.cos(angle) * distance;
      ghost.y = player.y + Math.sin(angle) * distance;
    }
    ghosts.push(ghost);
    if (Math.random() < 0.35) {
      sfx.wail(clamp((ghost.x - width / 2) / (width / 2), -1, 1), 0.16, kind === 'banshee' ? 1.3 : 1);
    }
  }

  function banish(ghost: Ghost) {
    const spec = KINDS[ghost.kind];
    ghost.state = 'dying';
    ghost.t = 0;
    chain = chainTimer > 0 ? chain + 1 : 1;
    chainTimer = 1.6;
    bestChain = Math.max(bestChain, chain);
    const multiplier = Math.min(3, 1 + (chain - 1) * 0.25);
    const points = Math.round(spec.points * multiplier);
    score += points;
    banished++;
    popups.push({ x: ghost.x, y: ghost.y - 30, text: chain > 1 ? `+${points} ×${multiplier.toFixed(2).replace(/\.?0+$/, '')}` : `+${points}`, life: 0 });
    // The soul spirals up and away; embers fall off where it burned.
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      emit({ x: ghost.x + Math.cos(a) * spec.radius * 0.5, y: ghost.y + Math.sin(a) * spec.radius * 0.5, vx: Math.cos(a) * 40, vy: rand(-140, -60), max: rand(0.7, 1.3), size: rand(4, 10), sprite: spriteFor[ghost.kind], swirl: rand(3, 6) * (Math.random() < 0.5 ? -1 : 1) });
    }
    for (let i = 0; i < 10; i++) {
      emit({ x: ghost.x, y: ghost.y, vx: rand(-70, 70), vy: rand(-60, 30), max: rand(0.3, 0.6), size: rand(3, 6), sprite: EMBER, gravity: 120 });
    }
    const pan = clamp((ghost.x - width / 2) / (width / 2), -1, 1);
    sfx.banish(pan, 0.35);
    sfx.chime(Math.min(chain - 1, 9), pan, 0.22);
    haptic('light');
    if (chain >= 2) {
      hooks.hud({ score, banner: `${chain} in a chain!` });
      bannerTimer = 1.4;
    } else {
      hooks.hud({ score });
    }
  }

  function hit(ghost: Ghost) {
    lives--;
    invulnerable = 1.6;
    hurt = 1;
    chain = 0;
    ghost.struck = true;
    ghost.state = 'dying';
    ghost.t = 0;
    hooks.hud({ lives });
    hooks.scare(ghost.kind === 'wisp' ? 0.8 : 1);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(60, 220);
      emit({ x: ghost.x, y: ghost.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, max: rand(0.5, 1), size: rand(5, 12), sprite: spriteFor[ghost.kind] });
    }
    // The others recoil from the scream.
    for (const g of ghosts) {
      const dx = g.x - player.x;
      const dy = g.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 220 && g !== ghost) {
        g.x += (dx / d) * 120;
        g.y += (dy / d) * 120;
      }
    }
    if (lives <= 0) {
      finish(false);
    }
  }

  function strike() {
    lightning = 1;
    strikes++;
    nextStrike = rand(9, 15);
    sfx.thunder(rand(0.15, 0.6), 0.85);
    lightningTorch();
    haptic('medium');
    // The flash drives the dead back a little.
    if (started && !over) {
      for (const g of ghosts) {
        const dx = g.x - player.x;
        const dy = g.y - player.y;
        const d = Math.hypot(dx, dy) || 1;
        g.x += (dx / d) * 26;
        g.y += (dy / d) * 26;
      }
    }
  }

  function finish(win: boolean) {
    if (over) {
      return;
    }
    over = true;
    won = win;
    endIn = 1.6;
    aiming = false;
    heart.set(0, 0);
    if (win) {
      sfx.bell(0.6);
      for (const g of ghosts) {
        if (g.state !== 'dying') {
          g.state = 'dying';
          g.t = 0;
          g.struck = true;
        }
      }
    }
  }

  function report() {
    const bonus = won ? lives * 100 : 0;
    const total = score + bonus;
    hooks.end({
      won,
      score: total,
      stars: starsFor(won, total, 550, 900),
      stats: [
        { label: 'Ghosts banished', value: String(banished) },
        { label: 'Longest chain', value: String(bestChain) },
        { label: 'Candles kept', value: `${Math.max(0, lives)} of ${MAX_LIVES}` },
        { label: 'Lightning', value: `${strikes} strikes` },
      ],
      verdict: won
        ? 'The bell tolls twelve, and the dead sink back beneath the stones.'
        : 'Your light went out among the graves. Now you walk with them.',
    });
  }

  const lanternRadius = () => 78 + Math.sin(performance.now() * 0.011) * 3;
  const beamLength = () => Math.min(Math.max(width, height) * 0.62, 460);

  /** How strongly the light touches (x, y), 0..1: lantern, beam, lightning. */
  function lightAt(x: number, y: number, beamPower: number, reach: number, lampRadius: number) {
    const dx = x - player.x;
    const dy = y - player.y;
    const d = Math.hypot(dx, dy);
    let light = clamp(1 - d / (lampRadius * 1.3));
    if (beamPower > 0 && d < reach) {
      const off = Math.abs(angleDiff(Math.atan2(dy, dx), aim));
      if (off < BEAM_HALF_ANGLE * 1.5) {
        light = Math.max(light, beamPower * Math.exp(-Math.pow(off / 0.28, 2)) * (1 - d / reach) * 1.2);
      }
    }
    return Math.max(light, lightning);
  }

  function update(dt: number, time: number) {
    const s = dt / 1000;
    const lampRadius = lanternRadius();

    // Aim, battery and the flicker of a dying torch.
    if (aiming) {
      aim += angleDiff(targetAim, aim) * (1 - Math.exp(-18 * s));
    }
    const shining = aiming && !dead && !over;
    if (started && !over) {
      battery = clamp(battery + (shining ? -DRAIN : RECHARGE) * s);
      if (battery <= 0 && !dead) {
        dead = true;
        sfx.crackle(0.3);
        haptic('warning');
      } else if (dead && battery >= REVIVE_AT) {
        dead = false;
      }
    }
    flicker = battery < 0.25 && Math.random() < 0.18 ? rand(0.15, 0.7) : approach(flicker, 1, 20, dt);
    const beamPower = shining ? flicker : 0;
    const reach = beamLength();

    // Lightning.
    nextStrike -= s;
    if (nextStrike <= 0) {
      strike();
    }
    lightning = Math.max(0, lightning - s * 1.8);

    if (started && !over) {
      const before = Math.ceil(clock);
      clock -= s;
      if (clock <= 5 && Math.ceil(clock) < before && clock > 0) {
        // The last seconds before midnight.
        sfx.tock(0.55);
      }
      if (clock <= 0) {
        clock = 0;
        finish(true);
      }
      const elapsed = DURATION - clock;
      const newWave = Math.floor(elapsed / 15);
      if (newWave > wave) {
        wave = newWave;
        hooks.hud({ banner: 'The dead grow restless…' });
        bannerTimer = 2;
        sfx.wail(0, 0.22, 0.8);
      }
      spawnIn -= s;
      const maxGhosts = Math.round(4 + elapsed / 8);
      let hunting = 0;
      for (const g of ghosts) {
        if (g.state !== 'dying') {
          hunting++;
        }
      }
      if (spawnIn <= 0 && hunting < maxGhosts && clock > 3) {
        spawn();
        spawnIn = Math.max(0.65, 2.3 - elapsed / 40) * rand(0.7, 1.2);
      }
    }

    // Ghosts.
    let nearest = Infinity;
    let burningAny = 0;
    let retainedGhosts = 0;
    const elapsed = DURATION - clock;
    for (const g of ghosts) {
      const spec = KINDS[g.kind];
      g.t += s;
      g.presence = Math.min(1, g.presence + s * 0.8);

      if (g.state === 'dying') {
        g.y -= 40 * s;
        if (g.t < DIE_TIME) {
          ghosts[retainedGhosts++] = g;
        }
        continue;
      }
      if (g.state === 'rising') {
        if (g.t >= RISE_TIME) {
          g.state = 'hunting';
          g.t = 0;
        }
        if (Math.random() < 0.3) {
          emit({ x: g.x + rand(-8, 8), y: g.y + 4, vx: rand(-30, 30), vy: rand(-60, -20), max: 0.6, size: rand(2, 4), sprite: EARTH, gravity: 200 });
        }
        ghosts[retainedGhosts++] = g;
        continue;
      }

      const dx = player.x - g.x;
      const dy = player.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      nearest = Math.min(nearest, d);
      const light = lightAt(g.x, g.y, beamPower, reach, lampRadius);

      // Burning in the beam: it shudders, flares, and is held back.
      g.burning = 0;
      if (beamPower > 0 && d < reach + spec.radius) {
        const off = Math.abs(angleDiff(Math.atan2(-dy, -dx), aim));
        const cover = Math.atan2(spec.radius, d);
        if (off < BEAM_HALF_ANGLE + cover * 0.8) {
          const falloff = 1.15 - (d / reach) * 0.55;
          g.burning = beamPower * falloff;
          g.hp -= g.burning * s;
          burningAny = Math.max(burningAny, g.burning);
          if (Math.random() < 0.5) {
            emit({ x: g.x + rand(-spec.radius, spec.radius) * 0.6, y: g.y + rand(-spec.radius, spec.radius) * 0.6, vx: rand(-20, 20), vy: rand(-60, -20), max: rand(0.3, 0.7), size: rand(3, 7) });
          }
        }
      }

      // Mourners only move while no light is on them, and then in jumps.
      g.frozen = g.kind === 'mourner' && light > 0.2;
      let mx = 0;
      let my = 0;
      if (!g.frozen && !over) {
        const speed = spec.speed * (1 + elapsed / 110) * (1 - clamp(g.burning * 1.2) * 0.85);
        let vx = (dx / d) * speed;
        let vy = (dy / d) * speed;
        // Sway (wisps), zig-zag (wraiths).
        const side = g.kind === 'wraith' ? Math.sin(time * 0.006 + g.phase) * 1.4 : Math.sin(time * 0.002 + g.phase) * 0.4;
        vx += (-dy / d) * speed * side;
        vy += (dx / d) * speed * side;
        if (g.kind === 'mourner') {
          g.hop -= s;
          if (g.hop <= 0) {
            g.hop = 0.42;
            mx = vx * 0.42;
            my = vy * 0.42;
          }
        } else {
          mx = vx * s;
          my = vy * s;
        }
        // Pushed back along the beam while it burns.
        if (g.burning > 0) {
          mx -= (dx / d) * 22 * g.burning * s;
          my -= (dy / d) * 22 * g.burning * s;
        }
      }
      g.x += mx;
      g.y += my;
      g.vx = approach(g.vx, s > 0 ? mx / s : 0, 6, dt);
      g.vy = approach(g.vy, s > 0 ? my / s : 0, 6, dt);

      // Afterimages and a trickle of ectoplasm.
      g.trailTimer -= s;
      if (g.trailTimer <= 0) {
        g.trailTimer = 0.06;
        g.trail.unshift({ x: g.x, y: g.y });
        g.trail.length = Math.min(g.trail.length, 4);
      }
      g.moteTimer -= s;
      if (g.moteTimer <= 0) {
        g.moteTimer = rand(0.16, 0.4);
        emit({ x: g.x + rand(-spec.radius, spec.radius) * 0.8, y: g.y + spec.radius, vx: rand(-8, 8), vy: rand(-35, -15), max: rand(0.6, 1.1), size: rand(2, 4.5), sprite: spriteFor[g.kind] });
      }

      // The banshee screams once when she's close, and the torch dies with it.
      if (g.kind === 'banshee' && !g.screamed && d < 210 && started && !over) {
        g.screamed = true;
        sfx.wail(clamp((g.x - width / 2) / (width / 2), -1, 1), 0.5, 1.5);
        battery = Math.max(0, battery - 0.35);
        hooks.shake();
        haptic('heavy');
      }

      if (g.hp <= 0 && started && !over) {
        banish(g);
      } else if (started && !over && d < 16 + spec.radius * 0.55 && invulnerable <= 0) {
        hit(g);
      }
      ghosts[retainedGhosts++] = g;
    }
    ghosts.length = retainedGhosts;
    sizzle.set(burningAny, 0.08);

    // Heartbeat follows the nearest ghost.
    heartTimer -= s;
    if (heartTimer <= 0 && started && !over) {
      heartTimer = 0.3;
      const closeness = clamp(1 - nearest / 420);
      heart.set(58 + closeness * 100, closeness);
      drone?.set(0.85 + closeness * 0.3, 0.5);
    }

    invulnerable = Math.max(0, invulnerable - s);
    hurt = Math.max(0, hurt - s * 1.4);
    chainTimer -= s;
    if (chainTimer <= 0) {
      chain = 0;
    }
    if (bannerTimer > 0) {
      bannerTimer -= s;
      if (bannerTimer <= 0) {
        hooks.hud({ banner: '' });
      }
    }

    let retainedParticles = 0;
    for (const p of particles) {
      p.life += s;
      if (p.swirl) {
        const c = Math.cos(p.swirl * s);
        const sn = Math.sin(p.swirl * s);
        const vx = p.vx * c - p.vy * sn;
        p.vy = p.vx * sn + p.vy * c;
        p.vx = vx;
      }
      p.vy += p.gravity * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const drag = Math.exp(-1.5 * s);
      p.vx *= drag;
      p.vy *= p.gravity ? 1 : drag;
      if (p.life < p.max) {
        particles[retainedParticles++] = p;
      }
    }
    particles.length = retainedParticles;
    for (const p of popups) {
      p.life += s;
      p.y -= 26 * s;
    }
    while (popups.length && popups[0].life > 1.1) {
      popups.shift();
    }
    for (const m of mists) {
      m.x += (m.v / width) * s;
      if (m.x > 1.3) {
        m.x = -0.3;
        m.y = Math.random();
      }
    }
    for (const mote of dust) {
      mote.x += (Math.sin(time * 0.0004 + mote.phase) * 4 * s) / width;
      mote.y += ((Math.cos(time * 0.0003 + mote.phase * 1.3) * 3 - 1.5) * s) / height;
      if (mote.y < 0) mote.y += 1;
      if (mote.x < 0) mote.x += 1;
      else if (mote.x > 1) mote.x -= 1;
    }

    hudTimer -= s;
    if (hudTimer <= 0 && started && !over) {
      hudTimer = 0.1;
      hooks.hud({ time: clock, meter: battery });
    }

    if (over && endIn > 0) {
      endIn -= s;
      if (endIn <= 0) {
        report();
      }
    }

    return { beamPower, reach, lampRadius };
  }

  /**
   * A ghost: a sheet with a domed head and a tattered hem that ripples,
   * leaning into its motion and breathing (squash and stretch). Close to
   * the keeper it reaches out; dying, it stretches upward and thins away.
   */
  function drawGhost(g: Ghost, time: number, x: number, y: number, alpha: number) {
    const spec = KINDS[g.kind];
    const r = spec.radius;
    const heat = clamp(g.burning * 1.3);
    const health = clamp(g.hp / g.maxHp);
    const breath = Math.sin(time * 0.004 + g.phase);
    let sx = 1 - breath * 0.04;
    let sy = 1 + breath * 0.06;
    let lift = 0;
    if (g.state === 'rising') {
      // Out of the earth, head first.
      const p = clamp(g.t / RISE_TIME);
      const e = 1 - Math.pow(1 - p, 3);
      sy *= e;
      sx *= 0.6 + 0.4 * e;
      lift = (1 - e) * r * 0.9;
    } else if (g.state === 'dying') {
      const p = clamp(g.t / DIE_TIME);
      sy *= 1 + p * 1.6;
      sx *= 1 - p * 0.75;
      alpha *= 1 - p;
    }
    const speed = Math.hypot(g.vx, g.vy);
    const lean = clamp(g.vx / (spec.speed * 2), -0.35, 0.35);
    const jitter = heat > 0 ? rand(-2.5, 2.5) * heat : 0;

    // Reaching: arms toward the keeper when close.
    const dx = player.x - x;
    const dy = player.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = g.state === 'hunting' ? clamp(1 - dist / 180) : 0;

    ctx.save();
    ctx.translate(x + jitter, y + lift);
    ctx.rotate(lean);
    ctx.scale(sx, sy);
    ctx.globalAlpha = alpha * (0.55 + 0.4 * health);

    const tone = `hsl(${spec.hue}, ${heat > 0 ? 25 : 55}%, ${Math.min(98, spec.light + heat * 12)}%)`;

    if (reach > 0) {
      const a = Math.atan2(dy, dx) - lean;
      ctx.strokeStyle = tone;
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.22;
      for (const side of [-1, 1]) {
        const ox = side * r * 0.72;
        const len = r * (0.5 + 1.1 * reach);
        const ex = ox + Math.cos(a + side * 0.25) * len;
        const ey = Math.sin(a + side * 0.25) * len;
        const wave = Math.sin(time * 0.012 + side + g.phase) * r * 0.15;
        ctx.beginPath();
        ctx.moveTo(ox, -r * 0.05);
        ctx.quadraticCurveTo((ox + ex) / 2 + wave, (ey - r * 0.05) / 2 + r * 0.35, ex, ey);
        ctx.stroke();
      }
    }

    // The sheet.
    const body = ctx.createRadialGradient(0, -r * 0.5, r * 0.1, 0, 0, r * 1.6);
    body.addColorStop(0, `hsl(${spec.hue}, ${heat > 0 ? 25 : 60}%, ${Math.min(99, spec.light + 8 + heat * 10)}%)`);
    body.addColorStop(0.6, `hsla(${spec.hue}, 55%, ${spec.light - 22}%, 0.85)`);
    body.addColorStop(1, `hsla(${spec.hue}, 55%, 38%, 0)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, -r * 0.3, r, Math.PI, 0);
    const hem = r * 1.2;
    // The sides billow out a little, then a ragged hem in a travelling wave.
    ctx.bezierCurveTo(r * 1.08, r * 0.3, r * 1.02 + Math.sin(time * 0.006 + g.phase) * r * 0.08, hem * 0.7, r * 0.95, hem);
    const tatters = 7;
    const trailing = speed > 2 ? r * 0.2 : 0;
    for (let i = tatters; i >= 0; i--) {
      const u = i / tatters;
      const hx = -r * 0.95 + u * r * 1.9;
      const wave = Math.sin(time * 0.011 - u * 7 + g.phase) * r * 0.16;
      const tatter = i % 2 ? r * 0.22 : -r * 0.04;
      ctx.lineTo(hx, hem + wave + tatter + trailing * Math.sin(u * Math.PI));
    }
    ctx.bezierCurveTo(-r * 1.02, hem * 0.7, -r * 1.08, r * 0.3, -r, -r * 0.3);
    ctx.closePath();
    ctx.fill();

    if (g.kind === 'banshee') {
      // Hair streaming back.
      ctx.strokeStyle = `hsla(${spec.hue}, 30%, 20%, 0.7)`;
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.22, -r * 1.15);
        ctx.quadraticCurveTo(i * r * 0.5 + Math.sin(time * 0.006 + i) * 7, -r * 0.2, i * r * 0.4 + Math.sin(time * 0.004 + i * 2) * 5, r * 0.95);
        ctx.stroke();
      }
    }

    // The face: hollow eyes, and a mouth that gapes as it closes in or burns.
    if (!(g.kind === 'mourner' && g.frozen)) {
      const gape = Math.max(reach, heat, g.kind === 'banshee' ? 0.6 : 0);
      ctx.fillStyle = 'rgba(8, 4, 12, 0.88)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.35, r * 0.15, r * (0.22 + gape * 0.08), -0.15, 0, Math.PI * 2);
      ctx.ellipse(r * 0.34, -r * 0.35, r * 0.15, r * (0.22 + gape * 0.08), 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, r * 0.18, r * (0.14 + gape * 0.06), r * (0.12 + gape * 0.28 + Math.max(0, breath) * 0.04), 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Hands over its face.
      ctx.fillStyle = `hsla(${spec.hue}, 15%, 58%, 0.95)`;
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, -r * 0.28, r * 0.28, r * 0.36, 0.3, 0, Math.PI * 2);
      ctx.ellipse(r * 0.25, -r * 0.28, r * 0.28, r * 0.36, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawKeeper(time: number) {
    // The keeper from above: a hooded cloak, holding the lantern out.
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(aim + Math.PI / 2);
    if (invulnerable > 0 && Math.floor(time / 90) % 2) {
      ctx.globalAlpha = 0.4;
    }
    ctx.fillStyle = '#1b1320';
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1f33';
    ctx.beginPath();
    ctx.arc(0, -1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2a3f';
    ctx.fillRect(4, -14, 4, 12);
    ctx.restore();
  }

  function render(time: number, beamPower: number, reach: number, lampRadius: number) {
    if (!litLayer || !darkLayer) {
      return;
    }
    const fade = over && !won ? clamp(endIn / 1.6) : 1;
    const lr = lampRadius * fade;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.95;
    ctx.drawImage(pool, player.x - lr * 1.4, player.y - lr * 1.4, lr * 2.8, lr * 2.8);
    if (beamPower > 0) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(aim);
      ctx.globalAlpha = beamPower;
      const half = (reach * COOKIE_HALF) / COOKIE_LENGTH;
      ctx.drawImage(beamCookie, 0, -half, reach, half * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (lightning > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, lightning * 1.2)})`;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. The lit graveyard, only where light falls.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(litLayer, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // 3. Ghosts and the keeper, only where light falls: afterimages first.
    ctx.globalCompositeOperation = 'source-atop';
    for (const g of ghosts) {
      // Only wraiths smear: they zig-zag fast enough to leave afterimages.
      if (g.state !== 'hunting' || g.kind !== 'wraith') {
        continue;
      }
      g.trail.forEach((p, i) => {
        if (i > 0) {
          drawGhost(g, time - i * 60, p.x, p.y, g.presence * 0.16 * (1 - i / g.trail.length));
        }
      });
    }
    for (const g of ghosts) {
      drawGhost(g, time, g.x, g.y, g.presence);
    }
    drawKeeper(time);

    // 4. The moonlit graveyard behind it all.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(darkLayer, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // 5. What shows in the dark.
    ctx.globalCompositeOperation = 'lighter';
    // Dust hanging in the light.
    for (const mote of dust) {
      const x = mote.x * width;
      const y = mote.y * height;
      const lit = lightAt(x, y, beamPower, reach, lampRadius);
      if (lit > 0.05) {
        const twinkle = 0.6 + 0.4 * Math.sin(time * 0.003 + mote.phase);
        ctx.globalAlpha = lit * 0.55 * twinkle;
        ctx.drawImage(sprites[EMBER], x - mote.size * 2, y - mote.size * 2, mote.size * 4, mote.size * 4);
      }
    }
    const lampGlow = 34 + Math.sin(time * 0.013) * 3;
    ctx.globalAlpha = fade;
    ctx.drawImage(sprites[EMBER], player.x - lampGlow + Math.cos(aim) * 8, player.y - lampGlow + Math.sin(aim) * 8, lampGlow * 2, lampGlow * 2);

    // A faint aura gives each ghost away in the dark; eyes glint inside it.
    for (const g of ghosts) {
      const spec = KINDS[g.kind];
      const r = spec.radius;
      const dying = g.state === 'dying' ? 1 - clamp(g.t / DIE_TIME) : 1;
      const rising = g.state === 'rising' ? clamp(g.t / RISE_TIME) : 1;
      const close = clamp(1 - Math.hypot(player.x - g.x, player.y - g.y) / 380);
      const aura = r * (3 + close);
      ctx.globalAlpha = g.presence * dying * rising * (0.07 + close * 0.1);
      ctx.drawImage(sprites[spriteFor[g.kind]], g.x - aura, g.y - aura * 1.1, aura * 2, aura * 2.2);
      if ((g.kind === 'mourner' && g.frozen) || g.state === 'dying') {
        continue;
      }
      const lean = clamp(g.vx / (spec.speed * 2), -0.35, 0.35);
      const breath = Math.sin(time * 0.004 + g.phase);
      const eyeY = g.y - r * 0.35 * (1 + breath * 0.06) + (g.state === 'rising' ? (1 - rising) * r * 0.9 : 0);
      const blink = Math.sin(time * 0.002 + g.phase * 3) > 0.97 ? 0.1 : 1;
      const eye = (g.kind === 'banshee' || g.kind === 'mourner' ? 7 : 5) * blink * rising;
      ctx.globalAlpha = g.presence * 0.9;
      for (const side of [-1, 1]) {
        const ex = g.x + side * r * 0.34 * Math.cos(lean) - r * 0.35 * Math.sin(lean);
        ctx.drawImage(sprites[g.kind === 'wisp' ? EYE : spriteFor[g.kind]], ex - eye, eyeY - eye, eye * 2, eye * 2);
      }
    }
    ctx.globalAlpha = 1;

    // Embers, ectoplasm, earth.
    for (const p of particles) {
      const t = p.life / p.max;
      const s = p.size * (1 - t * 0.6);
      ctx.globalAlpha = (1 - t) * (p.sprite === EARTH ? 0.9 : 1);
      ctx.drawImage(sprites[p.sprite], p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;

    // Mist drifting over everything.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.3;
    for (const m of mists) {
      const s = Math.min(width, height) * 0.9 * m.s;
      ctx.drawImage(mist, m.x * width - s / 2, m.y * height - s / 2, s, s);
    }
    ctx.globalAlpha = 1;

    // Floating scores.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `26px ${CANVAS_FONTS.creep}`;
    for (const p of popups) {
      ctx.globalAlpha = clamp(1.1 - p.life);
      ctx.fillStyle = '#fde68a';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // Lightning washes the frame; a hit bleeds red in from the edges.
    if (lightning > 0.3) {
      ctx.fillStyle = `rgba(220, 225, 255, ${(lightning - 0.3) * 0.6})`;
      ctx.fillRect(0, 0, width, height);
    }
    // The vignettes are painted once per size and stamped.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (vignette) {
      ctx.drawImage(vignette, 0, 0);
    }
    if (wound && hurt > 0) {
      ctx.globalAlpha = Math.min(1, 0.4 + hurt * 0.6);
      ctx.drawImage(wound, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // A dead torch tells you so.
    if (dead && started && !over) {
      ctx.font = `20px ${CANVAS_FONTS.fell}`;
      ctx.fillStyle = `rgba(240, 82, 82, ${0.6 + 0.4 * Math.sin(time * 0.01)})`;
      ctx.fillText('The torch is dead… let it rest', width / 2, player.y + 110);
    }
  }

  const instance: GameInstance = {
    frame(time, dt) {
      if (paused) {
        return;
      }
      const { beamPower, reach, lampRadius } = update(dt, time);
      render(time, beamPower, reach, lampRadius);
    },
    resize(w, h) {
      capResolution(canvas, { width: w, height: h, scale: size.scale }, DENSITY);
      width = w;
      height = h;
      player.x = w / 2;
      player.y = h * 0.56;
      paintGraveyard();
    },
    pointer(type, x, y) {
      if (over) {
        return;
      }
      if (type === 'up') {
        aiming = false;
        return;
      }
      targetAim = Math.atan2(y - player.y, x - player.x);
      if (type === 'down') {
        if (!aiming) {
          sfx.click();
        }
        // Snap on touch: the beam goes where you put your finger.
        aim = targetAim;
      }
      aiming = true;
    },
    begin() {
      started = true;
      battery = 1;
      drone = sfx.music('add-ons', 0.5);
      hooks.hud({ banner: 'Survive until midnight' });
      bannerTimer = 2.5;
    },
    setPaused(value) {
      paused = value;
      const level = value ? 0 : 1;
      wind.set(level);
      rain.set(level);
      drone?.set(level);
      sizzle.set(0, 0.05);
      if (value) {
        heart.set(0, 0);
        aiming = false;
      }
    },
    dispose() {
      wind.stop(0.5);
      rain.stop(0.5);
      drone?.stop(0.5);
      sizzle.stop(0.1);
      heart.stop();
    },
  };
  return instance;
};
