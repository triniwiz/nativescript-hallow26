if (typeof globalThis.OffscreenCanvas === 'undefined' && typeof document !== 'undefined') {
  const CanvasSurface = function (width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  Reflect.set(globalThis, 'OffscreenCanvas', CanvasSurface);
}
