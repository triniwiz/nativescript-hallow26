<script lang="ts" setup>
import { $navigateBack, $navigateTo, computed } from 'nativescript-vue';
import WorkerCanvasView from '../components/WorkerCanvasView.vue';
import { createWispsWorker } from '../art/workers';
import { wisps } from '../art/wisps';
import { backIcon, candle, ghost, star } from '../art/svg';
import { sfx } from '../core/audio';
import { haptic, safeAreaInsets } from '../core/native';
import { candlesLit, progress } from '../core/save';
import { formatCount } from '../game/util';
import { rites, type Rite } from '../rites';
import GameShell from '../game/GameShell.vue';
import { startMenuMusic } from './menu-music';

/**
 * The six rites, over will-o'-wisps that a Worker draws into an
 * OffscreenCanvas, so scrolling the cards never competes with them.
 */
const lit = computed(() => candlesLit());
const litCandle = candle(true, 22);
const outCandle = candle(false, 22);
const fullStar = star(true, 18);
const emptyStar = star(false, 18);
const spirit = ghost(56);
const insets = safeAreaInsets();
const wispsFallback = wisps();

function play(rite: Rite) {
  sfx.wake();
  sfx.click();
  haptic('medium');
  $navigateTo(GameShell, {
    props: { riteId: rite.id },
    // "Next rite" swaps one rite for the next, so back always returns here.
    backstackVisible: false,
    transition: { name: 'fade', duration: 450 },
  });
}

function back() {
  sfx.click();
  $navigateBack();
}
</script>

<template>
  <Page actionBarHidden="true" statusBarStyle="dark" backgroundColor="#07040b" @navigatedTo="startMenuMusic">
    <div class="relative h-full w-full" iosOverflowSafeArea="true">
      <div class="absolute inset-0">
        <WorkerCanvasView :worker="createWispsWorker" :fallback="wispsFallback" class="h-full w-full" />
      </div>

      <Scroll class="absolute inset-0">
        <main
          class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5"
          :style="{ paddingTop: `${insets.top + 12}px`, paddingBottom: `${insets.bottom + 24}px` }"
        >
          <header class="flex flex-row items-center gap-4">
            <div class="web-clickable flex size-12 shrink-0 items-center justify-center rounded-full border border-night-600 bg-night-800/80" @click="back">
            <Svg :src="backIcon" class="size-[22]" />
          </div>
            <div class="flex flex-1 flex-col">
              <span class="eyebrow">All Hallows' Eve</span>
              <h1 class="font-creep text-5xl text-bone-50">The Six Rites</h1>
            </div>
            <Svg :src="spirit" class="float size-[56]" />
          </header>

          <p class="font-fell-italic text-lg text-bone-200">
            Perform each rite to light its candle. When all six burn, the curse lifts and the sun
            may rise.
          </p>

          <article
            v-for="rite in rites"
            :key="rite.id"
            class="web-clickable flex flex-col gap-3 rounded-3xl border border-night-700/70 bg-night-950/55 p-6 active:bg-night-800/70"
            @click="play(rite)"
          >
            <div class="flex flex-row items-center gap-4">
              <Svg :src="rite.icon" class="size-[72]" />
              <div class="flex flex-1 flex-col gap-1">
                <span class="eyebrow">Rite {{ rite.numeral }}</span>
                <h2 class="font-creep text-3xl" :style="{ color: rite.accent }">{{ rite.title }}</h2>
                <span class="self-start chip">{{ rite.renderer }}</span>
              </div>
              <Svg
                :src="progress[rite.id]?.completed ? litCandle : outCandle"
                class="h-[34] w-[22]"
              />
            </div>
            <p class="font-fell-italic text-base text-bone-400">{{ rite.teaser }}</p>
            <div v-if="progress[rite.id]?.plays" class="flex flex-row items-center gap-2">
              <Svg
                v-for="i in 3"
                :key="i"
                :src="i <= (progress[rite.id]?.stars ?? 0) ? fullStar : emptyStar"
                class="size-[18]"
              />
              <span class="flex-1 text-sm text-bone-400">
                Best {{ formatCount(progress[rite.id]?.best ?? 0) }}
              </span>
              <span class="text-sm text-bone-600">{{ progress[rite.id]?.plays }} {{ progress[rite.id]?.plays === 1 ? 'attempt' : 'attempts' }}</span>
            </div>
          </article>

          <section v-if="lit === rites.length" class="panel flex flex-col items-center gap-2 border-pumpkin-500">
            <h2 class="font-creep text-4xl text-pumpkin-300">Dawn breaks</h2>
            <p class="font-fell-italic text-center text-lg text-bone-200">
              Six candles burn. Go back to the gate and watch the sun come up.
            </p>
          </section>

          <span class="self-center chip">Will-o'-wisps drawn by a Worker · OffscreenCanvas</span>
        </main>
      </Scroll>
    </div>
  </Page>
</template>
