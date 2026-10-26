import { sfx, type Loop } from '../core/audio';

/**
 * The lullaby and wind behind the title and the map. Both screens start it
 * (it keeps playing between them); a rite stops it while it's played.
 */
let loops: Loop[] = [];

export function startMenuMusic() {
  if (loops.length) {
    return;
  }
  loops = [sfx.music('lullaby', 0.6), sfx.wind(0.25, 'light')];
}

export function stopMenuMusic() {
  loops.forEach((loop) => loop.stop(1.2));
  loops = [];
}
