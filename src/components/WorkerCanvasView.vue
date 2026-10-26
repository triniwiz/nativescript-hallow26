<script lang="ts" setup>
import { onUnmounted, ref } from 'nativescript-vue';
import type { Canvas } from '@nativescript/canvas';
import { runDemo, type Demo, type DemoInstance } from '../canvas/runner';
import { runInWorker, type TransferMode } from '../canvas/worker-host';

/**
 * CanvasView, drawn by a Worker: `worker` creates one whose entry file calls
 * `serveDemo` (see src/art/wisps.worker.ts). Sizing and the slot work as in
 * CanvasView. The Worker ends when this component unmounts.
 */
const props = defineProps<{ worker: () => Worker; height?: number; fallback?: Demo }>();
const emit = defineEmits<{ started: [mode: TransferMode | 'main'] }>();

const error = ref<string | null>(null);
let stop: (() => void) | null = null;
let postMessage: ((data: unknown) => void) | undefined;

function showError(reason: any) {
  error.value = String(reason?.message ?? reason);
}

function startFallback(canvas: Canvas) {
  if (!props.fallback) {
    return false;
  }
  error.value = null;
  let instance: DemoInstance | undefined;
  stop = runDemo(
    canvas,
    props.fallback,
    (created) => {
      instance = created;
      emit('started', 'main');
    },
    showError,
  );
  postMessage = (data) => instance?.message?.(data);
  return true;
}

function onLoaded(args: { object: Canvas }) {
  if (stop) {
    return;
  }
  if (typeof Worker === 'undefined' || typeof args.object.transferControlToOffscreen !== 'function') {
    if (!startFallback(args.object)) {
      showError('Workers with OffscreenCanvas are not supported in this browser.');
    }
    return;
  }
  // Some runtimes reject the worker immediately; later load failures arrive
  // through `worker.onerror`.
  let worker: Worker;
  try {
    worker = props.worker();
  } catch (reason) {
    console.error('[canvas worker]', reason);
    if (!startFallback(args.object)) {
      showError(reason);
    }
    return;
  }
  error.value = null;
  const handle = runInWorker(args.object, worker, (mode) => emit('started', mode), showError);
  stop = handle;
  postMessage = handle.post;
}

// The page can talk to the scene in the Worker (its `message` hook).
defineExpose({ post: (data: unknown) => postMessage?.(data) });

onUnmounted(() => {
  stop?.();
  stop = null;
  postMessage = undefined;
});
</script>

<template>
  <div class="relative overflow-hidden" :style="props.height ? { height: `${props.height}px` } : undefined">
    <div class="absolute inset-0">
      <Canvas :style="{ width: '100%', height: '100%' }" @loaded="onLoaded" />
    </div>
    <slot />
    <div
      v-if="error"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-night-950 p-6"
    >
      <span class="text-sm font-semibold text-blood-400">The Worker couldn't draw</span>
      <p class="text-center text-xs text-bone-400">{{ error }}</p>
    </div>
  </div>
</template>
