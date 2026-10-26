import type {
  CanvasRenderingContext2D,
  OffscreenCanvas as OffscreenCanvasClass,
} from '@nativescript/canvas';
import type { Demo, DemoInstance } from '../canvas/runner';
import { capResolution } from '../canvas/resolution';
import { CANVAS_FONTS, loadCanvasFonts } from '../core/fonts';
import { fbm1, noise1 } from '../game/noise';

declare const OffscreenCanvas: typeof OffscreenCanvasClass;

interface Source {
  /** Where the blood leaves the letter, dp. */
  x: number;
  y: number;
}

interface Drip {
  source: Source;
  width: number;
  /** Current length below the source, and how long it may get before a drop lets go. */
  length: number;
  limit: number;
  seed: number;
  /** A drop that has let go: falling, then gone. */
  drop: { y: number; v: number } | null;
  /** The dried streak it leaves, darkening as it fades. */
  trail: number;
  /** Its colour across the stem, made once (in local coordinates). */
  fill: any;
}

/**
 * The title, bleeding. The word is drawn once into an OffscreenCanvas with
 * Creepster; its pixels are read back to find where each letter's strokes end
 * (Creepster's own drip tips), and blood runs from exactly there: oozing in
 * fits and starts (noise), swelling into a bead, letting a drop go, leaving a
 * darker trail that dries.
 *
 * Transparent: it sits over the title screen's shader backdrop.
 */
export function bleedingTitle(options: { text: string; fontSize: number; top: number }): Demo {
  return async (canvas, size): Promise<DemoInstance> => {
    await loadCanvasFonts();
    const ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
    let { width, height } = size;
    const scale = capResolution(canvas, size, 2);
    let word: OffscreenCanvasClass | null = null;
    let drips: Drip[] = [];
    let clock = 0;
    let sinceDraw = 0;

    const font = `${options.fontSize}px ${CANVAS_FONTS.creep}`;

    /** Draws the word into its own layer and finds where its strokes end. */
    function prepare() {
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const layer = new OffscreenCanvas(w, h);
      const g = layer.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.font = font;
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const fill = g.createLinearGradient(0, options.top, 0, options.top + options.fontSize);
      fill.addColorStop(0, '#ff4d4d');
      fill.addColorStop(0.45, '#d11a1a');
      fill.addColorStop(1, '#7a0808');
      g.fillStyle = fill;
      g.fillText(options.text, width / 2, options.top);

      // The bottom of the ink in each column.
      const image = g.getImageData(0, 0, w, h).data;
      const profile = new Float32Array(w).fill(-1);
      for (let x = 0; x < w; x++) {
        for (let y = h - 1; y >= 0; y--) {
          if (image[(y * w + x) * 4 + 3] > 140) {
            profile[x] = y;
            break;
          }
        }
      }
      // Local lowest points, a stroke's width apart: where blood would gather and run.
      const sources: Source[] = [];
      const gap = Math.round(9 * scale);
      for (let x = gap; x < w - gap; x++) {
        const y = profile[x];
        if (y < 0) {
          continue;
        }
        let lowest = true;
        for (let k = -gap; k <= gap && lowest; k++) {
          if (profile[x + k] > y) {
            lowest = false;
          }
        }
        if (lowest && (!sources.length || x / scale - sources[sources.length - 1].x > 9)) {
          sources.push({ x: x / scale, y: y / scale - 1 });
        }
      }

      word = layer;
      drips = sources.map((source, i) => ({
        fill: null,
        source,
        width: 2.6 + noise1(i * 7.1) * 3.4,
        length: 2 + noise1(i * 3.3) * 10,
        limit: 18 + noise1(i * 1.9) * (height - source.y - 30) * 0.7,
        seed: i * 13.37,
        drop: null,
        trail: 0,
      }));
    }

    /** One drip: it flares out of the letter, narrows, and ends in a bead. */
    function drawDrip(d: Drip, x: number, top: number, w: number, len: number, alpha: number) {
      const f = w * 0.9;
      ctx.globalAlpha = alpha;
      // Drawn about its own axis so its gradient is made once, not every frame.
      if (!d.fill) {
        d.fill = ctx.createLinearGradient(-w, 0, w, 0);
        d.fill.addColorStop(0, '#5c0505');
        d.fill.addColorStop(0.4, '#b30f0f');
        d.fill.addColorStop(1, '#4a0404');
      }
      ctx.save();
      ctx.translate(x, 0);
      x = 0;
      ctx.fillStyle = d.fill;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 - f, top);
      ctx.quadraticCurveTo(x - w / 2, top, x - w / 2, top + f);
      ctx.lineTo(x - w / 2, top + len);
      ctx.arc(x, top + len, w / 2, Math.PI, 0, true);
      ctx.lineTo(x + w / 2, top + f);
      ctx.quadraticCurveTo(x + w / 2, top, x + w / 2 + f, top);
      ctx.closePath();
      ctx.fill();
      // The bead swells a little wider than the stem.
      ctx.beginPath();
      ctx.arc(x, top + len, w * 0.68, 0, Math.PI * 2);
      ctx.fill();
      // Wet shine down one side.
      ctx.strokeStyle = 'rgba(255, 170, 170, 0.35)';
      ctx.lineWidth = Math.max(0.6, w * 0.18);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - w * 0.18, top + f);
      ctx.lineTo(x - w * 0.18, top + len - w * 0.2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 210, 210, 0.45)';
      ctx.beginPath();
      ctx.arc(x - w * 0.22, top + len - w * 0.15, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    return {
      frame(time, dt) {
        // Blood is slow: 30 frames a second is plenty, and halves the cost.
        sinceDraw += dt;
        if (word && sinceDraw < 32) {
          return;
        }
        const s = sinceDraw / 1000;
        sinceDraw = 0;
        clock += s;
        if (!word) {
          prepare();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        for (const d of drips) {
          // Blood oozes in fits and starts: it hangs, then suddenly runs.
          const urge = fbm1(clock * 0.35 + d.seed, 3);
          const speed = urge > 0.62 ? (urge - 0.62) * 70 : 0.6;
          d.length += speed * s * (1 + d.length / 60);
          if (d.length > d.limit) {
            // The bead is too heavy: it lets go, and what's left draws back up.
            d.drop = { y: d.source.y + d.length, v: 40 };
            d.trail = Math.max(d.trail, d.length);
            d.length = 3 + noise1(clock + d.seed) * 6;
            d.limit = 16 + noise1(clock * 0.7 + d.seed * 2) * (height - d.source.y - 30) * 0.75;
          }
          if (d.drop) {
            d.drop.v += 900 * s;
            d.drop.y += d.drop.v * s;
            if (d.drop.y > height + 10) {
              d.drop = null;
            }
          }
          d.trail = Math.max(0, d.trail - s * 6);
        }

        // Dried trails first, dark and thin, then the wet drips over them.
        for (const d of drips) {
          if (d.trail > d.length) {
            ctx.strokeStyle = `rgba(70, 4, 4, ${Math.min(0.55, d.trail / 80)})`;
            ctx.lineWidth = d.width * 0.45;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(d.source.x, d.source.y + 2);
            ctx.lineTo(d.source.x, d.source.y + d.trail);
            ctx.stroke();
          }
        }
        for (const d of drips) {
          drawDrip(d, d.source.x, d.source.y, d.width, d.length, 1);
          if (d.drop) {
            const r = d.width * 0.62;
            ctx.fillStyle = '#9b0c0c';
            ctx.beginPath();
            // Stretched by its speed: a falling drop is a teardrop.
            ctx.ellipse(d.source.x, d.drop.y, r, r * (1 + Math.min(1.4, d.drop.v / 500)), 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // The word over the drips' roots, so the blood comes out of it,
        // guttering now and then like the light behind it (here rather than a
        // CSS opacity animation, which would composite the canvas offscreen).
        if (word) {
          const gutter = noise1(clock * 0.9);
          ctx.globalAlpha = gutter > 0.78 ? 0.55 + (1 - gutter) * 1.5 : 1;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(word, 0, 0);
          ctx.globalAlpha = 1;
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
        // A slow, wet sheen sliding across the letters.
        const sheen = (noise1(time * 0.00015) * 1.6 - 0.3) * width;
        const shine = ctx.createLinearGradient(sheen - 60, 0, sheen + 60, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)');
        shine.addColorStop(0.5, 'rgba(255,200,200,0.16)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = shine;
        ctx.fillRect(0, options.top, width, options.fontSize * 1.1);
        ctx.globalCompositeOperation = 'source-over';
      },
      resize(w, h) {
        capResolution(canvas, { width: w, height: h, scale: size.scale }, 2);
        width = w;
        height = h;
        word = null;
      },
    };
  };
}
