// Single-file (offline download) build: no service worker.
export function registerSW(_opts?: unknown) { return async (_reload?: boolean) => {}; }
