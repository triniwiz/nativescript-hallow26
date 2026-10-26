import { Application, CoreTypes, Utils, type View } from '@nativescript/core';
import { settings } from './save';

export const isWeb = false;

/**
 * The bits of the phone itself the game reaches for, straight through
 * NativeScript's native API access: no plugins, just UIKit, AVFoundation and
 * the Android SDK called from TypeScript. Everything here is best effort and
 * a no-op where a platform (or the simulator) has no such hardware.
 */

export type HapticKind = 'tick' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

let lastHaptic = 0;

/** Press feedback for the title screen's two illustrated buttons. */
export function animatePress(view: View, pressed: boolean) {
  void view
    .animate({
      scale: { x: pressed ? 0.95 : 1, y: pressed ? 0.95 : 1 },
      duration: pressed ? 90 : 260,
      curve: pressed ? CoreTypes.AnimationCurve.easeOut : CoreTypes.AnimationCurve.spring,
    })
    .catch(() => {});
}

/**
 * The "lub-dub" pulse of the call to action, as a loop. Mason doesn't animate
 * `transform: scale` keyframes on Android/iOS, so native drives it here and
 * the web uses the `.heartbeat` CSS class. Returns a stop function.
 */
export function startHeartbeat(view: View): () => void {
  let stopped = false;
  const step = (scale: number, duration: number) =>
    stopped ? Promise.resolve() : view.animate({ scale: { x: scale, y: scale }, duration, curve: CoreTypes.AnimationCurve.easeInOut }).catch(() => {});
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  (async () => {
    while (!stopped) {
      await step(1.035, 120);
      await step(1, 120);
      await step(1.025, 120);
      await step(1, 190);
      await wait(930);
    }
  })();
  return () => {
    stopped = true;
  };
}

/** A single tap of the Taptic Engine / vibration motor. */
export function haptic(kind: HapticKind) {
  if (!settings.haptics) {
    return;
  }
  // Fast games call this a lot; the motor can't render taps closer than this.
  const now = Date.now();
  if (kind === 'tick' && now - lastHaptic < 40) {
    return;
  }
  lastHaptic = now;
  try {
    if (__IOS__) {
      switch (kind) {
        case 'tick':
          UISelectionFeedbackGenerator.new().selectionChanged();
          break;
        case 'success':
          UINotificationFeedbackGenerator.new().notificationOccurred(UINotificationFeedbackType.Success);
          break;
        case 'warning':
          UINotificationFeedbackGenerator.new().notificationOccurred(UINotificationFeedbackType.Warning);
          break;
        case 'error':
          UINotificationFeedbackGenerator.new().notificationOccurred(UINotificationFeedbackType.Error);
          break;
        default: {
          const style =
            kind === 'light'
              ? UIImpactFeedbackStyle.Light
              : kind === 'medium'
                ? UIImpactFeedbackStyle.Medium
                : UIImpactFeedbackStyle.Heavy;
          UIImpactFeedbackGenerator.alloc().initWithStyle(style).impactOccurred();
        }
      }
    } else if (__ANDROID__) {
      const view = decorView();
      if (!view) {
        return;
      }
      const C = android.view.HapticFeedbackConstants;
      const sdk = android.os.Build.VERSION.SDK_INT;
      const constant = {
        tick: C.CLOCK_TICK,
        light: C.KEYBOARD_TAP,
        medium: C.VIRTUAL_KEY,
        heavy: C.LONG_PRESS,
        // CONFIRM and REJECT arrived in API 30.
        success: sdk >= 30 ? 16 : C.VIRTUAL_KEY,
        warning: C.LONG_PRESS,
        error: sdk >= 30 ? 17 : C.LONG_PRESS,
      }[kind];
      view.performHapticFeedback(constant);
    }
  } catch {
    // No haptics here (simulator, tablet without a motor, ...).
  }
}

/**
 * A pattern of buzzes, in ms: [on, off, on, off, ...]. Used for jump scares,
 * where one tap isn't enough.
 */
export function rumble(pattern: number[]) {
  if (!settings.haptics) {
    return;
  }
  try {
    if (__IOS__) {
      // Taptic taps can't be held, so play one heavy tap per "on" segment.
      let at = 0;
      pattern.forEach((ms, i) => {
        if (i % 2 === 0) {
          setTimeout(() => {
            UIImpactFeedbackGenerator.alloc().initWithStyle(UIImpactFeedbackStyle.Heavy).impactOccurred();
          }, at);
        }
        at += ms;
      });
    } else if (__ANDROID__) {
      const context = Utils.android.getApplicationContext();
      const vibrator = context.getSystemService(android.content.Context.VIBRATOR_SERVICE) as android.os.Vibrator;
      if (!vibrator?.hasVibrator()) {
        return;
      }
      const timings = Array.create('long', pattern.length + 1);
      timings[0] = 0;
      pattern.forEach((ms, i) => (timings[i + 1] = ms));
      if (android.os.Build.VERSION.SDK_INT >= 26) {
        vibrator.vibrate(android.os.VibrationEffect.createWaveform(timings, -1));
      } else {
        vibrator.vibrate(timings, -1);
      }
    }
  } catch {
    // No motor.
  }
}

/** Keeps the screen from dimming while a rite is being played. */
export function keepAwake(on: boolean) {
  try {
    if (__IOS__) {
      UIApplication.sharedApplication.idleTimerDisabled = on;
    } else if (__ANDROID__) {
      const window = Application.android.foregroundActivity?.getWindow();
      const flag = android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
      if (on) {
        window?.addFlags(flag);
      } else {
        window?.clearFlags(flag);
      }
    }
  } catch {
    // Not fatal: the screen may just dim.
  }
}

let torchBusy = false;

/**
 * Lightning you can feel: strobes the camera's LED torch. Opt-in from the
 * settings, and only on hardware that has one.
 */
export function lightningTorch() {
  if (!settings.torch || torchBusy) {
    return;
  }
  torchBusy = true;
  const steps: [boolean, number][] = [
    [true, 70],
    [false, 90],
    [true, 40],
    [false, 60],
    [true, 160],
    [false, 0],
  ];
  let at = 0;
  for (const [on, ms] of steps) {
    setTimeout(() => setTorch(on), at);
    at += ms;
  }
  setTimeout(() => (torchBusy = false), at + 50);
}

function setTorch(on: boolean) {
  try {
    if (__IOS__) {
      const device = AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo);
      if (!device?.hasTorch) {
        return;
      }
      if (device.lockForConfiguration()) {
        device.torchMode = on ? AVCaptureTorchMode.On : AVCaptureTorchMode.Off;
        device.unlockForConfiguration();
      }
    } else if (__ANDROID__) {
      // CameraManager.setTorchMode needs no CAMERA permission.
      const context = Utils.android.getApplicationContext();
      const manager = context.getSystemService(
        android.content.Context.CAMERA_SERVICE,
      ) as android.hardware.camera2.CameraManager;
      const ids = manager.getCameraIdList();
      for (let i = 0; i < ids.length; i++) {
        const traits = manager.getCameraCharacteristics(ids[i]);
        if (traits.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE)) {
          manager.setTorchMode(ids[i], on);
          return;
        }
      }
    }
  } catch {
    // No torch, or the camera is in use.
  }
}

/** Whether this device has a torch worth offering in the settings. */
export function hasTorch(): boolean {
  try {
    if (__IOS__) {
      return !!AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo)?.hasTorch;
    }
    if (__ANDROID__) {
      const pm = Utils.android.getApplicationContext().getPackageManager();
      return pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_CAMERA_FLASH);
    }
  } catch {}
  return false;
}

function decorView(): android.view.View | null {
  return Application.android.foregroundActivity?.getWindow()?.getDecorView() ?? null;
}

/**
 * Calls `onPause` when the app leaves the foreground and `onResume` when it
 * returns. Returns a function that stops listening.
 */
export function onAppLifecycle(onPause: () => void, onResume: () => void): () => void {
  Application.on(Application.suspendEvent, onPause);
  Application.on(Application.resumeEvent, onResume);
  return () => {
    Application.off(Application.suspendEvent, onPause);
    Application.off(Application.resumeEvent, onResume);
  };
}

/**
 * The notch and home-indicator insets, in dp. Full-screen canvases draw
 * under them (`iosOverflowSafeArea`); text and buttons are padded by them.
 */
export function safeAreaInsets(): { top: number; bottom: number } {
  try {
    if (__IOS__) {
      const scenes = UIApplication.sharedApplication.connectedScenes?.allObjects;
      for (let i = 0; i < (scenes?.count ?? 0); i++) {
        const scene = scenes!.objectAtIndex(i);
        if (scene instanceof UIWindowScene) {
          const window = scene.windows.firstObject;
          if (window) {
            return { top: window.safeAreaInsets.top, bottom: window.safeAreaInsets.bottom };
          }
        }
      }
    }
  } catch {}
  return { top: 0, bottom: 0 };
}
