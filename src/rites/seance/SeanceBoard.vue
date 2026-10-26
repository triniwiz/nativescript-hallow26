<script lang="ts" setup>
import { onUnmounted, ref, shallowRef } from 'nativescript-vue';
import { Screen } from '@nativescript/core';
import CanvasView from '../../components/CanvasView.vue';
import WorkerCanvasView from '../../components/WorkerCanvasView.vue';
import { sfx } from '../../core/audio';
import { haptic } from '../../core/native';
import type { GameHooks, GameInstance } from '../../game/types';
import { clamp, pick, rand, starsFor } from '../../game/util';
import { BOARD_H, BOARD_W, WORDS, type Mark } from './board';
import { boardScene, type BoardScene, type Ease, type GlowKind } from './board-scene';
import { seanceTable, type TableMessage } from './table';
import { createTableWorker } from './workers';

/**
 * Rite VI, The Séance: two canvases, layered. The candlelit table is drawn by
 * a Worker into an OffscreenCanvas, and the game posts it the spirit's mood.
 * Over it, a transparent 2D canvas holds the board, the glows and the
 * planchette, all laid out from the font's own measurements, so where a
 * letter is drawn, where the planchette stops and where a touch lands agree.
 *
 * The spirit spells a word; the player taps it back. Six words, three to
 * eight letters.
 */
const props = defineProps<{ hooks: GameHooks }>();
const emit = defineEmits<{ started: [instance: GameInstance]; failed: [message: string] }>();

const ROUNDS = 6;
const MAX_LIVES = 3;
const WORD_BANK: Record<number, string[]> = {
  3: ['BOO', 'HEX', 'RIP', 'OWL', 'BAT', 'DIE'],
  4: ['DOOM', 'TOMB', 'BONE', 'COLD', 'DEAD', 'VEIL'],
  5: ['GRAVE', 'CURSE', 'GHOST', 'BELOW', 'WITCH', 'CRYPT'],
  6: ['HOLLOW', 'COFFIN', 'BURIED', 'SHADOW', 'CANDLE', 'RAVENS'],
  7: ['BENEATH', 'PHANTOM', 'HAUNTED', 'WHISPER', 'CHAINED'],
  8: ['MIDNIGHT', 'FORSAKEN', 'BANISHED', 'UNBURIED'],
};

// Board size: as wide as the screen allows, up to a tabletop-sized board.
const boardW = Math.min(Screen.mainScreen.widthDIPs - 20, 600);
const boardH = (boardW * BOARD_H) / BOARD_W;

const table = ref<{ post(data: unknown): void } | null>(null);
const tableFallback = seanceTable();
const scene = shallowRef<BoardScene>();
const shaking = ref(false);
const boardDemo = boardScene({ onTouch: (x, y) => onTouch(x, y) });

let alive = true;
let started = false;
let paused = false;
let lives = MAX_LIVES;
let score = 0;
let round = 1;
let lettersSpelled = 0;
let wordsAnswered = 0;
let fastest = Infinity;

const beds = [sfx.whispers(0.14), sfx.drone(0.12, 28)];

function mood(m: TableMessage['mood']) {
  table.value?.post({ mood: m } satisfies TableMessage);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Waits out a pause; false once the rite is over. */
async function gate() {
  while (paused && alive) {
    await sleep(120);
  }
  return alive;
}

/** Glides the planchette's window onto `m`. */
async function glide(m: Mark, duration: number, ease: Ease = 'inOut') {
  if (alive) {
    await scene.value?.glide(m, duration, ease);
  }
}

function glow(m: Mark, kind: GlowKind = 'spirit') {
  scene.value?.glow(m, kind);
}

const markFor = (key: string) => scene.value!.layout.markFor(key);

const pan = (m: Mark) => clamp((m.x - BOARD_W / 2) / (BOARD_W / 2), -1, 1);

/** The spirit spells `word`. */
async function spell(word: string) {
  const speed = 860 - (round - 1) * 95;
  const hold = 430 - (round - 1) * 45;
  mood('spelling');
  props.hooks.hud({ banner: 'The spirit speaks…', meter: undefined });
  let previous = '';
  for (const letter of word) {
    if (!(await gate())) {
      return;
    }
    const m = markFor(letter);
    if (letter === previous) {
      // The same letter twice: it circles away and comes back.
      await glide({ ...m, x: m.x + 50, y: m.y + 40 }, speed * 0.35);
    }
    await glide(m, speed);
    glow(m);
    if (Math.random() < 0.55) {
      sfx.ghost(pan(m), 0.18);
    } else {
      sfx.crackle(0.12);
    }
    haptic('tick');
    lettersSpelled++;
    previous = letter;
    await sleep(hold);
  }
  await glide(WORDS.REST, 600);
  mood('calm');
}

interface Expecting {
  word: string;
  index: number;
  timeLeft: number;
  total: number;
  resolve: (result: 'right' | 'wrong') => void;
}
let expecting: Expecting | null = null;
/** Seconds of candle left when the last word was answered right. */
let spareTime = 0;

function answer(word: string) {
  const total = 4 + word.length * 1.5;
  props.hooks.hud({ banner: 'Say it back…', meter: 1, meterLabel: 'Candle' });
  return new Promise<'right' | 'wrong'>((resolve) => {
    expecting = { word, index: 0, timeLeft: total, total, resolve };
  });
}

// The candle burns while the player answers.
const clock = setInterval(() => {
  if (!expecting || paused) {
    return;
  }
  expecting.timeLeft -= 0.1;
  props.hooks.hud({ meter: Math.max(0, expecting.timeLeft / expecting.total) });
  if (expecting.timeLeft <= 0) {
    const done = expecting;
    expecting = null;
    sfx.crackle(0.3);
    done.resolve('wrong');
  }
}, 100);

/** A touch on the board, in board units. */
function onTouch(x: number, y: number) {
  if (!expecting || paused) {
    return;
  }
  const m = scene.value?.layout.letterAt(x, y);
  if (!m) {
    return;
  }
  const e = expecting;
  void glide(m, 180, 'out');
  if (m.key === e.word[e.index]) {
    glow(m, 'player');
    sfx.chime(e.index, pan(m), 0.25);
    haptic('light');
    e.index++;
    if (e.index === e.word.length) {
      expecting = null;
      fastest = Math.min(fastest, e.total - e.timeLeft);
      spareTime = e.timeLeft;
      e.resolve('right');
    }
  } else {
    glow(m, 'anger');
    expecting = null;
    e.resolve('wrong');
  }
}

function shake() {
  shaking.value = false;
  setTimeout(() => {
    shaking.value = true;
    setTimeout(() => (shaking.value = false), 460);
  }, 0);
}

async function play() {
  // Knock, knock: is anyone there?
  props.hooks.hud({ score, lives, maxLives: MAX_LIVES, banner: 'Is anyone there?' });
  sfx.knock(0, 0.45);
  await sleep(900);
  if (!alive) return;
  mood('spelling');
  await glide(WORDS.YES, 1400);
  glow(WORDS.YES);
  sfx.ghost(-0.6, 0.25);
  await sleep(900);

  while (alive && round <= ROUNDS) {
    const word = pick(WORD_BANK[round + 2]);
    await spell(word);
    if (!(await gate())) return;
    const result = await answer(word);
    if (!alive) return;

    if (result === 'right') {
      score += 100 * round + Math.round(spareTime * 25);
      wordsAnswered++;
      round++;
      mood('pleased');
      haptic('success');
      props.hooks.hud({ score, banner: round <= ROUNDS ? `Word ${round} of ${ROUNDS}` : 'It is satisfied…', meter: undefined });
      await glide(WORDS.YES, 500);
      glow(WORDS.YES, 'player');
      for (let i = 0; i < 3; i++) {
        setTimeout(() => sfx.chime(5 + i, -0.4 + i * 0.4, 0.2), i * 110);
      }
      await sleep(1100);
    } else {
      lives--;
      mood('anger');
      shake();
      props.hooks.shake();
      sfx.crack(0.6);
      haptic('error');
      props.hooks.hud({ lives, banner: lives ? 'The spirit is displeased' : 'The spirit has had enough', meter: undefined });
      await glide(WORDS.NO, 220, 'out');
      glow(WORDS.NO, 'anger');
      if (lives > 0 && round >= 4 && Math.random() < 0.5) {
        props.hooks.scare(0.8);
      }
      await sleep(1300);
      if (lives <= 0) {
        finish(false);
        return;
      }
    }
  }
  if (alive) {
    await glide(WORDS.GOODBYE, 1600);
    glow(WORDS.GOODBYE);
    sfx.bell(0.5);
    await sleep(800);
    finish(true);
  }
}

function finish(won: boolean) {
  if (!alive) return;
  const total = score + (won ? lives * 100 : 0);
  props.hooks.end({
    won,
    score: total,
    stars: starsFor(won, total, 2300, 2700),
    stats: [
      { label: 'Words answered', value: `${wordsAnswered} of ${ROUNDS}` },
      { label: 'Letters spelled', value: String(lettersSpelled) },
      { label: 'Candles kept', value: `${Math.max(0, lives)} of ${MAX_LIVES}` },
      { label: 'Fastest answer', value: Number.isFinite(fastest) ? `${fastest.toFixed(1)} s` : '—' },
    ],
    verdict: won
      ? 'The planchette slides to GOODBYE, and the candles burn steady again.'
      : 'The planchette spells your name, and does not say goodbye.',
  });
}

/** Before the rite: the planchette drifts, as if something were idly testing it. */
async function idle() {
  while (alive && !started) {
    const m: Mark = { key: '', x: 500 + rand(-260, 260), y: 400 + rand(-120, 130), angle: 0, size: 0 };
    await glide(m, rand(1800, 2800));
  }
}

const instance: GameInstance = {
  begin() {
    started = true;
    void play();
  },
  setPaused(value) {
    paused = value;
    for (const bed of beds) {
      bed.set(value ? 0 : 1);
    }
  },
};

function onStarted(instanceScene: BoardScene) {
  scene.value = instanceScene;
  emit('started', instance);
  void idle();
}

onUnmounted(() => {
  alive = false;
  clearInterval(clock);
  expecting = null;
  for (const bed of beds) {
    bed.stop(0.5);
  }
});
</script>

<template>
  <div class="relative h-full w-full bg-black">
    <div class="absolute inset-0">
      <WorkerCanvasView ref="table" :worker="createTableWorker" :fallback="tableFallback" class="h-full w-full" />
    </div>
    <div class="absolute inset-0 flex items-center justify-center">
      <div :class="{ shake: shaking }" :style="{ width: `${boardW}px`, height: `${boardH}px` }">
        <CanvasView :demo="boardDemo" class="h-full w-full" @started="onStarted" @failed="emit('failed', $event)" />
      </div>
    </div>
  </div>
</template>
