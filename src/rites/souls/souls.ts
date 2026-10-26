import {
  GPUBufferUsage,
  GPUMapMode,
  type GPU,
  type GPUBindGroup,
  type GPUBuffer,
  type GPUCanvasContext,
  type GPUDevice,
  type Canvas,
  type CanvasRenderingContext2D,
} from '@nativescript/canvas';
import { capResolution } from '../../canvas/resolution';
import { sfx } from '../../core/audio';
import { haptic } from '../../core/native';
import type { DemoSize } from '../../canvas/runner';
import type { GameFactory, GameHooks, GameInstance, Hud } from '../../game/types';
import { approach, clamp, formatCount, rand, starsFor, throttle } from '../../game/util';
import { renderWGSL, simulateWGSL } from './shaders';

const RUN_SECONDS = 60;
/** Free this fraction of the souls to win. */
const TARGET = 0.45;
/** Lose at once when this fraction has been devoured. */
const LOSE_AT = 0.4;
/** When the moon-gate wanders off, in seconds of play. */
const GATE_MOVES = [20, 40];
/** When each shade rises, in seconds of play. */
const SHADE_TIMES = [5, 13, 23, 34];
const MAX_SHADES = 5;
const LANTERN_REACH = 0.72;
const GATE_RADIUS = 0.17;
const READBACK_MS = 200;

/** Floats in the Scene uniform (shaders.ts): six vec4s and five shades. */
const SCENE_FLOATS = (6 + MAX_SHADES) * 4;
/** Floats per soul: pos, vel, state, timer, heat, seed. */
const SOUL_FLOATS = 8;

interface Shade {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  presence: number;
  wander: number;
}

interface CanvasSoul {
  x: number;
  y: number;
  vx: number;
  vy: number;
  guided: boolean;
  freed: boolean;
}

interface CanvasShade {
  x: number;
  y: number;
}

function canvasSouls(canvas: Canvas, size: DemoSize, hooks: GameHooks): GameInstance {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const souls: CanvasSoul[] = [];
  const shades: CanvasShade[] = [];
  let width = size.width;
  let height = size.height;
  let scale = 1;
  let elapsed = 0;
  let lastHud = 0;
  let nextShade = 6;
  let freed = 0;
  let devoured = 0;
  let lives = 3;
  let invulnerable = 0;
  let running = false;
  let paused = false;
  let ended = false;
  const cursor = { x: width / 2, y: height * 0.72 };
  const player = { x: cursor.x, y: cursor.y };
  const gate = { x: width / 2, y: height * 0.46 };
  const target = 120;

  for (let i = 0; i < target; i++) {
    souls.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: rand(-12, 12),
      vy: rand(-12, 12),
      guided: false,
      freed: false,
    });
  }

  function resize(nextWidth: number, nextHeight: number) {
    width = nextWidth;
    height = nextHeight;
    scale = capResolution(canvas, { width, height, scale: size.scale }, 1.5);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    gate.x = width / 2;
    gate.y = height * 0.46;
  }

  function finish(won: boolean, reason: 'cleared' | 'devoured' | 'time') {
    if (ended) {
      return;
    }
    ended = true;
    running = false;
    const freedFraction = freed / target;
    const score = freed * 10 + (won ? Math.round((1 - devoured / target) * 2000) : 0);
    hooks.end({
      won,
      score,
      stars: starsFor(won, freedFraction * 100, 60, 75),
      stats: [
        { label: 'Souls freed', value: `${freed} of ${target}` },
        { label: 'Devoured', value: String(devoured) },
        { label: 'Freed', value: `${Math.round(freedFraction * 100)}%` },
      ],
      verdict: won
        ? 'The moon-gate closes behind them. At last, they are home.'
        : reason === 'devoured'
          ? 'The shades feast, and the night grows colder.'
          : 'Too many remain, to wander until next All Hallows.',
    });
  }

  function draw() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#11152e');
    sky.addColorStop(1, '#07040b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const moon = ctx.createRadialGradient(width * 0.5, height * 0.2, 2, width * 0.5, height * 0.2, Math.min(width, height) * 0.2);
    moon.addColorStop(0, 'rgba(197, 231, 255, 0.42)');
    moon.addColorStop(1, 'rgba(69, 102, 167, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, width, height);

    const gatePulse = 1 + Math.sin(elapsed * 3) * 0.08;
    ctx.save();
    ctx.translate(gate.x, gate.y);
    ctx.scale(gatePulse, gatePulse);
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.8)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 78, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (const soul of souls) {
      if (soul.freed) {
        continue;
      }
      ctx.fillStyle = soul.guided ? '#a5f3fc' : '#a7f3d0';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = soul.guided ? 15 : 7;
      ctx.beginPath();
      ctx.arc(soul.x, soul.y, soul.guided ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    for (const shade of shades) {
      ctx.fillStyle = '#6d1e38';
      ctx.shadowColor = '#f05252';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(shade.x, shade.y, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    const lantern = ctx.createRadialGradient(player.x, player.y, 1, player.x, player.y, 90);
    lantern.addColorStop(0, 'rgba(253, 230, 138, 0.3)');
    lantern.addColorStop(1, 'rgba(253, 230, 138, 0)');
    ctx.fillStyle = lantern;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = invulnerable > 0 ? '#fca5a5' : '#fde68a';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function update(time: number, dt: number) {
    if (running && !paused && !ended) {
      const seconds = Math.min(dt, 50) / 1000;
      elapsed += seconds;
      invulnerable = Math.max(0, invulnerable - seconds);
      player.x += (cursor.x - player.x) * Math.min(1, seconds * 8);
      player.y += (cursor.y - player.y) * Math.min(1, seconds * 8);

      if (elapsed >= nextShade && shades.length < 4) {
        const angle = Math.random() * Math.PI * 2;
        shades.push({
          x: gate.x + Math.cos(angle) * width * 0.58,
          y: gate.y + Math.sin(angle) * height * 0.58,
        });
        nextShade += 10;
      }

      for (const soul of souls) {
        if (soul.freed) {
          continue;
        }
        if (!soul.guided && Math.hypot(soul.x - player.x, soul.y - player.y) < 88) {
          soul.guided = true;
        }
        if (soul.guided) {
          const dx = gate.x - soul.x;
          const dy = gate.y - soul.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 17) {
            soul.freed = true;
            freed++;
          } else {
            soul.x += (dx / distance) * 72 * seconds;
            soul.y += (dy / distance) * 72 * seconds;
          }
        } else {
          soul.x += soul.vx * seconds;
          soul.y += soul.vy * seconds;
          if (soul.x < 0 || soul.x > width) soul.vx *= -1;
          if (soul.y < 0 || soul.y > height) soul.vy *= -1;
        }
      }

      for (const shade of shades) {
        const dx = player.x - shade.x;
        const dy = player.y - shade.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        shade.x += (dx / distance) * 31 * seconds;
        shade.y += (dy / distance) * 31 * seconds;
        if (invulnerable <= 0 && distance < 20) {
          invulnerable = 1.4;
          lives--;
          hooks.shake();
          haptic('light');
          if (lives <= 0) {
            finish(false, 'devoured');
          }
        }
      }

      if (freed >= Math.ceil(target * TARGET)) {
        finish(true, 'cleared');
      } else if (elapsed >= RUN_SECONDS) {
        finish(false, 'time');
      }

      if (time - lastHud > 120) {
        lastHud = time;
        hooks.hud({
          score: freed * 10,
          lives,
          maxLives: 3,
          time: Math.max(0, RUN_SECONDS - elapsed),
          totalTime: RUN_SECONDS,
          meter: Math.min(1, freed / Math.ceil(target * TARGET)),
          meterLabel: 'Souls freed',
        });
      }
    }
    draw();
  }

  resize(width, height);
  return {
    frame: update,
    resize,
    pointer(kind, x, y) {
      if (kind !== 'up') {
        cursor.x = clamp(x, 0, width);
        cursor.y = clamp(y, 0, height);
      }
    },
    begin() {
      running = true;
      paused = false;
      ended = false;
      elapsed = 0;
      lastHud = 0;
      hooks.hud({
        score: 0,
        lives,
        maxLives: 3,
        time: RUN_SECONDS,
        totalTime: RUN_SECONDS,
        meter: 0,
        meterLabel: 'Souls freed',
      });
    },
    setPaused(value) {
      paused = value;
    },
    dispose() {
      running = false;
      ended = true;
    },
  };
}

/**
 * Rite V. Thousands of lost souls live entirely on the GPU: every frame a
 * WGSL compute pass steers each one (wander, flocking against a sample of
 * neighbours, the lantern's pull, fleeing shades) and decides its fate:
 * souls inside the moon-gate are freed and souls caught by a shade are
 * devoured, each counted with an atomicAdd. A render pass then draws the
 * night, the gate, the lantern and the shades in one full-screen fragment
 * shader, and the souls as instanced additive sprites read straight from the
 * simulation's storage buffer. The counters come back to JavaScript with
 * mapAsync a few times a second.
 */
export const lostSouls: GameFactory = (hooks) => async (canvas, size) => {
  const gpu = (globalThis as any).navigator?.gpu as GPU | undefined;
  if (!gpu) {
    if (typeof __WEB__ !== 'undefined' && __WEB__) {
      return canvasSouls(canvas, size, hooks);
    }
    throw new Error('The Souls needs WebGPU, which this device does not offer.');
  }
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    throw new Error('The Souls needs WebGPU, but no GPU adapter was found.');
  }
  const device: GPUDevice = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = gpu.getPreferredCanvasFormat();
  const configure = () => context.configure({ device, format, alphaMode: 'opaque' });

  let { width, height } = size;
  const DENSITY = __ANDROID__ ? 1 : 1.25;
  capResolution(canvas, size, DENSITY);
  configure();
  let unit = Math.min(width, height);
  let ax = width / unit;
  let ay = height / unit;
  const count = __ANDROID__ ? 1536 : 3072;

  const sceneData = new Float32Array(SCENE_FLOATS);
  const sceneBuffer = device.createBuffer({
    size: SCENE_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Simulated in place by the compute pass and read as instance data by the
  // render pass, so it needs both STORAGE and VERTEX.
  const soulBuffer = device.createBuffer({
    size: count * SOUL_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const counterBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const readBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: simulateWGSL }), entryPoint: 'main' },
  });
  const computeGroup: GPUBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: sceneBuffer } },
      { binding: 1, resource: { buffer: soulBuffer } },
      { binding: 2, resource: { buffer: counterBuffer } },
    ],
  });

  const renderModule = device.createShaderModule({ code: renderWGSL });
  const backgroundPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: renderModule, entryPoint: 'bg_vert' },
    fragment: { module: renderModule, entryPoint: 'bg_frag', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const soulPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: renderModule,
      entryPoint: 'soul_vert',
      buffers: [
        {
          arrayStride: SOUL_FLOATS * 4,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: renderModule,
      entryPoint: 'soul_frag',
      targets: [
        {
          format,
          // Additive: overlapping souls glow brighter.
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });
  const sceneGroup = (pipeline: typeof backgroundPipeline) =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: sceneBuffer } }],
    });
  const backgroundGroup = sceneGroup(backgroundPipeline);
  const soulGroup = sceneGroup(soulPipeline);

  const lantern = { x: 0, y: -ay * 0.45 };
  const aim = { ...lantern };
  const gate = { x: 0, y: ay * 0.55, open: 0, closing: false, next: { x: 0, y: 0 } };
  const shades: Shade[] = [];

  function scatterSouls() {
    const data = new Float32Array(count * SOUL_FLOATS);
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      // Not inside the gate's pull, or the first seconds would be free.
      do {
        x = rand(-ax, ax) * 0.9;
        y = rand(-ay, ay) * 0.9;
      } while (Math.hypot(x - gate.x, y - gate.y) < GATE_RADIUS * 3);
      const o = i * SOUL_FLOATS;
      data[o] = x;
      data[o + 1] = y;
      data[o + 2] = rand(-0.1, 0.1);
      data[o + 3] = rand(-0.1, 0.1);
      data[o + 7] = Math.random();
    }
    device.queue.writeBuffer(soulBuffer, 0, data);
    device.queue.writeBuffer(counterBuffer, 0, new Uint32Array(4));
  }
  scatterSouls();

  type Phase = 'attract' | 'playing' | 'ended';
  let phase: Phase = 'attract';
  let paused = false;
  let disposed = false;
  let time = 0;
  let elapsed = 0;
  let frame = 0;
  let dim = 0;
  let hurt = 0;
  let hitCooldown = 0;
  let stingerCooldown = 0;
  let scared = false;
  let movesDone = 0;
  let shadesRisen = 0;
  let bannerUntil = 0;

  // Counters, from the GPU (or estimated, should readback fail).
  let freed = 0;
  let devoured = 0;
  let readPending = false;
  let readStarted = 0;
  let lastRead = 0;
  let readbackBroken = false;
  let estimateFreed = 0;
  let estimateDevoured = 0;
  let chimeStep = 0;
  let lastChime = 0;
  let lastTick = 0;
  let lastGulp = 0;

  const hud: Hud = {
    score: 0,
    time: RUN_SECONDS,
    totalTime: RUN_SECONDS,
    meter: 0,
    meterLabel: 'Souls freed',
    banner: '',
  };
  const sendHud = throttle(() => hooks.hud({ ...hud }), 100);
  function setHud(update: Partial<Hud>) {
    let changed = false;
    for (const key of Object.keys(update) as (keyof Hud)[]) {
      if (hud[key] !== update[key]) {
        (hud as any)[key] = update[key];
        changed = true;
      }
    }
    if (changed) {
      sendHud();
    }
  }
  hooks.hud({ ...hud });

  // Sounds.
  const whispers = sfx.whispers(0.16);
  const drone = sfx.music('where-my-home-is', 0.5);
  const heart = sfx.heartbeat();

  function banner(text: string, seconds = 2.5) {
    setHud({ banner: text });
    bannerUntil = time + seconds;
  }

  function moveGate() {
    gate.closing = true;
    let best = { x: 0, y: 0 };
    for (let i = 0; i < 24; i++) {
      const candidate = { x: rand(-ax, ax) * 0.7, y: rand(-ay, ay) * 0.7 };
      best = candidate;
      if (
        Math.hypot(candidate.x - lantern.x, candidate.y - lantern.y) > 0.9 &&
        Math.hypot(candidate.x - gate.x, candidate.y - gate.y) > 0.8
      ) {
        break;
      }
    }
    gate.next = best;
    banner('The moon-gate wanders…');
    sfx.bell(0.3);
  }

  function raiseShade() {
    // From the edge furthest from the lantern.
    const side = Math.floor(Math.random() * 4);
    const along = rand(-0.8, 0.8);
    const x = side === 0 ? -ax - 0.2 : side === 1 ? ax + 0.2 : along * ax;
    const y = side === 2 ? -ay - 0.2 : side === 3 ? ay + 0.2 : along * ay;
    shades.push({ x, y, vx: 0, vy: 0, r: rand(0.17, 0.24), presence: 0, wander: Math.random() * 10 });
    sfx.wail(clamp(x / ax, -1, 1), 0.3, 0.8);
    if (shadesRisen === 0) {
      banner('A shade hungers…');
    }
    shadesRisen++;
  }

  function hitLantern(shade: Shade) {
    dim = 1;
    hurt = 1;
    hitCooldown = 2.5;
    const dx = shade.x - lantern.x;
    const dy = shade.y - lantern.y;
    const d = Math.hypot(dx, dy) || 1;
    shade.vx = (dx / d) * 0.7;
    shade.vy = (dy / d) * 0.7;
    haptic('heavy');
    if (!scared && elapsed > 12 && Math.random() < 0.5) {
      scared = true;
      hooks.scare(0.5);
    } else {
      hooks.shake();
      if (stingerCooldown <= 0) {
        sfx.stinger(0.4);
        stingerCooldown = 5;
      }
    }
  }

  function updateShades(dt: number) {
    const speed = 0.16 + 0.16 * (elapsed / RUN_SECONDS);
    for (const s of shades) {
      s.presence = Math.min(1, s.presence + dt / 1.5);
      s.wander += dt;
      // Hunt the lantern, where the souls gather, with a lazy weave.
      let dx = lantern.x - s.x;
      let dy = lantern.y - s.y;
      let d = Math.hypot(dx, dy) || 1;
      let wantX = (dx / d) * speed + Math.cos(s.wander * 0.9) * 0.08;
      let wantY = (dy / d) * speed + Math.sin(s.wander * 1.3) * 0.08;
      // The gate's light burns them: keep clear.
      const gx = s.x - gate.x;
      const gy = s.y - gate.y;
      const gd = Math.hypot(gx, gy) || 1;
      const keep = GATE_RADIUS + s.r + 0.25;
      if (gd < keep) {
        wantX += (gx / gd) * (keep - gd) * 2;
        wantY += (gy / gd) * (keep - gd) * 2;
      }
      // And keep apart from each other.
      for (const o of shades) {
        if (o !== s) {
          const ox = s.x - o.x;
          const oy = s.y - o.y;
          const od = Math.hypot(ox, oy) || 1;
          if (od < s.r + o.r) {
            wantX += (ox / od) * 0.2;
            wantY += (oy / od) * 0.2;
          }
        }
      }
      const k = Math.min(1, dt * 1.2);
      s.vx += (wantX - s.vx) * k;
      s.vy += (wantY - s.vy) * k;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      dx = lantern.x - s.x;
      dy = lantern.y - s.y;
      d = Math.hypot(dx, dy);
      if (d < s.r * 0.75 && hitCooldown <= 0 && s.presence > 0.8 && phase === 'playing') {
        hitLantern(s);
      }
    }
  }

  function updateGate(dt: number) {
    if (gate.closing) {
      gate.open = Math.max(0, gate.open - dt / 0.6);
      if (gate.open === 0) {
        gate.x = gate.next.x;
        gate.y = gate.next.y;
        gate.closing = false;
      }
    } else {
      gate.open = Math.min(1, gate.open + dt / 0.9);
    }
  }

  function nearestShade() {
    let best = Infinity;
    for (const s of shades) {
      best = Math.min(best, Math.hypot(s.x - lantern.x, s.y - lantern.y) - s.r);
    }
    return best;
  }

  function onCounts(nextFreed: number, nextDevoured: number) {
    if (phase !== 'playing') {
      return;
    }
    const now = Date.now();
    if (nextDevoured > devoured && now - lastGulp > 700) {
      lastGulp = now;
      sfx.banish(0, 0.15);
    }
    freed = nextFreed;
    devoured = nextDevoured;
    const step = Math.floor(freed / (count * 0.02));
    if (step > chimeStep) {
      chimeStep = step;
      if (now - lastChime > 180) {
        lastChime = now;
        sfx.chime(step % 12, clamp(gate.x / ax, -1, 1), 0.3);
      }
      if (now - lastTick > 140) {
        lastTick = now;
        haptic('light');
      }
    }
    const target = Math.ceil(count * TARGET);
    setHud({ score: freed * 10, meter: Math.min(1, freed / target) });
  }

  function finish(reason: 'time' | 'devoured' | 'cleared') {
    phase = 'ended';
    heart.stop();
    whispers.set(0.5, 2);
    const freedFrac = freed / count;
    const devouredFrac = devoured / count;
    const won = reason !== 'devoured' && freedFrac >= TARGET;
    const score = freed * 10 + (won ? Math.round((1 - devouredFrac) * 2000) : 0);
    setHud({ score, banner: '' });
    hooks.end({
      won,
      score,
      // Stars from the share of souls freed, so both soul counts rate alike.
      stars: starsFor(won, freedFrac * 100, 60, 75),
      stats: [
        { label: 'Souls freed', value: `${formatCount(freed)} of ${formatCount(count)}` },
        { label: 'Devoured', value: formatCount(devoured) },
        { label: 'Freed', value: `${Math.round(freedFrac * 100)}%` },
      ],
      verdict: won
        ? 'The moon-gate closes behind them. At last, they are home.'
        : reason === 'devoured'
          ? 'The shades feast, and the night grows colder.'
          : 'Too many remain, to wander until next All Hallows.',
    });
  }

  function checkEnd() {
    if (devoured >= count * LOSE_AT) {
      finish('devoured');
    } else if (freed + devoured >= count * 0.97) {
      finish('cleared');
    } else if (elapsed >= RUN_SECONDS) {
      finish('time');
    }
  }

  /** If mapAsync never answers, count roughly from where the lantern is. */
  function estimate(dt: number) {
    if (gate.open > 0.6 && Math.hypot(lantern.x - gate.x, lantern.y - gate.y) < GATE_RADIUS + 0.35) {
      estimateFreed += dt * count * 0.05 * (1 - dim);
    }
    for (const s of shades) {
      if (Math.hypot(s.x - lantern.x, s.y - lantern.y) < s.r + 0.3) {
        estimateDevoured += dt * count * 0.02;
      }
    }
    estimateFreed = Math.min(estimateFreed, count - estimateDevoured);
    onCounts(Math.floor(estimateFreed), Math.floor(Math.min(estimateDevoured, count)));
  }

  function readCounters() {
    readPending = true;
    readStarted = Date.now();
    readBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (disposed) {
          return;
        }
        const values = new Uint32Array(readBuffer.getMappedRange());
        const nextFreed = values[0];
        const nextDevoured = values[1];
        readBuffer.unmap();
        readPending = false;
        if (!readbackBroken) {
          onCounts(nextFreed, nextDevoured);
        }
      })
      .catch((error: unknown) => {
        console.warn('[souls] counter readback failed, estimating instead:', error);
        readbackBroken = true;
        readPending = false;
      });
  }

  function writeScene(dt: number) {
    const d = sceneData;
    d[0] = dt;
    d[1] = time % 600;
    d[2] = ax;
    d[3] = ay;
    d[4] = lantern.x;
    d[5] = lantern.y;
    d[6] = LANTERN_REACH;
    d[7] = 1 - 0.85 * dim;
    d[8] = gate.x;
    d[9] = gate.y;
    d[10] = GATE_RADIUS;
    d[11] = phase === 'playing' && gate.open > 0.6 ? 1 : 0;
    d[12] = shades.length;
    d[13] = frame;
    d[14] = count;
    d[15] = dim;
    d[16] = gate.open;
    d[17] = freed / count;
    d[18] = hurt;
    d[19] = 0.03;
    d[20] = canvas.width;
    d[21] = canvas.height;
    for (let i = 0; i < MAX_SHADES; i++) {
      const s = shades[i];
      const o = 24 + i * 4;
      d[o] = s?.x ?? 0;
      d[o + 1] = s?.y ?? 0;
      d[o + 2] = s?.r ?? 0;
      d[o + 3] = s?.presence ?? 0;
    }
    device.queue.writeBuffer(sceneBuffer, 0, d);
  }

  return {
    frame(_now, dtMs) {
      if (paused) {
        return;
      }
      const texture = context.getCurrentTexture();
      if (!texture) {
        return;
      }
      const dt = Math.min(dtMs, 50) / 1000;
      time += dt;
      frame++;

      lantern.x = approach(lantern.x, aim.x, 14, dtMs);
      lantern.y = approach(lantern.y, aim.y, 14, dtMs);
      dim = Math.max(0, dim - dt / 1.6);
      hurt = Math.max(0, hurt - dt * 1.5);
      hitCooldown -= dt;
      stingerCooldown -= dt;
      updateGate(dt);

      if (phase === 'playing') {
        elapsed += dt;
        if (movesDone < GATE_MOVES.length && elapsed >= GATE_MOVES[movesDone]) {
          movesDone++;
          moveGate();
        }
        const maxShades = __ANDROID__ ? 3 : 4;
        if (shadesRisen < Math.min(maxShades, SHADE_TIMES.length) && elapsed >= SHADE_TIMES[shadesRisen]) {
          raiseShade();
        }
        updateShades(dt);
        const near = nearestShade();
        const danger = Number.isFinite(near) ? clamp(1 - near / 1.2) : 0;
        heart.set(60 + 90 * danger, danger * 0.9);
        if (readbackBroken) {
          estimate(dt);
        } else if (readPending && Date.now() - readStarted > 2500) {
          // mapAsync never answered: stop waiting on it.
          readbackBroken = true;
          estimateFreed = freed;
          estimateDevoured = devoured;
        }
        setHud({ time: Math.max(0, Math.ceil((RUN_SECONDS - elapsed) * 10) / 10) });
        checkEnd();
      } else if (phase === 'ended') {
        updateShades(dt);
      }
      if (bannerUntil && time > bannerUntil) {
        bannerUntil = 0;
        setHud({ banner: '' });
      }

      writeScene(dt);
      const encoder = device.createCommandEncoder();

      const compute = encoder.beginComputePass();
      compute.setPipeline(computePipeline);
      compute.setBindGroup(0, computeGroup);
      compute.dispatchWorkgroups(Math.ceil(count / 64));
      compute.end();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView(),
            clearValue: [0, 0, 0, 1],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(backgroundPipeline);
      pass.setBindGroup(0, backgroundGroup);
      pass.draw(3, 1, 0, 0);
      pass.setPipeline(soulPipeline);
      pass.setBindGroup(0, soulGroup);
      pass.setVertexBuffer(0, soulBuffer);
      pass.draw(6, count, 0, 0);
      pass.end();

      // Never copy into the read buffer while it is mapped or being mapped.
      const wantRead =
        phase === 'playing' && !readbackBroken && !readPending && Date.now() - lastRead >= READBACK_MS;
      if (wantRead) {
        encoder.copyBufferToBuffer(counterBuffer, 0, readBuffer, 0, 16);
      }
      device.queue.submit([encoder.finish()]);
      if (wantRead) {
        lastRead = Date.now();
        readCounters();
      }
    },
    resize(w, h) {
      capResolution(canvas, { width: w, height: h, scale: size.scale }, DENSITY);
      width = w;
      height = h;
      unit = Math.min(w, h);
      ax = w / unit;
      ay = h / unit;
      configure();
      for (const p of [lantern, aim, gate]) {
        p.x = clamp(p.x, -ax * 0.9, ax * 0.9);
        p.y = clamp(p.y, -ay * 0.9, ay * 0.9);
      }
    },
    pointer(type, x, y) {
      if (type === 'up') {
        // The lantern stays where it was set down.
        return;
      }
      aim.x = clamp((x * 2 - width) / unit, -ax, ax);
      aim.y = clamp((height - y * 2) / unit, -ay, ay);
    },
    begin() {
      if (phase !== 'attract') {
        return;
      }
      phase = 'playing';
      elapsed = 0;
      device.queue.writeBuffer(counterBuffer, 0, new Uint32Array(4));
      lastRead = Date.now();
      setHud({ score: 0, time: RUN_SECONDS, meter: 0 });
      banner('Lead them home', 2);
    },
    setPaused(value) {
      paused = value;
      whispers.set(value ? 0 : phase === 'ended' ? 0.5 : 1, 0.3);
      drone.set(value ? 0 : 1, 0.3);
      if (value) {
        heart.set(0, 0);
      }
    },
    dispose() {
      disposed = true;
      whispers.stop();
      drone.stop();
      heart.stop();
      context.unconfigure();
      for (const buffer of [sceneBuffer, soulBuffer, counterBuffer, readBuffer]) {
        buffer.destroy();
      }
      device.destroy();
    },
  } satisfies GameInstance;
};
