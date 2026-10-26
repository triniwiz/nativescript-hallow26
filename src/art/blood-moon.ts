import type { WebGLRenderingContext, WebGLUniformLocation } from '@nativescript/canvas';
import type { Demo, DemoInstance } from '../canvas/runner';
import { sfx } from '../core/audio';
import { glPixelRatio } from '../core/gpu';

/**
 * The title screen's backdrop, one GLSL fragment shader: a blood moon behind
 * drifting clouds, a haunted house with flickering windows on a hill of
 * graves, an iron fence, rolling fog, bats, and lightning. `dawn` (0 to 1)
 * sets the moon and brings up the sunrise once every candle is lit.
 */
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dawn;
uniform float u_flash;
uniform float u_bolt;
// A figure the lightning reveals: how present it is (its eyes linger), and where.
uniform float u_figure;
uniform float u_figureX;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float box(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// A gable: base at y = 0, apex at (0, h), half width w. Negative inside.
float gable(vec2 p, float w, float h) {
  return max(-p.y, p.y - h * (1.0 - abs(p.x) / w));
}
float nearHill(float x, float hx) {
  return 0.17 + 0.06 * exp(-pow((x - hx) / 0.3, 2.0)) + 0.012 * sin(x * 9.0) + 0.006 * sin(x * 23.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  // x is centred, y runs 0 (bottom) to 1 (top); s scales props on narrow screens.
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float s = min(aspect, 1.0) * 1.1;
  float px = 1.5 / u_resolution.y;
  float t = u_time;
  // On tall screens the menu covers the bottom, so the land rises to meet it.
  float lift = clamp((0.9 - aspect) * 0.4, 0.0, 0.16);
  vec2 lp = vec2(p.x, p.y - lift);

  // Sky.
  vec3 night = mix(vec3(0.015, 0.008, 0.03), vec3(0.2, 0.035, 0.07), pow(1.0 - uv.y, 2.2));
  vec3 morning = mix(vec3(0.22, 0.32, 0.62), vec3(1.0, 0.56, 0.32), pow(1.0 - uv.y, 1.6));
  vec3 col = mix(night, morning, u_dawn);

  // Stars: soft round points scattered on a grid sized to the screen (not
  // the backing store, which is deliberately low-res), twinkling, gone by dawn.
  vec2 sp = vec2(uv.x * aspect, uv.y) * 70.0;
  vec2 cell = floor(sp);
  float sh = hash(cell);
  vec2 centre = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.6 + 0.2;
  float twinkle = 0.45 + 0.55 * sin(t * (1.5 + sh * 2.0) + sh * 40.0);
  float star = step(0.93, sh) * smoothstep(0.16, 0.0, length(fract(sp) - centre)) * twinkle;
  col += star * smoothstep(0.35, 0.8, uv.y) * (1.0 - u_dawn) * 0.85;

  // The moon: low and red, setting as dawn comes.
  vec2 moonPos = vec2(0.12 * s, mix(0.73, 0.2 + lift, u_dawn));
  float moonR = 0.1 * s;
  float d = length(p - moonPos);
  float craters = fbm((p - moonPos) * 18.0 / s);
  vec3 moonCol = mix(vec3(0.98, 0.42, 0.22), vec3(0.62, 0.12, 0.08), smoothstep(0.35, 0.75, craters));
  moonCol = mix(moonCol, vec3(1.0, 0.95, 0.85), u_dawn * 0.6);
  float disk = smoothstep(moonR, moonR - px, d);
  col += vec3(0.7, 0.12, 0.06) * exp(-max(d - moonR, 0.0) * 9.0 / s) * 0.55 * (1.0 - u_dawn * 0.5);
  col = mix(col, moonCol, disk);

  // The sun, rising behind the hills.
  col += vec3(1.0, 0.6, 0.25) * exp(-length(p - vec2(-0.1 * s, 0.12 + lift)) * 4.0) * u_dawn;

  // Clouds, lit from underneath by the moon.
  float c = fbm(vec2(p.x * 2.2 + t * 0.025, p.y * 7.0 - t * 0.004));
  float clouds = smoothstep(0.5, 0.78, c) * smoothstep(0.32, 0.6, uv.y);
  vec3 cloudCol = mix(vec3(0.08, 0.03, 0.08), vec3(0.45, 0.12, 0.12), exp(-d * 6.0 / s));
  cloudCol = mix(cloudCol, vec3(0.95, 0.75, 0.7), u_dawn);
  col = mix(col, cloudCol, clouds * 0.85);

  // Lightning: the sky flares, and a jagged bolt hits the far hills.
  col += vec3(0.55, 0.55, 0.85) * u_flash * (0.35 + uv.y * 0.6);
  if (u_flash > 0.05) {
    float bx = (u_bolt - 0.5) * aspect * 0.8;
    float jag = (noise(vec2(p.y * 14.0, u_bolt * 50.0)) - 0.5) * 0.09 + (noise(vec2(p.y * 50.0, u_bolt * 10.0)) - 0.5) * 0.02;
    float bolt = smoothstep(0.004, 0.0, abs(p.x - bx - jag)) * step(0.28 + lift, p.y);
    col += vec3(0.9, 0.9, 1.0) * bolt * u_flash * 1.5;
  }

  // Far hills.
  float far = 0.3 + 0.035 * sin(p.x * 3.1 + 1.0) + 0.02 * sin(p.x * 8.3 + 2.0) + 0.01 * noise(vec2(p.x * 30.0, 0.0));
  vec3 farCol = mix(vec3(0.05, 0.02, 0.06), vec3(0.32, 0.22, 0.3), u_dawn) + vec3(0.25, 0.25, 0.4) * u_flash * 0.4;
  col = mix(col, farCol, smoothstep(far + px, far - px, lp.y));

  // Near hill with the house and its graves: pure silhouette.
  float hx = -0.1 * s;
  float hill = nearHill(p.x, hx);
  float solid = smoothstep(hill + px, hill - px, lp.y);

  vec2 hp = (lp - vec2(hx, nearHill(hx, hx) - 0.004)) / s;
  float house = box(hp - vec2(0.0, 0.05), vec2(0.075, 0.05));
  house = min(house, gable(hp - vec2(0.0, 0.1), 0.095, 0.075));
  house = min(house, box(hp - vec2(0.066, 0.1), vec2(0.022, 0.1)));
  house = min(house, gable(hp - vec2(0.066, 0.2), 0.03, 0.1));
  house = min(house, box(hp - vec2(-0.045, 0.15), vec2(0.008, 0.03)));
  // A crooked weathervane.
  house = min(house, box(hp - vec2(0.066, 0.31), vec2(0.0015, 0.012)));
  solid = max(solid, smoothstep(px, -px, house * s));

  // Graves: one in some cells along the hill, leaning a little.
  float gw = 0.055 * s;
  float gi = floor(p.x / gw);
  float gx = (gi + 0.5) * gw;
  float gr = hash(vec2(gi, 3.0));
  if (gr > 0.4 && abs(gx - hx) > 0.13 * s) {
    float gh = (0.018 + 0.02 * hash(vec2(gi, 9.0))) * s;
    float lean = (hash(vec2(gi, 5.0)) - 0.5) * 0.4;
    vec2 gp = lp - vec2(gx, nearHill(gx, hx) - 0.003);
    gp.x -= gp.y * lean;
    float stone = box(gp - vec2(0.0, gh * 0.5), vec2(0.009 * s, gh * 0.5));
    stone = min(stone, length(gp - vec2(0.0, gh)) - 0.009 * s);
    if (gr > 0.85) {
      // A cross instead of a headstone.
      stone = min(box(gp - vec2(0.0, gh * 0.8), vec2(0.0025 * s, gh * 0.8)), box(gp - vec2(0.0, gh * 1.1), vec2(0.008 * s, 0.0025 * s)));
    }
    solid = max(solid, smoothstep(px, -px, stone));
  }

  vec3 silhouette = mix(vec3(0.008, 0.004, 0.012), vec3(0.12, 0.07, 0.1), u_dawn);
  col = mix(col, silhouette, solid);

  // Windows, flickering with candlelight.
  float flick = 0.75 + 0.25 * sin(t * 13.0) * sin(t * 7.3 + 1.0);
  float win = 1.0;
  win = min(win, box(hp - vec2(-0.04, 0.045), vec2(0.011, 0.016)));
  win = min(win, box(hp - vec2(0.0, 0.045), vec2(0.011, 0.016)));
  win = min(win, box(hp - vec2(0.066, 0.13), vec2(0.008, 0.014)));
  win = min(win, length(hp - vec2(0.0, 0.125)) - 0.012);
  float lit = smoothstep(px, -px, win * s) * (1.0 - u_dawn);
  col = mix(col, vec3(1.0, 0.62, 0.2) * flick, lit);
  // Now and then someone stands in the left window, watching.
  float watching = smoothstep(0.55, 0.6, fract(t / 23.0)) * (1.0 - smoothstep(0.78, 0.83, fract(t / 23.0)));
  vec2 wp = hp - vec2(-0.04, 0.036);
  float head = length(wp - vec2(0.0, 0.013)) - 0.0055;
  float shoulders = max(length(wp * vec2(1.0, 1.6)) - 0.011, -wp.y - 0.02);
  float watcher = smoothstep(px, -px, min(head, shoulders) * s) * watching * lit;
  col = mix(col, vec3(0.02, 0.0, 0.0), watcher);
  float glow = exp(-max(win, 0.0) * 60.0) * (1.0 - u_dawn);
  col += vec3(0.9, 0.4, 0.1) * glow * 0.25 * flick * (1.0 - lit);

  // Fog rolling in front of the hill.
  float f = fbm(vec2(p.x * 2.6 - t * 0.05, p.y * 9.0 + t * 0.02));
  float f2 = fbm(vec2(p.x * 1.4 + t * 0.03, p.y * 4.0));
  float fog = smoothstep(0.32 + lift, 0.02, p.y) * (0.35 + 0.65 * f) + smoothstep(0.22 + lift, 0.0, p.y) * f2 * 0.6;
  vec3 fogCol = mix(vec3(0.22, 0.14, 0.26), vec3(0.95, 0.78, 0.7), u_dawn) + vec3(0.3) * u_flash;
  col = mix(col, fogCol, clamp(fog, 0.0, 1.0) * 0.75);

  // Eyes in the dark: pairs open in the black ground among the graves, blink,
  // and close; each time somewhere else.
  if (u_dawn < 0.5) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float cycle = 9.0 + fi * 2.3;
      float cyc = t / cycle + hash(vec2(fi, 4.0));
      float phase = fract(cyc);
      float id = floor(cyc);
      float open = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.3, 0.38, phase));
      // A blink in the middle.
      open *= 1.0 - smoothstep(0.0, 0.01, 0.012 - abs(phase - 0.19));
      if (open > 0.01) {
        vec2 ep = vec2((hash(vec2(id, fi)) - 0.5) * aspect * 0.85, 0.11 + lift + hash(vec2(fi, id + 7.0)) * 0.1);
        float sep = 0.011 * s;
        float r = 0.0032 * s;
        float e = min(length(p - ep - vec2(sep, 0.0)), length(p - ep + vec2(sep, 0.0)));
        col += vec3(1.0, 0.08, 0.04) * (smoothstep(r, r * 0.3, e) * 1.4 + exp(-e / (r * 3.0)) * 0.35) * open;
      }
    }
  }

  // The figure: tall, thin, hooded, standing behind the fence. Only the
  // lightning shows it; its eyes stay lit a moment after.
  if (u_figure > 0.01) {
    float fx = (u_figureX - 0.5) * aspect * 0.8;
    float fh = 0.24 * s;
    vec2 q = (p - vec2(fx, 0.06)) / fh;
    float body = max(abs(q.x) - (0.06 + q.y * 0.04), max(-q.y, q.y - 0.8));
    float hood = length((q - vec2(0.0, 0.86)) * vec2(1.0, 0.8)) - 0.1;
    float arms = max(abs(abs(q.x) - 0.13) - 0.025, max(q.y - 0.7, 0.2 - q.y));
    float shape = min(min(body, hood), arms);
    float seen = smoothstep(0.02, -0.02, shape) * clamp(u_flash * 2.5, 0.0, 1.0);
    col = mix(col, vec3(0.0), seen);
    float ey = length((q - vec2(-0.035, 0.85)) * vec2(1.0, 1.8));
    float ey2 = length((q - vec2(0.035, 0.85)) * vec2(1.0, 1.8));
    col += vec3(0.9, 0.95, 1.0) * smoothstep(0.016, 0.004, min(ey, ey2)) * u_figure;
  }

  // Iron fence in the foreground.
  float ground = 0.07 + 0.008 * sin(p.x * 6.0);
  float spacing = 0.022 * s;
  float bx2 = mod(p.x, spacing) - spacing * 0.5;
  float topY = ground + 0.07 * s;
  float bar = max(abs(bx2) - 0.0018 * s, p.y - topY);
  float spike = max(abs(bx2) - (topY + 0.012 * s - p.y) * 0.25, -(p.y - topY));
  float rail = abs(p.y - (ground + 0.055 * s)) - 0.002 * s;
  float fence = min(min(bar, spike), rail);
  fence = min(fence, p.y - ground);
  col = mix(col, vec3(0.0), smoothstep(px, -px, fence));

  // Bats: scalloped wings whose tips flex through each beat, a body, ears.
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float speed = 0.035 + fi * 0.012;
    vec2 bp = vec2((fract(t * speed + fi * 0.31) - 0.5) * (aspect + 0.3),
                   0.5 + 0.06 * fi + 0.05 * sin(t * 0.8 + fi * 2.0));
    float size = (0.02 - fi * 0.0025) * s;
    vec2 q = (p - bp) / size;
    float beat = sin(t * 13.0 + fi * 3.0);
    // The body bobs against the wings.
    q.y += beat * 0.12;
    float ax = abs(q.x);
    // Leading edge: rises from the shoulder, the tip lifting or dropping with the beat.
    float top = 0.25 + ax * (0.35 + 0.75 * beat) - ax * ax * 0.35;
    // Trailing edge: scalloped between the finger bones.
    float scallop = 0.22 * abs(sin(ax * 7.85));
    float bottom = top - (0.55 - ax * 0.38) + scallop;
    float wing = max(max(q.y - top, bottom - q.y), ax - 1.0);
    float body = length(q * vec2(2.4, 1.1)) - 0.36;
    float ears = max(abs(abs(q.x) - 0.12) - 0.05 + (q.y - 0.3) * 0.25, abs(q.y - 0.42) - 0.12);
    float bat = min(min(wing, body), ears);
    col = mix(col, vec3(0.0), smoothstep(0.06, -0.06, bat) * (1.0 - u_dawn));
  }

  // Vignette and a little grain.
  float v = smoothstep(1.2, 0.35, length((uv - 0.5) * vec2(aspect, 1.0) * 1.1));
  col *= mix(0.35, 1.0, v);
  col += (hash(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}`;

/** Backing-store pixels per dp for the title backdrop: see `bloodMoon`. */
const SOFT_FOCUS = 0.6;

export interface BloodMoon extends DemoInstance {
  setDawn(dawn: number): void;
}

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

export function bloodMoon(options: { dawn?: number; storm?: boolean } = {}): Demo<BloodMoon> {
  return (canvas, size) => {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false }) as WebGLRenderingContext;
    if (!gl) {
      throw new Error('WebGL is not available on this device.');
    }
    // Rendered on purpose at a low resolution and scaled up: the soft focus
    // blooms the moon and the windows and turns the grain into a filmic
    // texture, which is eerier than crisp vector edges (and much cheaper).
    // The text over it is MasonKit, so it stays sharp.
    const pixelRatio = Math.min(glPixelRatio(gl, size.scale, 2), SOFT_FOCUS);
    const fit = (w: number, h: number) => {
      canvas.width = Math.round(w * pixelRatio);
      canvas.height = Math.round(h * pixelRatio);
    };
    fit(size.width, size.height);

    const vertex = compile(gl, gl.VERTEX_SHADER, 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }');
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    const u = (name: string) => gl.getUniformLocation(program, name) as WebGLUniformLocation;
    const uniforms = {
      resolution: u('u_resolution'),
      time: u('u_time'),
      dawn: u('u_dawn'),
      flash: u('u_flash'),
      bolt: u('u_bolt'),
      figure: u('u_figure'),
      figureX: u('u_figureX'),
    };

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    let dawn = options.dawn ?? 0;
    let shownDawn = dawn;
    let flash = 0;
    let bolt = 0.5;
    let figure = 0;
    let figureX = 0.5;
    let nextStrike = 4000 + Math.random() * 5000;


    return {
      frame(time, dt) {
        // Lightning every so often (never at dawn), thunder a moment later.
        if (options.storm !== false && dawn < 1) {
          nextStrike -= dt;
          if (nextStrike <= 0) {
            nextStrike = 7000 + Math.random() * 9000;
            flash = 1;
            bolt = Math.random();
            sfx.thunder(0.4 + Math.random() * 0.8, 0.6);
            // Some strikes show you something standing in the dark.
            if (Math.random() < 0.5) {
              figure = 1;
              figureX = 0.15 + Math.random() * 0.7;
            }
          }
        }
        // A strike flickers before it fades.
        flash = Math.max(0, flash - dt * 0.0025);
        const flicker = flash > 0.6 ? (Math.sin(time * 0.09) > 0 ? 1 : 0.4) : 1;
        shownDawn += (dawn - shownDawn) * Math.min(1, dt * 0.001);

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uniforms.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform1f(uniforms.time, (time / 1000) % 3600);
        gl.uniform1f(uniforms.dawn, shownDawn);
        gl.uniform1f(uniforms.flash, flash * flash * flicker);
        gl.uniform1f(uniforms.bolt, bolt);
        figure = Math.max(0, figure - dt * 0.0005);
        gl.uniform1f(uniforms.figure, figure);
        gl.uniform1f(uniforms.figureX, figureX);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      resize(w, h) {
        fit(w, h);
      },
      setDawn(value) {
        dawn = value;
      },
      dispose() {
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.deleteBuffer(buffer);
      },
    };
  };
}
