import type { RiteId } from '../core/save';
import type { Component } from 'nativescript-vue';
import type { GameFactory, RiteGuide } from '../game/types';
import { riteIcons } from '../art/svg';
import { lantern } from './graveyard/lantern';
import { guide as graveyardGuide } from './graveyard/guide';
import { carve } from './patch/carve';
import { guide as patchGuide } from './patch/guide';
import { hallway } from './corridor/hallway';
import { guide as corridorGuide } from './corridor/guide';
import { summoning } from './sigil/summoning';
import { guide as sigilGuide } from './sigil/guide';
import { lostSouls } from './souls/souls';
import { guide as soulsGuide } from './souls/guide';
import SeanceBoard from './seance/SeanceBoard.vue';
import { guide as seanceGuide } from './seance/guide';

/** One chapter of the night: a mini-game and how the map and intro card present it. */
export interface Rite {
  id: RiteId;
  numeral: string;
  title: string;
  /** The renderer it showcases, shown as a chip. */
  renderer: string;
  /** The techniques it leans on, for the Grimoire. */
  techniques: string[];
  /** Map card text. */
  teaser: string;
  /** An accent colour for its card. */
  accent: string;
  icon: string;
  guide: RiteGuide;
  /** A rite drawn on one canvas... */
  game?: GameFactory;
  /**
   * ...or one built from views: a component taking `hooks` that emits
   * `started` with its GameInstance (and `failed` if it can't begin).
   */
  component?: Component;
}

export const rites: Rite[] = [
  {
    id: 'graveyard',
    numeral: 'I',
    title: 'The Graveyard',
    renderer: 'Canvas 2D',
    techniques: ['Compositing light masks', 'OffscreenCanvas sprites', 'Radial gradients', 'Canvas text with FontFace'],
    teaser: 'Hold back the restless dead with a dying flashlight.',
    accent: '#5eead4',
    icon: riteIcons.graveyard,
    guide: graveyardGuide,
    game: lantern,
  },
  {
    id: 'patch',
    numeral: 'II',
    title: 'The Pumpkin Patch',
    renderer: 'PixiJS',
    techniques: ['Generated textures', 'Sprite pools & particles', 'Swipe hit-testing'],
    teaser: 'Carve the lanterns before they fall. Never touch the skulls.',
    accent: '#fb923c',
    icon: riteIcons.patch,
    guide: patchGuide,
    game: carve,
  },
  {
    id: 'corridor',
    numeral: 'III',
    title: 'The Corridor',
    renderer: 'three.js',
    techniques: ['Procedural DataTextures', 'Flickering point lights & fog', 'Raycast picking'],
    teaser: 'Walk the endless hall. Photograph what walks toward you.',
    accent: '#fde68a',
    icon: riteIcons.corridor,
    guide: corridorGuide,
    game: hallway,
  },
  {
    id: 'sigil',
    numeral: 'IV',
    title: 'The Sigil',
    renderer: 'WebGL',
    techniques: ['GLSL fragment shaders', 'Uniform arrays', 'Fractal noise'],
    teaser: 'Trace the summoning marks before the candles gutter.',
    accent: '#c4b5fd',
    icon: riteIcons.sigil,
    guide: sigilGuide,
    game: summoning,
  },
  {
    id: 'souls',
    numeral: 'V',
    title: 'The Lost Souls',
    renderer: 'WebGPU',
    techniques: ['WGSL compute shaders', 'Storage buffers & atomics', 'GPU readback'],
    teaser: 'Lead a thousand lost souls home, past the shades that feed.',
    accent: '#67e8f9',
    icon: riteIcons.souls,
    guide: soulsGuide,
    game: lostSouls,
  },
  {
    id: 'seance',
    numeral: 'VI',
    title: 'The Séance',
    renderer: 'Canvas 2D + Worker',
    techniques: ['Glyphs laid out with measureText', 'A transparent canvas over a Worker-drawn table', 'OffscreenCanvas in a Worker, talked to with postMessage'],
    teaser: 'Something on the other side is spelling. Say it back.',
    accent: '#fca5a5',
    icon: riteIcons.seance,
    guide: seanceGuide,
    component: SeanceBoard,
  },
];

export const riteById = (id: RiteId) => rites.find((rite) => rite.id === id)!;

export const nextRite = (id: RiteId): Rite | undefined => rites[rites.findIndex((r) => r.id === id) + 1];
