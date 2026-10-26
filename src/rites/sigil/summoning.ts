import type { WebGLProgram, WebGLRenderingContext, WebGLShader, WebGLUniformLocation } from '@nativescript/canvas';
import { sfx, type Loop } from '../../core/audio';
import { haptic } from '../../core/native';
import { glPixelRatio } from '../../core/gpu';
import type { GameFactory, GameInstance, Hud } from '../../game/types';
import { approach, clamp, rand, starsFor } from '../../game/util';
import { FRAGMENT, TRAIL_POINTS, VERTEX } from './shader';
import { MAX_PATH, SIGILS } from './sigils';

/** How close (in centered() units) the finger must come to the next node. */
const HIT = 0.12;
/** How close to a wrong node counts as touching it: tighter, to be fair. */
const WRONG = 0.075;
/** Seconds the finger may be lifted mid-sigil before the chain fades. */
const LIFT_GRACE = 0.6;
/** Seconds a trail point lives. */
const TRAIL_LIFE = 0.35;
const LIVES = 3;

type Phase = 'attract' | 'tracing' | 'sealed' | 'erupt' | 'done';

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * Rite IV, the Sigil: raw WebGL 1. The whole scene is one fragment shader
 * (src/rites/sigil/shader.ts) on a full-screen triangle; this side runs the
 * rules and feeds it uniforms: the sigil's nodes and progress, the finger's
 * trail, candle flicker and one-shot effects.
 *
 * Trace five sigils in order, one stroke each, before the candle burns down.
 * A wrong node, or the candle running out, cracks the circle and costs one of
 * three lives.
 */
export const summoning: GameFactory = (hooks) => (canvas, size) => {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false }) as WebGLRenderingContext;
  if (!gl) {
    throw new Error('WebGL is not available on this device.');
  }
  let { width, height } = size;
  // The shader costs per pixel: cap the backing store (see glPixelRatio).
  const pixelRatio = glPixelRatio(gl, size.scale, 1.25);
  const fit = (w: number, h: number) => {
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
  };
  fit(width, height);

  const vertex: WebGLShader = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment: WebGLShader = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program: WebGLProgram = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program failed to link: ${gl.getProgramInfoLog(program)}`);
  }

  // One triangle that covers the whole viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // The compiler drops uniforms the shader doesn't end up using; those come
  // back null and are skipped.
  const names = [
    'u_resolution',
    'u_time',
    'u_path[0]',
    'u_pathLen',
    'u_progress',
    'u_reveal',
    'u_trail[0]',
    'u_trailLen',
    'u_flicker[0]',
    'u_candle',
    'u_crack',
    'u_flare',
    'u_erupt',
    'u_face',
  ] as const;
  const u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) as Record<
    (typeof names)[number],
    WebGLUniformLocation | null
  >;
  const set1 = (loc: WebGLUniformLocation | null, v: number) => loc && gl.uniform1f(loc, v);

  const pathData = new Float32Array((MAX_PATH + 1) * 2);
  const trailData = new Float32Array(TRAIL_POINTS * 2);
  const flicker = new Float32Array(8).fill(1);
  const flickerTarget = new Float32Array(8).fill(1);

  let phase: Phase = 'attract';
  let paused = false;
  let ended = false;
  let index = 0;
  let progress = 0;
  let lives = LIVES;
  let score = 0;
  let candle = SIGILS[0].time;
  let reveal = 0.35;
  let revealTarget = 0.35;
  let crack = 0;
  let flare = 0;
  let erupt = 0;
  let face = 0;
  /** Seconds left of the face looking through the portal. */
  let faceHold = 0;
  let scareArmed = false;
  let scared = false;
  let phaseTime = 0;
  /** Input is ignored for a moment after a crack. */
  let stunned = 0;
  let down = false;
  let liftedFor = 0;
  let mistakesHere = 0;
  let cracks = 0;
  let sealed = 0;
  let timeToSpare = 0;
  let nextCrackle = rand(2, 5);
  let clock = 0;
  const trail: { x: number; y: number; age: number }[] = [];

  const beds: Loop[] = [sfx.whispers(0.16), sfx.music('electricity', 0.45)];

  // Send only what changed, the clock at most 10 times a second.
  const sent: Partial<Hud> = {};
  let lastClockSync = 0;
  function syncHud(force = false) {
    const total = SIGILS[index].time;
    const next: Partial<Hud> = {
      score,
      lives,
      maxLives: LIVES,
      totalTime: total,
      meterLabel: 'Candle',
      banner: phase === 'attract' ? '' : `Sigil ${index + 1} of ${SIGILS.length}`,
    };
    if (force || clock - lastClockSync >= 0.1) {
      lastClockSync = clock;
      next.time = Math.ceil(Math.max(0, candle));
      next.meter = Math.round(clamp(candle / total) * 100) / 100;
    }
    const update: Partial<Hud> = {};
    let changed = false;
    for (const key of Object.keys(next) as (keyof Hud)[]) {
      if (next[key] !== sent[key]) {
        (update as any)[key] = next[key];
        (sent as any)[key] = next[key];
        changed = true;
      }
    }
    if (changed) {
      hooks.hud(update);
    }
  }

  function loadSigil(i: number) {
    index = i;
    progress = 0;
    mistakesHere = 0;
    candle = SIGILS[i].time;
    const path = SIGILS[i].path;
    pathData.fill(0);
    path.forEach(([x, y], j) => {
      pathData[j * 2] = x;
      pathData[j * 2 + 1] = y;
    });
    // The face may look through on the last sigil, if the player dawdles.
    scareArmed = i === SIGILS.length - 1 && !scared && Math.random() < 0.6;
  }

  /** Centered() space: the short side spans -1..1, y up. */
  function toScene(x: number, y: number) {
    const m = Math.min(width, height);
    return { x: (x * 2 - width) / m, y: (height - y * 2) / m };
  }

  function loseLife(reason: 'wrong' | 'wax') {
    lives--;
    cracks++;
    mistakesHere++;
    crack = 1;
    stunned = 0.6;
    progress = 0;
    trail.length = 0;
    sfx.crack(0.7);
    haptic('error');
    hooks.shake();
    if (reason === 'wax') {
      candle = SIGILS[index].time;
    }
    if (lives <= 0) {
      finish(false);
    }
    syncHud(true);
  }

  function sealSigil() {
    const bonus = Math.round(candle * 15);
    const clean = mistakesHere === 0 ? 50 : 0;
    score += 100 * (index + 1) + bonus + clean;
    timeToSpare += candle;
    sealed++;
    flare = 1;
    haptic('success');
    sfx.bell(0.35);
    sfx.flame(0, 0.35);
    // A rising run of chimes.
    for (let i = 0; i < 4; i++) {
      setTimeout(() => sfx.chime(index + 4 + i, (i - 1.5) * 0.3, 0.22), i * 90);
    }
    trail.length = 0;
    phaseTime = 0;
    if (index === SIGILS.length - 1) {
      phase = 'erupt';
      hooks.shake();
      sfx.banish(0, 0.6);
    } else {
      phase = 'sealed';
      revealTarget = 0;
    }
    syncHud(true);
  }

  function finish(won: boolean) {
    if (ended) {
      return;
    }
    ended = true;
    phase = 'done';
    revealTarget = won ? 0 : 0.15;
    hooks.end({
      won,
      score,
      stars: starsFor(won, score, 1850, 2150),
      stats: [
        { label: 'Sigils sealed', value: `${sealed} of ${SIGILS.length}` },
        { label: 'Cracks in the circle', value: String(cracks) },
        { label: 'Wax to spare', value: `${timeToSpare.toFixed(1)}s` },
      ],
      verdict: won
        ? 'The circle holds. Something on the other side is still listening.'
        : 'The circle broke, and something stepped through.',
    });
  }

  function touch(x: number, y: number) {
    trail.unshift({ x, y, age: 0 });
    if (trail.length > TRAIL_POINTS) {
      trail.length = TRAIL_POINTS;
    }
    if (phase !== 'tracing' || stunned > 0) {
      return;
    }
    const path = SIGILS[index].path;
    const [nx, ny] = path[progress];
    if (Math.hypot(x - nx, y - ny) < HIT) {
      progress++;
      liftedFor = 0;
      sfx.chime(index + progress - 1, nx, 0.32);
      haptic('light');
      if (progress >= path.length) {
        sealSigil();
      }
      return;
    }
    if (progress === 0) {
      // The chain hasn't started: stray touches are free.
      return;
    }
    const [lx, ly] = path[progress - 1];
    for (const [px, py] of path) {
      const isNext = px === nx && py === ny;
      const isLast = px === lx && py === ly;
      if (!isNext && !isLast && Math.hypot(x - px, y - py) < WRONG) {
        loseLife('wrong');
        return;
      }
    }
  }

  function update(dt: number) {
    const s = dt / 1000;
    clock += s;
    phaseTime += s;

    for (const p of trail) {
      p.age += s;
    }
    while (trail.length && trail[trail.length - 1].age > TRAIL_LIFE) {
      trail.pop();
    }

    crack = Math.max(0, crack - s * 1.6);
    flare = Math.max(0, flare - s * 0.8);
    stunned = Math.max(0, stunned - s);
    reveal = approach(reveal, revealTarget, 4, dt);

    if (phase === 'tracing') {
      candle -= s;
      if (!down && progress > 0) {
        liftedFor += s;
        if (liftedFor > LIFT_GRACE) {
          // The chain fades: no life lost, just time.
          progress = 0;
          liftedFor = 0;
          sfx.banish(0, 0.18);
          haptic('warning');
        }
      }
      if (scareArmed && !scared && candle / SIGILS[index].time < 0.4) {
        scared = true;
        faceHold = 0.9;
      }
      if (candle <= 0) {
        loseLife('wax');
      }
      nextCrackle -= s;
      if (nextCrackle <= 0) {
        sfx.crackle(0.08 + 0.1 * (1 - candle / SIGILS[index].time));
        nextCrackle = rand(1.5, 4.5) * clamp(candle / SIGILS[index].time, 0.35, 1);
      }
    } else if (phase === 'sealed') {
      if (phaseTime > 0.9 && index < SIGILS.length - 1 && reveal < 0.05) {
        loadSigil(index + 1);
        revealTarget = 1;
        phase = 'tracing';
        syncHud(true);
      }
    } else if (phase === 'erupt') {
      erupt = clamp(phaseTime / 1.6);
      if (phaseTime >= 1.6) {
        finish(true);
      }
    } else if (phase === 'done' && erupt > 0) {
      // The door stays open, glowing, behind the results.
      erupt = approach(erupt, 0.35, 1.2, dt);
    }

    // The face: in quickly, hold, out.
    if (faceHold > 0) {
      const was = face;
      face = approach(face, 1, 18, dt);
      if (was < 0.6 && face >= 0.6) {
        hooks.scare(0.7);
      }
      faceHold -= s;
    } else {
      face = approach(face, 0, 5, dt);
    }

    // Candle flicker: each flame drifts toward a new random brightness, and
    // gutters harder as the wax runs out.
    const low = phase === 'tracing' ? 1 - candle / SIGILS[index].time : 0;
    for (let k = 0; k < 8; k++) {
      if (Math.random() < 0.08 + low * 0.15) {
        flickerTarget[k] = rand(0.72 - low * 0.4, 1.08);
      }
      flicker[k] = approach(flicker[k], flickerTarget[k], 14, dt);
    }
  }

  function render(time: number) {
    trailData.fill(0);
    trail.forEach((p, i) => {
      trailData[i * 2] = p.x;
      trailData[i * 2 + 1] = p.y;
    });

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    if (u.u_resolution) {
      gl.uniform2f(u.u_resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    // Wrapped so float precision holds up in long sessions.
    set1(u.u_time, (time / 1000) % 1000);
    if (u['u_path[0]']) {
      gl.uniform2fv(u['u_path[0]'], pathData);
    }
    set1(u.u_pathLen, SIGILS[index].path.length);
    set1(u.u_progress, progress);
    set1(u.u_reveal, reveal);
    if (u['u_trail[0]']) {
      gl.uniform2fv(u['u_trail[0]'], trailData);
    }
    set1(u.u_trailLen, trail.length);
    if (u['u_flicker[0]']) {
      gl.uniform1fv(u['u_flicker[0]'], flicker);
    }
    set1(u.u_candle, phase === 'tracing' ? clamp(candle / SIGILS[index].time) : 1);
    set1(u.u_crack, crack);
    set1(u.u_flare, flare);
    set1(u.u_erupt, erupt);
    set1(u.u_face, face);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  loadSigil(0);

  const instance: GameInstance = {
    frame(time, dt) {
      if (paused) {
        return;
      }
      update(dt);
      render(time);
      syncHud();
    },
    resize(w, h) {
      width = w;
      height = h;
      fit(w, h);
    },
    pointer(type, x, y) {
      if (paused) {
        return;
      }
      if (type === 'up') {
        down = false;
        return;
      }
      down = true;
      const p = toScene(x, y);
      touch(p.x, p.y);
    },
    begin() {
      if (phase !== 'attract') {
        return;
      }
      loadSigil(0);
      revealTarget = 1;
      phase = 'tracing';
      clock = 0;
      syncHud(true);
    },
    setPaused(value) {
      paused = value;
      down = false;
      for (const bed of beds) {
        bed.set(value ? 0 : 1, 0.4);
      }
    },
    dispose() {
      for (const bed of beds) {
        bed.stop(0.6);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteBuffer(buffer);
    },
  };

  syncHud(true);
  return instance;
};
