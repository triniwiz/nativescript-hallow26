import * as THREE from '@nativescript/canvas-three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from '../../core/audio';
import { haptic } from '../../core/native';
import { glPixelRatio } from '../../core/gpu';
import type { GameFactory, GameInstance, Hud } from '../../game/types';
import { clamp, lerp, rand, starsFor } from '../../game/util';
import {
  FLOOR_TILE,
  WALL_TILE,
  ceilingTexture,
  doorTexture,
  floorTexture,
  glowTexture,
  portraitTexture,
  wallTexture,
} from './textures';

/** Seconds from the first step to the door at the end. */
const DURATION = 80;
/** Walking pace while playing, and while the intro card is up, in m/s. */
const WALK = 1.45;
const ATTRACT_WALK = 0.45;
const LIVES = 3;
/** Seconds for the flash to recharge. */
const FLASH_RECHARGE = 1.2;
/** How far the flash reaches, in metres. */
const CAPTURE_RANGE = 14;

// The corridor: 3 m wide and tall, built from 4 m segments.
const HALF_W = 1.5;
const HEIGHT = 3;
const EYE = 1.6;
const SEG = 4;
const SEGMENTS = __ANDROID__ ? 7 : 8;
const WALL_LEN = 48;
const FOG_NEAR = 3;
const FOG_FAR = 20;
const LAMP_Y = 2.72;
/** Candela of a ceiling lamp at full brightness. Tune with the exposure. */
const LAMP_INTENSITY = 9;
const LIGHTS = 4;
const MAX_GHOSTS = __ANDROID__ ? 4 : 5;
const WISPS = __ANDROID__ ? 14 : 22;

/** How far the look-around drag can turn the head, in radians (25°). */
const LOOK_LIMIT = 0.436;

type Phase = 'attract' | 'playing' | 'won' | 'lost';

interface Slot {
  side: -1 | 1;
  /** z within the segment. */
  localZ: number;
  kind: 'none' | 'door' | 'painting';
  door: THREE.Group;
  pivot: THREE.Group;
  ajar: boolean;
  painting: THREE.Group;
  canvas: THREE.Mesh;
  pupils: THREE.Mesh[];
  haunted: boolean;
}

interface Lamp {
  bulb: THREE.MeshBasicMaterial;
  halo: THREE.SpriteMaterial;
  base: number;
  level: number;
  on: boolean;
  flickerUntil: number;
  nextToggle: number;
  deadUntil: number;
  broken: boolean;
}

interface Segment {
  group: THREE.Group;
  z: number;
  slots: [Slot, Slot];
  lamp: Lamp;
}

interface Ghost {
  group: THREE.Group;
  robeGeometry: THREE.LatheGeometry;
  rest: Float32Array;
  robe: THREE.MeshStandardMaterial;
  hood: THREE.MeshBasicMaterial;
  eyes: THREE.MeshBasicMaterial;
  glow: THREE.SpriteMaterial;
  wisps: THREE.Points;
  wispPositions: Float32Array;
  wispColors: Float32Array;
  wispVelocity: Float32Array;
  wispLife: Float32Array;
  state: 'idle' | 'gliding' | 'dying';
  /** Seconds since it appeared (or started dying). */
  age: number;
  /** 0..1 materialisation. */
  fade: number;
  x: number;
  z: number;
  /** Where it drifts to sideways after leaving a doorway. */
  targetX: number;
  speed: number;
  zig: number;
  zigRate: number;
  phase: number;
  scale: number;
  /** Died from the flash (bursts outward) rather than by reaching you. */
  captured: boolean;
}

/**
 * Rite III, the corridor: three.js on the native canvas. An endless hotel
 * hallway of recycled segments with procedurally painted wallpaper, floors and
 * portraits (DataTextures), a small pool of point lights that follows the
 * flickering ceiling lamps, and translucent apparitions that glide toward the
 * camera. Tap to fire the flash; whatever it catches in range is captured.
 */
export const hallway: GameFactory = (hooks) => (canvas, size): GameInstance => {
  let { width, height } = size;

  // Fragment cost is per pixel, so cap the density like the galaxy demo does.
  const renderer = new THREE.WebGLRenderer({ canvas: canvas as any, antialias: size.scale < 1.5 });
  const pixelRatio = glPixelRatio(renderer.getContext(), size.scale, 1.25);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(fovFor(width / height), width / height, 0.05, FOG_FAR + 8);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const ambient = new THREE.AmbientLight(0x8a90b8, 0.08);
  scene.add(ambient);


  let phase: Phase = 'attract';
  let paused = false;
  let ready = false;
  /** Seconds the scene has been running (not counting pauses). */
  let clock = 0;
  let elapsed = 0;
  let camZ = 0;
  let startZ = 0;
  let endZ = -Infinity;
  let lookYaw = 0;
  let lookPitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let shake = 0;
  let walkPhase = 0;
  let spawnIn = 0;
  let charge = 1;
  let flash = 0;
  let hurt = 0;
  let outcomeAt = 0;
  let ended = false;
  let lastCrackle = 0;

  let score = 0;
  let lives = LIVES;
  let captured = 0;
  let bestCombo = 0;
  let portraits = 0;
  let bannerUntil = 0;

  const drag = { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: 0, at: 0 };

  // Everything that has to be disposed at the end.
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const keepG = <G extends THREE.BufferGeometry>(g: G) => (geometries.push(g), g);
  const keepM = <M extends THREE.Material>(m: M) => (materials.push(m), m);
  const keepT = <T extends THREE.Texture>(t: T) => (textures.push(t), t);


  const wallTex = keepT(wallTexture());
  wallTex.repeat.set(WALL_LEN / WALL_TILE, 1);
  const floorTex = keepT(floorTexture());
  floorTex.repeat.set(1, WALL_LEN / FLOOR_TILE);
  const ceilingTex = keepT(ceilingTexture());
  ceilingTex.repeat.set(1, WALL_LEN / FLOOR_TILE);
  const glowTex = keepT(glowTexture());
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const t of [wallTex, floorTex, ceilingTex]) {
    t.anisotropy = anisotropy;
  }

  const wallMat = keepM(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, metalness: 0 }));
  const floorMat = keepM(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.78, metalness: 0 }));
  const ceilingMat = keepM(new THREE.MeshStandardMaterial({ map: ceilingTex, roughness: 1, metalness: 0 }));

  // The shell (walls, floor, ceiling) follows the camera in steps of 3 m,
  // a multiple of every texture tile, so the patterns stay put in the world.
  const shell = new THREE.Group();
  scene.add(shell);
  const sideGeometry = keepG(new THREE.PlaneGeometry(WALL_LEN, HEIGHT));
  const leftWall = new THREE.Mesh(sideGeometry, wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-HALF_W, HEIGHT / 2, 0);
  const rightWall = new THREE.Mesh(sideGeometry, wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(HALF_W, HEIGHT / 2, 0);
  const capGeometry = keepG(new THREE.PlaneGeometry(HALF_W * 2, WALL_LEN));
  const floor = new THREE.Mesh(capGeometry, floorMat);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = new THREE.Mesh(capGeometry, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HEIGHT;
  shell.add(leftWall, rightWall, floor, ceiling);


  const darkWood = keepM(new THREE.MeshStandardMaterial({ color: 0x1a0d07, roughness: 0.7 }));
  const doorTex = keepT(doorTexture());
  const doorMat = keepM(new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.75 }));
  const voidMat = keepM(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const goldMat = keepM(new THREE.MeshStandardMaterial({ color: 0x6b5022, metalness: 0.65, roughness: 0.42 }));
  const brassMat = keepM(new THREE.MeshStandardMaterial({ color: 0x2c2214, metalness: 0.5, roughness: 0.6 }));
  const pupilDark = keepM(new THREE.MeshBasicMaterial({ color: 0x0b0806 }));
  const pupilRed = keepM(new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
  const portraitMats = [0, 1].map((variant) =>
    keepM(new THREE.MeshStandardMaterial({ map: keepT(portraitTexture(variant)), roughness: 0.55 })),
  );

  const doorFrameGeometry = keepG(
    mergeGeometries([
      new THREE.BoxGeometry(0.12, 2.4, 0.1).translate(-0.56, 1.2, 0.05),
      new THREE.BoxGeometry(0.12, 2.4, 0.1).translate(0.56, 1.2, 0.05),
      new THREE.BoxGeometry(1.24, 0.12, 0.1).translate(0, 2.36, 0.05),
    ])!,
  );
  const doorVoidGeometry = keepG(new THREE.PlaneGeometry(1, 2.3).translate(0, 1.15, 0.004));
  // Hinged at its left edge, so the pivot's rotation swings it.
  const doorPanelGeometry = keepG(new THREE.BoxGeometry(1, 2.3, 0.05).translate(0.5, 1.15, 0.03));
  const frameGeometry = keepG(new THREE.BoxGeometry(0.8, 1, 0.06).translate(0, 0, 0.03));
  const canvasGeometry = keepG(new THREE.PlaneGeometry(0.64, 0.8).translate(0, 0, 0.062));
  const pupilGeometry = keepG(new THREE.CircleGeometry(0.012, 12));
  const fixtureGeometry = keepG(
    mergeGeometries([
      new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6).translate(0, HEIGHT - 0.11, 0),
      new THREE.CylinderGeometry(0.05, 0.2, 0.16, 16, 1, true).translate(0, LAMP_Y + 0.06, 0),
    ])!,
  );
  const bulbGeometry = keepG(new THREE.SphereGeometry(0.06, 12, 8));

  // In the portrait texture the eyes sit at u = 0.5 ± 0.065, v = 0.63.
  const EYE_X = 0.065 * 0.64;
  const EYE_Y = (0.63 - 0.5) * 0.8;

  function makeSlot(side: -1 | 1, localZ: number): Slot {
    // Both wall fixtures face the corridor: local +z points at its centre.
    const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;

    const door = new THREE.Group();
    door.position.set(side * HALF_W, 0, localZ);
    door.rotation.y = yaw;
    const pivot = new THREE.Group();
    pivot.position.x = -0.5;
    pivot.add(new THREE.Mesh(doorPanelGeometry, doorMat));
    door.add(new THREE.Mesh(doorFrameGeometry, darkWood), new THREE.Mesh(doorVoidGeometry, voidMat), pivot);

    const painting = new THREE.Group();
    painting.position.set(side * HALF_W, 1.75, localZ);
    painting.rotation.y = yaw;
    const canvasMesh = new THREE.Mesh(canvasGeometry, portraitMats[0]);
    painting.add(new THREE.Mesh(frameGeometry, goldMat), canvasMesh);
    const pupils = [-1, 1].map((sx) => {
      const pupil = new THREE.Mesh(pupilGeometry, pupilDark);
      pupil.position.set(sx * EYE_X, EYE_Y, 0.064);
      painting.add(pupil);
      return pupil;
    });

    return { side, localZ, kind: 'none', door, pivot, ajar: false, painting, canvas: canvasMesh, pupils, haunted: false };
  }

  function makeLamp(group: THREE.Group): Lamp {
    const bulb = keepM(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));
    const halo = keepM(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffb870,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const fixture = new THREE.Mesh(fixtureGeometry, brassMat);
    const bulbMesh = new THREE.Mesh(bulbGeometry, bulb);
    bulbMesh.position.y = LAMP_Y;
    const haloSprite = new THREE.Sprite(halo);
    haloSprite.position.y = LAMP_Y - 0.02;
    haloSprite.scale.setScalar(0.9);
    group.add(fixture, bulbMesh, haloSprite);
    return { bulb, halo, base: 1, level: 1, on: true, flickerUntil: 0, nextToggle: 0, deadUntil: 0, broken: false };
  }

  const segments: Segment[] = Array.from({ length: SEGMENTS }, (_, i) => {
    const group = new THREE.Group();
    scene.add(group);
    const slots: [Slot, Slot] = [makeSlot(-1, -1), makeSlot(1, 1)];
    for (const slot of slots) {
      group.add(slot.door, slot.painting);
    }
    const segment: Segment = { group, z: -i * SEG, slots, lamp: makeLamp(group) };
    furnish(segment, true);
    return segment;
  });

  /** Picks new doors and portraits for a segment coming round again. */
  function furnish(segment: Segment, first = false) {
    segment.group.position.z = segment.z;
    for (const slot of segment.slots) {
      const roll = Math.random();
      slot.kind = roll < 0.38 ? 'door' : roll < 0.74 ? 'painting' : 'none';
      // Nothing right beside the camera at the very start.
      if (first && segment.z > -SEG) {
        slot.kind = 'none';
      }
      slot.door.visible = slot.kind === 'door';
      slot.painting.visible = slot.kind === 'painting';
      slot.ajar = slot.kind === 'door' && Math.random() < 0.55;
      slot.pivot.rotation.y = slot.ajar ? -rand(0.35, 0.9) : 0;
      slot.canvas.material = portraitMats[Math.random() < 0.5 ? 0 : 1];
      slot.haunted = slot.kind === 'painting' && phase === 'playing' && Math.random() < 0.3;
      for (const pupil of slot.pupils) {
        pupil.material = slot.haunted ? pupilRed : pupilDark;
      }
    }
    const lamp = segment.lamp;
    lamp.base = rand(0.8, 1.1);
    lamp.broken = Math.random() < 0.08;
    lamp.deadUntil = 0;
    lamp.flickerUntil = 0;
  }

  const lights = Array.from({ length: LIGHTS }, () => {
    const light = new THREE.PointLight(0xffc68a, 0, 10, 2);
    scene.add(light);
    return light;
  });


  const endWallMat = keepM(wallMat.clone());
  const endWallTex = keepT(wallTex.clone());
  endWallTex.repeat.set(1, 1);
  endWallTex.needsUpdate = true;
  endWallMat.map = endWallTex;
  const warmLight = keepM(new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false, fog: false }));
  const leakMat = keepM(new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }));

  /** A wall piece whose UVs follow world metres, so the wallpaper lines up. */
  function wallPiece(w: number, h: number, cx: number, cy: number) {
    const g = keepG(new THREE.PlaneGeometry(w, h).translate(cx, cy, 0));
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + HALF_W) / WALL_TILE, pos.getY(i) / HEIGHT);
    }
    return new THREE.Mesh(g, endWallMat);
  }

  const DOOR_W = 0.8;
  const DOOR_H = 2.4;
  const endDoor = new THREE.Group();
  endDoor.add(
    wallPiece(HALF_W - DOOR_W, HEIGHT, -(HALF_W + DOOR_W) / 2, HEIGHT / 2),
    wallPiece(HALF_W - DOOR_W, HEIGHT, (HALF_W + DOOR_W) / 2, HEIGHT / 2),
    wallPiece(DOOR_W * 2, HEIGHT - DOOR_H, 0, (HEIGHT + DOOR_H) / 2),
  );
  const endFrame = new THREE.Mesh(
    keepG(
      mergeGeometries([
        new THREE.BoxGeometry(0.14, DOOR_H + 0.1, 0.12).translate(-DOOR_W - 0.07, (DOOR_H + 0.1) / 2, 0.06),
        new THREE.BoxGeometry(0.14, DOOR_H + 0.1, 0.12).translate(DOOR_W + 0.07, (DOOR_H + 0.1) / 2, 0.06),
        new THREE.BoxGeometry(DOOR_W * 2 + 0.28, 0.14, 0.12).translate(0, DOOR_H + 0.07, 0.06),
      ])!,
    ),
    darkWood,
  );
  const leafGeometry = keepG(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.06).translate(DOOR_W / 2, DOOR_H / 2, 0.03));
  const leaves = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.x = sx * DOOR_W;
    const leaf = new THREE.Mesh(leafGeometry, doorMat);
    // The right leaf is the left one mirrored about its hinge.
    leaf.scale.x = -sx;
    pivot.add(leaf);
    endDoor.add(pivot);
    return pivot;
  });
  const beyond = new THREE.Mesh(keepG(new THREE.PlaneGeometry(DOOR_W * 2, DOOR_H)), warmLight);
  beyond.position.set(0, DOOR_H / 2, -0.6);
  const leak = new THREE.Mesh(keepG(new THREE.PlaneGeometry(DOOR_W * 2, 0.6)), leakMat);
  leak.rotation.x = -Math.PI / 2;
  leak.position.set(0, 0.005, 0.3);
  leakMat.transparent = true;
  leakMat.opacity = 0.18;
  leakMat.blending = THREE.AdditiveBlending;
  leakMat.depthWrite = false;
  endDoor.add(endFrame, beyond, leak);
  scene.add(endDoor);


  // A hooded robe, flaring at the hem.
  const robeProfile = [
    [0.5, 0],
    [0.46, 0.2],
    [0.38, 0.55],
    [0.31, 0.95],
    [0.28, 1.2],
    [0.27, 1.32],
    [0.25, 1.48],
    [0.2, 1.62],
    [0.1, 1.71],
    [0.001, 1.74],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const hoodGeometry = keepG(new THREE.SphereGeometry(0.17, 16, 12));
  const eyeGeometry = keepG(new THREE.SphereGeometry(0.022, 8, 6));

  const ghosts: Ghost[] = Array.from({ length: MAX_GHOSTS }, () => {
    const robeGeometry = keepG(new THREE.LatheGeometry(robeProfile, 22));
    const robe = keepM(
      new THREE.MeshStandardMaterial({
        color: 0xc9dcec,
        emissive: 0x4d7f9e,
        emissiveIntensity: 0.55,
        roughness: 1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const hood = keepM(new THREE.MeshBasicMaterial({ color: 0x010203, transparent: true, opacity: 0, depthWrite: false }));
    const eyes = keepM(new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, toneMapped: false }));
    const glow = keepM(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xff4630,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const group = new THREE.Group();
    const robeMesh = new THREE.Mesh(robeGeometry, robe);
    robeMesh.renderOrder = 1;
    const hoodMesh = new THREE.Mesh(hoodGeometry, hood);
    hoodMesh.position.set(0, 1.43, 0.08);
    hoodMesh.scale.set(1, 1.15, 0.8);
    hoodMesh.renderOrder = 2;
    group.add(robeMesh, hoodMesh);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry, eyes);
      eye.position.set(sx * 0.06, 1.45, 0.2);
      eye.renderOrder = 3;
      group.add(eye);
    }
    const glowSprite = new THREE.Sprite(glow);
    glowSprite.position.set(0, 1.45, 0.22);
    glowSprite.scale.set(0.55, 0.3, 1);
    glowSprite.renderOrder = 4;
    group.add(glowSprite);
    group.visible = false;
    scene.add(group);

    const wispPositions = new Float32Array(WISPS * 3);
    const wispColors = new Float32Array(WISPS * 3);
    const wispGeometry = keepG(new THREE.BufferGeometry());
    wispGeometry.setAttribute('position', new THREE.BufferAttribute(wispPositions, 3));
    wispGeometry.setAttribute('color', new THREE.BufferAttribute(wispColors, 3));
    const wisps = new THREE.Points(
      wispGeometry,
      keepM(
        new THREE.PointsMaterial({
          map: glowTex,
          size: 0.16,
          vertexColors: true,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    wisps.frustumCulled = false;
    wisps.renderOrder = 5;
    wisps.visible = false;
    scene.add(wisps);

    return {
      group,
      robeGeometry,
      rest: Float32Array.from(robeGeometry.attributes.position.array as ArrayLike<number>),
      robe,
      hood,
      eyes,
      glow,
      wisps,
      wispPositions,
      wispColors,
      wispVelocity: new Float32Array(WISPS * 3),
      wispLife: new Float32Array(WISPS),
      state: 'idle',
      age: 0,
      fade: 0,
      x: 0,
      z: 0,
      targetX: 0,
      speed: 0,
      zig: 0,
      zigRate: 0,
      phase: 0,
      scale: 1,
      captured: false,
    };
  });

  /** The flash (and the red of a hit): a quad stuck to the lens. */
  const overlayMat = keepM(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  const overlay = new THREE.Mesh(keepG(new THREE.PlaneGeometry(4, 4)), overlayMat);
  overlay.position.z = -0.2;
  overlay.renderOrder = 999;
  camera.add(overlay);


  const hum = sfx.hum(0.07);
  const drone = sfx.music('surveillance', 0.45);
  const heart = sfx.heartbeat();
  // Somewhere in the house a door creaks, or someone knocks.
  let houseNoiseIn = rand(4, 8);


  const sent: Partial<Hud> = {};
  let lastSlowHud = 0;
  /** Sends what changed; the clock and the meter at most ten times a second. */
  function hud(force = false) {
    const update: Partial<Hud> = {};
    const fast: Partial<Hud> = {
      score,
      lives,
      maxLives: LIVES,
      totalTime: DURATION,
      meterLabel: 'Flash',
      banner: clock < bannerUntil ? sent.banner : '',
    };
    const slow: Partial<Hud> = {
      time: Math.max(0, Math.ceil(DURATION - elapsed)),
      meter: Math.round(charge * 20) / 20,
    };
    const now = clock;
    const includeSlow = force || now - lastSlowHud >= 0.1;
    for (const [key, value] of Object.entries(includeSlow ? { ...fast, ...slow } : fast) as [keyof Hud, any][]) {
      if (sent[key] !== value) {
        (update as any)[key] = value;
        (sent as any)[key] = value;
      }
    }
    if (includeSlow) {
      lastSlowHud = now;
    }
    if (Object.keys(update).length) {
      hooks.hud(update);
    }
  }

  function banner(text: string) {
    sent.banner = text;
    bannerUntil = clock + 1.6;
    hooks.hud({ banner: text });
  }

  hud(true);


  const v = new THREE.Vector3();
  /** Projects a world point to canvas dp. `ok` is false outside the view. */
  function toScreen(x: number, y: number, z: number) {
    v.set(x, y, z).project(camera);
    return {
      x: ((v.x + 1) / 2) * width,
      y: ((1 - v.y) / 2) * height,
      ok: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1,
    };
  }

  /** Stereo position of a world x, from where the head is turned. */
  function panOf(x: number, z: number) {
    const s = toScreen(x, EYE, z);
    return clamp((s.x / width) * 2 - 1, -1, 1) * 0.8;
  }


  function spawn() {
    const ghost = ghosts.find((g) => g.state === 'idle');
    if (!ghost) {
      return;
    }
    const progress = clamp(elapsed / DURATION);
    ghost.state = 'gliding';
    ghost.age = 0;
    ghost.fade = 0;
    ghost.captured = false;
    ghost.speed = lerp(1.1, 3.1, progress) * rand(0.85, 1.15);
    ghost.zig = progress > 0.25 && Math.random() < 0.45 ? rand(0.25, 0.65) : 0;
    ghost.zigRate = rand(1.2, 2.2);
    ghost.phase = rand(0, Math.PI * 2);
    ghost.scale = rand(0.92, 1.1);

    // Out of an open doorway, from under a lamp that just died, or out of the dark ahead.
    const roll = Math.random();
    let placed = false;
    if (roll < 0.4) {
      const doors: { side: number; z: number }[] = [];
      for (const s of segments) {
        for (const slot of s.slots) {
          const z = s.z + slot.localZ;
          const d = camZ - z;
          if (slot.kind === 'door' && slot.ajar && d > 6 && d < 13 && z > endZ + 1) {
            doors.push({ side: slot.side, z });
          }
        }
      }
      if (doors.length) {
        const door = doors[Math.floor(Math.random() * doors.length)];
        ghost.x = door.side * (HALF_W + 0.5);
        ghost.targetX = door.side * rand(0.3, 0.7);
        ghost.z = door.z;
        placed = true;
      }
    } else if (roll < 0.62) {
      const candidates = segments.filter((s) => {
        const d = camZ - s.z;
        return d > 8 && d < 14 && !s.lamp.broken && s.z > endZ + 1;
      });
      if (candidates.length) {
        const s = candidates[Math.floor(Math.random() * candidates.length)];
        s.lamp.deadUntil = clock + 3.5;
        sfx.sparks(0, 0.3);
        ghost.x = ghost.targetX = rand(-0.5, 0.5);
        ghost.z = s.z;
        placed = true;
      }
    }
    if (!placed) {
      ghost.x = ghost.targetX = rand(-0.8, 0.8);
      ghost.z = camZ - rand(15, 18);
    }
    ghost.group.visible = true;
    ghost.group.scale.setScalar(ghost.scale);
    ghost.wisps.visible = true;
    ghost.wispLife.fill(0);
    sfx.wail(panOf(ghost.x, ghost.z), 0.22, rand(0.85, 1.15));
  }

  function kill(ghost: Ghost, captured: boolean) {
    ghost.state = 'dying';
    ghost.age = 0;
    ghost.captured = captured;
    // Throw every wisp outward from the body.
    const gx = ghost.group.position.x;
    const gy = ghost.group.position.y;
    for (let i = 0; i < WISPS; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = captured ? rand(0.8, 2.2) : rand(0.3, 0.8);
      ghost.wispPositions[i * 3] = gx + Math.cos(a) * 0.2;
      ghost.wispPositions[i * 3 + 1] = gy + rand(0.2, 1.6) * ghost.scale;
      ghost.wispPositions[i * 3 + 2] = ghost.z + Math.sin(a) * 0.2;
      ghost.wispVelocity[i * 3] = Math.cos(a) * speed;
      ghost.wispVelocity[i * 3 + 1] = rand(0.2, 1.2);
      ghost.wispVelocity[i * 3 + 2] = Math.sin(a) * speed;
      ghost.wispLife[i] = rand(0.6, 1);
    }
  }

  function updateGhost(ghost: Ghost, s: number) {
    ghost.age += s;
    const t = clock;

    if (ghost.state === 'gliding') {
      ghost.fade = Math.min(1, ghost.fade + s / 1.1);
      ghost.z += ghost.speed * s;
      // Out of a doorway, it lurches across before coming at you.
      ghost.x += (ghost.targetX - ghost.x) * (1 - Math.exp(-s * 2.6));
    }

    const dying = ghost.state === 'dying' ? clamp(ghost.age / 0.75) : 0;
    const sway = Math.sin(t * ghost.zigRate + ghost.phase) * ghost.zig;
    const x = clamp(ghost.x + sway, -HALF_W + 0.35, HALF_W - 0.35);
    const y = 0.12 + Math.sin(t * 1.7 + ghost.phase) * 0.07 + dying * 0.5;
    ghost.group.position.set(Math.abs(ghost.x) > HALF_W ? ghost.x : x, y, ghost.z);
    // Always face the one it's coming for.
    ghost.group.rotation.y = Math.atan2(camera.position.x - ghost.group.position.x, camera.position.z - ghost.z);
    ghost.group.rotation.z = sway * 0.12;
    const stretch = 1 + dying * 0.6;
    ghost.group.scale.set(ghost.scale * (1 - dying * 0.3), ghost.scale * stretch, ghost.scale * (1 - dying * 0.3));

    const opacity = ghost.fade * (1 - dying);
    const flicker = 0.85 + 0.15 * Math.sin(t * 13 + ghost.phase);
    ghost.robe.opacity = 0.48 * opacity * flicker;
    ghost.robe.emissiveIntensity = 0.55 + flash * 2.5;
    ghost.hood.opacity = 0.92 * opacity;
    ghost.eyes.opacity = ghost.state === 'dying' ? 0 : opacity;
    ghost.glow.opacity = ghost.state === 'dying' ? 0 : 0.85 * opacity * flicker;

    // The hem ripples like cloth in water.
    const pos = ghost.robeGeometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const rest = ghost.rest;
    for (let i = 0; i < arr.length; i += 3) {
      const ry = rest[i + 1];
      if (ry > 1.0) {
        continue;
      }
      const rx = rest[i];
      const rz = rest[i + 2];
      const k = (1 - ry) * (1 + dying);
      const a = Math.atan2(rz, rx);
      const wave = 1 + 0.16 * k * Math.sin(a * 5 + t * 4.5 + ghost.phase);
      arr[i] = rx * wave;
      arr[i + 2] = rz * wave;
      arr[i + 1] = ry + 0.05 * k * Math.sin(a * 3 - t * 3.2);
    }
    pos.needsUpdate = true;

    // Wisps trail behind it, or blow outward as it dissolves.
    const wp = ghost.wispPositions;
    const wc = ghost.wispColors;
    const wv = ghost.wispVelocity;
    const life = ghost.wispLife;
    let alive = false;
    for (let i = 0; i < WISPS; i++) {
      if (life[i] <= 0 && ghost.state === 'gliding' && Math.random() < s * 9) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.45 * ghost.scale;
        wp[i * 3] = ghost.group.position.x + Math.cos(a) * r;
        wp[i * 3 + 1] = y + rand(0.02, 0.5);
        wp[i * 3 + 2] = ghost.z + Math.sin(a) * r;
        wv[i * 3] = Math.cos(a) * 0.15;
        wv[i * 3 + 1] = rand(0.15, 0.45);
        wv[i * 3 + 2] = -ghost.speed * 0.35;
        life[i] = 1;
      }
      if (life[i] > 0) {
        alive = true;
        life[i] -= s * (ghost.state === 'dying' ? 1.1 : 0.9);
        wp[i * 3] += wv[i * 3] * s;
        wp[i * 3 + 1] += wv[i * 3 + 1] * s;
        wp[i * 3 + 2] += wv[i * 3 + 2] * s;
        const l = Math.max(0, life[i]) * ghost.fade;
        const hot = ghost.captured ? 1 : 0;
        wc[i * 3] = l * (0.55 + hot * 0.45);
        wc[i * 3 + 1] = l * (0.8 + hot * 0.2);
        wc[i * 3 + 2] = l;
      } else {
        wc[i * 3] = wc[i * 3 + 1] = wc[i * 3 + 2] = 0;
      }
    }
    (ghost.wisps.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (ghost.wisps.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    if (ghost.state === 'dying') {
      if (dying >= 1) {
        ghost.group.visible = false;
      }
      if (dying >= 1 && !alive) {
        ghost.state = 'idle';
        ghost.wisps.visible = false;
      }
      return;
    }

    // It reached you.
    if (camZ - ghost.z < 0.75 && phase === 'playing') {
      kill(ghost, false);
      lives--;
      hurt = 1;
      shake = 1;
      hooks.scare(1);
      if (lives <= 0) {
        lose();
      }
      hud(true);
    } else if (ghost.z > camZ + 2) {
      // Slipped past (after the run ended): let it go.
      kill(ghost, false);
    }
  }


  function fire(tx: number, ty: number) {
    if (!ready || phase === 'lost') {
      return;
    }
    if (charge < 1) {
      sfx.click();
      haptic('tick');
      return;
    }
    charge = 0;
    flash = 1;
    sfx.flash();
    haptic('medium');
    if (phase !== 'playing') {
      return;
    }

    const caught: { ghost: Ghost; points: number }[] = [];
    for (const ghost of ghosts) {
      if (ghost.state !== 'gliding' || ghost.fade < 0.3) {
        continue;
      }
      const d = camZ - ghost.z;
      if (d < 0.3 || d > CAPTURE_RANGE) {
        continue;
      }
      const gx = ghost.group.position.x;
      const centre = toScreen(gx, ghost.group.position.y + 1.05 * ghost.scale, ghost.z);
      if (!centre.ok) {
        continue;
      }
      const top = toScreen(gx, ghost.group.position.y + 1.75 * ghost.scale, ghost.z);
      const bottom = toScreen(gx, ghost.group.position.y, ghost.z);
      const tall = Math.abs(bottom.y - top.y);
      const near = Math.hypot(centre.x - tx, centre.y - ty) < Math.max(110, tall * 0.65);
      // Point blank, the flash catches it wherever you tapped.
      if (near || d < 3.2) {
        caught.push({ ghost, points: 100 + Math.round((CAPTURE_RANGE - d) * 12) + Math.round(ghost.speed * 20) });
      }
    }

    if (caught.length) {
      const combo = caught.length;
      let gained = 0;
      caught.forEach(({ ghost, points }, i) => {
        gained += points;
        kill(ghost, true);
        sfx.banish(panOf(ghost.x, ghost.z), 0.4);
        sfx.chime(captured + i, panOf(ghost.x, ghost.z), 0.22);
      });
      captured += combo;
      bestCombo = Math.max(bestCombo, combo);
      score += gained * combo;
      haptic(combo > 1 ? 'success' : 'light');
      if (combo === 2) {
        banner('Double exposure ×2');
      } else if (combo >= 3) {
        banner(`Spirit photograph ×${combo}`);
      }
    }

    // Portraits with burning eyes.
    for (const segment of segments) {
      for (const slot of segment.slots) {
        if (!slot.haunted || !slot.painting.visible || !segment.group.visible) {
          continue;
        }
        const z = segment.z + slot.localZ;
        const d = camZ - z;
        if (d < 0.5 || d > 12) {
          continue;
        }
        const eye = toScreen(slot.side * (HALF_W - 0.07), 1.75 + EYE_Y, z);
        if (eye.ok && Math.hypot(eye.x - tx, eye.y - ty) < 90) {
          slot.haunted = false;
          for (const pupil of slot.pupils) {
            pupil.material = pupilDark;
          }
          portraits++;
          score += 150;
          sfx.chime(7, slot.side * 0.7, 0.3);
          if (!caught.length) {
            banner('The portrait closes its eyes');
          }
        }
      }
    }
    hud(true);
  }


  function win() {
    phase = 'won';
    outcomeAt = clock + 2.2;
    score += lives * 300;
    sfx.bell(0.55);
    heart.set(0, 0);
    for (const ghost of ghosts) {
      if (ghost.state === 'gliding') {
        kill(ghost, true);
      }
    }
    haptic('success');
    hud(true);
  }

  function lose() {
    phase = 'lost';
    outcomeAt = clock + 1.6;
    heart.set(0, 0);
    drone.set(1.6, 1);
    hum.set(0, 2);
  }

  function finish() {
    if (ended) {
      return;
    }
    ended = true;
    const won = phase === 'won';
    hooks.end({
      won,
      score,
      stars: starsFor(won, score, 3500, 6000),
      stats: [
        { label: 'Apparitions captured', value: String(captured) },
        { label: 'Best exposure', value: bestCombo ? `×${bestCombo}` : '—' },
        { label: 'Portraits silenced', value: String(portraits) },
        won
          ? { label: 'Lives left', value: `${lives} of ${LIVES}` }
          : { label: 'Walked', value: `${Math.round(WALK * elapsed)} m of ${Math.round(WALK * DURATION)} m` },
      ],
      verdict: won
        ? lives === LIVES
          ? 'Not one of them touched you. The door opens onto grey morning light.'
          : 'You reached the door. Something followed you through it.'
        : 'The lamps go out one by one. The corridor goes on without you.',
    });
  }


  function placeShell() {
    // Snapped to 3 m: whole tiles of every texture, so nothing slides.
    const snap = Math.round(camZ / 3) * 3;
    shell.position.z = snap - WALL_LEN / 2 + 6;
  }

  function updateLamps(s: number) {
    houseNoiseIn -= s;
    if (houseNoiseIn <= 0) {
      houseNoiseIn = rand(6, 14);
      const side = Math.random() < 0.5 ? -0.8 : 0.8;
      const roll = Math.random();
      if (roll < 0.45) {
        sfx.creak(side, 0.3);
      } else if (roll < 0.7) {
        sfx.knock(side, 0.35);
      } else {
        sfx.drip(side, 0.3);
      }
    }
    for (const segment of segments) {
      const lamp = segment.lamp;
      let level: number;
      if (lamp.broken || clock < lamp.deadUntil) {
        level = 0;
      } else if (clock < lamp.flickerUntil) {
        if (clock >= lamp.nextToggle) {
          lamp.on = Math.random() < (lamp.on ? 0.45 : 0.7);
          lamp.nextToggle = clock + rand(0.03, 0.12);
        }
        level = lamp.on ? 1 : 0.06;
      } else {
        level = 0.94 + 0.06 * Math.sin(clock * 50 + segment.z);
        if (Math.random() < s * 0.09) {
          lamp.flickerUntil = clock + rand(0.25, 1.1);
          const d = camZ - segment.z;
          if (d > -2 && d < 10 && clock - lastCrackle > 0.6) {
            lastCrackle = clock;
            sfx.crackle(0.1);
          }
        }
      }
      // A dead lamp coming back stutters first.
      if (lamp.deadUntil && clock >= lamp.deadUntil) {
        lamp.deadUntil = 0;
        lamp.flickerUntil = clock + 0.8;
      }
      lamp.level = level;
      const b = 0.08 + 0.92 * level * lamp.base;
      lamp.bulb.color.setRGB(b, b * 0.82, b * 0.58);
      lamp.halo.opacity = 0.5 * level * lamp.base;
    }

    // The light pool goes to the lamps nearest ahead.
    const candidates = segments
      .filter((s) => s.group.visible && s.z > endZ + 0.2)
      .map((s) => ({ s, d: camZ - s.z }))
      .filter(({ d }) => d > -3 && d < FOG_FAR)
      .sort((a, b) => Math.abs(a.d - 2) - Math.abs(b.d - 2));
    lights.forEach((light, i) => {
      const c = candidates[i];
      if (c) {
        light.position.set(0, LAMP_Y - 0.12, c.s.z);
        light.intensity = LAMP_INTENSITY * c.s.lamp.base * c.s.lamp.level;
      } else {
        light.intensity = 0;
      }
    });
  }

  function updateSegments() {
    for (const segment of segments) {
      if (segment.z - camZ > SEG) {
        segment.z -= SEGMENTS * SEG;
        furnish(segment);
      }
      const d = camZ - segment.z;
      segment.group.visible = d < FOG_FAR + SEG && segment.z > endZ - SEG;
    }
  }

  const local = new THREE.Vector3();
  function updatePortraits() {
    for (const segment of segments) {
      if (!segment.group.visible) {
        continue;
      }
      for (const slot of segment.slots) {
        if (slot.kind !== 'painting') {
          continue;
        }
        // The pupils slide toward wherever you are.
        local.copy(camera.position);
        slot.painting.worldToLocal(local);
        const dx = clamp(local.x / Math.max(0.5, local.z), -1, 1);
        const dy = clamp(local.y / Math.max(0.5, local.z), -1, 1);
        slot.pupils.forEach((pupil, i) => {
          pupil.position.x = (i ? 1 : -1) * EYE_X + dx * 0.016;
          pupil.position.y = EYE_Y + dy * 0.006;
        });
      }
    }
  }

  // Compile every shader before the first frame, the hidden ones included.
  for (const ghost of ghosts) {
    ghost.group.visible = true;
    ghost.wisps.visible = true;
  }
  endDoor.position.z = 40;
  const markReady = () => {
    for (const ghost of ghosts) {
      ghost.group.visible = false;
      ghost.wisps.visible = false;
    }
    endDoor.visible = false;
    ready = true;
  };
  placeShell();
  camera.position.set(0, EYE, camZ);
  renderer.compileAsync(scene, camera).then(markReady, markReady);

  return {
    begin() {
      if (phase !== 'attract') {
        return;
      }
      phase = 'playing';
      startZ = camZ;
      endZ = startZ - WALK * DURATION - 1.4;
      endDoor.position.z = endZ;
      endDoor.visible = true;
      leaves.forEach((leaf) => (leaf.rotation.y = 0));
      beyond.visible = false;
      spawnIn = 2;
      // Some portraits ahead wake up.
      for (const segment of segments) {
        for (const slot of segment.slots) {
          if (slot.kind === 'painting' && segment.z < camZ - 6 && Math.random() < 0.3) {
            slot.haunted = true;
            slot.pupils.forEach((p) => (p.material = pupilRed));
          }
        }
      }
      hud(true);
    },

    setPaused(value) {
      paused = value;
      const level = value ? 0 : 1;
      hum.set(phase === 'lost' ? 0 : level);
      drone.set(level);
      if (value) {
        heart.set(0, 0);
      }
    },

    frame(_time, dt) {
      if (!ready || paused) {
        return;
      }
      const s = dt / 1000;
      clock += s;

      // Walking.
      if (phase === 'attract') {
        camZ -= ATTRACT_WALK * s;
        walkPhase += s * 2.2;
      } else if (phase === 'playing') {
        elapsed += s;
        camZ = startZ - WALK * Math.min(elapsed, DURATION);
        walkPhase += s * 5.2;
        if (elapsed >= DURATION) {
          win();
        }
      } else if (phase === 'won') {
        const stop = endZ + 1.3;
        camZ += (stop - camZ) * (1 - Math.exp(-s * 1.5));
        walkPhase += s * 1.5;
      }

      if (phase === 'won' || phase === 'lost') {
        if (!ended && clock >= outcomeAt) {
          finish();
        }
      }

      // The look-around drag eases home when you let go.
      if (!drag.active) {
        targetYaw *= Math.exp(-s * 0.8);
        targetPitch *= Math.exp(-s * 0.8);
      }
      lookYaw += (targetYaw - lookYaw) * (1 - Math.exp(-s * 10));
      lookPitch += (targetPitch - lookPitch) * (1 - Math.exp(-s * 10));
      shake *= Math.exp(-s * 5);
      const bob = phase === 'lost' ? 0 : 1;
      camera.position.set(
        Math.sin(walkPhase * 0.5) * 0.025 * bob + (Math.random() - 0.5) * shake * 0.12,
        EYE + Math.abs(Math.sin(walkPhase)) * 0.035 * bob - (phase === 'lost' ? 0.5 * clamp(clock - outcomeAt + 1.6) : 0),
        camZ,
      );
      camera.rotation.set(
        lookPitch + (Math.random() - 0.5) * shake * 0.05,
        lookYaw,
        Math.sin(walkPhase * 0.5) * 0.008 * bob + (phase === 'lost' ? 0.3 * clamp(clock - outcomeAt + 1.6) : 0),
      );

      placeShell();
      updateSegments();
      updateLamps(s);

      // Apparitions.
      if (phase === 'playing') {
        spawnIn -= s;
        const progress = clamp(elapsed / DURATION);
        // None in the last few metres, so the door is reachable.
        if (spawnIn <= 0 && elapsed < DURATION - 5) {
          spawn();
          spawnIn = lerp(3.4, 1.4, progress) * rand(0.8, 1.2);
        }
      }
      let nearest = Infinity;
      for (const ghost of ghosts) {
        if (ghost.state !== 'idle') {
          updateGhost(ghost, s);
          if (ghost.state === 'gliding') {
            nearest = Math.min(nearest, camZ - ghost.z);
          }
        }
      }
      if (phase === 'playing') {
        if (nearest < 12) {
          heart.set(60 + (12 - nearest) * 9, clamp((12 - nearest) / 10, 0.15, 1));
        } else {
          heart.set(0, 0);
        }
      }

      updatePortraits();

      // The end door: a warm line of light under it, then it swings open.
      if (endDoor.visible) {
        leakMat.opacity = 0.15 + 0.05 * Math.sin(clock * 3);
        if (phase === 'won') {
          beyond.visible = true;
          const open = clamp((clock - (outcomeAt - 2.2)) / 1.8);
          const ease = 1 - Math.pow(1 - open, 3);
          leaves[0].rotation.y = -ease * 1.7;
          leaves[1].rotation.y = ease * 1.7;
          ambient.intensity = 0.08 + ease * 1.2;
        }
      }

      // The lamps die one by one when you're taken.
      if (phase === 'lost') {
        for (const segment of segments) {
          if (!segment.lamp.broken && Math.random() < s * 1.5) {
            segment.lamp.broken = true;
            sfx.crackle(0.15);
          }
        }
      }

      // Flash, hurt and the final fade.
      charge = Math.min(1, charge + s / FLASH_RECHARGE);
      flash = Math.max(0, flash - s / 0.35);
      hurt = Math.max(0, hurt - s / 0.6);
      if (phase === 'won') {
        const open = clamp((clock - (outcomeAt - 2.2)) / 2.2);
        overlayMat.color.setRGB(1, 0.95, 0.85);
        overlayMat.opacity = Math.max(flash, open * 0.55);
      } else if (flash > 0) {
        overlayMat.color.setRGB(1, 1, 1);
        overlayMat.opacity = flash * flash * 0.95;
      } else if (hurt > 0 || phase === 'lost') {
        overlayMat.color.setRGB(0.55, 0, 0);
        overlayMat.opacity = Math.max(hurt * 0.5, phase === 'lost' ? 0.3 : 0);
      } else {
        overlayMat.opacity = 0;
      }
      if (phase !== 'won') {
        ambient.intensity = 0.08 + flash * 3;
      }

      if (phase === 'playing' || flash > 0) {
        hud();
      }
      if (sent.banner && clock >= bannerUntil) {
        sent.banner = '';
        hooks.hud({ banner: '' });
      }

      renderer.render(scene, camera);
    },

    resize(w, h) {
      width = w;
      height = h;
      camera.aspect = w / h;
      camera.fov = fovFor(w / h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    },

    pointer(type, x, y) {
      if (paused) {
        return;
      }
      if (type === 'down') {
        Object.assign(drag, { active: true, startX: x, startY: y, lastX: x, lastY: y, moved: 0, at: clock });
      } else if (type === 'move' && drag.active) {
        const dx = x - drag.lastX;
        const dy = y - drag.lastY;
        drag.moved += Math.hypot(dx, dy);
        drag.lastX = x;
        drag.lastY = y;
        // Drag right to look right, down to look down.
        targetYaw = clamp(targetYaw - (dx / width) * 1.6, -LOOK_LIMIT, LOOK_LIMIT);
        targetPitch = clamp(targetPitch - (dy / height) * 1.2, -LOOK_LIMIT, LOOK_LIMIT);
      } else if (type === 'up' && drag.active) {
        drag.active = false;
        if (drag.moved < 14 && clock - drag.at < 0.45) {
          fire(x, y);
        }
      }
    },

    dispose() {
      hum.stop(0.4);
      drone.stop(0.6);
      heart.stop();
      renderer.dispose();
      for (const g of geometries) {
        g.dispose();
      }
      for (const m of materials) {
        m.dispose();
      }
      for (const t of textures) {
        t.dispose();
      }
    },
  };
};

/** A wider vertical field of view in portrait, so the corridor doesn't feel like a slot. */
function fovFor(aspect: number) {
  return aspect < 1 ? lerp(84, 70, clamp((aspect - 0.45) / 0.55)) : 68;
}
