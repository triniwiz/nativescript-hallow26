const audioAssets = import.meta.glob('../assets/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

interface GainOptions {
  gain?: number;
}

interface OscillatorOptions {
  type?: OscillatorType;
  frequency?: number;
}

interface BiquadOptions {
  type?: BiquadFilterType;
  frequency?: number;
  Q?: number;
}

interface PannerOptions {
  pan?: number;
}

interface BufferOptions {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
}

interface CompressorOptions {
  threshold?: number;
  knee?: number;
  ratio?: number;
  attack?: number;
  release?: number;
}

function assetUrl(path: string): string {
  if (!path.startsWith('~/assets/')) {
    return path;
  }
  const key = `../assets/${path.slice('~/assets/'.length)}`;
  const url = audioAssets[key];
  if (!url) {
    throw new Error(`Audio asset not found: ${path}`);
  }
  return url;
}

class BrowserAudioContext {
  private readonly context: globalThis.AudioContext;

  constructor(options?: AudioContextOptions) {
    this.context = new window.AudioContext(options);
  }

  get currentTime() {
    return this.context.currentTime;
  }

  get destination() {
    return this.context.destination;
  }

  get sampleRate() {
    return this.context.sampleRate;
  }

  get state() {
    return this.context.state;
  }

  createDynamicsCompressor(options: CompressorOptions = {}) {
    const node = this.context.createDynamicsCompressor();
    if (options.threshold !== undefined) node.threshold.value = options.threshold;
    if (options.knee !== undefined) node.knee.value = options.knee;
    if (options.ratio !== undefined) node.ratio.value = options.ratio;
    if (options.attack !== undefined) node.attack.value = options.attack;
    if (options.release !== undefined) node.release.value = options.release;
    return node;
  }

  createGain(options: GainOptions = {}) {
    const node = this.context.createGain();
    if (options.gain !== undefined) node.gain.value = options.gain;
    return node;
  }

  createOscillator(options: OscillatorOptions = {}) {
    const node = this.context.createOscillator();
    if (options.type !== undefined) node.type = options.type;
    if (options.frequency !== undefined) node.frequency.value = options.frequency;
    return node;
  }

  createBiquadFilter(options: BiquadOptions = {}) {
    const node = this.context.createBiquadFilter();
    if (options.type !== undefined) node.type = options.type;
    if (options.frequency !== undefined) node.frequency.value = options.frequency;
    if (options.Q !== undefined) node.Q.value = options.Q;
    return node;
  }

  createStereoPanner(options: PannerOptions = {}) {
    const node = this.context.createStereoPanner();
    if (options.pan !== undefined) node.pan.value = options.pan;
    return node;
  }

  createBuffer(options: BufferOptions) {
    return this.context.createBuffer(options.numberOfChannels, options.length, options.sampleRate);
  }

  createBufferSource() {
    return this.context.createBufferSource();
  }

  createConvolver() {
    return this.context.createConvolver();
  }

  async decodeAudioData(source: string | ArrayBuffer): Promise<AudioBuffer> {
    if (typeof source !== 'string') {
      return this.context.decodeAudioData(source);
    }
    const url = assetUrl(source);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load audio (${response.status}): ${url}`);
    }
    return this.context.decodeAudioData(await response.arrayBuffer());
  }

  resume() {
    return this.context.resume();
  }

  suspend() {
    return this.context.suspend();
  }
}

export { BrowserAudioContext as AudioContext };
