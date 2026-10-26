/**
 * WGSL for The Souls. Every pass shares one uniform block, `Scene`, written
 * once a frame from souls.ts (see `SCENE_FLOATS` there). It is all vec4s, so
 * there are no alignment surprises.
 *
 * World space: the short side of the canvas spans -1..1, y points up, so
 * distances mean the same thing on any canvas shape.
 */
const scene = /* wgsl */ `
struct Scene {
  a : vec4f,  // dt (s), time (s), half width, half height (world units)
  b : vec4f,  // lantern.xy, lantern radius, lantern strength (0..1)
  c : vec4f,  // portal.xy, portal radius, capture (1 while playing)
  d : vec4f,  // shade count, frame, soul count, lantern dim (0..1)
  e : vec4f,  // portal open (0..1), freed fraction, hurt flash, soul size
  f : vec4f,  // resolution in pixels .xy
  shades : array<vec4f, 5>,  // xy, radius, presence (0..1)
}
@group(0) @binding(0) var<uniform> scene : Scene;
`;

/** One record per soul, used as the compute shader's storage and as instance data. */
const soul = /* wgsl */ `
struct Soul {
  pos : vec2f,
  vel : vec2f,
  state : f32,  // 0 lost, 1 freed, 2 devoured
  timer : f32,  // seconds since the state changed
  heat : f32,   // 0..1, how close to the lantern
  seed : f32,
}
`;

export const simulateWGSL = /* wgsl */ `
${scene}
${soul}
@group(0) @binding(1) var<storage, read_write> souls : array<Soul>;
// [0] freed, [1] devoured.
@group(0) @binding(2) var<storage, read_write> counters : array<atomic<u32>, 4>;

const NEIGHBOURS = 24u;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id : vec3u) {
  let count = u32(scene.d.z);
  let i = id.x;
  if (i >= count) {
    return;
  }
  var s = souls[i];
  let dt = scene.a.x;
  let t = scene.a.y;
  let bounds = scene.a.zw;

  // Devoured: sink and vanish.
  if (s.state > 1.5) {
    s.timer += dt;
    s.vel *= 0.9;
    s.pos += s.vel * dt;
    souls[i] = s;
    return;
  }

  // Freed: a short spiral around the gate, then rise and fade.
  if (s.state > 0.5) {
    s.timer += dt;
    if (s.timer < 4.0) {
      let toP = scene.c.xy - s.pos;
      let spin = vec2f(-toP.y, toP.x);
      var want = vec2f(sin(t * 3.0 + s.seed * 20.0) * 0.18, 0.6);
      if (s.timer < 0.6) {
        want = toP * 2.0 + spin * 4.0;
      }
      s.vel = mix(s.vel, want, min(1.0, dt * 6.0));
      s.pos += s.vel * dt;
    }
    souls[i] = s;
    return;
  }

  var force = vec2f(0.0);

  // Wander.
  let ang = s.seed * 6.2831 + t * (0.3 + s.seed * 0.4) + sin(t * 0.7 + s.seed * 31.0);
  force += vec2f(cos(ang), sin(ang)) * 0.3;

  // Flocking against a sample of the others: O(n) instead of O(n²).
  var coh = vec2f(0.0);
  var ali = vec2f(0.0);
  var sep = vec2f(0.0);
  var n = 0.0;
  let frame = u32(scene.d.y);
  for (var k = 0u; k < NEIGHBOURS; k++) {
    let j = (i + 1u + (k * 2654435761u + frame * 97u) % (count - 1u)) % count;
    let o = souls[j];
    if (o.state > 0.5) {
      continue;
    }
    let dd = o.pos - s.pos;
    let d2 = dot(dd, dd);
    if (d2 < 0.0196 && d2 > 0.00000001) {
      coh += dd;
      ali += o.vel;
      n += 1.0;
      if (d2 < 0.0016) {
        let d = sqrt(d2);
        sep -= dd / d * (0.04 - d) / 0.04;
      }
    }
  }
  if (n > 0.0) {
    force += coh / n * 1.2 + (ali / n - s.vel) * 0.6;
  }
  force += sep * 1.6;

  // The lantern: pull towards a ring around it, and swirl.
  let lantern = scene.b.xy;
  let reach = scene.b.z;
  let strength = scene.b.w;
  let toL = lantern - s.pos;
  let dL2 = dot(toL, toL);
  var heat = 0.0;
  if (dL2 < reach * reach) {
    let dL = sqrt(dL2);
    let w = 1.0 - dL / reach;
    heat = w * strength;
    let dir = toL / max(dL, 0.0001);
    let pull = select(-0.8, 1.0, dL > 0.12);
    force += dir * pull * (1.4 + 3.4 * w) * strength;
    force += vec2f(-dir.y, dir.x) * 0.9 * w * strength;
  }

  let capture = scene.c.w > 0.5;

  // Shades: flee them, and be eaten if one gets close enough.
  let shadeCount = u32(scene.d.x);
  for (var k = 0u; k < shadeCount; k++) {
    let sh = scene.shades[k];
    if (sh.w < 0.5) {
      continue;
    }
    let away = s.pos - sh.xy;
    let d2 = dot(away, away);
    if (capture && d2 < sh.z * sh.z * 0.3025) {
      s.state = 2.0;
      s.timer = 0.0;
      s.vel = -away * 1.5;
      atomicAdd(&counters[1], 1u);
      souls[i] = s;
      return;
    }
    let fleeRange = sh.z * 2.2;
    if (d2 < fleeRange * fleeRange) {
      let d = sqrt(d2);
      force += away / max(d, 0.001) * (1.0 - d / fleeRange) * 1.8;
    }
  }

  // The moon-gate: a gentle gravity, and freedom inside it.
  if (capture) {
    let toP = scene.c.xy - s.pos;
    let dP2 = dot(toP, toP);
    let radius = scene.c.z;
    if (dP2 < radius * radius) {
      s.state = 1.0;
      s.timer = 0.0;
      atomicAdd(&counters[0], 1u);
      souls[i] = s;
      return;
    }
    let pullRange = radius * 2.6;
    if (dP2 < pullRange * pullRange) {
      let dP = sqrt(dP2);
      force += toP / dP * 1.3 * (1.0 - dP / (radius * 2.6));
    }
  }

  // Soft walls.
  let inner = bounds - vec2f(0.2);
  force.x -= clamp((s.pos.x - inner.x) / 0.2, 0.0, 1.0) * 3.0;
  force.x += clamp((-inner.x - s.pos.x) / 0.2, 0.0, 1.0) * 3.0;
  force.y -= clamp((s.pos.y - inner.y) / 0.2, 0.0, 1.0) * 3.0;
  force.y += clamp((-inner.y - s.pos.y) / 0.2, 0.0, 1.0) * 3.0;

  s.vel += force * dt;
  s.vel *= max(0.0, 1.0 - 1.2 * dt);
  let maxSpeed = 0.32 + 0.7 * s.heat;
  let speed2 = dot(s.vel, s.vel);
  if (speed2 > maxSpeed * maxSpeed) {
    s.vel *= maxSpeed / sqrt(speed2);
  }
  s.pos = clamp(s.pos + s.vel * dt, -bounds, bounds);
  s.heat = mix(s.heat, heat, min(1.0, dt * 4.0));
  souls[i] = s;
}
`;

export const renderWGSL = /* wgsl */ `
${scene}

fn hash(p : vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise(p : vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y);
}

fn fbm(p : vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    v += a * noise(q);
    q = q * 2.03 + vec2f(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

fn rotate(p : vec2f, a : f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

@vertex
fn bg_vert(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[vi], 0.0, 1.0);
}

@fragment
fn bg_frag(@builtin(position) frag : vec4f) -> @location(0) vec4f {
  let res = scene.f.xy;
  let m = min(res.x, res.y);
  let p = vec2f(frag.x * 2.0 - res.x, res.y - frag.y * 2.0) / m;
  let t = scene.a.y;
  let extent = scene.a.zw;
  let height = clamp((p.y + extent.y) / (2.0 * extent.y), 0.0, 1.0);

  // Sky: violet near the ground, black overhead, a few stars.
  var col = mix(vec3f(0.05, 0.03, 0.09), vec3f(0.006, 0.004, 0.018), height);
  let cell = floor(p * 70.0);
  let star = step(0.996, hash(cell)) * (0.5 + 0.5 * sin(t * 2.0 + hash(cell + 3.0) * 40.0));
  col += vec3f(0.7, 0.75, 1.0) * star * height * 0.6;

  // Rolling mist.
  let mist = fbm(p * 1.4 + vec2f(t * 0.03, -t * 0.015));
  let mist2 = fbm(p * 3.2 - vec2f(t * 0.05, t * 0.01));
  col += vec3f(0.11, 0.1, 0.19) * mist * mist2 * (1.6 - height);

  // Hills with leaning headstones along the bottom edge.
  let ground = -extent.y + 0.28 + 0.06 * sin(p.x * 2.3) + 0.03 * sin(p.x * 5.1 + 1.0);
  let slot = floor(p.x * 3.0);
  let lx = fract(p.x * 3.0) - 0.5;
  let hasStone = step(0.45, hash(vec2f(slot, 7.0)));
  let stoneTop = ground + 0.07 + 0.05 * hash(vec2f(slot, 3.0));
  let lean = (hash(vec2f(slot, 5.0)) - 0.5) * 0.4;
  let sx = lx + (p.y - ground) * lean;
  let stone = hasStone * step(abs(sx), 0.07) * step(p.y, stoneTop - 0.07 + sqrt(max(0.0, 0.0049 - sx * sx)));
  let land = max(step(p.y, ground), stone);
  col = mix(col, vec3f(0.008, 0.006, 0.014), land);

  // The moon-gate: a swirling ring of moonlight.
  let gateOpen = scene.e.x;
  let pp = p - scene.c.xy;
  let r = length(pp);
  let radius = scene.c.z * gateOpen;
  let q = rotate(pp, t * 0.9 + 3.0 / (r + 0.25)) * 7.0;
  let swirl = fbm(q + vec2f(0.0, -t));
  let ring = exp(-pow((r - radius) / (0.014 + 0.03 * swirl), 2.0));
  let inside = smoothstep(radius, radius * 0.2, r);
  let halo = exp(-max(r - radius, 0.0) * 8.0) * (0.22 + 0.25 * scene.e.y);
  let gold = vec3f(1.0, 0.82, 0.48);
  col += (gold * (ring * 1.5 + halo) + vec3f(0.55, 0.7, 1.0) * inside * (0.2 + 0.6 * swirl)) * gateOpen;

  // The lantern.
  let lp = p - scene.b.xy;
  let ld = length(lp);
  let flicker = 0.9 + 0.1 * sin(t * 23.0) * sin(t * 7.3);
  let glow = (1.0 - 0.8 * scene.d.w) * flicker;
  col += vec3f(1.0, 0.6, 0.25) * (exp(-ld * ld * 60.0) * 1.1 + exp(-ld * 3.0) * 0.14) * glow;
  col += vec3f(1.0, 0.55, 0.25) * exp(-pow((ld - scene.b.z) / 0.012, 2.0)) * 0.05 * glow;

  // Shades: smoky dark bodies with a bloody rim and red eyes.
  let shadeCount = u32(scene.d.x);
  for (var k = 0u; k < shadeCount; k++) {
    let sh = scene.shades[k];
    if (sh.w < 0.01) {
      continue;
    }
    let sp = p - sh.xy;
    let d = length(sp);
    if (d > sh.z * 2.0) {
      continue;
    }
    let smoke = fbm(sp / sh.z * 1.6 + vec2f(t * 0.4, -t * 0.7) + f32(k) * 7.0);
    let body = smoothstep(sh.z * 1.05, sh.z * 0.2, d + (smoke - 0.5) * sh.z * 0.9) * sh.w;
    col = mix(col, vec3f(0.0, 0.0, 0.004), body * 0.95);
    let rim = exp(-pow((d - sh.z) / (sh.z * 0.25), 2.0)) * sh.w;
    col += vec3f(0.3, 0.0, 0.05) * rim * 0.3;
    let blink = step(0.05, fract(t * 0.21 + f32(k) * 0.37));
    let eye = sh.z * 0.065;
    let e1 = length((sp - vec2f(-sh.z * 0.2, sh.z * 0.12)) * vec2f(1.0, 1.7)) / eye;
    let e2 = length((sp - vec2f(sh.z * 0.2, sh.z * 0.12)) * vec2f(1.0, 1.7)) / eye;
    let eyes = exp(-e1 * e1) + exp(-e2 * e2) + 0.15 * (exp(-e1 * 0.5) + exp(-e2 * 0.5));
    col += vec3f(1.0, 0.12, 0.05) * eyes * blink * sh.w * 1.4;
  }

  // Hurt: the edges bleed red. Then a vignette.
  let uv = frag.xy / res - 0.5;
  let edge = dot(uv, uv);
  col += vec3f(0.5, 0.0, 0.02) * scene.e.z * edge * 3.0;
  col *= 1.0 - 0.9 * edge;
  return vec4f(col, 1.0);
}

struct SoulOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
  @location(1) color : vec4f,
}

@vertex
fn soul_vert(
  @builtin(vertex_index) vi : u32,
  @location(0) posVel : vec4f,
  @location(1) info : vec4f,
) -> SoulOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let corner = corners[vi];
  let state = info.x;
  let timer = info.y;
  let heat = info.z;
  let seed = info.w;
  let t = scene.a.y;

  var size = scene.e.w * (0.75 + 0.5 * seed);
  var color : vec4f;
  if (state < 0.5) {
    let twinkle = 0.7 + 0.3 * sin(t * 3.0 + seed * 40.0);
    color = vec4f(mix(vec3f(0.55, 0.9, 1.0), vec3f(1.0, 0.75, 0.42), heat), (0.5 + 0.4 * heat) * twinkle);
    size *= 1.0 + heat * 0.6;
  } else if (state < 1.5) {
    let fade = clamp(1.0 - (timer - 1.4) / 1.6, 0.0, 1.0);
    color = vec4f(1.0, 0.86, 0.5, fade);
    size *= 1.0 + 0.8 * clamp(timer * 2.0, 0.0, 1.0);
  } else {
    let fade = clamp(1.0 - timer / 0.7, 0.0, 1.0);
    color = vec4f(0.95, 0.12, 0.18, fade);
    size *= 0.4 + 0.6 * fade;
  }

  var o : SoulOut;
  let world = posVel.xy + corner * size;
  o.pos = vec4f(world / scene.a.zw, 0.0, 1.0);
  o.uv = corner;
  o.color = color;
  return o;
}

@fragment
fn soul_frag(v : SoulOut) -> @location(0) vec4f {
  let d2 = dot(v.uv, v.uv);
  let core = exp(-d2 * 22.0);
  let halo = exp(-d2 * 4.5) * 0.4;
  let a = (core + halo) * v.color.a * (1.0 - smoothstep(0.75, 1.0, d2));
  return vec4f(v.color.rgb + core * 0.5, a);
}
`;
