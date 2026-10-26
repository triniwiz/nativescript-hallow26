import type {
  CanvasRenderingContext2D,
  OffscreenCanvas as OffscreenCanvasClass,
} from '@nativescript/canvas';
import type { DemoInstance, DemoSize } from '../canvas/runner';
import { capResolution } from '../canvas/resolution';
import { fbm1, noise1 } from '../game/noise';

// The global, so this file runs in a Worker too: @nativescript/canvas-polyfill
// installs it on the main thread, and @nativescript/canvas/worker in a Worker.
declare const OffscreenCanvas: typeof OffscreenCanvasClass;

/** Anything with a 2D context: a <Canvas> view, or an OffscreenCanvas. */
export interface Surface2D {
  getContext(contextId: '2d', options?: any): any;
}

interface Wisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number;
  size: number;
  /** 0 pale cyan, 1 sickly green. */
  tint: number;
  trail: { x: number; y: number }[];
  /** Seconds left of a gutter: the flame all but goes out. */
  gutter: number;
}

interface Figure {
  x: number;
  /** Feet. */
  y: number;
  scale: number;
  /** Seconds since it appeared, and how long it stays. */
  t: number;
  stay: number;
}

interface Crow {
  x: number;
  y: number;
  facing: number;
  seed: number;
}

/**
 * The map's backdrop, drawn by a Worker into an OffscreenCanvas: a graveyard
 * under a veiled moon, crows in a dead tree, heavy fog, and will-o'-wisps of
 * cold ghost-fire that shy from your touch. Now and then a tall figure is
 * standing among the graves. Then it isn't.
 *
 * The skyline, the fog and the clouds are painted once into OffscreenCanvases;
 * each frame stamps them and the wisps with drawImage.
 */
export function wisps() {
  return (canvas: Surface2D, size: DemoSize): DemoInstance => {
    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    let { width, height } = size;
    const scale = capResolution(canvas as never, size, 1.25);
    let skyline: OffscreenCanvasClass | null = null;
    let fog: OffscreenCanvasClass | null = null;
    let clouds: OffscreenCanvasClass | null = null;
    // The sky (gradient, moon and its halo) and the vignette never change:
    // painted once per size, stamped each frame.
    let sky: OffscreenCanvasClass | null = null;
    let vignette: OffscreenCanvasClass | null = null;
    let flock: Wisp[] = [];
    let crows: Crow[] = [];
    let figure: Figure | null = null;
    let nextFigure = 4 + Math.random() * 4;
    let pointer: { x: number; y: number } | null = null;
    let clock = 0;
    // Wisps and fog drift slowly: 30 frames a second is plenty for a backdrop.
    let sinceDraw = 0;

    /** A ghost-fire flame, pointing up: white-hot core, cold glow around it. */
    function flameSprite(core: string, body: string, edge: string) {
      const w = 48;
      const h = 80;
      const sprite = new OffscreenCanvas(w, h);
      const g = sprite.getContext('2d') as CanvasRenderingContext2D;
      const halo = g.createRadialGradient(w / 2, h * 0.62, 0, w / 2, h * 0.62, w / 2);
      halo.addColorStop(0, edge.replace('A', '0.45'));
      halo.addColorStop(1, edge.replace('A', '0'));
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      const flame = g.createRadialGradient(w / 2, h * 0.66, 1, w / 2, h * 0.58, h * 0.42);
      flame.addColorStop(0, core);
      flame.addColorStop(0.35, body);
      flame.addColorStop(1, edge.replace('A', '0'));
      g.fillStyle = flame;
      g.beginPath();
      g.moveTo(w / 2, h * 0.08);
      g.bezierCurveTo(w * 0.82, h * 0.4, w * 0.86, h * 0.72, w / 2, h * 0.9);
      g.bezierCurveTo(w * 0.14, h * 0.72, w * 0.18, h * 0.4, w / 2, h * 0.08);
      g.fill();
      return sprite;
    }
    const flames = [
      flameSprite('rgba(240, 255, 255, 1)', 'rgba(150, 230, 255, 0.75)', 'rgba(80, 160, 255, A)'),
      flameSprite('rgba(235, 255, 225, 1)', 'rgba(150, 255, 170, 0.7)', 'rgba(60, 200, 120, A)'),
    ];
    const fire = [
      { core: 'rgba(250, 255, 245, 1)', body: 'rgba(110, 200, 255, 0.7)', fade: 'rgba(60, 120, 255, 0)' },
      { core: 'rgba(245, 255, 230, 1)', body: 'rgba(110, 245, 160, 0.65)', fade: 'rgba(40, 180, 100, 0)' },
    ];

    /**
     * One tongue of flame, its base at (0, 0): a round bulb of radius `r`, then
     * a tip at height `h` that `whip` throws sideways while `kink` bends its
     * middle the other way, so it licks in an S rather than tilting stiffly.
     */
    function tongue(h: number, r: number, whip: number, kink: number, inner: string, outer: string, fade: string) {
      const tipX = whip * h * 0.3;
      const midX = tipX * 0.3 - kink * h * 0.12;
      // Hottest just above the base, burning out toward the tip.
      const fill = ctx.createLinearGradient(0, 0, tipX, -h);
      fill.addColorStop(0, outer);
      fill.addColorStop(0.18, inner);
      fill.addColorStop(0.6, outer);
      fill.addColorStop(1, fade);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(tipX, -h);
      ctx.bezierCurveTo(midX + r * 0.5, -h * 0.62, r * 1.1, -r * 1.9, r, -r);
      ctx.arc(0, -r, r, 0, Math.PI);
      ctx.bezierCurveTo(-r * 1.1, -r * 1.9, midX - r * 0.5, -h * 0.62, tipX, -h);
      ctx.fill();
    }

    function dot(r: number, g: number, b: number) {
      const n = 32;
      const sprite = new OffscreenCanvas(n, n);
      const c = sprite.getContext('2d') as CanvasRenderingContext2D;
      const gradient = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      c.fillStyle = gradient;
      c.fillRect(0, 0, n, n);
      return sprite;
    }
    const tails = [dot(120, 200, 255), dot(110, 240, 150)];
    const eyeGlint = dot(230, 240, 255);
    const redGlint = dot(255, 40, 30);

    const hillY = (x: number, base: number, amp: number, seed: number) =>
      height - base - Math.sin(x * 0.01 + seed) * amp - Math.sin(x * 0.027 + seed * 2) * amp * 0.4;

    /** Hills, graves, a bare tree and crosses, in device pixels. */
    function paintSkyline() {
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const layer = new OffscreenCanvas(w, h);
      const g = layer.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(scale, 0, 0, scale, 0, 0);

      const hill = (base: number, amp: number, color: string, seed: number) => {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, height);
        for (let x = 0; x <= width + 10; x += 10) {
          g.lineTo(x, hillY(x, base, amp, seed));
        }
        g.lineTo(width, height);
        g.closePath();
        g.fill();
      };
      hill(height * 0.3, 18, '#0f0a14', 1);
      hill(height * 0.2, 14, '#07040b', 4);

      // Graves along the front hill, leaning.
      g.fillStyle = '#030206';
      for (let x = 12; x < width; x += 26 + Math.random() * 30) {
        const groundY = hillY(x, height * 0.2, 14, 4) + 4;
        const h2 = 16 + Math.random() * 20;
        const w2 = 10 + Math.random() * 8;
        g.save();
        g.translate(x, groundY);
        g.rotate((Math.random() - 0.5) * 0.3);
        if (Math.random() < 0.25) {
          g.fillRect(-2, -h2 - 6, 4, h2 + 6);
          g.fillRect(-8, -h2 + 2, 16, 4);
        } else {
          g.beginPath();
          g.moveTo(-w2 / 2, 0);
          g.lineTo(-w2 / 2, -h2 + w2 / 2);
          g.arc(0, -h2 + w2 / 2, w2 / 2, Math.PI, 0);
          g.lineTo(w2 / 2, 0);
          g.closePath();
          g.fill();
        }
        g.restore();
      }

      // A dead tree, its branches split recursively; crows take some tips.
      crows = [];
      const tips: { x: number; y: number }[] = [];
      const branch = (x: number, y: number, len: number, angle: number, depth: number) => {
        const x2 = x + Math.cos(angle) * len;
        const y2 = y + Math.sin(angle) * len;
        g.lineWidth = Math.max(1, depth * 1.7);
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo((x + x2) / 2 + (Math.random() - 0.5) * len * 0.3, (y + y2) / 2, x2, y2);
        g.stroke();
        if (depth === 3) {
          tips.push({ x: x2, y: y2 });
        }
        if (depth > 0) {
          branch(x2, y2, len * 0.72, angle - 0.35 - Math.random() * 0.3, depth - 1);
          branch(x2, y2, len * 0.68, angle + 0.3 + Math.random() * 0.35, depth - 1);
        }
      };
      g.strokeStyle = '#030206';
      g.lineCap = 'round';
      const treeX = width * 0.82;
      branch(treeX, hillY(treeX, height * 0.2, 14, 4) + 6, Math.min(74, height * 0.095), -Math.PI / 2 - 0.08, 6);
      for (let i = 0; i < 3 && tips.length; i++) {
        const tip = tips.splice(Math.floor(Math.random() * tips.length), 1)[0];
        crows.push({ x: tip.x, y: tip.y, facing: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 100 });
      }

      // The ground in front.
      g.fillStyle = '#020104';
      g.fillRect(0, height - height * 0.08, width, height * 0.08);
      return layer;
    }

    /** A soft band of something, tiled horizontally: fog, or cloud. */
    function paintBand(color: string, blobs: number, alpha: number) {
      const w = 512;
      const h = 160;
      const layer = new OffscreenCanvas(w, h);
      const g = layer.getContext('2d') as CanvasRenderingContext2D;
      for (let i = 0; i < blobs; i++) {
        const x = Math.random() * w;
        const y = h * 0.25 + Math.random() * h * 0.5;
        const r = 24 + Math.random() * 60;
        const gradient = g.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);
        g.fillStyle = gradient;
        // Drawn twice, a tile apart, so the band wraps seamlessly.
        g.fillRect(x - r, y - r, r * 2, r * 2);
        g.save();
        g.translate(x > w / 2 ? -w : w, 0);
        g.fillRect(x - r, y - r, r * 2, r * 2);
        g.restore();
      }
      // Blobs near the top and bottom are cut off by the tile, which drew a hard
      // line across the screen: fade both edges out.
      const fade = g.createLinearGradient(0, 0, 0, h);
      fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      fade.addColorStop(0.3, 'rgba(0, 0, 0, 1)');
      fade.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
      fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = fade;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      return layer;
    }

    /** A full-size layer, painted once in dp. */
    function paintLayer(paint: (g: CanvasRenderingContext2D) => void) {
      const layer = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      const g = layer.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      paint(g);
      return layer;
    }

    function populate() {
      const count = Math.min(34, Math.round((width * height) / 14000));
      flock = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: height * (0.45 + Math.random() * 0.45),
        vx: 0,
        vy: 0,
        seed: Math.random() * 1000,
        size: 7 + Math.random() * 9,
        tint: Math.random() < 0.7 ? 0 : 1,
        trail: [],
        gutter: 0,
      }));
      skyline = paintSkyline();
      sky = paintLayer((g) => {
        const gradient = g.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#030205');
        gradient.addColorStop(0.6, '#0d0712');
        gradient.addColorStop(1, '#1a0c20');
        g.fillStyle = gradient;
        g.fillRect(0, 0, width, height);
        const mx = width * 0.22;
        const my = height * 0.12;
        const halo = g.createRadialGradient(mx, my, 0, mx, my, 130);
        halo.addColorStop(0, 'rgba(210, 220, 230, 0.3)');
        halo.addColorStop(1, 'rgba(210, 220, 230, 0)');
        g.fillStyle = halo;
        g.fillRect(mx - 130, my - 130, 260, 260);
        g.fillStyle = '#d9dfe4';
        g.beginPath();
        g.arc(mx, my, 26, 0, Math.PI * 2);
        g.fill();
      });
      vignette = paintLayer((g) => {
        const edge = g.createRadialGradient(width / 2, height * 0.55, Math.min(width, height) * 0.3, width / 2, height * 0.55, Math.max(width, height) * 0.75);
        edge.addColorStop(0, 'rgba(0,0,0,0)');
        edge.addColorStop(1, 'rgba(0,0,0,0.75)');
        g.fillStyle = edge;
        g.fillRect(0, 0, width, height);
      });
      fog ??= paintBand('110, 100, 130', 70, 0.16);
      clouds ??= paintBand('20, 16, 26', 40, 0.9);
    }

    /** The figure: tall, thin, hooded, arms too long. Feet at (0, 0), height 1. */
    function drawFigure(f: Figure, alpha: number, time: number) {
      const h = 120 * f.scale;
      ctx.save();
      ctx.translate(f.x, f.y);
      // It doesn't walk; it leans, barely.
      ctx.rotate((noise1(time * 0.0004 + f.x) - 0.5) * 0.06);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#010003';
      ctx.beginPath();
      ctx.moveTo(-h * 0.07, 0);
      ctx.lineTo(-h * 0.1, -h * 0.55);
      // Arms hanging past the knees.
      ctx.lineTo(-h * 0.17, -h * 0.68);
      ctx.lineTo(-h * 0.2, -h * 0.25);
      ctx.lineTo(-h * 0.16, -h * 0.22);
      ctx.lineTo(-h * 0.11, -h * 0.66);
      // The hood.
      ctx.quadraticCurveTo(-h * 0.12, -h * 0.98, 0, -h);
      ctx.quadraticCurveTo(h * 0.12, -h * 0.98, h * 0.11, -h * 0.66);
      ctx.lineTo(h * 0.16, -h * 0.22);
      ctx.lineTo(h * 0.2, -h * 0.25);
      ctx.lineTo(h * 0.17, -h * 0.68);
      ctx.lineTo(h * 0.1, -h * 0.55);
      ctx.lineTo(h * 0.07, 0);
      ctx.closePath();
      ctx.fill();
      // Two pale points where its eyes would be.
      ctx.globalCompositeOperation = 'lighter';
      const blink = noise1(time * 0.003 + f.x) > 0.82 ? 0.1 : 1;
      const e = h * 0.035;
      ctx.globalAlpha = alpha * 0.85 * blink;
      ctx.drawImage(eyeGlint, -h * 0.04 - e, -h * 0.85 - e, e * 2, e * 2);
      ctx.drawImage(eyeGlint, h * 0.04 - e, -h * 0.85 - e, e * 2, e * 2);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    populate();

    return {
      frame(time, dt) {
        sinceDraw += dt;
        if (sinceDraw < 32) {
          return;
        }
        const s = sinceDraw / 1000;
        sinceDraw = 0;
        clock += s;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        // The sky and a pale moon, veiled by cloud drifting across it.
        const my = height * 0.12;
        if (sky) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(sky, 0, 0);
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
        if (clouds) {
          const tileW = 640;
          const offset = (time * 0.006) % tileW;
          ctx.globalAlpha = 0.95;
          for (let x = -offset; x < width; x += tileW) {
            ctx.drawImage(clouds, x, my - 70, tileW, 200);
          }
          ctx.globalAlpha = 1;
        }

        if (skyline) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(skyline, 0, 0);
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }

        // Crows on the tree; now and then one turns its head, eyes glinting.
        for (const c of crows) {
          const turn = noise1(time * 0.0005 + c.seed) > 0.7 ? -c.facing : c.facing;
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.scale(turn, 1);
          ctx.fillStyle = '#010002';
          ctx.beginPath();
          ctx.ellipse(0, -5, 4.5, 6.5, 0.2, 0, Math.PI * 2);
          ctx.ellipse(3, -12, 3.2, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(5.5, -12.5);
          ctx.lineTo(9, -11.5);
          ctx.lineTo(5.5, -10.5);
          ctx.moveTo(-3, -1);
          ctx.lineTo(-8, 4);
          ctx.lineTo(-2, 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = noise1(time * 0.002 + c.seed) > 0.25 ? 0.9 : 0;
          ctx.drawImage(redGlint, 2.5, -14, 3, 3);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }

        // The figure among the graves.
        nextFigure -= s;
        if (!figure && nextFigure <= 0) {
          const close = Math.random() < 0.25;
          const x = width * (0.12 + Math.random() * 0.76);
          figure = {
            x,
            y: close ? height + 10 : hillY(x, height * 0.2, 14, 4) + 6,
            scale: close ? 2.6 + Math.random() * 0.6 : 0.55 + Math.random() * 0.35,
            t: 0,
            stay: close ? 1.6 : 2.5 + Math.random() * 2,
          };
        }
        let figureAlpha = 0;
        if (figure) {
          figure.t += s;
          const fadeIn = Math.min(1, figure.t / 1.4);
          const fadeOut = Math.min(1, Math.max(0, (figure.stay + 1.4 + 1.2 - figure.t) / 1.2));
          figureAlpha = Math.min(fadeIn, fadeOut);
          if (figure.t > figure.stay + 2.6) {
            figure = null;
            nextFigure = 8 + Math.random() * 8;
          } else {
            drawFigure(figure, figureAlpha * 0.95, time);
          }
        }

        // Fog rolling past in two bands, heavier toward the ground. The wisps
        // burn in front of it.
        if (fog) {
          for (const [band, speed, y, alpha] of [
            [0, 0.01, height * 0.6, 0.9],
            [1, -0.018, height * 0.78, 1],
            [2, 0.013, height * 0.9, 1],
          ] as const) {
            ctx.globalAlpha = alpha;
            const tileW = 512 * (1 + band * 0.4);
            const tileH = 160 * (1 + band * 0.4);
            const offset = (((time * speed) % tileW) + tileW) % tileW;
            for (let x = -offset; x < width; x += tileW) {
              ctx.drawImage(fog, x, y - tileH / 2, tileW, tileH);
            }
          }
        }
        ctx.globalAlpha = 1;

        // Ghost-fire: drifting, shying from a touch, drawn to the figure.
        ctx.globalCompositeOperation = 'lighter';
        for (const w of flock) {
          const wander = (fbm1(clock * 0.2 + w.seed, 3) - 0.5) * Math.PI * 4;
          let ax = Math.cos(wander) * 8;
          let ay = Math.sin(wander) * 5 - 1.5;
          if (pointer) {
            const dx = w.x - pointer.x;
            const dy = w.y - pointer.y;
            const d = Math.hypot(dx, dy) + 1;
            if (d < 180) {
              ax += (dx / d) * 220;
              ay += (dy / d) * 220;
            }
          }
          if (figure && figureAlpha > 0.3) {
            const dx = figure.x - w.x;
            const dy = figure.y - 60 * figure.scale - w.y;
            const d = Math.hypot(dx, dy) + 1;
            ax += (dx / d) * 30;
            ay += (dy / d) * 30;
          }
          w.vx = (w.vx + ax * s) * Math.exp(-1.2 * s);
          w.vy = (w.vy + ay * s) * Math.exp(-1.2 * s);
          w.x += w.vx * s;
          w.y += w.vy * s;
          if (w.x < -40) w.x = width + 40;
          else if (w.x > width + 40) w.x = -40;
          w.y = Math.max(height * 0.3, Math.min(height - 12, w.y));

          // Now and then a flame gutters almost out.
          if (w.gutter > 0) {
            w.gutter -= s;
          } else if (Math.random() < s * 0.08) {
            w.gutter = 0.2 + Math.random() * 0.5;
          }
          const flicker = 0.35 + 0.65 * fbm1(clock * 3 + w.seed, 3);
          const life = w.gutter > 0 ? 0.08 : flicker;

          w.trail.unshift({ x: w.x, y: w.y });
          if (w.trail.length > 10) {
            w.trail.length = 10;
          }
          // Embers rise off the wake, shrinking.
          for (let i = 1; i < w.trail.length; i += 2) {
            const p = w.trail[i];
            const r = w.size * (1 - i / 12) * 0.55;
            ctx.globalAlpha = life * 0.25 * (1 - i / 10);
            ctx.drawImage(tails[w.tint], p.x - r, p.y - r - w.size * 0.8 - i * 2.5, r * 2, r * 2);
          }
          // A flame dances: the bulb at its base holds still while the tongue
          // whips about, thinning as it flares, trailing behind as it drifts,
          // and a hotter inner tongue licks out of step.
          const h = w.size * (2.8 + flicker * 1.1);
          const r = w.size * (0.62 - flicker * 0.12);
          const lean = Math.max(-0.6, Math.min(0.6, -w.vx * 0.025));
          const whip = (fbm1(clock * 4.5 + w.seed * 3, 2) - 0.5) * 1.4 + lean;
          const kink = (fbm1(clock * 6.5 + w.seed * 5, 2) - 0.5) * 1.2;
          const colors = fire[w.tint];
          ctx.save();
          ctx.translate(w.x, w.y);
          ctx.globalAlpha = life * 0.7;
          ctx.drawImage(flames[w.tint], -h * 0.45, -h * 0.85, h * 0.9, h * 1.2);
          // A wide, faint pass under the body blurs its edge into the glow (the
          // passes add up: 'lighter').
          ctx.globalAlpha = life * 0.35;
          tongue(h * 1.1, r * 1.5, whip, kink, colors.body, colors.fade, colors.fade);
          ctx.globalAlpha = life * 0.75;
          tongue(h, r, whip, kink, colors.body, colors.fade, colors.fade);
          ctx.globalAlpha = life;
          tongue(h * (0.5 + 0.2 * flicker), r * 0.55, whip * 0.6 - kink * 0.5, kink, colors.core, colors.body, colors.fade);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // Vignette.
        if (vignette) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(vignette, 0, 0);
        }
      },
      resize(w, h) {
        capResolution(canvas as never, { width: w, height: h, scale: size.scale }, 1.25);
        width = w;
        height = h;
        populate();
      },
      pointer(type, x, y) {
        pointer = type === 'up' ? null : { x, y };
      },
    };
  };
}
