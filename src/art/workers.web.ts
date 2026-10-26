export const createWispsWorker = () =>
  new Worker(new URL('./wisps.worker.ts', import.meta.url), { type: 'module' });
