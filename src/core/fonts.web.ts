export const CANVAS_FONTS = {
  creep: 'Creepster',
  fell: 'IM FELL English',
} as const;

let loading: Promise<void> | null = null;

export function loadCanvasFonts(): Promise<void> {
  loading ??= Promise.all(
    [
      ['Creepster', new URL('../fonts/Creepster-Regular.ttf', import.meta.url).href],
      ['IM FELL English', new URL('../fonts/IMFellEnglish-Regular.ttf', import.meta.url).href],
    ].map(async ([family, url]) => {
      try {
        const face = new FontFace(family, `url(${url})`);
        await face.load();
        document.fonts.add(face);
      } catch (error) {
        console.warn(`[fonts] ${family}:`, error);
      }
    }),
  ).then(() => {});
  return loading;
}
