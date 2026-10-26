import {
  AudioContext,
  type AudioBuffer,
  type AudioNode,
  type AudioBufferSourceNode,
  type AudioParam,
  type GainNode,
} from '@nativescript/audio-context';
import { watch } from 'nativescript-vue';
import { onAppLifecycle } from './native';
import { settings } from './save';

/**
 * Every sound in Hallow, synthesized at runtime with the Web Audio API from
 * @nativescript/audio-context: no audio files ship with the app. Oscillators,
 * noise buffers, filters and a convolution reverb (with a generated impulse
 * response) make the wind, drones, heartbeat, music box, thunder, wails and
 * stingers.
 *
 *   one-shots ─┐
 *   loops ─────┼─▶ sfx ─┬───────────────▶ master ─▶ compressor ─▶ speakers
 *   music ─────┘        └─▶ reverb send ─▶ convolver ─┘
 *
 * If the platform has no audio, every call quietly does nothing.
 */

/** A sound that keeps playing until stopped. */
export interface Loop {
  /** Fades to `level` (0 to 1, relative to the loop's own mix) over `seconds`. */
  set(level: number, seconds?: number): void;
  stop(fade?: number): void;
}

/** A heartbeat whose rate and loudness follow the danger. */
export interface Heartbeat {
  /** `bpm` 0 rests it. `level` 0 to 1. */
  set(bpm: number, level: number): void;
  stop(): void;
}

/** Recorded one-shots in src/assets/sfx, decoded once and played from memory. */
const SAMPLES = [
  'sting', 'ghost-long', 'ghost', 'creak-long', 'creak-short', 'knock',
  'squelch-1', 'squelch-2', 'squelch-3', 'splat', 'crunch-splat', 'bone-snap',
  'swipe', 'whoosh', 'fire-light', 'thunder-1', 'thunder-2', 'thunder-3',
  'zap', 'sparks', 'box-mystery', 'box-defeated', 'box-complete', 'tock',
  'grind', 'drip', 'match', 'page', 'book', 'laugh', 'scream-1', 'scream-2',
] as const;
type Sample = (typeof SAMPLES)[number];

const any = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const vary = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

/** The music in src/assets/music. */
export type Track = 'lullaby' | 'add-ons' | 'clouds' | 'surveillance' | 'electricity' | 'where-my-home-is';

const SILENT_LOOP: Loop = { set() {}, stop() {} };
const SILENT_HEART: Heartbeat = { set() {}, stop() {} };
const MAX_VOICES = 28;

interface Mod {
  param: AudioParam;
  base: number;
  depth: number;
  hz: number;
  shape: ModShape;
  phase: number;
  /** For 'drift': where it's heading, where it is, and when it picks a new target (s). */
  target: number;
  value: number;
  next: number;
  /** Replaces the shape: the value comes from this function of the time (s). */
  fn?: (t: number) => number;
}

/**
 * 'sine' wobbles smoothly; 'noise' jumps every step (crackle); 'drift' glides
 * toward a new random target about `hz` times a second, at irregular moments,
 * the way gusts of wind come and go.
 */
type ModShape = 'sine' | 'noise' | 'drift';

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

class Engine {
  private ctx: AudioContext | null = null;
  private failed = false;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  /** End times of playing one-shots, to cap the voice count. */
  private voices: number[] = [];
  /** Decoded samples; null while decoding (or if it failed). */
  private samples = new Map<Sample, AudioBuffer | null>();
  /** Slow LFOs, driven from JS (see `modulate`). */
  private mods = new Set<Mod>();
  private modTimer: ReturnType<typeof setInterval> | null = null;

  /** Creates the graph on first use. */
  private get context(): AudioContext | null {
    if (this.ctx || this.failed) {
      return this.ctx;
    }
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;

      const compressor = ctx.createDynamicsCompressor({ threshold: -14, knee: 12, ratio: 6, attack: 0.003, release: 0.25 });
      compressor.connect(ctx.destination);
      this.master = ctx.createGain({ gain: settings.volume });
      this.master.connect(compressor);

      this.sfx = ctx.createGain({ gain: 1 });
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain({ gain: settings.music ? 1 : 0 });
      this.musicBus.connect(this.sfx);

      const reverb = ctx.createConvolver();
      reverb.buffer = this.impulse(ctx, 3.2, 2.6);
      reverb.connect(this.master);
      this.reverbSend = ctx.createGain({ gain: 0.6 });
      this.reverbSend.connect(reverb);
      this.sfx.connect(this.reverbSend);

      this.noise = this.makeNoise(ctx, 2, false);
      this.brown = this.makeNoise(ctx, 4, true);
      this.preload(ctx);

      watch(
        () => settings.volume,
        (v) => this.master.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
      );
      watch(
        () => settings.music,
        (on) => this.musicBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.1),
      );
      onAppLifecycle(
        () => void ctx.suspend().catch(() => {}),
        () => void ctx.resume().catch(() => {}),
      );
      void ctx.resume().catch(() => {});
    } catch (error) {
      console.warn('[audio] unavailable:', error);
      this.failed = true;
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Decodes the recorded one-shots in the background. Until one is ready, its synthesized stand-in plays. */
  private preload(ctx: AudioContext) {
    for (const name of SAMPLES) {
      this.samples.set(name, null);
      ctx
        .decodeAudioData(`~/assets/sfx/${name}.mp3`)
        .then((buffer) => this.samples.set(name, buffer))
        .catch((error: unknown) => console.warn(`[audio] ${name}:`, error));
    }
  }

  /**
   * Plays a decoded sample: one buffer source, a gain and a panner. Returns
   * false if it isn't decoded (yet), so the caller can synthesize instead.
   */
  private playSample(name: Sample, level: number, pan = 0, rate = 1, delay = 0): boolean {
    const ctx = this.ctx;
    const buffer = this.samples.get(name);
    if (!ctx || !buffer) {
      return false;
    }
    try {
      const t = ctx.currentTime + 0.005 + delay;
      const end = t + buffer.duration / rate;
      if (!this.voice(ctx, end)) {
        return true;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const gain = ctx.createGain({ gain: level });
      const panner = ctx.createStereoPanner({ pan: Math.max(-1, Math.min(1, pan)) });
      src.connect(gain).connect(panner).connect(this.sfx);
      src.start(t);
      this.release(ctx, end, [src, gain, panner]);
      return true;
    } catch (error) {
      console.warn('[audio]', error);
      return false;
    }
  }

  /** Starts the engine early (call from a tap, so every platform allows it). */
  wake() {
    const ctx = this.context;
    if (ctx && ctx.state !== 'running') {
      void ctx.resume().catch(() => {});
    }
  }


  private makeNoise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const data = new Float32Array(length);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    const buffer = ctx.createBuffer({ length, numberOfChannels: 1, sampleRate: rate });
    buffer.copyToChannel(data, 0);
    return buffer;
  }

  /** A stereo impulse response: decaying, darkening noise, like a stone crypt. */
  private impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer({ length, numberOfChannels: 2, sampleRate: rate });
    for (let channel = 0; channel < 2; channel++) {
      const data = new Float32Array(length);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // Later reflections are duller: lowpass harder as the tail decays.
        const k = 0.15 + 0.8 * (1 - t);
        smooth += k * (Math.random() * 2 - 1 - smooth);
        data[i] = smooth * Math.pow(1 - t, decay);
      }
      buffer.copyToChannel(data, channel);
    }
    return buffer;
  }

  /** Reserves a voice until `end` (context time). False when too many play. */
  private voice(ctx: AudioContext, end: number): boolean {
    const now = ctx.currentTime;
    this.voices = this.voices.filter((t) => t > now);
    if (this.voices.length >= MAX_VOICES) {
      return false;
    }
    this.voices.push(end);
    return true;
  }

  /** Disconnects `nodes` once `end` (context time) has passed. */
  private release(ctx: AudioContext, end: number, nodes: AudioNode[]) {
    const ms = Math.max(0, (end - ctx.currentTime) * 1000) + 250;
    setTimeout(() => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {}
      }
    }, ms);
  }

  /**
   * Wobbles `param` around `base` by `depth`, `hz` times a second (or
   * randomly, for crackle). Web Audio would connect an oscillator to the
   * param, but not every platform's audio graph supports AudioParam inputs
   * yet, so slow modulation is stepped from a JS timer instead.
   */
  private modulate(param: AudioParam, base: number, depth: number, hz: number, shape: ModShape = 'sine'): Mod {
    const mod: Mod = { param, base, depth, hz, shape, phase: Math.random() * Math.PI * 2, target: base, value: base, next: 0 };
    return this.addMod(mod);
  }

  /** Sets `param` to `fn(seconds)` on every modulation step: for parameters that move together. */
  private follow(param: AudioParam, fn: (t: number) => number): Mod {
    return this.addMod({ param, base: 0, depth: 0, hz: 0, shape: 'sine', phase: 0, target: 0, value: 0, next: 0, fn });
  }

  private addMod(mod: Mod): Mod {
    this.mods.add(mod);
    this.modTimer ??= setInterval(() => {
      const t = Date.now() / 1000;
      for (const m of this.mods) {
        let value: number;
        if (m.fn) {
          value = m.fn(t);
        } else if (m.shape === 'noise') {
          value = m.base + m.depth * (Math.random() * 2 - 1);
        } else if (m.shape === 'drift') {
          if (t >= m.next) {
            m.target = m.base + m.depth * (Math.random() * 2 - 1);
            m.next = t + (0.4 + Math.random() * 1.2) / m.hz;
          }
          m.value += (m.target - m.value) * 0.05;
          value = m.value;
        } else {
          value = m.base + m.depth * Math.sin(t * Math.PI * 2 * m.hz + m.phase);
        }
        try {
          m.param.value = value;
        } catch {}
      }
    }, 50);
    return mod;
  }

  private unmodulate(mods: Mod[]) {
    mods.forEach((m) => this.mods.delete(m));
    if (!this.mods.size && this.modTimer) {
      clearInterval(this.modTimer);
      this.modTimer = null;
    }
  }

  /** Attack to `peak`, then an exponential decay to silence. */
  private envelope(param: AudioParam, t: number, attack: number, peak: number, decay: number) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSource(ctx: AudioContext, brown = false, rate = 1) {
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.noise;
    src.loop = true;
    src.playbackRate.value = rate;
    return src;
  }

  /** Wraps a one-shot: `build` wires nodes into `out` and returns them plus its length. */
  private oneShot(
    level: number,
    pan: number,
    build: (ctx: AudioContext, t: number, out: AudioNode) => { nodes: AudioNode[]; length: number },
    delay = 0,
  ) {
    const ctx = this.context;
    if (!ctx) {
      return;
    }
    try {
      const t = ctx.currentTime + 0.01 + delay;
      const out = ctx.createGain({ gain: level });
      const panner = ctx.createStereoPanner({ pan: Math.max(-1, Math.min(1, pan)) });
      out.connect(panner);
      panner.connect(this.sfx);
      const { nodes, length } = build(ctx, t, out);
      if (!this.voice(ctx, t + length)) {
        out.disconnect();
        return;
      }
      this.release(ctx, t + length, [...nodes, out, panner]);
    } catch (error) {
      console.warn('[audio]', error);
    }
  }


  /** UI tap. */
  click() {
    this.oneShot(0.18, 0, (ctx, t, out) => {
      const osc = ctx.createOscillator({ type: 'triangle', frequency: 1400 });
      const g = ctx.createGain({ gain: 0 });
      osc.frequency.exponentialRampToValueAtTime(700, t + 0.05);
      this.envelope(g.gain, t, 0.002, 1, 0.06);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.1);
      return { nodes: [osc, g], length: 0.1 };
    });
  }

  /** A bell-like ping; `step` climbs a minor pentatonic scale, for combos. */
  chime(step = 0, pan = 0, level = 0.35) {
    const scale = [0, 3, 5, 7, 10];
    const note = 76 + scale[step % 5] + 12 * Math.floor(step / 5);
    const f = midi(Math.min(note, 100));
    this.oneShot(level, pan, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      // Inharmonic partials make it a bell rather than an organ.
      [
        [1, 1, 1.6],
        [2.76, 0.4, 0.9],
        [5.4, 0.2, 0.5],
        [8.93, 0.08, 0.25],
      ].forEach(([ratio, amp, decay]) => {
        const osc = ctx.createOscillator({ type: 'sine', frequency: f * ratio });
        const g = ctx.createGain({ gain: 0 });
        this.envelope(g.gain, t, 0.003, amp, decay);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.05);
        nodes.push(osc, g);
      });
      return { nodes, length: 1.7 };
    });
  }

  /** A church bell tolling: the start and end of a rite. */
  bell(level = 0.5) {
    this.oneShot(level, 0, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      const f = 98;
      // Hum, prime, tierce, quint, nominal, and the upper partials of a bell.
      [
        [0.5, 0.5, 6],
        [1, 0.6, 4.5],
        [1.183, 0.4, 3.5],
        [1.506, 0.25, 3],
        [2, 0.35, 2.5],
        [2.514, 0.12, 1.8],
        [3.011, 0.1, 1.4],
        [4.166, 0.06, 1],
      ].forEach(([ratio, amp, decay]) => {
        const osc = ctx.createOscillator({ type: 'sine', frequency: f * ratio });
        const g = ctx.createGain({ gain: 0 });
        this.envelope(g.gain, t, 0.004, amp, decay);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.1);
        nodes.push(osc, g);
      });
      return { nodes, length: 6.2 };
    });
  }

  /** The jump scare: a screeching dissonant cluster over a boom. */
  stinger(strength = 1) {
    const gentle = settings.gentle;
    const level = (gentle ? 0.35 : 0.85) * strength;
    // A real scream when there's one decoded; the 400-pack sting otherwise.
    const sampled =
      !gentle &&
      (this.playSample(any(['scream-1', 'scream-2'] as const), 0.95 * strength, 0, vary(0.04)) ||
        this.playSample('sting', 0.9 * strength));
    this.oneShot(level, 0, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      // Boom.
      const boom = ctx.createOscillator({ type: 'sine', frequency: 70 });
      const boomGain = ctx.createGain({ gain: 0 });
      boom.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      this.envelope(boomGain.gain, t, 0.005, 1, 1.1);
      boom.connect(boomGain).connect(out);
      boom.start(t);
      boom.stop(t + 1.2);
      nodes.push(boom, boomGain);

      if (!gentle && !sampled) {
        // Screech: detuned saws a semitone apart, bending upward.
        const shriek = ctx.createBiquadFilter({ type: 'bandpass', frequency: 1800, Q: 0.7 });
        shriek.connect(out);
        nodes.push(shriek);
        [622, 659, 698, 932, 988].forEach((f, i) => {
          const osc = ctx.createOscillator({ type: 'sawtooth', frequency: f });
          const g = ctx.createGain({ gain: 0 });
          osc.frequency.linearRampToValueAtTime(f * 1.12, t + 0.8);
          this.envelope(g.gain, t + i * 0.006, 0.01, 0.22, 0.9);
          osc.connect(g).connect(shriek);
          osc.start(t);
          osc.stop(t + 1.1);
          nodes.push(osc, g);
        });
      }

      // Noise burst.
      const hiss = this.noiseSource(ctx);
      const hp = ctx.createBiquadFilter({ type: 'highpass', frequency: 1200 });
      const hissGain = ctx.createGain({ gain: 0 });
      this.envelope(hissGain.gain, t, 0.004, gentle ? 0.25 : 0.7, 0.7);
      hiss.connect(hp).connect(hissGain).connect(out);
      hiss.start(t);
      hiss.stop(t + 0.9);
      nodes.push(hiss, hp, hissGain);
      return { nodes, length: 1.3 };
    });
  }

  /** Thunder, `delay` seconds after the flash (further storms rumble later). */
  thunder(delay = 0.3, level = 0.9) {
    if (delay < 0.5) {
      // A close strike: the crack of the bolt itself, before the rumble.
      this.playSample('zap', level * 0.55, Math.random() * 0.8 - 0.4, vary(0.08));
    }
    if (this.playSample(any(['thunder-1', 'thunder-2', 'thunder-3'] as const), level * 1.1, Math.random() * 1.2 - 0.6, vary(0.06), delay)) {
      return;
    }
    this.oneShot(
      level,
      Math.random() * 1.2 - 0.6,
      (ctx, t, out) => {
        const length = 4.5;
        const rumble = this.noiseSource(ctx, true, 0.6);
        const lp = ctx.createBiquadFilter({ type: 'lowpass', frequency: 900, Q: 0.4 });
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(120, t + length);
        const g = ctx.createGain({ gain: 0 });
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(1, t + 0.03);
        // A few rolling swells as the sound comes back off the hills.
        let at = t + 0.2;
        for (let i = 0; i < 6 && at < t + length - 0.6; i++) {
          g.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.5, at);
          at += 0.25 + Math.random() * 0.6;
        }
        g.gain.exponentialRampToValueAtTime(0.0001, t + length);
        rumble.connect(lp).connect(g).connect(out);
        rumble.start(t);
        rumble.stop(t + length);

        const crack = this.noiseSource(ctx);
        const hp = ctx.createBiquadFilter({ type: 'highpass', frequency: 2500 });
        const cg = ctx.createGain({ gain: 0 });
        this.envelope(cg.gain, t, 0.002, 0.5, 0.25);
        crack.connect(hp).connect(cg).connect(out);
        crack.start(t);
        crack.stop(t + 0.4);
        return { nodes: [rumble, lp, g, crack, hp, cg], length };
      },
      delay,
    );
  }

  /** A ghost's wail, panned to where it comes from (-1 left, 1 right). */
  wail(pan = 0, level = 0.28, pitch = 1) {
    if (Math.random() < 0.5 && this.playSample('ghost-long', level * 1.5, pan, pitch * vary(0.12))) {
      return;
    }
    this.oneShot(level, pan, (ctx, t, out) => {
      const length = 1.8;
      const f = (420 + Math.random() * 120) * pitch;
      const osc = ctx.createOscillator({ type: 'sine', frequency: f });
      const voice = ctx.createOscillator({ type: 'triangle', frequency: f * 1.005 });
      // A glide up and down, with vibrato, as a run of short ramps.
      osc.frequency.setValueAtTime(f, t);
      voice.frequency.setValueAtTime(f * 1.005, t);
      for (let k = 0.03; k <= length; k += 0.03) {
        const glide = k < 0.5 ? 1 + (k / 0.5) * 0.5 : 1.5 - ((k - 0.5) / (length - 0.5)) * 0.8;
        const hz = f * glide * (1 + 0.035 * Math.sin(k * Math.PI * 2 * 5.5));
        osc.frequency.linearRampToValueAtTime(hz, t + k);
        voice.frequency.linearRampToValueAtTime(hz * 1.005, t + k);
      }
      const g = ctx.createGain({ gain: 0 });
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.8, t + 0.35);
      g.gain.linearRampToValueAtTime(0.5, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + length);
      const vg = ctx.createGain({ gain: 0.25 });
      osc.connect(g);
      voice.connect(vg).connect(g);
      g.connect(out);
      for (const o of [osc, voice]) {
        o.start(t);
        o.stop(t + length + 0.05);
      }
      return { nodes: [osc, voice, vg, g], length };
    });
  }

  /** A ghost dissolving: a breathy downward sweep. */
  banish(pan = 0, level = 0.4) {
    this.oneShot(level, pan, (ctx, t, out) => {
      const src = this.noiseSource(ctx);
      const bp = ctx.createBiquadFilter({ type: 'bandpass', frequency: 3000, Q: 4 });
      bp.frequency.setValueAtTime(3200, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
      const g = ctx.createGain({ gain: 0 });
      this.envelope(g.gain, t, 0.02, 1, 0.6);
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.7);
      const osc = ctx.createOscillator({ type: 'sine', frequency: 900 });
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.5);
      const og = ctx.createGain({ gain: 0 });
      this.envelope(og.gain, t, 0.01, 0.35, 0.5);
      osc.connect(og).connect(out);
      osc.start(t);
      osc.stop(t + 0.6);
      return { nodes: [src, bp, g, osc, og], length: 0.75 };
    });
  }

  /** A wet splat: pumpkins. */
  splat(pan = 0, level = 0.55) {
    if (this.playSample(any(['squelch-1', 'squelch-2', 'squelch-3', 'splat', 'crunch-splat'] as const), level * 1.2, pan, vary(0.1))) {
      return;
    }
    this.oneShot(level, pan, (ctx, t, out) => {
      const src = this.noiseSource(ctx);
      const lp = ctx.createBiquadFilter({ type: 'lowpass', frequency: 2400, Q: 3 });
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      const g = ctx.createGain({ gain: 0 });
      this.envelope(g.gain, t, 0.002, 1, 0.22);
      src.connect(lp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.3);
      const thump = ctx.createOscillator({ type: 'sine', frequency: 160 });
      thump.frequency.exponentialRampToValueAtTime(55, t + 0.15);
      const tg = ctx.createGain({ gain: 0 });
      this.envelope(tg.gain, t, 0.002, 0.8, 0.18);
      thump.connect(tg).connect(out);
      thump.start(t);
      thump.stop(t + 0.25);
      return { nodes: [src, lp, g, thump, tg], length: 0.3 };
    });
  }

  /** A blade through the air. */
  whoosh(pan = 0, level = 0.22) {
    if (this.playSample(any(['swipe', 'whoosh'] as const), level * 1.8, pan, vary(0.12))) {
      return;
    }
    this.oneShot(level, pan, (ctx, t, out) => {
      const src = this.noiseSource(ctx);
      const bp = ctx.createBiquadFilter({ type: 'bandpass', frequency: 500, Q: 1.5 });
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(2800, t + 0.1);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
      const g = ctx.createGain({ gain: 0 });
      this.envelope(g.gain, t, 0.04, 1, 0.22);
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.3);
      return { nodes: [src, bp, g], length: 0.3 };
    });
  }

  /** A camera flash: the capacitor whine, then the pop. */
  flash(level = 0.4) {
    this.oneShot(level, 0, (ctx, t, out) => {
      const pop = this.noiseSource(ctx);
      const hp = ctx.createBiquadFilter({ type: 'highpass', frequency: 3000 });
      const pg = ctx.createGain({ gain: 0 });
      this.envelope(pg.gain, t, 0.001, 1, 0.08);
      pop.connect(hp).connect(pg).connect(out);
      pop.start(t);
      pop.stop(t + 0.12);
      const whine = ctx.createOscillator({ type: 'sine', frequency: 2200 });
      whine.frequency.setValueAtTime(2200, t + 0.05);
      whine.frequency.exponentialRampToValueAtTime(7800, t + 0.9);
      const wg = ctx.createGain({ gain: 0 });
      wg.gain.setValueAtTime(0.0001, t + 0.05);
      wg.gain.linearRampToValueAtTime(0.08, t + 0.2);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      whine.connect(wg).connect(out);
      whine.start(t);
      whine.stop(t + 1);
      return { nodes: [pop, hp, pg, whine, wg], length: 1 };
    });
  }

  /** Stone cracking: a wrong move. */
  crack(level = 0.6) {
    this.playSample('bone-snap', level * 0.8, 0, vary(0.1));
    this.oneShot(level, 0, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      for (let i = 0; i < 4; i++) {
        const at = t + i * (0.03 + Math.random() * 0.05);
        const src = this.noiseSource(ctx);
        const bp = ctx.createBiquadFilter({ type: 'bandpass', frequency: 600 + Math.random() * 1800, Q: 2 });
        const g = ctx.createGain({ gain: 0 });
        this.envelope(g.gain, at, 0.001, 1 - i * 0.2, 0.08 + Math.random() * 0.1);
        src.connect(bp).connect(g).connect(out);
        src.start(at);
        src.stop(at + 0.25);
        nodes.push(src, bp, g);
      }
      const low = ctx.createOscillator({ type: 'triangle', frequency: 90 });
      low.frequency.exponentialRampToValueAtTime(40, t + 0.4);
      const lg = ctx.createGain({ gain: 0 });
      this.envelope(lg.gain, t, 0.003, 0.7, 0.45);
      low.connect(lg).connect(out);
      low.start(t);
      low.stop(t + 0.5);
      nodes.push(low, lg);
      return { nodes, length: 0.6 };
    });
  }

  /** "Heh heh heh": a witch's cackle from formant-filtered saws. */
  cackle(level = 0.3) {
    this.oneShot(level, Math.random() - 0.5, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      const formant = ctx.createBiquadFilter({ type: 'bandpass', frequency: 1100, Q: 3 });
      const formant2 = ctx.createBiquadFilter({ type: 'bandpass', frequency: 2400, Q: 5 });
      formant.connect(out);
      formant2.connect(out);
      nodes.push(formant, formant2);
      for (let i = 0; i < 7; i++) {
        const at = t + i * 0.12;
        const f = 520 - i * 22 + Math.random() * 30;
        const osc = ctx.createOscillator({ type: 'sawtooth', frequency: f });
        osc.frequency.setValueAtTime(f * 1.15, at);
        osc.frequency.exponentialRampToValueAtTime(f * 0.85, at + 0.09);
        const g = ctx.createGain({ gain: 0 });
        this.envelope(g.gain, at, 0.01, 0.5, 0.09);
        osc.connect(g);
        g.connect(formant);
        g.connect(formant2);
        osc.start(at);
        osc.stop(at + 0.12);
        nodes.push(osc, g);
      }
      return { nodes, length: 1 };
    });
  }

  /**
   * "Mwa-ha-ha-ha-ha": a deep, villainous laugh. A buzzy voice (a sawtooth and
   * an octave below it, with breath noise) runs through three formant filters
   * tuned to an open "ah"; the pitch falls syllable by syllable, and the
   * reverb carries it off into the house.
   */
  laugh(level = 0.55) {
    // The recorded laugh when it's decoded; this synthesized one until then.
    if (this.playSample('laugh', level * 1.2)) {
      return;
    }
    this.oneShot(level, 0, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      const voice = ctx.createGain({ gain: 0 });
      // The "ah" formants (F1, F2, F3) of a low male voice.
      [
        [650, 6, 1],
        [1080, 8, 0.6],
        [2650, 10, 0.25],
      ].forEach(([f, q, g]) => {
        const bp = ctx.createBiquadFilter({ type: 'bandpass', frequency: f, Q: q });
        const gain = ctx.createGain({ gain: g * 3 });
        voice.connect(bp).connect(gain).connect(out);
        nodes.push(bp, gain);
      });
      const glottis = ctx.createOscillator({ type: 'sawtooth', frequency: 120 });
      const sub = ctx.createOscillator({ type: 'sawtooth', frequency: 60 });
      const subGain = ctx.createGain({ gain: 0.6 });
      const breath = this.noiseSource(ctx);
      const breathGain = ctx.createGain({ gain: 0.18 });
      glottis.connect(voice);
      sub.connect(subGain).connect(voice);
      breath.connect(breathGain).connect(voice);
      nodes.push(voice, glottis, sub, subGain, breath, breathGain);

      // "Mwaaa": a long rising-then-falling opener...
      voice.gain.setValueAtTime(0.0001, t);
      voice.gain.linearRampToValueAtTime(0.9, t + 0.12);
      voice.gain.linearRampToValueAtTime(0.7, t + 0.42);
      voice.gain.linearRampToValueAtTime(0.0001, t + 0.52);
      glottis.frequency.setValueAtTime(105, t);
      glottis.frequency.linearRampToValueAtTime(150, t + 0.2);
      glottis.frequency.linearRampToValueAtTime(128, t + 0.5);
      // ...then "ha-ha-ha-ha-ha", each a little lower and quieter.
      let at = t + 0.62;
      for (let i = 0; i < 6; i++) {
        const pitch = 150 - i * 9;
        const peak = 0.95 - i * 0.1;
        glottis.frequency.setValueAtTime(pitch * 1.08, at);
        glottis.frequency.linearRampToValueAtTime(pitch * 0.92, at + 0.12);
        voice.gain.setValueAtTime(0.0001, at);
        voice.gain.linearRampToValueAtTime(peak, at + 0.025);
        voice.gain.setValueAtTime(peak * 0.8, at + 0.09);
        voice.gain.linearRampToValueAtTime(0.0001, at + 0.14);
        // The "h": a puff of breath before each vowel.
        breathGain.gain.setValueAtTime(0.5, at - 0.03);
        breathGain.gain.linearRampToValueAtTime(0.12, at + 0.03);
        at += 0.17 + i * 0.012;
      }
      sub.frequency.setValueAtTime(52, t);
      sub.frequency.linearRampToValueAtTime(46, at);
      const end = at + 0.2;
      for (const src of [glottis, sub, breath]) {
        src.start(t);
        src.stop(end);
      }
      return { nodes, length: end - t + 0.1 };
    });
  }

  /** The rite is complete: a swelling major chord, like dawn. */
  triumph(level = 0.4) {
    this.playSample('box-complete', 0.55);
    this.oneShot(level, 0, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      const lp = ctx.createBiquadFilter({ type: 'lowpass', frequency: 600, Q: 0.5 });
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.exponentialRampToValueAtTime(3200, t + 1.6);
      lp.connect(out);
      nodes.push(lp);
      [57, 61, 64, 69, 73, 76].forEach((note, i) => {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator({ type: 'sawtooth', frequency: midi(note) * Math.pow(2, detune / 1200) });
          const g = ctx.createGain({ gain: 0 });
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.09, t + 0.5 + i * 0.08);
          g.gain.setValueAtTime(0.09, t + 2.2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
          osc.connect(g).connect(lp);
          osc.start(t);
          osc.stop(t + 4.1);
          nodes.push(osc, g);
        }
      });
      return { nodes, length: 4.2 };
    });
    this.chime(5, -0.3, 0.25);
    this.chime(7, 0.3, 0.2);
  }

  /** The rite has failed: a low, sinking tritone. */
  doom(level = 0.5) {
    this.playSample('box-defeated', 0.55);
    this.oneShot(level, 0, (ctx, t, out) => {
      const nodes: AudioNode[] = [];
      const lp = ctx.createBiquadFilter({ type: 'lowpass', frequency: 700, Q: 1 });
      lp.connect(out);
      nodes.push(lp);
      [38, 44, 45].forEach((note) => {
        const osc = ctx.createOscillator({ type: 'sawtooth', frequency: midi(note) });
        osc.frequency.linearRampToValueAtTime(midi(note) * 0.84, t + 3.5);
        const g = ctx.createGain({ gain: 0 });
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
        osc.connect(g).connect(lp);
        osc.start(t);
        osc.stop(t + 3.7);
        nodes.push(osc, g);
      });
      return { nodes, length: 3.8 };
    });
    this.bell(0.35);
  }

  /** A short crackle: a flickering bulb or candle. */
  crackle(level = 0.12) {
    this.oneShot(level, Math.random() - 0.5, (ctx, t, out) => {
      const src = this.noiseSource(ctx);
      const hp = ctx.createBiquadFilter({ type: 'highpass', frequency: 4000 });
      const g = ctx.createGain({ gain: 0 });
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 5; i++) {
        const at = t + Math.random() * 0.12;
        g.gain.setValueAtTime(0.6 + Math.random() * 0.4, at);
        g.gain.setValueAtTime(0.0001, at + 0.008);
      }
      src.connect(hp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.2);
      return { nodes: [src, hp, g], length: 0.2 };
    });
  }

  /** A door creaking somewhere in the house. */
  creak(pan = 0, level = 0.4) {
    this.playSample(Math.random() < 0.5 ? 'creak-long' : 'creak-short', level, pan, vary(0.08));
  }

  /** Three knocks on a door that shouldn't have anyone behind it. */
  knock(pan = 0, level = 0.45) {
    this.playSample('knock', level, pan, vary(0.05));
  }

  /** A short ghostly "oooh". */
  ghost(pan = 0, level = 0.3) {
    this.playSample('ghost', level, pan, vary(0.15));
  }

  /** A match struck and a flame catching. */
  flame(pan = 0, level = 0.4) {
    this.playSample('match', level, pan, vary(0.05));
    this.playSample('fire-light', level * 0.8, pan, vary(0.1), 0.35);
  }

  /** A music-box phrase that asks a question: a rite begins. */
  mystery(level = 0.5) {
    this.playSample('box-mystery', level);
  }

  /** A scream: someone, somewhere in the night. */
  scream(level = 0.5) {
    this.playSample(any(['scream-1', 'scream-2'] as const), level, Math.random() * 0.6 - 0.3, vary(0.04));
  }

  /** A clock's tock: the last seconds. */
  tock(level = 0.5) {
    this.playSample('tock', level, 0, vary(0.03));
  }

  /** Stone dragged over stone: a grave opening. */
  grind(pan = 0, level = 0.4) {
    this.playSample('grind', level, pan, vary(0.1));
  }

  /** Water dripping somewhere in the dark. */
  drip(pan = 0, level = 0.35) {
    this.playSample('drip', level, pan, vary(0.05));
  }

  /** A failing bulb: it sputters, sparks and dies. */
  sparks(pan = 0, level = 0.4) {
    this.playSample('sparks', level, pan, vary(0.08));
  }

  /** Grimoire pages. */
  page(level = 0.4) {
    this.playSample(Math.random() < 0.5 ? 'page' : 'book', level, 0, vary(0.06));
  }


  private loop(
    build: (
      ctx: AudioContext,
      out: GainNode,
      mod: (param: AudioParam, base: number, depth: number, hz: number, shape?: ModShape) => void,
      follow: (param: AudioParam, fn: (t: number) => number) => void,
    ) => { nodes: AudioNode[]; sources: { start(): void; stop(when?: number): void }[] },
    level: number,
    bus: 'sfx' | 'music' = 'sfx',
    fadeIn = 2,
  ): Loop {
    const ctx = this.context;
    if (!ctx) {
      return SILENT_LOOP;
    }
    try {
      const out = ctx.createGain({ gain: 0 });
      out.connect(bus === 'music' ? this.musicBus : this.sfx);
      const mods: Mod[] = [];
      const { nodes, sources } = build(
        ctx,
        out,
        (param, base, depth, hz, shape) => mods.push(this.modulate(param, base, depth, hz, shape)),
        (param, fn) => mods.push(this.follow(param, fn)),
      );
      sources.forEach((s) => s.start());
      out.gain.setValueAtTime(0.0001, ctx.currentTime);
      out.gain.linearRampToValueAtTime(level, ctx.currentTime + fadeIn);
      let stopped = false;
      return {
        set(value, seconds = 0.5) {
          if (!stopped) {
            out.gain.setTargetAtTime(Math.max(0.0001, value * level), ctx.currentTime, seconds / 3);
          }
        },
        stop: (fade = 1.2) => {
          if (stopped) {
            return;
          }
          stopped = true;
          this.unmodulate(mods);
          const t = ctx.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setTargetAtTime(0.0001, t, fade / 4);
          sources.forEach((s) => {
            try {
              s.stop(t + fade + 0.1);
            } catch {}
          });
          this.release(ctx, t + fade + 0.2, [...nodes, out]);
        },
      };
    } catch (error) {
      console.warn('[audio]', error);
      return SILENT_LOOP;
    }
  }

  /**
   * Wind whistling through the stones. The heavy recording alone reads as surf:
   * its energy is a 200-1000 Hz roar that swells every 8-9 s, like breakers. So
   * the roar is cut and one gust level, wandering at irregular moments (with
   * lulls in between), drives everything together, as in real wind: when a
   * gust rises it gets louder, brighter and higher, the howl wakes, leaves
   * hiss, and in a lull only a low breath is left. The air is spread over two
   * decorrelated channels so it moves around the listener.
   */
  wind(level = 0.3, strength: 'light' | 'heavy' = 'heavy'): Loop {
    const heavy = strength === 'heavy';
    let alive = true;

    // 0..1: the gust right now. Stepped once per modulation tick, whoever asks first.
    const gust = { v: 0.4, target: 0.4, next: 0, at: 0 };
    const gustAt = (t: number) => {
      if (t !== gust.at) {
        gust.at = t;
        if (t >= gust.next) {
          gust.target = Math.random() < 0.35 ? 0.05 + Math.random() * 0.2 : 0.55 + Math.random() * 0.45;
          gust.next = t + 1.5 + Math.random() * 3.5;
        }
        gust.v += (gust.target - gust.v) * 0.04;
      }
      return gust.v;
    };

    const wind = this.loop(
      (ctx, out, _mod, follow) => {
        const nodes: AudioNode[] = [];
        const sources: AudioBufferSourceNode[] = [];

        // The recording, without its roar, swelling with the gusts.
        const cut = ctx.createBiquadFilter({ type: 'highpass', frequency: heavy ? 320 : 220, Q: 0.7 });
        const recGain = ctx.createGain({ gain: 0.6 });
        follow(recGain.gain, (t) => 0.4 + 0.5 * gustAt(t));
        cut.connect(recGain).connect(out);
        nodes.push(cut, recGain);

        // Body: a low breath that never quite stops, and darkens in the lulls.
        const body = this.noiseSource(ctx, true);
        const bodyLow = ctx.createBiquadFilter({ type: 'lowpass', frequency: 220, Q: 0.5 });
        follow(bodyLow.frequency, (t) => 160 + 260 * gustAt(t));
        const bodyGain = ctx.createGain({ gain: 0.3 });
        follow(bodyGain.gain, (t) => (heavy ? 0.6 : 0.3) * (0.4 + 0.6 * gustAt(t)));
        body.connect(bodyLow).connect(bodyGain).connect(out);
        nodes.push(bodyLow, bodyGain);
        sources.push(body);

        // Air: two unrelated hisses, left and right, that open up and brighten in a gust.
        for (const [pan, rate] of [
          [-0.55, 0.93],
          [0.55, 1.07],
        ]) {
          const air = this.noiseSource(ctx, false, rate);
          const band = ctx.createBiquadFilter({ type: 'bandpass', frequency: 600, Q: 0.7 });
          follow(band.frequency, (t) => 450 + 900 * gustAt(t));
          const g = ctx.createGain({ gain: 0.05 });
          const flutter = Math.random() * 6;
          follow(g.gain, (t) => {
            const v = gustAt(t);
            return (0.03 + (heavy ? 0.35 : 0.2) * v * v) * (0.92 + 0.08 * Math.sin(t * 3.7 + flutter));
          });
          const panner = ctx.createStereoPanner({ pan });
          air.connect(band).connect(g).connect(panner).connect(out);
          nodes.push(band, g, panner);
          sources.push(air);
        }

        // The howl: narrow resonances that rise in pitch and volume with the gust, and are silent in a lull.
        // [frequency, swing, Q, gain]; the gains sit ~10 dB under the recording.
        const howls = heavy
          ? [
              [480, 160, 9, 1.4],
              [960, 260, 14, 0.6],
            ]
          : [
              [700, 200, 12, 0.09],
              [1400, 300, 16, 0.04],
            ];
        howls.forEach(([frequency, swing, Q, gain], i) => {
          const noise = this.noiseSource(ctx);
          const band = ctx.createBiquadFilter({ type: 'bandpass', frequency, Q });
          const wander = Math.random() * 6;
          follow(band.frequency, (t) => frequency * (0.85 + 0.3 * gustAt(t)) + swing * 0.5 * Math.sin(t * (0.31 + i * 0.17) + wander));
          const g = ctx.createGain({ gain: 0 });
          follow(g.gain, (t) => gain * Math.min(1, Math.max(0, gustAt(t) - 0.35) * 1.6));
          noise.connect(band).connect(g).connect(out);
          nodes.push(band, g);
          sources.push(noise);
        });

        // Dry leaves and grit, only in the strongest gusts.
        const grit = this.noiseSource(ctx, false, 1.13);
        const gritHigh = ctx.createBiquadFilter({ type: 'highpass', frequency: 3200, Q: 0.7 });
        const gritGain = ctx.createGain({ gain: 0 });
        follow(gritGain.gain, (t) => (heavy ? 0.03 : 0.012) * Math.pow(gustAt(t), 3));
        grit.connect(gritHigh).connect(gritGain).connect(out);
        nodes.push(gritHigh, gritGain);
        sources.push(grit);

        this.loadBed(ctx, `~/assets/sfx/wind-${strength}.mp3`)
          .then((buffer) => {
            if (!alive) {
              return;
            }
            const recording = ctx.createBufferSource();
            recording.buffer = buffer;
            recording.loop = true;
            recording.connect(cut);
            recording.start();
            // Stopped with the rest: loop() keeps this array.
            sources.push(recording);
          })
          .catch((error: unknown) => console.warn('[audio] wind:', error));
        return { nodes, sources };
      },
      level,
      'sfx',
      2.5,
    );
    return {
      set: (value, seconds) => wind.set(value, seconds),
      stop: (fade) => {
        alive = false;
        wind.stop(fade);
      },
    };
  }

  /** Rain on the graves: a recorded, seamless loop. */
  rain(level = 0.25): Loop {
    return this.bed('~/assets/sfx/rain.mp3', level, 'sfx');
  }

  /** A low, beating drone with a glassy whine on top. `root` is a MIDI note. */
  drone(level = 0.16, root = 33): Loop {
    return this.loop(
      (ctx, out, mod) => {
        const f = midi(root);
        const lp = ctx.createBiquadFilter({ type: 'lowpass', frequency: 260, Q: 2 });
        mod(lp.frequency, 260, 120, 0.05);
        lp.connect(out);
        const oscs = [f, f * 1.006, f * 1.498, f * 2.013].map((freq, i) => {
          const o = ctx.createOscillator({ type: i < 2 ? 'sawtooth' : 'triangle', frequency: freq });
          const g = ctx.createGain({ gain: i < 2 ? 0.5 : 0.25 });
          o.connect(g).connect(lp);
          return [o, g] as const;
        });
        // The "glass": a high sine, a tritone over the root, slowly tremoloing.
        const glass = ctx.createOscillator({ type: 'sine', frequency: f * 16 * Math.SQRT2 });
        const glassGain = ctx.createGain({ gain: 0.04 });
        mod(glassGain.gain, 0.04, 0.03, 0.3);
        glass.connect(glassGain).connect(out);
        return {
          nodes: [lp, ...oscs.flat(), glass, glassGain],
          sources: [...oscs.map(([o]) => o), glass],
        };
      },
      level,
      'music',
      3,
    );
  }

  /**
   * A music track from src/assets/music, looping in the graph, so the volume
   * and music settings and the fades apply. Each file is a seamless loop of
   * about 100 s (longer than any rite), decoded on first use.
   */
  music(track: Track, level = 0.5): Loop {
    return this.bed(`~/assets/music/${track}.mp3`, level, 'music');
  }

  /**
   * Decoded beds, most recent last. A decoded stereo minute is ~23 MB, so
   * only the few most recently used stay in memory (the lullaby and the
   * current rite's bed, typically).
   */
  private beds = new Map<string, Promise<AudioBuffer>>();

  private loadBed(ctx: AudioContext, path: string): Promise<AudioBuffer> {
    let buffer = this.beds.get(path);
    if (buffer) {
      this.beds.delete(path);
    } else {
      buffer = ctx.decodeAudioData(path);
      buffer.catch(() => this.beds.delete(path));
    }
    this.beds.set(path, buffer);
    while (this.beds.size > 2) {
      this.beds.delete(this.beds.keys().next().value!);
    }
    return buffer;
  }

  /** Loops a long recording from `path` on `bus`, fading in once it's decoded. */
  private bed(path: string, level: number, bus: 'sfx' | 'music'): Loop {
    const ctx = this.context;
    if (!ctx) {
      return SILENT_LOOP;
    }
    let out: GainNode;
    try {
      out = ctx.createGain({ gain: 0 });
      out.connect(bus === 'music' ? this.musicBus : this.sfx);
    } catch {
      return SILENT_LOOP;
    }
    let stopped = false;
    let source: AudioBufferSourceNode | null = null;
    this.loadBed(ctx, path)
      .then((buffer) => {
        if (stopped) {
          return;
        }
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(out);
        source.start();
        out.gain.setValueAtTime(0.0001, ctx.currentTime);
        out.gain.linearRampToValueAtTime(level, ctx.currentTime + 2.5);
      })
      .catch((error: unknown) => console.warn(`[audio] ${path}:`, error));

    return {
      set(value, seconds = 0.5) {
        if (!stopped) {
          out.gain.setTargetAtTime(Math.max(0.0001, value * level), ctx.currentTime, seconds / 3);
        }
      },
      stop: (fade = 1.5) => {
        if (stopped) {
          return;
        }
        stopped = true;
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0.0001, t, fade / 4);
        setTimeout(() => {
          try {
            source?.stop();
          } catch {}
          for (const node of [source, out]) {
            try {
              node?.disconnect();
            } catch {}
          }
        }, fade * 1000 + 200);
      },
    };
  }

  /** Fluorescent hum with a flicker in it: the corridor. */
  hum(level = 0.06): Loop {
    return this.loop((ctx, out) => {
      const mains = ctx.createOscillator({ type: 'sawtooth', frequency: 60 });
      const lp = ctx.createBiquadFilter({ type: 'lowpass', frequency: 420, Q: 4 });
      const h2 = ctx.createOscillator({ type: 'sine', frequency: 120 });
      const h2g = ctx.createGain({ gain: 0.6 });
      mains.connect(lp).connect(out);
      h2.connect(h2g).connect(out);
      return { nodes: [mains, lp, h2, h2g], sources: [mains, h2] };
    }, level);
  }

  /** Breathy whispers: noise through moving vocal formants. */
  whispers(level = 0.18): Loop {
    return this.loop((ctx, out, mod) => {
      const src = this.noiseSource(ctx);
      const nodes: AudioNode[] = [src];
      const sources: { start(): void; stop(when?: number): void }[] = [src];
      [700, 1200, 2600].forEach((f, i) => {
        const bp = ctx.createBiquadFilter({ type: 'bandpass', frequency: f, Q: 8 });
        mod(bp.frequency, f, f * 0.35, 0.7 + i * 0.37);
        const g = ctx.createGain({ gain: 0.5 });
        mod(g.gain, 0.5, 0.5, 0.21 + i * 0.13);
        src.connect(bp).connect(g).connect(out);
        nodes.push(bp, g);
      });
      return { nodes, sources };
    }, level);
  }

  /** A sizzle whose level follows how hard something is burning. Starts silent. */
  sizzle(level = 0.35): Loop {
    const loop = this.loop(
      (ctx, out, mod) => {
        const src = this.noiseSource(ctx);
        const hp = ctx.createBiquadFilter({ type: 'highpass', frequency: 2600 });
        const amp = ctx.createGain({ gain: 0.65 });
        mod(amp.gain, 0.65, 0.35, 0, 'noise');
        src.connect(hp).connect(amp).connect(out);
        return { nodes: [src, hp, amp], sources: [src] };
      },
      level,
      'sfx',
      0.01,
    );
    loop.set(0, 0.01);
    return loop;
  }

  /**
   * A music box with a bent tine, playing a lullaby in A minor. Each note is
   * a few inharmonic sine partials; a little random detune and rubato keep
   * it unsettling.
   */
  musicBox(level = 0.22): Loop {
    const ctx = this.context;
    if (!ctx) {
      return SILENT_LOOP;
    }
    // [MIDI note, beats] in 3/4. 0 is a rest.
    const melody: [number, number][] = [
      [69, 1], [72, 1], [76, 1], [74, 1], [72, 1], [71, 1],
      [69, 1], [64, 1], [69, 1], [68, 3],
      [69, 1], [72, 1], [76, 1], [77, 1], [76, 1], [74, 1],
      [72, 1], [71, 1], [68, 1], [69, 3],
      [81, 1], [79, 1], [77, 1], [76, 2], [72, 1],
      [74, 1], [72, 1], [71, 1], [64, 3],
      [69, 1], [71, 1], [72, 1], [71, 1], [69, 1], [68, 1],
      [69, 3], [0, 3],
    ];
    const bass = [45, 45, 52, 52, 45, 41, 40, 45, 41, 40, 45, 52, 45];
    const beat = 0.62;
    let out: GainNode;
    try {
      out = ctx.createGain({ gain: 0 });
      out.connect(this.musicBus);
      out.gain.setValueAtTime(0.0001, ctx.currentTime);
      out.gain.linearRampToValueAtTime(level, ctx.currentTime + 1.5);
    } catch {
      return SILENT_LOOP;
    }

    const pluck = (note: number, t: number, amp: number) => {
      // Slightly out of tune, like an old box.
      const f = midi(note) * Math.pow(2, (Math.random() * 18 - 9) / 1200);
      const nodes: AudioNode[] = [];
      [
        [1, 1, 1.4],
        [3.01, 0.22, 0.5],
        [5.83, 0.08, 0.25],
      ].forEach(([ratio, a, decay]) => {
        const osc = ctx.createOscillator({ type: 'sine', frequency: f * ratio });
        const g = ctx.createGain({ gain: 0 });
        this.envelope(g.gain, t, 0.002, a * amp, decay);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.05);
        nodes.push(osc, g);
      });
      this.release(ctx, t + 1.5, nodes);
    };

    let index = 0;
    let bar = 0;
    let beatInBar = 0;
    let next = ctx.currentTime + 0.3;
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) {
        return;
      }
      // Schedule anything due in the next 400 ms.
      while (next < ctx.currentTime + 0.4) {
        const [note, beats] = melody[index];
        if (note) {
          pluck(note, next, 0.5);
        }
        if (beatInBar === 0) {
          pluck(bass[bar % bass.length], next, 0.32);
        }
        // Rubato: the spring winds down now and then.
        const drag = Math.random() < 0.08 ? 1.25 : 1;
        next += beats * beat * drag;
        beatInBar += beats;
        while (beatInBar >= 3) {
          beatInBar -= 3;
          bar++;
        }
        index = (index + 1) % melody.length;
      }
    }, 100);

    return {
      set(value, seconds = 0.5) {
        out.gain.setTargetAtTime(Math.max(0.0001, value * level), ctx.currentTime, seconds / 3);
      },
      stop: (fade = 1.5) => {
        if (stopped) {
          return;
        }
        stopped = true;
        clearInterval(timer);
        out.gain.cancelScheduledValues(ctx.currentTime);
        out.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 4);
        this.release(ctx, ctx.currentTime + fade + 1.5, [out]);
      },
    };
  }

  /** A heartbeat: "lub-dub", rate and loudness set by the game. */
  heartbeat(): Heartbeat {
    const ctx = this.context;
    if (!ctx) {
      return SILENT_HEART;
    }
    let bpm = 0;
    let level = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const thump = (t: number, amp: number, f: number) => {
      this.oneShot(amp, 0, (c, at, out) => {
        const osc = c.createOscillator({ type: 'sine', frequency: f });
        osc.frequency.setValueAtTime(f, at);
        osc.frequency.exponentialRampToValueAtTime(f * 0.55, at + 0.12);
        const g = c.createGain({ gain: 0 });
        this.envelope(g.gain, at, 0.008, 1, 0.22);
        const lp = c.createBiquadFilter({ type: 'lowpass', frequency: 180 });
        osc.connect(lp).connect(g).connect(out);
        osc.start(at);
        osc.stop(at + 0.3);
        return { nodes: [osc, g, lp], length: 0.3 };
      }, Math.max(0, t - c0()));
    };
    const c0 = () => ctx.currentTime + 0.01;

    const beat = () => {
      timer = null;
      if (stopped || bpm <= 0 || level <= 0.01) {
        return;
      }
      const t = ctx.currentTime;
      thump(t, 0.9 * level, 68);
      thump(t + 0.17, 0.6 * level, 58);
      timer = setTimeout(beat, 60000 / bpm);
    };

    return {
      set(rate, amount) {
        bpm = rate;
        level = amount;
        if (!timer && !stopped && bpm > 0 && level > 0.01) {
          beat();
        }
      },
      stop() {
        stopped = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
    };
  }
}

/** The one sound engine. Calls are cheap no-ops when audio isn't available. */
export const sfx = new Engine();
