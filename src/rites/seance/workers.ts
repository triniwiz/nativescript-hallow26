// The bundler builds a Worker from the `new URL('…', import.meta.url)` it is
// created with, so it is spelled out here rather than passed as a path.
export const createTableWorker = () => new Worker(new URL('./table.worker.ts', import.meta.url));
