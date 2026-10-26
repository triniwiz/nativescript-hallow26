import type {
  CanvasRenderingContext2D,
  OffscreenCanvas as OffscreenCanvasClass,
} from '@nativescript/canvas';
import type { DemoInstance, DemoSize } from '../../canvas/runner';
import { capResolution } from '../../canvas/resolution';
import { flameFlicker, noise1 } from '../../game/noise';

// The global, so this file runs in a Worker: @nativescript/canvas/worker installs it.
declare const OffscreenCanvas: typeof OffscreenCanvasClass;

/** What the séance tells the table: the spirit's mood. */
export type TableMood = 'calm' | 'spelling' | 'anger' | 'pleased';

export interface TableMessage {
  mood: TableMood;
}

interface Surface2D {
  getContext(contextId: '2d', options?: any): any;
}

interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

/**
 * The séance table, drawn by a Worker into an OffscreenCanvas: dark planks,
 * six candles at the points of a hexagon around the board, their light
 * pooling on the wood, smoke curling up, and a pale mist when the spirit is
 * near. The page posts the spirit's mood: anger gutters the candles blue,
 * a right answer makes them flare.
 */
export function seanceTable() {
  return (canvas: Surface2D, size: DemoSize): DemoInstance => {
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    let { width, height } = size;
    const scale = capResolution(canvas as never, size, 1.25);
    let planks: OffscreenCanvasClass | null = null;
    // Edge darkness, and the red of the spirit's anger: painted once per size.
    let shade: OffscreenCanvasClass | null = null;
    let fury: OffscreenCanvasClass | null = null;
    let mood: TableMood = 'calm';
    let moodTime = 0;
    // Candles and smoke are slow: 30 frames a second is plenty for a backdrop.
    let sinceDraw = 0;
    // Smoothed 0..1 levels the frame reads.
    let anger = 0;
    let joy = 0;
    let spirit = 0;
    const smoke: Wisp[] = [];
    const flames = Array.from({ length: 6 }, (_, i) => ({ phase: i * 1.7, out: 0 }));

    function glow(r: number, g: number, b: number) {
      const n = 128;
      const sprite = new OffscreenCanvas(n, n);
      const c = sprite.getContext('2d') as CanvasRenderingContext2D;
      const gradient = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
      gradient.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.35)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      c.fillStyle = gradient;
      c.fillRect(0, 0, n, n);
      return sprite;
    }
    const warm = glow(255, 170, 80);
    const cold = glow(120, 170, 255);
    const mist = glow(200, 210, 230);

    function paintPlanks() {
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const layer = new OffscreenCanvas(w, h);
      const g = layer.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      const plank = 74;
      for (let x = -20, i = 0; x < width + plank; x += plank, i++) {
        const tone = 26 + (i % 3) * 5;
        g.fillStyle = `rgb(${tone + 12}, ${tone}, ${tone - 8})`;
        g.fillRect(x, 0, plank - 3, height);
        // Grain: long, slightly wavering strokes down each plank.
        for (let k = 0; k < 9; k++) {
          const gx = x + 6 + Math.random() * (plank - 14);
          g.strokeStyle = `rgba(${10 + Math.random() * 20}, ${6 + Math.random() * 10}, 4, ${0.25 + Math.random() * 0.3})`;
          g.lineWidth = 0.6 + Math.random() * 1.4;
          g.beginPath();
          g.moveTo(gx, 0);
          for (let y = 0; y <= height; y += 40) {
            g.lineTo(gx + Math.sin(y * 0.01 + k) * 3, y);
          }
          g.stroke();
        }
        // A knot now and then.
        if (Math.random() < 0.6) {
          const kx = x + plank / 2;
          const ky = Math.random() * height;
          g.strokeStyle = 'rgba(8, 4, 2, 0.4)';
          for (let r = 3; r < 14; r += 3) {
            g.beginPath();
            g.ellipse(kx, ky, r, r * 1.8, 0, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }
      planks = layer;
      const edge = (color: string) => {
        const l = new OffscreenCanvas(w, h);
        const c = l.getContext('2d') as CanvasRenderingContext2D;
        c.setTransform(scale, 0, 0, scale, 0, 0);
        const gradient = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.7);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, color);
        c.fillStyle = gradient;
        c.fillRect(0, 0, width, height);
        return l;
      };
      shade = edge('rgba(0,0,0,0.7)');
      fury = edge('rgba(90, 0, 0, 0.9)');
    }

    /**
     * The six candles, ringed around the board like the points of a hexagon:
     * three in an arc above it and three below or, when the screen is too
     * short for that, three down each side. The board is sized as in
     * SeanceBoard.vue: up to 600 dp wide, 0.68 as tall, centred.
     */
    function candleAt(i: number) {
      const cx = width / 2;
      const cy = height / 2;
      const bw = Math.min(width - 20, 600);
      const bh = bw * 0.68;
      const side = i < 3 ? -1 : 1;
      const j = (i % 3) - 1;
      if (height - bh > 260) {
        const gap = Math.min(90, (height - bh) / 4);
        return { x: cx + j * bw * 0.34, y: cy + side * (bh / 2 + gap + (1 - Math.abs(j)) * 26) };
      }
      return { x: cx + side * (bw / 2 + 50 + (1 - Math.abs(j)) * 20), y: cy + j * bh * 0.32 };
    }

    paintPlanks();

    return {
      frame(time, dt) {
        sinceDraw += dt;
        if (sinceDraw < 32) {
          return;
        }
        dt = sinceDraw;
        sinceDraw = 0;
        const s = dt / 1000;
        moodTime += s;
        anger += ((mood === 'anger' && moodTime < 1.6 ? 1 : 0) - anger) * Math.min(1, s * 5);
        joy += ((mood === 'pleased' && moodTime < 1.2 ? 1 : 0) - joy) * Math.min(1, s * 5);
        spirit += ((mood === 'spelling' ? 1 : 0) - spirit) * Math.min(1, s * 2);

        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        if (planks) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(planks, 0, 0);
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
        // Darkness over the wood; the candles light it back.
        ctx.fillStyle = `rgba(4, 2, 6, ${0.72 + anger * 0.15})`;
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const f = flames[i];
          const p = candleAt(i);
          const flicker = flameFlicker(time / 1000, i);
          const level = Math.max(0.15, flicker * (1 - anger * 0.75) + joy * 0.6);
          const r = (120 + joy * 60) * level;
          ctx.globalAlpha = 0.55 * level;
          ctx.drawImage(anger > 0.3 ? cold : warm, p.x - r, p.y - r, r * 2, r * 2);
        }
        if (spirit > 0.02) {
          const r = Math.min(width, height) * 0.5;
          ctx.globalAlpha = spirit * (0.12 + 0.05 * Math.sin(time * 0.002));
          ctx.drawImage(mist, width / 2 - r, height * 0.5 - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // The candles themselves: wax, wick and flame.
        for (let i = 0; i < 6; i++) {
          const f = flames[i];
          const p = candleAt(i);
          ctx.fillStyle = '#e9e0cf';
          ctx.fillRect(p.x - 7, p.y - 6, 14, 30);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(p.x + 2, p.y - 6, 5, 30);
          ctx.fillStyle = '#1c1410';
          ctx.fillRect(p.x - 1, p.y - 11, 2, 5);
          // Noise, not sine waves: the flames lean and stretch without ever repeating.
          const sway = (noise1(time * 0.0011 + f.phase * 9) - 0.5) * 6;
          const tall = (9 + flameFlicker(time / 1000, i) * 8) * (1 - anger * 0.6) * (1 + joy * 0.5);
          const flame = ctx.createRadialGradient(p.x + sway, p.y - 12 - tall * 0.4, 1, p.x + sway, p.y - 12 - tall * 0.4, tall * 0.7);
          flame.addColorStop(0, anger > 0.3 ? '#dbeafe' : '#fff7d6');
          flame.addColorStop(0.5, anger > 0.3 ? '#60a5fa' : '#fbbf24');
          flame.addColorStop(1, 'rgba(249, 115, 22, 0)');
          ctx.fillStyle = flame;
          ctx.beginPath();
          ctx.ellipse(p.x + sway, p.y - 12 - tall * 0.45, tall * 0.28, tall * 0.62, sway * 0.03, 0, Math.PI * 2);
          ctx.fill();
          // Smoke, more of it when the candles gutter.
          if (Math.random() < (0.06 + anger * 0.4) * (dt / 16)) {
            smoke.push({ x: p.x + sway, y: p.y - 12 - tall, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 14, life: 0, max: 2 + Math.random() * 1.5, size: 3 + Math.random() * 4 });
          }
        }

        ctx.globalCompositeOperation = 'lighter';
        for (let i = smoke.length - 1; i >= 0; i--) {
          const w = smoke[i];
          w.life += s;
          if (w.life >= w.max) {
            smoke.splice(i, 1);
            continue;
          }
          w.vx += Math.sin(time * 0.002 + w.y * 0.05) * 6 * s;
          w.x += w.vx * s;
          w.y += w.vy * s;
          const t = w.life / w.max;
          const r = w.size * (1 + t * 4);
          ctx.globalAlpha = 0.18 * (1 - t);
          ctx.drawImage(mist, w.x - r, w.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // Vignette, and a red wash when the spirit is angry.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (shade) {
          ctx.drawImage(shade, 0, 0);
        }
        if (fury && anger > 0.02) {
          ctx.globalAlpha = anger;
          ctx.drawImage(fury, 0, 0);
          ctx.globalAlpha = 1;
        }
      },
      resize(w, h) {
        capResolution(canvas as never, { width: w, height: h, scale: size.scale }, 1.25);
        width = w;
        height = h;
        paintPlanks();
      },
      message(data) {
        const next = (data as TableMessage | null)?.mood;
        if (next) {
          mood = next;
          moodTime = 0;
        }
      },
    };
  };
}
