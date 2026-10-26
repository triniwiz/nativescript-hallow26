import { settings } from './save';

export const isWeb = true;

export type HapticKind = 'tick' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// The browser pulses through the `.heartbeat` CSS class.
export function startHeartbeat(_view: unknown): () => void {
  return () => {};
}

export function animatePress(view: unknown, pressed: boolean) {
  const element = view as HTMLElement;
  if (typeof element.animate === 'function') {
    element.animate(
      [{ transform: pressed ? 'scale(1)' : 'scale(0.95)' }, { transform: pressed ? 'scale(0.95)' : 'scale(1)' }],
      {
        duration: pressed ? 90 : 260,
        easing: pressed ? 'ease-out' : 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'both',
      },
    );
    return;
  }
  element.style.transform = pressed ? 'scale(0.95)' : 'scale(1)';
}

export function haptic(kind: HapticKind) {
  if (!settings.haptics || typeof navigator.vibrate !== 'function') {
    return;
  }
  const duration = { tick: 8, light: 14, medium: 24, heavy: 40, success: 18, warning: 28, error: 36 }[kind];
  navigator.vibrate(duration);
}

export function rumble(pattern: number[]) {
  if (settings.haptics && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

let keepAwakeRequested = false;
let wakeLock: WakeLockSentinel | null = null;

export function keepAwake(on: boolean) {
  keepAwakeRequested = on;
  if (!('wakeLock' in navigator)) {
    return;
  }
  if (!on) {
    const current = wakeLock;
    wakeLock = null;
    void current?.release().catch((error) => console.warn('[wake lock]', error));
    return;
  }
  if (wakeLock || document.visibilityState !== 'visible') {
    return;
  }
  void navigator.wakeLock
    .request('screen')
    .then((lock) => {
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) {
          wakeLock = null;
        }
      });
    })
    .catch((error) => console.warn('[wake lock]', error));
}

export function lightningTorch() {}

export function hasTorch(): boolean {
  return false;
}

export function onAppLifecycle(onPause: () => void, onResume: () => void): () => void {
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      onPause();
    } else {
      if (keepAwakeRequested) {
        keepAwake(true);
      }
      onResume();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}

function readSafeArea(property: 'top' | 'bottom'): number {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;padding-${property}:env(safe-area-inset-${property})`;
  document.documentElement.append(probe);
  const value = Number.parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${property}`)) || 0;
  probe.remove();
  return value;
}

export function safeAreaInsets(): { top: number; bottom: number } {
  return { top: readSafeArea('top'), bottom: readSafeArea('bottom') };
}
