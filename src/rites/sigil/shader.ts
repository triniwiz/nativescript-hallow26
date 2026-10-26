/**
 * The whole rite in one GLSL ES 1.0 fragment shader, drawn on a full-screen
 * triangle: a flagstone floor lit by eight candles, a summoning circle, an
 * ectoplasm portal, the sigil and the finger's trail.
 *
 * Cost is kept phone-friendly: the only fbm (four octaves) runs inside the
 * portal, candle flicker is computed once per frame on the CPU, and every
 * loop has a constant bound with an early break.
 */

export const TRAIL_POINTS = 24;

export const VERTEX = 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }';

export const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define PI 3.14159265

uniform vec2 u_resolution;
uniform float u_time;
// The sigil: u_pathLen points, the first u_progress of them already lit.
// One spare slot so u_path[i + 1] is always in range.
uniform vec2 u_path[11];
uniform float u_pathLen;
uniform float u_progress;
// 0..1: how visible the sigil is (faint in attract mode, fading once sealed).
uniform float u_reveal;
// Recent finger positions, newest first.
uniform vec2 u_trail[${TRAIL_POINTS}];
uniform float u_trailLen;
// Per-candle brightness, and how much wax is left (0..1).
uniform float u_flicker[8];
uniform float u_candle;
// One-shot effects, each 0..1.
uniform float u_crack;
uniform float u_flare;
uniform float u_erupt;
uniform float u_face;

vec2 centered() {
  return (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
}

// smoothstep with the edges in either order. GLSL leaves smoothstep(hi, lo, x)
// undefined, and these falloffs use it a lot.
float ss(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
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

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = centered();
  float t = u_time;

  // A crack shudders the whole circle.
  if (u_crack > 0.001) {
    uv += (vec2(noise(uv * 18.0 + t * 30.0), noise(uv * 18.0 - t * 27.0)) - 0.5) * 0.05 * u_crack;
  }
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float wax = 0.4 + 0.6 * u_candle;

  float light = 0.0;
  float bodyMask = 0.0;
  vec3 bodyCol = vec3(0.0);
  vec3 flames = vec3(0.0);
  float height = 0.035 + 0.075 * u_candle;
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    float ang = fk * PI * 0.25 + PI * 0.125;
    vec2 cp = vec2(cos(ang), sin(ang)) * 0.88;
    vec2 q = uv - cp;
    float f = u_flicker[k];
    light += f * 0.03 / (dot(q, q) + 0.035);

    // An upright pillar of wax that melts down with the timer.
    vec2 bq = q - vec2(0.0, height * 0.5 - 0.03);
    vec2 bd = abs(bq) - vec2(0.022, height * 0.5);
    float body = ss(0.004, 0.0, max(bd.x, bd.y));
    float shade = 0.5 + 0.5 * (1.0 - abs(bq.x) / 0.022);
    if (body > bodyMask) {
      bodyMask = body;
      bodyCol = vec3(0.86, 0.8, 0.66) * shade * (0.45 + 0.6 * f);
    }

    // A teardrop flame, swaying.
    vec2 fq = q - vec2(0.0, height - 0.03 + 0.03);
    fq.x += sin(t * 11.0 + fk * 1.7) * 0.012 * clamp(fq.y / 0.05, 0.0, 1.0);
    float fl = length(vec2(fq.x * 1.8, fq.y < 0.0 ? fq.y * 1.5 : fq.y * 0.55));
    flames += vec3(1.0, 0.42, 0.08) * ss(0.035, 0.0, fl) * f * 1.6;
    flames += vec3(1.0, 0.9, 0.6) * ss(0.013, 0.0, fl) * f;
    flames += vec3(1.0, 0.5, 0.15) * 0.0008 / (dot(fq, fq) + 0.0025) * f;
  }

  vec2 tile = uv * 2.4 + vec2(0.5);
  vec2 cell = floor(tile);
  vec2 g = abs(fract(tile) - 0.5);
  float seam = ss(0.44, 0.5, max(g.x, g.y));
  float grain = noise(uv * 9.0) * 0.6 + noise(uv * 31.0) * 0.4;
  vec3 albedo = vec3(0.16, 0.145, 0.17) * (0.7 + 0.5 * hash(cell)) * (0.6 + 0.7 * grain);
  albedo *= 1.0 - 0.8 * seam;
  vec3 col = albedo * (vec3(0.12, 0.1, 0.2) + vec3(1.0, 0.58, 0.28) * light * wax);

  float rings = ss(0.012, 0.0, abs(r - 0.76)) + ss(0.008, 0.0, abs(r - 0.7));
  float slot = a / (2.0 * PI) * 36.0;
  float band = step(0.713, r) * step(r, 0.747);
  float glyph = band * step(0.3, fract(slot)) * step(fract(slot), 0.7) * step(0.45, hash(vec2(floor(slot), floor(r * 90.0))));
  float charged = u_pathLen > 0.0 ? u_progress / u_pathLen : 0.0;
  vec3 blood = mix(vec3(0.42, 0.04, 0.03), vec3(1.0, 0.3, 0.1), charged * 0.6 + u_flare * 0.4);
  col += blood * (rings * 0.8 + glyph * 0.45) * (0.35 + light * wax + charged * 0.5);

  col = mix(col, bodyCol, bodyMask);
  col += flames;

  float pr = 0.3 + 0.06 * u_flare + 1.8 * u_erupt * u_erupt;
  if (r < pr + 0.12) {
    float swirl = a + t * 0.5 + 1.2 / (r + 0.2);
    vec2 sp = vec2(cos(swirl), sin(swirl)) * r * 3.0;
    float n = fbm(sp + vec2(t * 0.15, -t * 0.1));
    float inside = ss(pr, pr - 0.08, r);
    vec3 ecto = mix(vec3(0.1, 0.02, 0.18), vec3(0.25, 1.0, 0.75), ss(0.35, 0.8, n));
    ecto += vec3(0.6, 1.0, 0.9) * pow(n, 5.0) * 2.5;
    // The face behind the door, when it looks through.
    if (u_face > 0.01) {
      vec2 f = uv / max(pr, 0.2);
      float eyes = min(length((f - vec2(-0.33, 0.16)) * vec2(1.0, 0.8)),
                       length((f - vec2(0.33, 0.16)) * vec2(1.0, 0.8)));
      float socket = ss(0.25, 0.18, eyes);
      float pupil = ss(0.08, 0.02, eyes);
      float maw = ss(0.32, 0.25, length((f - vec2(0.0, -0.4)) * vec2(1.7, 0.75)));
      float skull = ss(0.95, 0.8, length(f * vec2(1.0, 0.85)));
      vec3 face = vec3(0.7, 0.85, 0.8) * (0.6 + 0.5 * n);
      face = mix(face, vec3(0.0), max(socket, maw));
      face += vec3(1.0, 0.08, 0.04) * pupil * 2.5;
      ecto = mix(ecto, face, u_face * skull);
    }
    float edge = ss(0.045, 0.0, abs(r - pr + 0.03 * n));
    col = mix(col, ecto * (0.6 + 0.7 * u_flare), inside);
    col += vec3(0.3, 1.0, 0.8) * edge * (0.5 + n);
  }
  col += vec3(0.2, 0.9, 0.7) * 0.012 / (abs(r - pr) + 0.04) * (0.6 + u_flare);

  vec3 fire = vec3(1.0, 0.42, 0.1);
  vec3 ghost = vec3(0.45, 1.0, 0.8);
  float pulse = 0.5 + 0.5 * sin(t * 6.0);
  float travel = fract(t * 0.9);
  vec3 sig = vec3(0.0);
  float nodeDone = 0.0;
  float nodeNext = 0.0;
  float nodeIdle = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= u_pathLen) {
      break;
    }
    vec2 p = u_path[i];
    float dn = length(uv - p);
    float glow = 0.012 / (dn + 0.012);
    if (fi < u_progress) {
      nodeDone = max(nodeDone, glow);
    } else if (fi < u_progress + 0.5) {
      nodeNext = max(nodeNext, glow + ss(0.012, 0.0, abs(dn - 0.06 - 0.025 * pulse)));
    } else {
      nodeIdle = max(nodeIdle, glow);
    }
    if (fi + 1.0 < u_pathLen) {
      vec2 q = u_path[i + 1];
      float ds = segment(uv, p, q);
      if (fi + 1.0 < u_progress) {
        // Lit: it burns.
        float burn = 0.85 + 0.15 * noise(vec2(ds * 80.0, t * 6.0 + fi));
        sig += fire * (0.006 / (ds + 0.006)) * 0.55 * burn * u_reveal;
        sig += vec3(1.0, 0.85, 0.6) * ss(0.008, 0.0, ds) * u_reveal;
      } else {
        // Unlit: a faint scratch on the stone.
        sig += vec3(0.75, 0.7, 0.85) * ss(0.006, 0.0, ds) * 0.2 * u_reveal;
        if (fi < u_progress) {
          // The stroke to make next: a spark runs along it.
          vec2 ba = q - p;
          float h = clamp(dot(uv - p, ba) / dot(ba, ba), 0.0, 1.0);
          sig += ghost * ss(0.014, 0.0, ds) * ss(0.12, 0.0, abs(h - travel)) * u_reveal;
        }
      }
    }
  }
  sig += fire * nodeDone * 1.3 * u_reveal;
  sig += ghost * nodeNext * (0.7 + 1.0 * pulse) * u_reveal;
  sig += vec3(0.8, 0.75, 0.9) * nodeIdle * 0.45 * u_reveal;

  for (int i = 0; i < ${TRAIL_POINTS - 1}; i++) {
    float fi = float(i);
    if (fi + 1.0 >= u_trailLen) {
      break;
    }
    float ds = segment(uv, u_trail[i], u_trail[i + 1]);
    float fade = 1.0 - fi / ${(TRAIL_POINTS - 1).toFixed(1)};
    sig += ghost * (0.0025 / (ds + 0.004)) * fade * 0.35;
    sig += vec3(0.9, 1.0, 1.0) * ss(0.006, 0.0, ds) * fade * 0.5;
  }
  col += sig;

  vec2 ep = uv * 9.0 - vec2(0.0, t * 0.6);
  vec2 ec = floor(ep);
  vec2 eo = vec2(hash(ec), hash(ec + 7.1));
  float ember = ss(0.08, 0.0, length(fract(ep) - eo)) * step(0.85, hash(ec + 3.3));
  col += vec3(1.0, 0.45, 0.1) * ember * (0.5 + 0.5 * sin(t * 4.0 + eo.x * 20.0))
       * ss(1.1, 0.2, r) * (0.4 + u_flare + u_erupt);

  col += vec3(0.3, 1.0, 0.8) * u_flare * 0.4 * exp(-r * 2.5);
  col = mix(col, vec3(0.85, 1.0, 0.95), ss(0.55, 1.0, u_erupt) * 0.75 * exp(-r * 0.5));
  if (u_crack > 0.001) {
    float fracture = ss(0.06, 0.0, abs(sin(a * 5.0 + noise(uv * 3.0) * 4.0))) * ss(0.1, 0.45, r);
    col = mix(col, col * vec3(1.5, 0.25, 0.2), u_crack * 0.85);
    col += vec3(1.0, 0.1, 0.05) * fracture * u_crack;
  }

  float vignette = 1.0 - ss(0.8, 2.0, r);
  col *= 0.2 + 0.8 * vignette;
  col = 1.0 - exp(-col * 1.4);
  gl_FragColor = vec4(col, 1.0);
}
`;
