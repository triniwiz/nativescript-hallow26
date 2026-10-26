import '@nativescript/canvas-pixi';
import '../../core/intl';
import { Application, CanvasTextMetrics, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { sfx, type Loop } from '../../core/audio';
import { CANVAS_FONTS, loadCanvasFonts } from '../../core/fonts';
import { haptic } from '../../core/native';
import type { GameFactory, GameInstance } from '../../game/types';
import { clamp, lerp, pick, rand, starsFor } from '../../game/util';
import { R0, drawBackdrop, halves, makeTextures, type MoonSpot } from './art';

// PixiJS makes its grapheme segmenter when it loads, which can be before
// core/intl swaps out the Intl.Segmenter that crashes on Windows.
if (__WINDOWS__) {
  const segmenter = new Intl.Segmenter();
  CanvasTextMetrics.graphemeSegmenter = (s) => [...segmenter.segment(s)].map((x) => x.segment);
}

/** Length of a round, in seconds. */
const ROUND = 75;
/** Score needed by the end of the round to win, and for two and three stars. */
const TARGET = 400;
const TWO_STARS = 700;
const THREE_STARS = 1000;
const LIVES = 3;
/** Slices closer together than this (s), in one swipe, chain into a combo. */
const COMBO_WINDOW = 0.32;
/** How long the blade trail lingers, in seconds. */
const TRAIL_LIFE = 0.14;
const MAX_PARTICLES = __ANDROID__ ? 140 : 260;
const GOO = __ANDROID__ ? 8 : 14;
const SEEDS = __ANDROID__ ? 4 : 8;
const MAX_DECALS = 10;

type Kind = 'pumpkin' | 'golden' | 'skull';

interface Item {
  kind: Kind;
  node: Container;
  body: Sprite;
  glow: Sprite;
  flame?: Sprite;
  texture: Texture;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  r: number;
  value: number;
  /** Thrown during play: falling unsliced costs a life. */
  scoring: boolean;
  wisp: number;
}

interface Piece {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  gravity: number;
  drag: number;
  spin: number;
  scale: number;
  grow: number;
  alpha: number;
}

interface Fading {
  sprite: Sprite;
  life: number;
  max: number;
  vy: number;
  scale: number;
}

interface Bat {
  sprite: Sprite;
  vx: number;
  baseY: number;
  phase: number;
  flap: number;
  wait: number;
}

interface Drifter {
  sprite: Sprite;
  vx: number;
}

const COMBO_LABELS = ['', '', 'Double carve!', 'Triple carve!', 'Quadruple carve!'];
const UNHOLY = 'Unholy carve!';

function segmentDistance(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l2) : 0;
  return Math.hypot(ax + dx * t - cx, ay + dy * t - cy);
}

/**
 * Rite II, the Pumpkin Patch: PixiJS v8 on the native canvas. Jack-o'-lanterns
 * are tossed up from below a moonlit patch; swipe to carve them before they
 * fall, chain several in one stroke for combos, and leave the violet-flamed
 * skulls alone. Every texture is vector Graphics baked once with
 * generateTexture, and a carved lantern's halves are two frames of its
 * texture, turned so the cut follows the blade.
 */
export const carve: GameFactory = (hooks) => async (canvas, size) => {
  let { width, height } = size;
  const resolution = Math.min(size.scale, 1.5);
  const app = new Application();
  await app.init({
    canvas: canvas as any,
    preference: 'webgl',
    width,
    height,
    resolution,
    autoDensity: false,
    antialias: true,
    background: '#07030f',
    // The runner owns the frame loop and calls app.render().
    autoStart: false,
    sharedTicker: false,
  });

  const tex = makeTextures(app.renderer, resolution);
  const halfCache = new Map<Texture, [Texture, Texture]>();
  const halvesOf = (t: Texture) => {
    let pair = halfCache.get(t);
    if (!pair) {
      pair = halves(t);
      halfCache.set(t, pair);
    }
    return pair;
  };

  // Floating labels are baked from Text once. If text can't render here,
  // they're skipped and the HUD banner carries the news alone.
  const labels = new Map<string, Texture>();
  try {
    await loadCanvasFonts();
    const bakeLabel = (text: string, fill: number, size: number) => {
      const t = new Text({
        text,
        style: { fontFamily: CANVAS_FONTS.creep, fontSize: size, fill, stroke: { color: 0x1a0505, width: 5 } },
      });
      labels.set(text, app.renderer.generateTexture({ target: t, resolution }));
      t.destroy();
    };
    bakeLabel('+10', 0xfdba74, 26);
    bakeLabel('+15', 0xfdba74, 28);
    bakeLabel('+50', 0xfde047, 34);
    for (const label of [...COMBO_LABELS.filter(Boolean), UNHOLY]) {
      bakeLabel(label, 0xa7f3d0, 34);
    }
    bakeLabel('Cursed!', 0xc084fc, 36);
  } catch (error) {
    console.warn('[patch] text labels unavailable:', error);
    for (const t of labels.values()) {
      t.destroy(true);
    }
    labels.clear();
  }

  const sky = new Graphics();
  const moonGlow = new Sprite(tex.glow);
  moonGlow.anchor.set(0.5);
  moonGlow.tint = 0xfde2a8;
  moonGlow.blendMode = 'add';
  const clouds = new Container();
  const batLayer = new Container();
  const hills = new Graphics();
  const fence = new Graphics();
  const decalLayer = new Container();
  const fogLayer = new Container();
  const itemLayer = new Container();
  const pieceLayer = new Container();
  const particleLayer = new Container();
  const popupLayer = new Container();
  const trail = new Graphics();
  const flash = new Graphics();
  flash.alpha = 0;
  app.stage.addChild(
    sky,
    moonGlow,
    clouds,
    batLayer,
    hills,
    fence,
    decalLayer,
    fogLayer,
    itemLayer,
    pieceLayer,
    particleLayer,
    popupLayer,
    trail,
    flash,
  );

  let moon: MoonSpot = { x: 0, y: 0, r: 1 };
  let baseRadius = 40;
  function layout() {
    moon = drawBackdrop(sky, hills, fence, width, height);
    moonGlow.position.set(moon.x, moon.y);
    baseRadius = clamp(Math.min(width, height) * 0.085, 28, 58);
    flash.clear().rect(0, 0, width, height).fill(0xffffff);
  }
  layout();

  const cloudList: Drifter[] = Array.from({ length: 3 }, (_, i) => {
    const sprite = new Sprite(tex.glow);
    sprite.anchor.set(0.5);
    sprite.tint = 0x12081d;
    sprite.alpha = 0.75;
    sprite.scale.set(rand(2.4, 3.4), rand(0.35, 0.55));
    sprite.position.set(rand(0, width), moon.y + (i - 1) * moon.r * 0.9 + rand(-10, 10));
    clouds.addChild(sprite);
    return { sprite, vx: rand(6, 14) * (i % 2 ? 1 : 0.7) };
  });

  const fogList: Drifter[] = Array.from({ length: 5 }, () => {
    const sprite = new Sprite(tex.glow);
    sprite.anchor.set(0.5);
    sprite.tint = 0x9d8ac7;
    sprite.alpha = rand(0.07, 0.13);
    sprite.scale.set(rand(3.5, 5.5), rand(0.9, 1.4));
    sprite.position.set(rand(0, width), height * rand(0.72, 0.95));
    fogLayer.addChild(sprite);
    return { sprite, vx: rand(-18, 18) || 8 };
  });

  const bats: Bat[] = Array.from({ length: 5 }, () => {
    const sprite = new Sprite(tex.bat[0]);
    sprite.anchor.set(0.5);
    batLayer.addChild(sprite);
    const bat: Bat = { sprite, vx: 0, baseY: 0, phase: 0, flap: 0, wait: rand(0, 4) };
    sprite.visible = false;
    return bat;
  });

  function launchBat(bat: Bat) {
    const fromLeft = Math.random() < 0.5;
    const s = rand(0.35, 0.75);
    bat.sprite.scale.set(fromLeft ? s : -s, s);
    bat.sprite.alpha = 0.55 + s * 0.5;
    bat.vx = (fromLeft ? 1 : -1) * rand(40, 90) * s * 1.6;
    bat.baseY = height * rand(0.08, 0.5);
    bat.phase = rand(0, Math.PI * 2);
    bat.sprite.position.set(fromLeft ? -40 : width + 40, bat.baseY);
    bat.sprite.visible = true;
  }

  const particles: Particle[] = [];
  const freeParticles: Sprite[] = Array.from({ length: MAX_PARTICLES }, () => {
    const sprite = new Sprite(tex.goo);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    particleLayer.addChild(sprite);
    return sprite;
  });

  function emit(
    texture: Texture,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    o: { tint?: number; scale?: number; gravity?: number; drag?: number; spin?: number; add?: boolean; grow?: number; alpha?: number } = {},
  ) {
    const sprite = freeParticles.pop();
    if (!sprite) {
      return;
    }
    sprite.texture = texture;
    sprite.tint = o.tint ?? 0xffffff;
    sprite.blendMode = o.add ? 'add' : 'normal';
    sprite.position.set(x, y);
    sprite.rotation = rand(0, Math.PI * 2);
    sprite.scale.set(o.scale ?? 1);
    sprite.alpha = o.alpha ?? 1;
    sprite.visible = true;
    particles.push({
      sprite,
      vx,
      vy,
      life,
      max: life,
      gravity: o.gravity ?? 900,
      drag: o.drag ?? 0.8,
      spin: o.spin ?? 0,
      scale: o.scale ?? 1,
      grow: o.grow ?? 0,
      alpha: o.alpha ?? 1,
    });
  }

  const items: Item[] = [];
  const pieces: Piece[] = [];
  const decals: Fading[] = [];
  const popups: Fading[] = [];

  let state: 'attract' | 'playing' | 'ended' = 'attract';
  let paused = false;
  let clock = 0;
  let elapsed = 0;
  let score = 0;
  let lives = LIVES;
  let carved = 0;
  let golden = 0;
  let lost = 0;
  let bestCombo = 0;
  let spawnTimer = 1.2;
  let pending: { delay: number; kind: Kind }[] = [];
  let comboCount = 0;
  let comboClock = 0;
  let comboX = 0;
  let comboY = 0;
  let bannerClock = 0;
  let lastTenths = -1;
  let lastTick = -1;
  let flashLevel = 0;

  const trailPoints: { x: number; y: number; t: number }[] = [];
  let pointerDown = false;
  let lastPoint: { x: number; y: number } | null = null;
  let lastWhoosh = 0;

  const wind: Loop = sfx.wind(0.26);
  let drone: Loop | null = null;

  const difficulty = () => clamp(elapsed / ROUND);
  const gravity = () => height * 1.15 * (1 + 0.3 * (state === 'playing' ? difficulty() : 0));

  hooks.hud({ score: 0, lives, maxLives: LIVES, time: ROUND, totalTime: ROUND, banner: '' });

  function toss(kind: Kind) {
    const r =
      baseRadius * (kind === 'skull' ? 0.85 : kind === 'golden' ? 0.9 : pick([0.78, 1, 1, 1.22]));
    const value = kind === 'golden' ? 50 : r < baseRadius * 0.9 ? 15 : 10;
    const x = rand(0.12, 0.88) * width;
    const y = height + r + 6;
    const g = gravity();
    const apex = height * rand(0.14, 0.42);
    const vy = -Math.sqrt(2 * g * (y - apex));
    const up = -vy / g;
    const landing = clamp(x + rand(-0.35, 0.35) * width, width * 0.1, width * 0.9);

    const texture = kind === 'skull' ? tex.skull : kind === 'golden' ? tex.golden : pick(tex.pumpkins);
    const node = new Container();
    const glow = new Sprite(tex.glow);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = kind === 'skull' ? 0xa855f7 : kind === 'golden' ? 0xfde68a : 0xfb923c;
    glow.scale.set((r * 1.35) / R0);
    glow.alpha = 0.45;
    node.addChild(glow);
    let flame: Sprite | undefined;
    if (kind === 'skull') {
      flame = new Sprite(tex.flame);
      flame.anchor.set(0.5, 0.62);
      flame.scale.set((r * 1.25) / R0);
      flame.position.set(0, -r * 0.3);
      flame.alpha = 0.9;
      node.addChild(flame);
    }
    const body = new Sprite(texture);
    body.anchor.set(0.5);
    body.scale.set(r / R0);
    body.rotation = rand(-0.4, 0.4);
    node.addChild(body);
    node.position.set(x, y);
    itemLayer.addChild(node);

    items.push({
      kind,
      node,
      body,
      glow,
      flame,
      texture,
      x,
      y,
      vx: (landing - x) / (up * 2),
      vy,
      spin: rand(-2.2, 2.2),
      r,
      value,
      scoring: state === 'playing',
      wisp: 0,
    });
  }

  function volley() {
    const d = difficulty();
    const count = 1 + Math.floor(Math.random() * lerp(1.4, 4.6, d));
    let skulls = 0;
    for (let i = 0; i < count; i++) {
      let kind: Kind = 'pumpkin';
      const roll = Math.random();
      // No skulls in the first seconds; one per volley until late in the round.
      if (elapsed > 4 && roll < lerp(0.07, 0.22, d) && (skulls === 0 || d > 0.6)) {
        kind = 'skull';
        skulls++;
      } else if (roll > 0.96) {
        kind = 'golden';
      }
      pending.push({ delay: i * 0.14 + rand(0, 0.06), kind });
    }
  }

  function removeItem(item: Item) {
    const i = items.indexOf(item);
    if (i >= 0) {
      items.splice(i, 1);
    }
    item.node.destroy({ children: true });
  }

  function slice(item: Item, dx: number, dy: number) {
    removeItem(item);
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const pan = clamp((item.x / width) * 2 - 1, -1, 1);

    if (item.kind === 'skull') {
      for (let i = 0; i < GOO; i++) {
        emit(tex.goo, item.x, item.y, ux * rand(60, 260) + rand(-220, 220), uy * rand(60, 260) + rand(-260, 120), rand(0.5, 0.9), {
          tint: pick([0xa855f7, 0xc084fc, 0x7e22ce]),
          scale: rand(0.5, 1.1),
          add: true,
          gravity: 300,
        });
      }
      for (let i = 0; i < 9; i++) {
        emit(tex.bone, item.x, item.y, rand(-260, 260), rand(-380, -60), rand(0.8, 1.3), {
          scale: rand(0.8, 1.6) * (item.r / 40),
          spin: rand(-12, 12),
        });
      }
      emit(tex.glow, item.x, item.y, 0, 0, 0.35, { tint: 0xa855f7, scale: (item.r * 1.4) / R0, grow: 2.2, add: true, gravity: 0 });
      popup('Cursed!', item.x, item.y);
      flashLevel = 0.45;
      flash.tint = 0x7e22ce;
      sfx.splat(pan, 0.35);
      sfx.cackle();
      haptic('error');
      if (state === 'playing') {
        hooks.scare(0.6);
        loseLife();
      }
      return;
    }

    // Halves: turned so the cut runs along the blade, flung apart across it.
    const [left, right] = halvesOf(item.texture);
    const rot = Math.atan2(uy, ux) - Math.PI / 2;
    const nx = Math.cos(rot);
    const ny = Math.sin(rot);
    const scale = item.r / R0;
    for (const [texture, side] of [
      [left, -1],
      [right, 1],
    ] as const) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(side < 0 ? 1 : 0, 0.5);
      sprite.scale.set(scale);
      sprite.rotation = rot;
      sprite.position.set(item.x, item.y);
      pieceLayer.addChild(sprite);
      const push = rand(110, 170);
      pieces.push({
        sprite,
        vx: item.vx * 0.6 + nx * side * push + ux * 60,
        vy: Math.min(item.vy, 0) * 0.35 + ny * side * push + uy * 60 - 90,
        spin: side * rand(1.5, 3.5) + item.spin * 0.3,
      });
    }

    const flesh = item.kind === 'golden' ? [0xfde047, 0xfacc15, 0xfff3b0] : [0xf59e0b, 0xfb923c, 0xea580c];
    for (let i = 0; i < GOO; i++) {
      emit(tex.goo, item.x, item.y, ux * rand(80, 360) + rand(-200, 200), uy * rand(80, 360) + rand(-260, 80), rand(0.45, 0.9), {
        tint: pick(flesh),
        scale: rand(0.45, 1.15) * (item.r / 40),
      });
    }
    for (let i = 0; i < SEEDS; i++) {
      emit(tex.seed, item.x, item.y, rand(-220, 220), rand(-340, -40), rand(0.7, 1.1), {
        scale: rand(0.8, 1.3),
        spin: rand(-10, 10),
      });
    }
    // The candle inside flares as it's cut.
    emit(tex.glow, item.x, item.y, 0, 0, 0.3, {
      tint: item.kind === 'golden' ? 0xfff3b0 : 0xffc94a,
      scale: (item.r * 1.3) / R0,
      grow: 1.6,
      add: true,
      gravity: 0,
    });

    decal(item);
    sfx.splat(pan);
    haptic('light');

    if (state === 'attract') {
      return;
    }
    if (state === 'playing') {
      carved++;
      if (item.kind === 'golden') {
        golden++;
        sfx.chime(4, pan, 0.4);
        haptic('success');
      }
      score += item.value;
      popup(`+${item.value}`, item.x, item.y - item.r);
      hooks.hud({ score });
      if (comboCount > 0 && comboClock < COMBO_WINDOW && pointerDown) {
        comboCount++;
      } else {
        finishCombo();
        comboCount = 1;
      }
      comboClock = 0;
      comboX = item.x;
      comboY = item.y;
    }
  }

  function finishCombo() {
    const n = comboCount;
    comboCount = 0;
    if (n < 2 || state !== 'playing') {
      return;
    }
    const bonus = 5 * n * (n - 1);
    score += bonus;
    bestCombo = Math.max(bestCombo, n);
    popup(n < COMBO_LABELS.length ? COMBO_LABELS[n] : UNHOLY, clamp(comboX, 90, width - 90), comboY - 30);
    sfx.chime(n, 0, 0.4);
    haptic('medium');
    hooks.hud({ score, banner: `×${n} combo  +${bonus}` });
    bannerClock = 1.6;
  }

  function decal(item: Item) {
    if (decals.length >= MAX_DECALS) {
      const old = decals.shift()!;
      old.sprite.destroy();
    }
    const sprite = new Sprite(tex.splat);
    sprite.anchor.set(0.5);
    sprite.tint = item.kind === 'golden' ? 0xca8a04 : 0xc2410c;
    sprite.alpha = 0.5;
    sprite.rotation = rand(0, Math.PI * 2);
    const s = (item.r / R0) * rand(0.9, 1.3);
    sprite.scale.set(s);
    sprite.position.set(item.x, item.y);
    decalLayer.addChild(sprite);
    decals.push({ sprite, life: 5, max: 5, vy: 0, scale: s });
  }

  function popup(label: string, x: number, y: number) {
    const texture = labels.get(label);
    if (!texture) {
      return;
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.scale.set(0.6);
    popupLayer.addChild(sprite);
    popups.push({ sprite, life: 0.9, max: 0.9, vy: -50, scale: 1 });
  }

  function loseLife() {
    if (state !== 'playing') {
      return;
    }
    lives--;
    hooks.hud({ lives });
    if (lives <= 0) {
      finish(false);
    }
  }

  function finish(timeUp: boolean) {
    if (state !== 'playing') {
      return;
    }
    finishCombo();
    state = 'ended';
    pending = [];
    const won = timeUp && lives > 0 && score >= TARGET;
    hooks.hud({ time: Math.max(0, ROUND - elapsed), banner: '' });
    hooks.end({
      won,
      score,
      stars: starsFor(won, score, TWO_STARS, THREE_STARS),
      stats: [
        { label: 'Lanterns carved', value: String(carved) },
        { label: 'Best combo', value: bestCombo >= 2 ? `×${bestCombo}` : '—' },
        { label: 'Golden lanterns', value: String(golden) },
        { label: 'Lanterns lost', value: String(lost) },
      ],
      verdict: won
        ? 'The patch glows. The harvest sleeps until next year.'
        : lives <= 0
          ? 'The last candle gutters. The patch has a new scarecrow.'
          : `Too few lanterns lit: ${TARGET} were owed. Something still walks the rows.`,
    });
  }

  function updateScenery(s: number) {
    moonGlow.scale.set((moon.r * 3.2) / R0);
    moonGlow.alpha = 0.32 + Math.sin(clock * 0.7) * 0.05;
    for (const c of cloudList) {
      c.sprite.x += c.vx * s;
      if (c.sprite.x - c.sprite.width / 2 > width) {
        c.sprite.x = -c.sprite.width / 2;
      }
    }
    for (const f of fogList) {
      f.sprite.x += f.vx * s;
      const half = f.sprite.width / 2;
      if (f.vx > 0 && f.sprite.x - half > width) {
        f.sprite.x = -half;
      } else if (f.vx < 0 && f.sprite.x + half < 0) {
        f.sprite.x = width + half;
      }
    }
    for (const bat of bats) {
      if (!bat.sprite.visible) {
        bat.wait -= s;
        if (bat.wait <= 0) {
          launchBat(bat);
        }
        continue;
      }
      bat.phase += s * 3;
      bat.sprite.x += bat.vx * s;
      bat.sprite.y = bat.baseY + Math.sin(bat.phase) * 14;
      bat.flap += s;
      bat.sprite.texture = tex.bat[Math.floor(bat.flap / 0.11) % 2];
      if (bat.sprite.x < -60 || bat.sprite.x > width + 60) {
        bat.sprite.visible = false;
        bat.wait = rand(1, 6);
      }
    }
  }

  function updateItems(s: number) {
    const g = gravity();
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      item.vy += g * s;
      item.x += item.vx * s;
      item.y += item.vy * s;
      item.node.position.set(item.x, item.y);
      item.body.rotation += item.spin * s;
      item.glow.alpha = 0.38 + Math.sin(clock * 13 + item.x) * 0.06 + Math.random() * 0.06;
      if (item.flame) {
        item.flame.scale.y = ((item.r * 1.25) / R0) * (1 + Math.sin(clock * 17 + item.x) * 0.08);
        item.wisp -= s;
        if (item.wisp <= 0) {
          item.wisp = 0.09;
          emit(tex.goo, item.x + rand(-item.r, item.r) * 0.4, item.y - item.r * 0.9, rand(-20, 20), rand(-90, -50), 0.6, {
            tint: 0xc084fc,
            scale: rand(0.4, 0.8),
            add: true,
            gravity: -60,
            alpha: 0.7,
          });
        }
      } else if (item.kind === 'golden' && Math.random() < s * 10) {
        emit(tex.goo, item.x + rand(-item.r, item.r), item.y + rand(-item.r, item.r), 0, -30, 0.5, {
          tint: 0xfff3b0,
          scale: 0.35,
          add: true,
          gravity: 0,
        });
      }
      if (item.vy > 0 && item.y - item.r > height + 10) {
        removeItem(item);
        if (item.scoring && state === 'playing' && item.kind === 'pumpkin') {
          lost++;
          flash.tint = 0xdc2626;
          flashLevel = 0.3;
          hooks.shake();
          haptic('warning');
          sfx.crack(0.35);
          loseLife();
        }
      }
    }
  }

  function updateEffects(s: number) {
    const g = gravity();
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.vy += g * s;
      p.sprite.x += p.vx * s;
      p.sprite.y += p.vy * s;
      p.sprite.rotation += p.spin * s;
      if (p.sprite.y > height + 120) {
        p.sprite.destroy();
        pieces.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= s;
      if (p.life <= 0) {
        p.sprite.visible = false;
        freeParticles.push(p.sprite);
        particles.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      p.vy += p.gravity * s;
      const damp = 1 - p.drag * s;
      p.vx *= damp;
      p.vy *= damp;
      p.sprite.x += p.vx * s;
      p.sprite.y += p.vy * s;
      p.sprite.rotation += p.spin * s;
      p.sprite.alpha = p.alpha * Math.min(1, k * 1.6);
      p.sprite.scale.set(p.scale * (1 + p.grow * (1 - k)));
    }

    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i];
      d.life -= s;
      if (d.life <= 0) {
        d.sprite.destroy();
        decals.splice(i, 1);
      } else {
        d.sprite.alpha = 0.5 * Math.min(1, d.life / 2);
      }
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= s;
      if (p.life <= 0) {
        p.sprite.destroy();
        popups.splice(i, 1);
        continue;
      }
      const age = 1 - p.life / p.max;
      p.sprite.y += p.vy * s;
      p.sprite.scale.set(0.6 + Math.min(1, age * 6) * 0.4);
      p.sprite.alpha = Math.min(1, p.life / 0.4);
    }

    // The blade: a wide ghost-green glow under a white-hot core, tapering to the tail.
    while (trailPoints.length && clock - trailPoints[0].t > TRAIL_LIFE) {
      trailPoints.shift();
    }
    trail.clear();
    const n = trailPoints.length;
    for (let i = 1; i < n; i++) {
      const a = trailPoints[i - 1];
      const b = trailPoints[i];
      const life = 1 - (clock - b.t) / TRAIL_LIFE;
      const w = (2 + 9 * (i / n)) * life;
      if (w <= 0.3) {
        continue;
      }
      trail.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: w * 2.6, color: 0x5eead4, alpha: 0.22 * life, cap: 'round' });
      trail.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: w, color: 0xf0fdfa, alpha: 0.9 * life, cap: 'round' });
    }

    if (flashLevel > 0) {
      flashLevel = Math.max(0, flashLevel - s * 2.5);
    }
    flash.alpha = flashLevel;
  }

  function updateClock(s: number) {
    if (state === 'playing') {
      elapsed += s;
      const left = Math.max(0, ROUND - elapsed);
      const tenths = Math.ceil(left * 10);
      if (tenths !== lastTenths) {
        lastTenths = tenths;
        hooks.hud({ time: left });
      }
      const whole = Math.ceil(left);
      if (whole <= 5 && whole > 0 && whole !== lastTick) {
        lastTick = whole;
        sfx.click();
        haptic('tick');
      }

      spawnTimer -= s;
      if (spawnTimer <= 0) {
        volley();
        spawnTimer = lerp(1.7, 0.8, difficulty()) * rand(0.85, 1.15);
      }
      if (left <= 0) {
        finish(true);
      }
    } else if (state === 'attract') {
      spawnTimer -= s;
      if (spawnTimer <= 0) {
        pending.push({ delay: 0, kind: Math.random() < 0.08 ? 'golden' : 'pumpkin' });
        spawnTimer = rand(1.4, 2.2);
      }
    }

    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].delay -= s;
      if (pending[i].delay <= 0) {
        toss(pending[i].kind);
        pending.splice(i, 1);
      }
    }

    if (comboCount > 0) {
      comboClock += s;
      if (comboClock >= COMBO_WINDOW) {
        finishCombo();
      }
    }
    if (bannerClock > 0) {
      bannerClock -= s;
      if (bannerClock <= 0) {
        hooks.hud({ banner: '' });
      }
    }
  }

  const instance: GameInstance = {
    frame(_time, dt) {
      if (paused) {
        return;
      }
      const s = Math.min(dt, 50) / 1000;
      clock += s;
      updateClock(s);
      updateScenery(s);
      updateItems(s);
      updateEffects(s);
      app.render();
    },
    resize(w, h) {
      width = w;
      height = h;
      app.renderer.resize(w, h);
      layout();
    },
    pointer(type, x, y) {
      if (paused) {
        return;
      }
      if (type === 'down') {
        pointerDown = true;
        lastPoint = { x, y };
        trailPoints.length = 0;
        trailPoints.push({ x, y, t: clock });
        return;
      }
      if (type === 'up') {
        pointerDown = false;
        lastPoint = null;
        finishCombo();
        return;
      }
      if (!pointerDown || !lastPoint) {
        return;
      }
      const ax = lastPoint.x;
      const ay = lastPoint.y;
      const dx = x - ax;
      const dy = y - ay;
      const len = Math.hypot(dx, dy);
      if (len < 2) {
        return;
      }
      trailPoints.push({ x, y, t: clock });
      lastPoint = { x, y };

      const now = Date.now();
      if (len > 18 && now - lastWhoosh > 230) {
        lastWhoosh = now;
        sfx.whoosh(clamp((x / width) * 2 - 1, -1, 1));
      }

      // Copy first: slicing removes from `items`.
      for (const item of items.slice()) {
        if (segmentDistance(ax, ay, x, y, item.x, item.y) < item.r * 0.95 + 4) {
          slice(item, dx, dy);
        }
      }
    },
    begin() {
      if (state !== 'attract') {
        return;
      }
      state = 'playing';
      elapsed = 0;
      spawnTimer = 0.8;
      score = 0;
      lives = LIVES;
      drone ??= sfx.music('clouds', 0.4);
      hooks.hud({ score, lives, maxLives: LIVES, time: ROUND, totalTime: ROUND, banner: '' });
    },
    setPaused(value) {
      paused = value;
      wind.set(value ? 0 : 1);
      drone?.set(value ? 0 : 1);
      if (value) {
        pointerDown = false;
        lastPoint = null;
      }
    },
    dispose() {
      wind.stop();
      drone?.stop();
      app.destroy({ removeView: false }, { children: true });
      for (const [l, r] of halfCache.values()) {
        l.destroy(false);
        r.destroy(false);
      }
      for (const t of labels.values()) {
        t.destroy(true);
      }
      tex.destroy();
    },
  };
  return instance;
};
