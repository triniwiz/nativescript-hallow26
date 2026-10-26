import { defineComponent, h, normalizeStyle, onBeforeUnmount, onMounted, ref } from './vue';

type BrowserCanvas = HTMLCanvasElement & {
  __hallowBrowserCanvas: true;
  isLoaded: boolean;
  on(event: string, listener: EventListener): void;
  off(event: string, listener: EventListener): void;
};

export const Frame = defineComponent({
  name: 'Frame',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('div', { ...attrs, class: ['web-frame', attrs.class] }, slots.default?.());
  },
});

export const Page = defineComponent({
  name: 'Page',
  inheritAttrs: false,
  emits: ['navigatedTo'],
  setup(_props, { attrs, slots, emit }) {
    onMounted(() => emit('navigatedTo'));
    return () => h('div', { ...attrs, class: ['web-page', attrs.class] }, slots.default?.());
  },
});

export const Scroll = defineComponent({
  name: 'Scroll',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('div', { ...attrs, class: ['web-scroll', attrs.class] }, slots.default?.());
  },
});

export const Svg = defineComponent({
  name: 'Svg',
  inheritAttrs: false,
  props: {
    src: {
      type: String,
      required: true,
    },
  },
  setup(props, { attrs }) {
    return () => h('span', { ...attrs, class: ['web-svg', attrs.class], style: normalizeStyle(attrs.style as any), innerHTML: props.src });
  },
});

export const Canvas = defineComponent({
  name: 'Canvas',
  inheritAttrs: false,
  emits: ['loaded'],
  setup(_props, { attrs, emit }) {
    const element = ref<HTMLCanvasElement>();
    let canvas: BrowserCanvas | undefined;

    onMounted(() => {
      const node = element.value!;
      canvas = node as BrowserCanvas;
      Object.defineProperties(canvas, {
        __hallowBrowserCanvas: { value: true },
        isLoaded: { value: true, writable: true },
        on: {
          value: (event: string, listener: EventListener) => canvas?.addEventListener(event, listener),
        },
        off: {
          value: (event: string, listener: EventListener) => canvas?.removeEventListener(event, listener),
        },
      });
      emit('loaded', { object: canvas });
    });

    onBeforeUnmount(() => {
      if (canvas) {
        canvas.isLoaded = false;
        canvas.dispatchEvent(new Event('unloaded'));
      }
    });

    return () =>
      h('canvas', {
        ...attrs,
        ref: element,
        class: ['web-canvas', attrs.class],
      });
  },
});

function dispatchTouch(target: HTMLElement, action: 'down' | 'up' | 'cancel') {
  const event = new Event('touch', { bubbles: true });
  Object.defineProperties(event, {
    action: { value: action },
    object: { get: () => event.currentTarget },
  });
  target.dispatchEvent(event);
}

export function installBrowserGestures() {
  const active = new Map<number, { target: HTMLElement; x: number; y: number; moved: boolean }>();
  document.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    active.set(event.pointerId, {
      target: event.target,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    });
    dispatchTouch(event.target, 'down');
  });
  document.addEventListener('pointermove', (event) => {
    const gesture = active.get(event.pointerId);
    if (gesture && (Math.abs(event.clientX - gesture.x) > 8 || Math.abs(event.clientY - gesture.y) > 8)) {
      gesture.moved = true;
    }
  });
  document.addEventListener('pointerup', (event) => {
    const gesture = active.get(event.pointerId);
    if (gesture) {
      active.delete(event.pointerId);
      dispatchTouch(gesture.target, gesture.moved ? 'cancel' : 'up');
    }
  });
  document.addEventListener('pointercancel', (event) => {
    const gesture = active.get(event.pointerId);
    if (gesture) {
      active.delete(event.pointerId);
      dispatchTouch(gesture.target, 'cancel');
    }
  });
}
