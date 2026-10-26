import { shallowRef, type Component } from 'vue';

interface PageEntry {
  component: Component;
  props?: Record<string, unknown>;
  key: number;
}

interface NavigationOptions {
  props?: Record<string, unknown>;
  backstackVisible?: boolean;
}

const stack = shallowRef<PageEntry[]>([]);
let nextKey = 0;

export const currentPage = shallowRef<PageEntry | null>(null);

function syncCurrentPage() {
  currentPage.value = stack.value.at(-1) ?? null;
}

export function setInitialPage(component: Component) {
  stack.value = [{ component, key: ++nextKey }];
  syncCurrentPage();
}

export function $navigateTo(component: Component, options: NavigationOptions = {}) {
  const entry = { component, props: options.props, key: ++nextKey };
  const previous = stack.value.at(-1);
  if (options.backstackVisible === false && previous?.component === component) {
    stack.value = [...stack.value.slice(0, -1), entry];
  } else {
    stack.value = [...stack.value, entry];
  }
  syncCurrentPage();
}

export function $navigateBack() {
  if (stack.value.length > 1) {
    stack.value = stack.value.slice(0, -1);
    syncCurrentPage();
  }
}
