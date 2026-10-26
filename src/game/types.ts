import type { Demo, DemoInstance } from '../canvas/runner';

/**
 * The contract between a rite (one mini-game, drawn on a canvas) and the
 * GameShell page that hosts it. The shell owns everything that isn't the
 * canvas: the HUD, the intro card, pausing, jump-scare overlays, results and
 * saving. A rite owns its canvas, its simulation and its sounds.
 *
 * Lifecycle, driven by the shell:
 *   create → (attract mode: scenery animates, no threats) → begin()
 *   → play, calling hooks.hud() as things change → hooks.end(result) once
 *   setPaused() may be called any time; dispose() always ends it.
 * Restarting mounts a fresh canvas and creates the rite again.
 */

/** What the HUD shows. Every field is optional; send only what changed. */
export interface Hud {
  score: number;
  /** Lives left. Leave undefined to hide the candles. */
  lives?: number;
  maxLives?: number;
  /** Seconds left on the clock. Leave undefined to hide the timer. */
  time?: number;
  /** Total seconds, so the timer can draw its bar. */
  totalTime?: number;
  /** A 0..1 gauge: battery, flash charge, candle wax... */
  meter?: number;
  meterLabel?: string;
  /** A short line under the score ("x4 combo", "Sigil 3 of 5"). Empty hides it. */
  banner?: string;
}

export interface RunResult {
  won: boolean;
  score: number;
  /** 0 to 3. A won run has at least 1. */
  stars: number;
  /** Shown on the results card, e.g. { label: 'Ghosts banished', value: '23' }. */
  stats: { label: string; value: string }[];
  /** One line of flavour for the results card. */
  verdict?: string;
}

export interface GameHooks {
  /**
   * Updates the HUD. Call it when values change, not every frame; throttle
   * the clock to about 10 updates a second.
   */
  hud(update: Partial<Hud>): void;
  /**
   * A jump scare: the shell flashes a face over the canvas (unless the
   * player asked for fewer scares), shakes the screen, plays the stinger and
   * rumbles the phone. `strength` 0..1.
   */
  scare(strength?: number): void;
  /** Shakes the screen without the face, for hits and explosions. */
  shake(): void;
  /** The run is over. Call exactly once; keep drawing the scene afterwards if you like. */
  end(result: RunResult): void;
}

export interface GameInstance extends DemoInstance {
  /** The player tapped "Begin": start the clock and the threats. */
  begin(): void;
  /** Freezes the simulation (pause menu, app in the background) and quiets loops. */
  setPaused(paused: boolean): void;
}

export type GameFactory = (hooks: GameHooks) => Demo<GameInstance>;

/** What the intro card says about a rite. Each rite exports one as `guide`. */
export interface RiteGuide {
  /** One or two sentences of flavour, in the voice of an old grimoire. */
  intro: string;
  /** Two to four short imperative lines: how to play. */
  howTo: string[];
}
