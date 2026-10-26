import { ApplicationSettings } from '@nativescript/core';
import { reactive, watch } from 'nativescript-vue';

/**
 * Settings and progress, kept in NativeScript's ApplicationSettings
 * (NSUserDefaults on iOS, SharedPreferences on Android). Both are reactive,
 * so screens read them directly and every change is written back.
 */

export type RiteId = 'graveyard' | 'patch' | 'corridor' | 'sigil' | 'souls' | 'seance';

export const RITE_IDS: RiteId[] = ['graveyard', 'patch', 'corridor', 'sigil', 'souls', 'seance'];

export interface RiteRecord {
  best: number;
  /** Best star rating, 0 to 3. */
  stars: number;
  plays: number;
  /** Won at least once: its candle is lit. */
  completed: boolean;
}

export interface Settings {
  /** Master volume, 0 to 1. */
  volume: number;
  music: boolean;
  haptics: boolean;
  /** Strobe the camera LED when lightning strikes. */
  torch: boolean;
  /** Fewer jump scares: no screaming face, softer stingers. */
  gentle: boolean;
}

const SETTINGS_KEY = 'hallow.settings.v1';
const PROGRESS_KEY = 'hallow.progress.v1';

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = ApplicationSettings.getString(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export const settings = reactive<Settings>(
  load<Settings>(SETTINGS_KEY, { volume: 0.8, music: true, haptics: true, torch: false, gentle: false }),
);

const emptyRecord = (): RiteRecord => ({ best: 0, stars: 0, plays: 0, completed: false });

export const progress = reactive<Record<RiteId, RiteRecord>>(
  load(
    PROGRESS_KEY,
    Object.fromEntries(RITE_IDS.map((id) => [id, emptyRecord()])) as Record<RiteId, RiteRecord>,
  ),
);

watch(settings, (value) => ApplicationSettings.setString(SETTINGS_KEY, JSON.stringify(value)), { deep: true });
watch(progress, (value) => ApplicationSettings.setString(PROGRESS_KEY, JSON.stringify(value)), { deep: true });

/** Records a finished run. Returns whether it beat the previous best. */
export function recordRun(id: RiteId, run: { won: boolean; score: number; stars: number }): boolean {
  const record = (progress[id] ??= emptyRecord());
  const newBest = run.score > record.best;
  record.plays++;
  record.best = Math.max(record.best, run.score);
  if (run.won) {
    record.completed = true;
    record.stars = Math.max(record.stars, run.stars);
  }
  return newBest;
}

/** How many candles are lit, 0 to 6. */
export function candlesLit(): number {
  return RITE_IDS.filter((id) => progress[id]?.completed).length;
}

export function resetProgress() {
  for (const id of RITE_IDS) {
    progress[id] = emptyRecord();
  }
}
