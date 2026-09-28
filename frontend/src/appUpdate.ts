import { notebookPrefix, draftPrefix, validNotebook } from './offline/notebook';
import { useSyncExternalStore } from 'react';
export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'development';
type UpdateState = { available: boolean; busy: boolean; message: string };
let state: UpdateState = { available: false, busy: false, message: '' };
let registration: ServiceWorkerRegistration | undefined;
let requested = false;
const subscribers = new Set<() => void>();
function publish(next: Partial<UpdateState>) { state = { ...state, ...next }; subscribers.forEach(fn => fn()); }
export function useAppUpdate() {
  return useSyncExternalStore(fn => { subscribers.add(fn); return () => { subscribers.delete(fn); }; }, () => state);
}
export function updateBlockReason(storage: Storage, pathname: string) {
  if (pathname !== '/updates') return 'Open App updates before installing.';
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)!;
      if (key.startsWith('golf.green-draft.')) return 'Save your green-note drafts before updating.';
      if (key.startsWith(draftPrefix)) return 'Save and sync personal note drafts before updating.';
      if (key.startsWith(notebookPrefix)) {
        const book = JSON.parse(storage.getItem(key)!);
        if (!validNotebook(book)) return 'Personal notes need recovery before updating.';
        if (Object.values(book.notes).some(n => n.dirty || n.conflict)) return 'Sync personal notes and resolve note conflicts before updating.';
      }
      if (!key.startsWith('golf.offline.v1.')) continue;
      const entry = JSON.parse(storage.getItem(key)!);
      if (entry.version !== 1 || !entry.round || !Array.isArray(entry.round.holes)) return 'A saved round needs recovery before updating.';
      if (entry.dirty || entry.shotStart || entry.shots?.some((s: { synced: boolean }) => !s.synced)) return 'Sync pending scores and shots, and finish or cancel active shot measurements before updating.';
    }
  } catch { return 'Device storage could not be checked. Recover your saved rounds before updating.'; }
  return '';
}
export async function checkForUpdate() {
  if (!registration) { publish({ message: 'Updates are available in the installed production app.' }); return; }
  publish({ busy: true, message: '' });
  try { await registration.update(); publish({ available: !!registration.waiting, message: registration.waiting ? 'An update is ready.' : 'Check complete. A new build may still be downloading.' }); }
  catch { publish({ message: 'Could not check for updates. Your current app remains available.' }); }
  finally { publish({ busy: false }); }
}
export function installUpdate() {
  const reason = updateBlockReason(localStorage, location.pathname);
  if (reason) { publish({ message: reason }); return; }
  if (!registration?.waiting) { publish({ message: 'No update is ready yet.' }); return; }
  requested = true;
  publish({ busy: true, message: 'Checking open app tabs…' });
  registration.waiting.postMessage({ type: 'INSTALL_UPDATE', pathname: location.pathname });
}
export async function registerAppWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'UPDATE_BLOCKED') {
      requested = false;
      publish({ busy: false, message: 'Close other Golf tabs or app windows, leave Play, and try again.' });
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!requested) return; // Never reload another tab or the first installation.
    requested = false;
    if (!updateBlockReason(localStorage, location.pathname)) location.reload();
    else publish({ busy: false, message: 'Update installed. Reopen the app after saving your current work.' });
  });
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    const inspect = () => publish({ available: !!registration?.waiting });
    inspect();
    registration.addEventListener('updatefound', () => {
      registration?.installing?.addEventListener('statechange', inspect);
    });
    // Explicit checks surface updates even when an old offline shell served navigation.
    void registration.update().catch(() => {});
  } catch { window.dispatchEvent(new Event('golf-offline-unavailable')); }
}
