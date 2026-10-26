<script lang="ts" setup>
import { $navigateBack, $navigateTo, computed, getCurrentInstance, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef } from 'nativescript-vue';
import type { EventData, View } from '@nativescript/core';
import CanvasView from '../components/CanvasView.vue';
import { candle, pauseIcon, scareFace, star } from '../art/svg';
import { sfx } from '../core/audio';
import { haptic, keepAwake, onAppLifecycle, rumble, safeAreaInsets } from '../core/native';
import { candlesLit, progress, recordRun, RITE_IDS, settings, type RiteId } from '../core/save';
import { nextRite, riteById } from '../rites';
import { stopMenuMusic } from '../screens/menu-music';
import type { GameHooks, GameInstance, Hud, RunResult } from './types';
import { formatCount } from './util';

/**
 * The page a rite is played on. The rite draws the canvas; this page layers
 * everything else over it with MasonKit: the HUD, the intro card, the pause
 * menu, jump scares and the results. It also records runs, keeps the screen
 * awake and pauses when the app goes to the background.
 */
const props = defineProps<{ riteId: RiteId }>();
const rite = riteById(props.riteId);
const next = nextRite(props.riteId);
// "Next rite" opens another copy of this page.
const GameShellPage = getCurrentInstance()!.type;

type Phase = 'intro' | 'playing' | 'paused' | 'over';
const phase = ref<Phase>('intro');
const runKey = ref(0);
const instance = shallowRef<GameInstance>();
const failure = ref<string | null>(null);
const autoBegin = ref(false);

const hud = reactive<Hud>({ score: 0 });
const result = ref<RunResult | null>(null);
const newBest = ref(false);

const insets = safeAreaInsets();
const shaking = ref(false);
const scareKey = ref(0);
const scaring = ref(false);

function resetHud() {
  for (const key of Object.keys(hud) as (keyof Hud)[]) {
    delete hud[key];
  }
  hud.score = 0;
}

const hooks: GameHooks = {
  hud(update) {
    for (const [key, value] of Object.entries(update) as [keyof Hud, never][]) {
      if (hud[key] !== value) {
        hud[key] = value;
      }
    }
  },
  scare(strength = 1) {
    sfx.stinger(strength);
    rumble(settings.gentle ? [60] : [90, 40, 140, 60, 220]);
    hooks.shake();
    if (!settings.gentle) {
      scareKey.value++;
      scaring.value = true;
      setTimeout(() => (scaring.value = false), 700);
    }
  },
  shake() {
    // Re-adding the class restarts the keyframes.
    shaking.value = false;
    nextTick(() => {
      shaking.value = true;
      setTimeout(() => (shaking.value = false), 460);
    });
  },
  end(run) {
    if (phase.value === 'over') {
      return;
    }
    result.value = run;
    newBest.value = recordRun(props.riteId, run);
    phase.value = 'over';
    keepAwake(false);
    if (run.won) {
      sfx.triumph();
      haptic('success');
    } else {
      sfx.doom();
      haptic('error');
    }
  },
};

// A fresh game per run: the canvas is keyed on runKey, so it remounts too.
// A canvas rite gets a fresh game per run; the canvas is keyed on runKey, so
// it remounts too. A component rite simply remounts.
const demo = computed(() => {
  void runKey.value;
  return rite.game?.(hooks);
});

function onStarted(game: GameInstance) {
  instance.value = game;
  if (autoBegin.value) {
    autoBegin.value = false;
    begin();
  }
}

function begin() {
  if (!instance.value) {
    return;
  }
  sfx.wake();
  sfx.bell(0.3);
  sfx.mystery(0.5);
  haptic('medium');
  keepAwake(true);
  instance.value.begin();
  phase.value = 'playing';
}

function pause() {
  if (phase.value !== 'playing') {
    return;
  }
  sfx.click();
  instance.value?.setPaused(true);
  phase.value = 'paused';
  keepAwake(false);
}

function resume() {
  sfx.click();
  instance.value?.setPaused(false);
  phase.value = 'playing';
  keepAwake(true);
}

function restart() {
  sfx.click();
  instance.value = undefined;
  result.value = null;
  resetHud();
  autoBegin.value = true;
  phase.value = 'intro';
  runKey.value++;
}

function leave() {
  sfx.click();
  $navigateBack();
}

function goNext() {
  if (!next) {
    return;
  }
  sfx.click();
  $navigateTo(GameShellPage, {
    props: { riteId: next.id },
    backstackVisible: false,
    transition: { name: 'fade', duration: 450 },
  });
}

const stopLifecycle = onAppLifecycle(pause, () => {});
onMounted(() => {
  sfx.wake();
  stopMenuMusic();
});
onUnmounted(() => {
  stopLifecycle();
  keepAwake(false);
});

const record = computed(() => progress[props.riteId]);
const allLit = computed(() => result.value?.won && candlesLit() === RITE_IDS.length);

const litCandle = candle(true, 20);
const outCandle = candle(false, 20);
const lives = computed(() =>
  hud.maxLives ? Array.from({ length: hud.maxLives }, (_, i) => i < (hud.lives ?? 0)) : [],
);

const clock = computed(() => {
  if (hud.time === undefined) {
    return '';
  }
  const s = Math.max(0, Math.ceil(hud.time));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});
const timePct = computed(() =>
  hud.time !== undefined && hud.totalTime ? Math.max(0, Math.min(100, (hud.time / hud.totalTime) * 100)) : 0,
);
const meterPct = computed(() => Math.max(0, Math.min(100, (hud.meter ?? 0) * 100)));
const stars = computed(() => [0, 1, 2].map((i) => star(i < (result.value?.stars ?? 0), 46)));

/**
 * A short window (a landscape desktop window, a phone on its side) can't hold
 * a whole card: shrink the card to fit rather than cut it off. Runs when the
 * overlay resizes and when the card does. `room` is the overlay's padding.
 */
function fitCard(args: EventData, room: number) {
  const view = args.object as View;
  let card = view;
  let overlay = view.parent as View | undefined;
  if (!view.className?.includes('panel')) {
    overlay = view;
    view.eachChildView((child) => {
      card = child;
      return false;
    });
  }
  if (!overlay || card === overlay) {
    return;
  }
  const height = card.getActualSize().height;
  const space = overlay.getActualSize().height - room;
  const scale = height > 0 && space > 0 ? Math.min(1, space / height) : 1;
  if (Math.abs(card.scaleX - scale) > 0.005) {
    card.scaleX = scale;
    card.scaleY = scale;
  }
}
</script>

<template>
  <Page actionBarHidden="true" statusBarStyle="dark" backgroundColor="#000000">
    <div class="relative h-full w-full bg-black" iosOverflowSafeArea="true">
      <div class="absolute inset-0" :class="{ shake: shaking }">
        <component
          :is="rite.component"
          v-if="rite.component"
          :key="runKey"
          :hooks="hooks"
          class="h-full w-full"
          @started="onStarted"
          @failed="failure = $event"
        />
        <CanvasView
          v-else-if="demo"
          :key="runKey"
          :demo="demo"
          class="h-full w-full"
          @started="onStarted"
          @failed="failure = $event"
        />
      </div>

      <!-- HUD -->
      <div
        v-if="phase === 'playing' || phase === 'paused'"
        class="absolute left-0 right-0 top-0 flex flex-col gap-2 bg-fade-down px-4 pb-8"
        :style="{ paddingTop: `${insets.top + 8}px` }"
      >
        <div class="flex flex-row items-start gap-3">
          <!-- A <div>: on Android a MasonKit <button> is a text view and can't hold the icon. -->
          <div class="web-clickable flex size-11 items-center justify-center rounded-full bg-black/50" @click="pause">
            <Svg :src="pauseIcon" class="size-[22]" />
          </div>
          <div class="flex flex-1 flex-col items-center">
            <span class="font-creep text-4xl text-bone-50">{{ formatCount(hud.score) }}</span>
            <!-- Always there, empty or not, so a banner never pushes the bars down. -->
            <span class="h-6 font-fell-italic text-base text-pumpkin-300">{{ hud.banner ?? '' }}</span>
          </div>
          <div class="flex min-w-11 flex-row justify-end gap-1">
            <Svg v-for="(lit, i) in lives" :key="i" :src="lit ? litCandle : outCandle" class="h-[31] w-[20]" />
          </div>
        </div>
        <div class="flex flex-row items-center gap-4">
          <div v-if="hud.time !== undefined" class="flex flex-1 flex-row items-center gap-2">
            <span class="w-10 text-sm font-semibold text-bone-200">{{ clock }}</span>
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-bone-200" :style="{ width: `${timePct}%` }" />
            </div>
          </div>
          <div v-if="hud.meter !== undefined" class="flex flex-1 flex-row items-center gap-2">
            <span class="text-xs font-semibold uppercase text-bone-400">{{ hud.meterLabel }}</span>
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                class="h-full rounded-full"
                :class="meterPct < 25 ? 'bg-blood-500' : 'bg-pumpkin-400'"
                :style="{ width: `${meterPct}%` }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Jump scare -->
      <div
        v-if="scaring"
        :key="scareKey"
        class="absolute inset-0 flex items-center justify-center bg-blood-700/40"
      >
        <Svg :src="scareFace" class="scare h-[360] w-[320]" />
      </div>

      <!-- Intro card: the rite's scenery animates behind it -->
      <div
        v-if="phase === 'intro' && !autoBegin"
        class="absolute inset-0 flex flex-col justify-end bg-fade-up px-4"
        :style="{ paddingBottom: `${insets.bottom + 16}px` }"
        @layoutChanged="fitCard($event, insets.bottom + 40)"
      >
        <section
          class="rise panel mx-auto flex w-full max-w-xl flex-col gap-4"
          :originY="1"
          @layoutChanged="fitCard($event, insets.bottom + 40)"
        >
          <div class="flex flex-row items-center gap-3">
            <Svg :src="rite.icon" class="size-[72]" />
            <div class="flex flex-1 flex-col">
              <span class="eyebrow">Rite {{ rite.numeral }} · {{ rite.renderer }}</span>
              <h1 class="font-creep text-4xl" :style="{ color: rite.accent }">{{ rite.title }}</h1>
            </div>
          </div>
          <p class="font-fell-italic text-lg text-bone-200">{{ rite.guide.intro }}</p>
          <div class="flex flex-col gap-2">
            <div v-for="line in rite.guide.howTo" :key="line" class="flex flex-row gap-3">
              <span class="text-base text-pumpkin-400">✦</span>
              <span class="flex-1 text-base text-bone-200">{{ line }}</span>
            </div>
          </div>
          <span v-if="record?.best" class="text-sm text-bone-400">
            Best: {{ formatCount(record.best) }} · {{ record.stars }} ★
          </span>
          <p v-if="failure" class="text-sm text-blood-400">{{ failure }}</p>
          <div class="flex flex-row flex-wrap gap-3 pt-1">
            <button
              v-if="!failure"
              class="btn-blood flex-1"
              :class="{ 'bg-blood-700 text-bone-400': !instance }"
              @click="begin"
            >
              {{ instance ? 'Begin the rite' : 'Preparing…' }}
            </button>
            <button class="btn-ghost" @click="leave">Back</button>
          </div>
        </section>
      </div>

      <!-- Pause -->
      <div
        v-if="phase === 'paused'"
        class="absolute inset-0 flex items-center justify-center bg-black/70 p-6"
        @layoutChanged="fitCard($event, 48)"
      >
        <section class="rise panel flex w-full max-w-sm flex-col items-center gap-4" @layoutChanged="fitCard($event, 48)">
          <h2 class="font-creep text-5xl text-bone-50">Paused</h2>
          <p class="font-fell-italic text-center text-lg text-bone-400">The night holds its breath…</p>
          <button class="btn-blood w-full" @click="resume">Resume</button>
          <button class="btn-ghost w-full" @click="restart">Restart the rite</button>
          <button class="btn-ghost w-full" @click="leave">Flee to the map</button>
        </section>
      </div>

      <!-- Results -->
      <div
        v-if="phase === 'over' && result"
        class="absolute inset-0 flex items-center justify-center bg-black/75 p-5"
        @layoutChanged="fitCard($event, 40)"
      >
        <section class="rise panel flex w-full max-w-md flex-col items-center gap-4" @layoutChanged="fitCard($event, 40)">
          <h2
            class="flicker font-creep text-center text-5xl"
            :class="result.won ? 'text-ecto-300' : 'text-blood-400'"
          >
            {{ result.won ? 'Rite complete' : 'You perished' }}
          </h2>
          <p v-if="result.verdict" class="font-fell-italic text-center text-lg text-bone-200">
            {{ result.verdict }}
          </p>
          <div class="flex flex-row gap-2">
            <Svg v-for="(src, i) in stars" :key="i" :src="src" class="size-[46]" />
          </div>
          <div class="flex flex-col items-center">
            <span class="font-creep text-6xl text-bone-50">{{ formatCount(result.score) }}</span>
            <span v-if="newBest" class="chip bg-pumpkin-500 text-night-950">New best</span>
            <span v-else class="text-sm text-bone-400">Best {{ formatCount(record?.best ?? 0) }}</span>
          </div>
          <div class="grid w-full grid-cols-[repeat(auto-fill,minmax(130,1fr))] gap-2">
            <div
              v-for="stat in result.stats"
              :key="stat.label"
              class="flex flex-col gap-1 rounded-2xl bg-night-800 p-3"
            >
              <span class="text-xs font-semibold uppercase text-bone-400">{{ stat.label }}</span>
              <span class="text-lg font-bold text-bone-50">{{ stat.value }}</span>
            </div>
          </div>
          <p v-if="allLit" class="font-fell-italic text-center text-base text-pumpkin-300">
            All six candles burn. Dawn is coming…
          </p>
          <button v-if="result.won && next" class="btn-blood w-full" @click="goNext">
            Rite {{ next.numeral }}: {{ next.title }} →
          </button>
          <button class="w-full" :class="result.won && next ? 'btn-ghost' : 'btn-blood'" @click="restart">
            Try again
          </button>
          <button class="btn-ghost w-full" @click="leave">Back to the map</button>
        </section>
      </div>
    </div>
  </Page>
</template>
