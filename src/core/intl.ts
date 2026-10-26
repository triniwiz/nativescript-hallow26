import { Segmenter } from '@formatjs/intl-segmenter';

/**
 * On Windows, the runtime's V8 crashes the app (an access violation, not an
 * exception) as soon as an `Intl.Segmenter` iterates a string. PixiJS segments
 * every string it measures, so the first Text took the Pumpkin Patch down.
 * The FormatJS implementation replaces it there; iOS and Android keep theirs.
 */
if (__WINDOWS__) {
  Object.defineProperty(Intl, 'Segmenter', { value: Segmenter, configurable: true, writable: true });
}
