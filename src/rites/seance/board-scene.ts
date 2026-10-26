import type {
  CanvasRenderingContext2D,
  OffscreenCanvas as OffscreenCanvasClass,
} from '@nativescript/canvas';
import type { Demo, DemoInstance } from '../../canvas/runner';
import { capResolution } from '../../canvas/resolution';
import { CANVAS_FONTS, loadCanvasFonts } from '../../core/fonts';
import { clamp } from '../../game/util';
import { BOARD_H, BOARD_W, WORDS, layoutBoard, paintBoard, paintPlanchette, type BoardLayout, type Mark } from './board';

declare const OffscreenCanvas: typeof OffscreenCanvasClass;

export type GlowKind = 'spirit' | 'anger' | 'player';
export type Ease = 'inOut' | 'out';

export interface BoardScene extends DemoInstance {
  layout: BoardLayout;
  /** Glides the planchette's window onto `m`; resolves when it arrives. */
  glide(m: Mark, ms: number, ease?: Ease): Promise<void>;
  /** Lights the board under `m` for a moment. */
  glow(m: Mark, kind?: GlowKind): void;
}

const GLOW: Record<GlowKind, [number, number, number]> = {
  spirit: [216, 251, 255],
  anger: [255, 42, 42],
  player: [253, 230, 138],
};

interface Glide {
  from: { x: number; y: number };
  to: { x: number; y: number };
  start: number;
  ms: number;
  ease: Ease;
  resolve: () => void;
}

/**
 * The séance board on a transparent 2D canvas the size of the board: the
 * board itself (painted once), glows under the marks, and the planchette,
 * glided by tweens in the frame loop. Everything (glyphs, glides, touches)
 * is in board units, so they always agree.
 */
export function boardScene(options: { onTouch(x: number, y: number): void }): Demo<BoardScene> {
  return async (canvas, size) => {
    await loadCanvasFonts();
    const ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
    let { width, height } = size;
    const scale = capResolution(canvas, size, 2);
    const font = CANVAS_FONTS.fell;

    ctx.font = `100px ${font}`;
    const layout = layoutBoard((text, px) => {
      ctx.font = `${px}px ${font}`;
      return ctx.measureText(text).width;
    });

    let board: OffscreenCanvasClass | null = null;
    const k = () => width / BOARD_W;

    function paint() {
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      board = new OffscreenCanvas(w, h);
      const g = board.getContext('2d') as CanvasRenderingContext2D;
      g.setTransform(scale * k(), 0, 0, scale * k(), 0, 0);
      paintBoard(g, layout, font);
    }
    paint();

    let clock = 0;
    const planchette = { x: WORDS.REST.x, y: WORDS.REST.y, lean: 0 };
    /** 0 while it moves (the eye stares out), 1 at rest (you read the mark). */
    let reveal = 0;
    // Under 1: the whole letter fits in the window, as through clear glass.
    const MAGNIFY = 0.8;

    /** The window's glass at rest: the board beneath it, magnified. */
    function lens(g: CanvasRenderingContext2D, radius: number) {
      if (!board) {
        return;
      }
      const px = scale * k();
      const src = (radius / MAGNIFY) * px;
      g.rotate(-planchette.lean);
      g.drawImage(board, planchette.x * px - src, planchette.y * px - src, src * 2, src * 2, -radius, -radius, radius * 2, radius * 2);
      // The mark glows in the glass, so it reads at a glance.
      const light = g.createRadialGradient(0, 0, 0, 0, 0, radius);
      light.addColorStop(0, 'rgba(255, 230, 190, 0.28)');
      light.addColorStop(1, 'rgba(255, 230, 190, 0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = light;
      g.fillRect(-radius, -radius, radius * 2, radius * 2);
      g.globalCompositeOperation = 'source-over';
    }
    let glide: Glide | null = null;
    const glows: { m: Mark; kind: GlowKind; t: number }[] = [];
    let lastDraw = 0;
    const widths = new Map<string, number>();
    /** A word mark's drawn width, board units. */
    const wordWidth = (m: Mark) => {
      let w = widths.get(m.key);
      if (w === undefined) {
        ctx.font = `${m.size}px ${font}`;
        w = ctx.measureText(m.key).width;
        widths.set(m.key, w);
      }
      return w;
    };

    const instance: BoardScene = {
      layout,
      frame(time) {
        clock = time;
        // Full rate while something moves; the idle eye only needs ~20 fps.
        if (!glide && !glows.length && reveal >= 1 && time - lastDraw < 50) {
          return;
        }
        lastDraw = time;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (board) {
          ctx.drawImage(board, 0, 0);
        }
        ctx.setTransform(scale * k(), 0, 0, scale * k(), 0, 0);

        // Glows: a quick swell, a slow fade.
        ctx.globalCompositeOperation = 'lighter';
        for (let i = glows.length - 1; i >= 0; i--) {
          const g = glows[i];
          const age = (time - g.t) / 1000;
          const level = age < 0.11 ? age / 0.11 : Math.max(0, 1 - (age - 0.11) / 0.7);
          if (level <= 0 && age > 0.2) {
            glows.splice(i, 1);
            continue;
          }
          const [r, gr, b] = GLOW[g.kind];
          const radius = 70;
          // A word (YES, NO, GOODBYE) glows end to end: the light is stretched to its width.
          const stretch = g.m.key.length > 1 ? (wordWidth(g.m) / 2 + 40) / radius : 1;
          ctx.save();
          ctx.translate(g.m.x, g.m.y);
          ctx.scale(stretch, 1);
          const light = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
          light.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${0.85 * level})`);
          light.addColorStop(0.45, `rgba(${r}, ${gr}, ${b}, ${0.35 * level})`);
          light.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
          ctx.fillStyle = light;
          ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';

        // The planchette's glide.
        if (glide) {
          const t = clamp((time - glide.start) / glide.ms);
          const e = glide.ease === 'out' ? 1 - Math.pow(1 - t, 3) : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const x = glide.from.x + (glide.to.x - glide.from.x) * e;
          const y = glide.from.y + (glide.to.y - glide.from.y) * e;
          // It leans into the motion and straightens as it settles.
          planchette.lean = clamp((x - planchette.x) * 0.02, -0.2, 0.2) * 0.5 + planchette.lean * 0.5;
          planchette.x = x;
          planchette.y = y;
          if (t >= 1) {
            const done = glide;
            glide = null;
            done.resolve();
          }
        } else {
          planchette.lean *= 0.85;
        }
        // The eye gives way to the glass once it has settled, and returns as it moves.
        reveal = glide ? Math.max(0, reveal - 0.25) : Math.min(1, reveal + 0.12);
        ctx.save();
        ctx.translate(planchette.x, planchette.y);
        ctx.rotate(planchette.lean);
        paintPlanchette(ctx, time, { eye: 1 - reveal, lens });
        ctx.restore();
      },
      resize(w, h) {
        capResolution(canvas, { width: w, height: h, scale: size.scale }, 2);
        width = w;
        height = h;
        paint();
      },
      pointer(type, x, y) {
        if (type === 'down') {
          options.onTouch(x / k(), y / k());
        }
      },
      glide(m, ms, ease = 'inOut') {
        // A newer glide takes over from wherever the planchette is.
        glide?.resolve();
        return new Promise((resolve) => {
          glide = { from: { x: planchette.x, y: planchette.y }, to: { x: m.x, y: m.y }, start: clock, ms: Math.max(1, ms), ease, resolve };
        });
      },
      glow(m, kind = 'spirit') {
        glows.push({ m, kind, t: clock });
      },
    };
    return instance;
  };
}

export { BOARD_W, BOARD_H };
