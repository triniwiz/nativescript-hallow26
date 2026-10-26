<script lang="ts" setup>
import { $navigateTo, computed, onUnmounted, ref, shallowRef, watch } from 'nativescript-vue';
import { Screen, type TouchGestureEventData, type View } from '@nativescript/core';
import CanvasView from '../components/CanvasView.vue';
import { bloodMoon, type BloodMoon } from '../art/blood-moon';
import { bats, bookGlyph, candleRow, leatherButton, skullGlyph, stoneButton, witch, WITCH_LAP, WITCH_PASS } from '../art/svg';
import { bleedingTitle } from '../art/bleeding-title';
import { sfx } from '../core/audio';
import { animatePress, haptic, safeAreaInsets, startHeartbeat } from '../core/native';
import { candlesLit, RITE_IDS, progress } from '../core/save';
import { startMenuMusic } from './menu-music';
import RiteMap from './RiteMap.vue';
import Grimoire from './Grimoire.vue';

/**
 * The title screen: a WebGL shader scene (blood moon, haunted house, fog,
 * lightning) behind MasonKit text and SVG bats. Light all six candles and
 * the shader brings up the dawn.
 */
const lit = computed(() => candlesLit());
const dawned = computed(() => lit.value === RITE_IDS.length);
const dawnLevel = () => (dawned.value ? 1 : lit.value * 0.05);

const scene = shallowRef<BloodMoon>();
const backdrop = bloodMoon({ dawn: dawnLevel() });
watch(lit, () => scene.value?.setDawn(dawnLevel()));

const colony = bats(360, 140);

// Now and then a witch crosses the moon (the shader puts it about 27% down).
const screenW = Screen.mainScreen.widthDIPs;
const witchTop = Screen.mainScreen.heightDIPs * 0.27 - 120;
const broom = witch(screenW, 120);
// She only exists while she's crossing: an animating SVG re-renders even
// off-screen. Her cackle comes mid-crossing.
const flying = ref(false);
const timers: ReturnType<typeof setTimeout>[] = [];
const lap = setInterval(() => {
  flying.value = true;
  timers.push(setTimeout(() => sfx.cackle(0.12), (WITCH_PASS * 1000) / 2));
  timers.push(setTimeout(() => (flying.value = false), WITCH_PASS * 1000 + 300));
}, WITCH_LAP * 1000);
let stopHeartbeat = () => {};
onUnmounted(() => {
  clearInterval(lap);
  timers.forEach(clearTimeout);
  stopHeartbeat();
});
function pulse(args: { object: View }) {
  stopHeartbeat();
  stopHeartbeat = startHeartbeat(args.object);
}
const insets = safeAreaInsets();
// The footer is up to max-w-md (448 dp) wide inside px-6.
const buttonWidth = Math.min(Screen.mainScreen.widthDIPs - 48, 448);
// Entering is a worn stone slab; the Grimoire is bound in tooled leather.
const enterFace = stoneButton(buttonWidth, 64);
const grimoireFace = leatherButton(buttonWidth, 56);
const skull = skullGlyph(26);
const book = bookGlyph(26);
const candles = computed(() => candleRow(RITE_IDS.map((id) => !!progress[id]?.completed), 26, 12));

function open(page: any) {
  sfx.wake();
  if (page === Grimoire) {
    sfx.page(0.5);
  } else {
    // A scream as you step into the night; then something laughs.
    sfx.scream(0.55);
    setTimeout(() => sfx.laugh(0.6), 1100);
    haptic('heavy');
  }
  $navigateTo(page, { transition: { name: 'fade', duration: 500 } });
}

/**
 * Buttons give under your finger: they sink (a native scale animation), the
 * blood runs, and they spring back when you let go.
 */
function press(args: TouchGestureEventData, kind: 'leather' | 'stone') {
  const view = args.object as View;
  if (args.action === 'down') {
    sfx.wake();
    haptic('light');
    if (kind === 'leather') {
      sfx.page(0.35);
    } else {
      sfx.grind(0, 0.15);
    }
    animatePress(view, true);
  } else if (args.action === 'up' || args.action === 'cancel') {
    animatePress(view, false);
  }
}

// The title bleeds: a transparent canvas draws the word and its blood. Its
// box is fixed (the word is centred inside), and the blood runs on below it.
const TITLE_FONT = 96;
const TITLE_HEIGHT = 112;
const TITLE_BLEED = 120;
const titleWidth = Math.min(Screen.mainScreen.widthDIPs - 24, 460);
const titleScene = bleedingTitle({ text: 'HALLOW', fontSize: TITLE_FONT, top: 6 });
</script>

<template>
  <Frame>
    <Page actionBarHidden="true" statusBarStyle="dark" backgroundColor="#07040b" @navigatedTo="startMenuMusic">
      <div class="relative h-full w-full" iosOverflowSafeArea="true">
        <div class="absolute inset-0">
          <CanvasView :demo="backdrop" class="h-full w-full" @started="scene = $event" />
        </div>
        <Svg v-if="flying && !dawned" :src="broom" class="absolute left-0" :style="{ top: witchTop, width: screenW, height: 120 }" />

        <div
          class="absolute inset-0 flex flex-col justify-between px-6"
          :style="{ paddingTop: `${insets.top + 24}px`, paddingBottom: `${insets.bottom + 20}px` }"
        >
          <header class="flex flex-col items-center gap-2">
            <Svg :src="colony" class="float h-[140] w-[360]" />
            <h1 v-if="dawned" class="flicker font-creep text-center text-8xl text-pumpkin-300">Hallow</h1>
            <div v-else class="relative" :style="{ width: `${titleWidth}px`, height: `${TITLE_HEIGHT}px` }">
              <div class="absolute left-0 top-0" :style="{ width: `${titleWidth}px`, height: `${TITLE_HEIGHT + TITLE_BLEED}px` }">
                <CanvasView :demo="titleScene" class="h-full w-full" />
              </div>
            </div>
            <span class="font-fell-italic text-center text-2xl text-bone-200">
              {{ dawned ? 'The curse is broken. Dawn has come.' : 'Six rites before dawn' }}
            </span>
          </header>

          <footer class="mx-auto flex w-full max-w-md flex-col items-center gap-4">
            <Svg :src="candles" :style="{ width: RITE_IDS.length * 38 - 12, height: 40 }" />
            <span class="font-fell text-base text-bone-400">
              {{ lit }} of {{ RITE_IDS.length }} candles burn
            </span>
            <!-- Each face is one SVG with the label laid over it (and <div>s, not
                 <button>s: a MasonKit button can't hold SVG on Android). -->
            <div class="web-clickable relative w-full" :style="{ height: '64px' }" @touch="press($event, 'stone')" @click="open(RiteMap)">
              <div class="heartbeat absolute inset-0" @loaded="pulse">
                <Svg :src="enterFace" class="absolute left-0 top-0" :style="{ width: buttonWidth, height: 64 }" />
                <Svg :src="skull" class="absolute" :style="{ left: 34, top: 19, width: 26, height: 26 }" />
                <Svg :src="skull" class="absolute" :style="{ right: 34, top: 19, width: 26, height: 26 }" />
                <!-- Creepster draws high in its line box: the label sits a little low to look centred. -->
                <div class="absolute left-0 right-0 flex flex-row justify-center" :style="{ top: '11px' }">
                  <span class="font-creep text-3xl text-bone-50">
                    {{ lit ? 'Return to the night' : 'Enter the night' }}
                  </span>
                </div>
              </div>
            </div>
            <div class="web-clickable relative w-full" :style="{ height: '56px' }" @touch="press($event, 'leather')" @click="open(Grimoire)">
              <Svg :src="grimoireFace" class="absolute left-0 top-0" :style="{ width: buttonWidth, height: 56 }" />
              <Svg :src="book" class="absolute" :style="{ left: 34, top: 15, width: 26, height: 26 }" />
              <div class="absolute left-0 right-0 flex flex-row justify-center" :style="{ top: '8px' }">
                <span class="font-fell-italic text-2xl text-pumpkin-300">The Grimoire</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </Page>
  </Frame>
</template>
