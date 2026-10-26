type NativeOffscreenCanvas = {
  _toHandle?: (canvas: OffscreenCanvas) => number;
  _fromHandle?: (handle: number) => OffscreenCanvas;
};

const canvasGlobals = globalThis as typeof globalThis & {
  OffscreenCanvas?: NativeOffscreenCanvas;
  GPUBufferUsage?: Readonly<Record<string, number>>;
  GPUMapMode?: Readonly<Record<string, number>>;
};

export const OffscreenCanvas = canvasGlobals.OffscreenCanvas ?? {};

export const GPUBufferUsage =
  canvasGlobals.GPUBufferUsage ??
  ({
    MAP_READ: 1,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512,
  } as const);

export const GPUMapMode = canvasGlobals.GPUMapMode ?? { READ: 1, WRITE: 2 };
