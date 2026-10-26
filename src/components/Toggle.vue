<script lang="ts" setup>
import { sfx } from '../core/audio';
import { haptic } from '../core/native';

/** A labelled on/off switch. */
defineProps<{ label: string; description?: string }>();
const model = defineModel<boolean>({ required: true });

function flip() {
  model.value = !model.value;
  sfx.click();
  haptic('tick');
}
</script>

<template>
  <div class="web-clickable flex flex-row items-center gap-4 py-2" @click="flip">
    <div class="flex flex-1 flex-col gap-1">
      <span class="text-base font-semibold text-bone-50">{{ label }}</span>
      <span v-if="description" class="text-sm text-bone-400">{{ description }}</span>
    </div>
    <div
      class="h-8 w-14 flex-row items-center rounded-full p-1"
      :class="model ? 'justify-end bg-pumpkin-500' : 'justify-start bg-night-600'"
    >
      <div class="size-6 rounded-full bg-bone-50" />
    </div>
  </div>
</template>
