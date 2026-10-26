import { FontFace, FontFaceSet } from '@nativescript/canvas';
import { knownFolders, path } from '@nativescript/core';

/**
 * Views find the fonts in src/fonts by themselves (see `font-creep` in
 * app.css). Canvas text goes through Skia, which only knows the fonts
 * registered with the CSS Font Loading API, so register them there too:
 * after this resolves, `ctx.font = '48px Creepster'` works.
 */
export const CANVAS_FONTS = {
  creep: 'Creepster',
  fell: 'IM FELL English',
} as const;

let loading: Promise<void> | null = null;

export function loadCanvasFonts(): Promise<void> {
  loading ??= Promise.all(
    [
      ['Creepster', 'Creepster-Regular.ttf'],
      ['IM FELL English', 'IMFellEnglish-Regular.ttf'],
    ].map(async ([family, file]) => {
      try {
        const face = new FontFace(family, `url(~/fonts/${file})`);
        await face.load();
        FontFaceSet.instance.add(face);
        // The canvas registers fonts from a FontFaceSet "loading done" listener,
        // which doesn't fire for a face loaded and then added. Register it with
        // the canvas directly (what that listener does) so ctx.font finds it.
        (globalThis as any).CanvasModule?.__addFontFamily?.(family, [path.join(knownFolders.currentApp().path, 'fonts', file)]);
      } catch (error) {
        // Canvas text falls back to the default font.
        console.warn(`[fonts] ${family}:`, error);
      }
    }),
  ).then(() => {});
  return loading;
}
