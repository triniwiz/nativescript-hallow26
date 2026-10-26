export const createTableWorker = () =>
  new Worker(new URL('./table.worker.ts', import.meta.url), { type: 'module' });
