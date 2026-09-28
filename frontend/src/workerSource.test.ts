/// <reference types="node" />
// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { workerSource } from '../workerSource';

function worker(urls: string[]) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const skipWaiting = vi.fn(); const postMessage = vi.fn();
  const clients = urls.map((url, i) => ({ id: String(i), url }));
  runInNewContext(workerSource('test', ['/index.html']), {
    URL, self: { addEventListener: (name: string, fn: (event: unknown) => void) => { handlers[name] = fn; },
      clients: { matchAll: async () => clients }, skipWaiting },
  });
  return { skipWaiting, postMessage, async install(pathname = '/updates') {
    let work: Promise<void> | undefined;
    handlers.message({ data: { type: 'INSTALL_UPDATE', pathname }, source: { id: '0', postMessage }, waitUntil: (p: Promise<void>) => { work = p; } });
    await work;
  } };
}
it('never skips waiting during install, and only activates for one update-screen client', async () => {
  const w = worker(['https://golf.test/login']); // Original document URL; SPA is on /updates.
  expect(w.skipWaiting).not.toHaveBeenCalled();
  await w.install(); expect(w.skipWaiting).toHaveBeenCalledOnce();
});
it('vetoes active play, another tab and missing requesters', async () => {
  for (const urls of [['https://golf.test/updates', 'https://golf.test/offline/2'], []]) {
    const w = worker(urls); await w.install();
    expect(w.skipWaiting).not.toHaveBeenCalled();
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'UPDATE_BLOCKED' });
  }
  const playing = worker(['https://golf.test/rounds/5']);
  await playing.install('/rounds/5');
  expect(playing.skipWaiting).not.toHaveBeenCalled();
});
