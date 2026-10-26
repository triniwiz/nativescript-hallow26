<script lang="ts" setup>
import { $navigateBack } from 'nativescript-vue';
import { Dialogs } from '@nativescript/core';
import Toggle from '../components/Toggle.vue';
import { backIcon } from '../art/svg';
import { sfx } from '../core/audio';
import { haptic, hasTorch, isWeb, lightningTorch } from '../core/native';
import { resetProgress, settings } from '../core/save';
import { rites } from '../rites';

/** Settings, how each rite is made, and credits. */
const volumes = [
  { label: 'Silent', value: 0 },
  { label: 'Hushed', value: 0.35 },
  { label: 'Eerie', value: 0.65 },
  { label: 'Deafening', value: 1 },
];
const torch = hasTorch();

function setVolume(value: number) {
  settings.volume = value;
  sfx.chime(2);
  haptic('tick');
}

function testTorch(on: boolean) {
  if (on) {
    lightningTorch();
    sfx.thunder(0.3, 0.6);
  }
}

function testHaptics(on: boolean) {
  if (on) {
    haptic('heavy');
  }
}

async function reset() {
  const ok = await Dialogs.confirm({
    title: 'Snuff out every candle?',
    message: 'Your best scores and lit candles will be forgotten.',
    okButtonText: 'Snuff them out',
    cancelButtonText: 'Keep them',
  });
  if (ok) {
    resetProgress();
    sfx.doom(0.3);
    haptic('warning');
  }
}

const platform = isWeb
  ? [
      { title: 'Vue 3 in the browser', body: 'The same screens and rites run in a regular browser build.' },
      { title: 'Canvas, PixiJS & three.js', body: 'Canvas 2D, PixiJS, three.js and WebGL render the rites directly in the browser.' },
      { title: 'Web Audio', body: 'Music and recorded effects play through one Web Audio graph, mixed with sounds synthesized live.' },
      { title: 'Browser APIs', body: 'Pointer controls, local storage and screen wake lock are used where available. Haptics depend on device support; the camera torch is native-only.' },
      { title: 'SVG & Workers', body: 'The candles, bats and icons are animated SVG. The map and séance use OffscreenCanvas Workers where supported, with a main-thread fallback.' },
      { title: 'WebGPU', body: 'The Lost Souls uses WebGPU where available and a Canvas 2D version otherwise.' },
      { title: 'Local storage', body: 'Candles, best scores and settings are saved in this browser.' },
    ]
  : [
  { title: 'NativeScript-Vue', body: 'Every screen is Vue 3 rendering real native views.' },
  { title: 'MasonKit + Tailwind', body: 'Flexbox and grid layouts, CSS keyframes for the flicker and the scares.' },
  { title: 'Web Audio', body: 'Music and recorded effects play through one Web Audio graph, mixed with sounds synthesized live: oscillators, noise, filters and a convolution reverb.' },
  { title: 'Native APIs', body: 'Taptic Engine and vibrator haptics, keep-awake, and the camera torch for lightning, called straight from TypeScript.' },
  { title: 'SVG with SMIL', body: 'The candles, bats, icons and the face that screams are animated SVG, rendered by Skia.' },
  { title: 'Workers', body: "The map's will-o'-wisps are drawn by a Worker that owns an OffscreenCanvas." },
  { title: 'WebGL title', body: 'The blood moon, haunted house, fog and lightning are one GLSL shader.' },
  { title: 'ApplicationSettings', body: 'Candles, best scores and these settings survive restarts.' },
  ];
</script>

<template>
  <Page actionBarHidden="true" statusBarStyle="dark" backgroundColor="#07040b">
    <Scroll>
      <main class="mx-auto flex w-full max-w-3xl flex-col gap-5 bg-crypt px-5 pb-10 pt-6">
        <header class="flex flex-row items-center gap-4">
          <div class="web-clickable flex size-12 shrink-0 items-center justify-center rounded-full border border-night-600 bg-night-800/80" @click="$navigateBack">
            <Svg :src="backIcon" class="size-[22]" />
          </div>
          <div class="flex flex-1 flex-col">
            <span class="eyebrow">Settings & secrets</span>
            <h1 class="font-creep text-5xl text-bone-50">The Grimoire</h1>
          </div>
        </header>

        <section class="panel flex flex-col gap-3">
          <h2 class="font-creep text-2xl text-pumpkin-400">Sound</h2>
          <div class="flex flex-row flex-wrap gap-2">
            <button
              v-for="v in volumes"
              :key="v.label"
              class="rounded-xl px-4 py-2 text-sm font-semibold"
              :class="settings.volume === v.value ? 'bg-pumpkin-500 text-night-950' : 'bg-night-800 text-bone-200'"
              @click="setVolume(v.value)"
            >
              {{ v.label }}
            </button>
          </div>
          <Toggle v-model="settings.music" label="Music box" description="The lullaby and the drones beneath each rite." />
        </section>

        <section class="panel flex flex-col gap-1">
          <h2 class="font-creep text-2xl text-pumpkin-400">Body & soul</h2>
          <Toggle
            v-model="settings.haptics"
            label="Haptics"
            description="Feel the heartbeat, the hits and the scares."
            @update:model-value="testHaptics"
          />
          <Toggle
            v-if="torch"
            v-model="settings.torch"
            label="Real lightning"
            description="Strobe the camera torch whenever lightning strikes in the graveyard."
            @update:model-value="testTorch"
          />
          <Toggle
            v-model="settings.gentle"
            label="Gentle mode"
            description="No screaming face, and softer stingers."
          />
        </section>

        <section class="panel flex flex-col gap-4">
          <h2 class="font-creep text-2xl text-pumpkin-400">How the rites are made</h2>
          <div v-for="rite in rites" :key="rite.id" class="flex flex-row gap-3">
            <Svg :src="rite.icon" class="size-[72]" />
            <div class="flex flex-1 flex-col gap-1">
              <span class="text-base font-semibold text-bone-50">{{ rite.numeral }}. {{ rite.title }}</span>
              <span class="self-start chip" :style="{ color: rite.accent }">{{ rite.renderer }}</span>
              <div class="flex flex-row flex-wrap gap-1 pt-1">
                <span
                  v-for="technique in rite.techniques"
                  :key="technique"
                  class="rounded-full bg-night-800 px-2 py-1 text-xs text-bone-400"
                >
                  {{ technique }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel flex flex-col gap-3">
          <h2 class="font-creep text-2xl text-pumpkin-400">And around them</h2>
          <div v-for="item in platform" :key="item.title" class="flex flex-col gap-1">
            <span class="text-base font-semibold text-bone-50">{{ item.title }}</span>
            <span class="text-sm text-bone-400">{{ item.body }}</span>
          </div>
        </section>

        <section class="panel flex flex-col gap-2">
          <h2 class="font-creep text-2xl text-pumpkin-400">Credits</h2>
          <span class="text-sm text-bone-400">Creepster by Sideshow, and IM FELL English by Igino Marini, both under the SIL Open Font License.</span>
          <span class="text-sm text-bone-400">Music: Lullaby, Add-Ons, Clouds, Surveillance, Electricity and Where My Home Is.</span>
          <span class="text-sm text-bone-400">Sound effects from the 400 Sounds Pack, Weather Elements (CC BY 4.0) and the MECHA Sounds Asset Pack (CC BY 4.0); the rest is synthesized live.</span>
          <span class="text-sm text-bone-400">The laugh and the screams: oliper18, jusatti890 and SimpleSound, via Pixabay.</span>
          <span class="text-sm text-bone-400">Built with @nativescript/canvas, three.js and PixiJS.</span>
        </section>

        <button class="btn-ghost text-blood-400" @click="reset">Snuff out every candle</button>
      </main>
    </Scroll>
  </Page>
</template>
