// The bundler builds a Worker from the `new URL('…', import.meta.url)` it is
// created with, so each one is spelled out here rather than passed as a path.
export const createWispsWorker = () => new Worker(new URL('./wisps.worker.ts', import.meta.url));
