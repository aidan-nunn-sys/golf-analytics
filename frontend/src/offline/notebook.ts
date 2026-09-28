import { ApiError, apiGet, apiSend, getToken } from '../api/client';

export interface PersonalNote { hole_number: number; text: string; revision: number; updated_at: string; }
export interface DeviceNote extends PersonalNote { dirty: boolean; changeId: string; conflict?: PersonalNote; }
export interface Notebook { version: 1; userId: number; courseId: number; fetchedAt: string; notes: Record<number, DeviceNote>; }
export interface NoteDraft { text: string; changeId: string; }
export const notebookPrefix = 'golf.notebook.v1.';
export const draftPrefix = 'golf.personal-draft.';
const key = (userId: number, courseId: number) => `${notebookPrefix}${userId}.${courseId}`;
export const draftKey = (userId: number, courseId: number, hole: number) => `${draftPrefix}${userId}.${courseId}.${hole}`;
const empty = (hole: number): DeviceNote => ({ hole_number: hole, text: '', revision: 0, updated_at: '', dirty: false, changeId: '' });

export function validNotebook(value: unknown): value is Notebook {
  if (!value || typeof value !== 'object') return false;
  const b = value as Notebook;
  return b.version === 1 && Number.isSafeInteger(b.userId) && Number.isSafeInteger(b.courseId) && typeof b.fetchedAt === 'string'
    && !!b.notes && typeof b.notes === 'object' && !Array.isArray(b.notes)
    && Object.entries(b.notes).every(([hole, n]) => Number(hole) === n?.hole_number && n.hole_number >= 1 && n.hole_number <= 18
      && typeof n.text === 'string' && n.text.length <= 2000 && Number.isSafeInteger(n.revision) && n.revision >= 0
      && typeof n.updated_at === 'string' && typeof n.dirty === 'boolean' && typeof n.changeId === 'string');
}
export function readNotebook(userId: number, courseId: number): Notebook {
  const raw = localStorage.getItem(key(userId, courseId));
  if (!raw) return { version: 1, userId, courseId, fetchedAt: '', notes: {} };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Personal notes need recovery. Export the notebook before clearing device storage.'); }
  if (!validNotebook(value) || value.userId !== userId || value.courseId !== courseId) throw new Error('Personal notes have an unsupported format. Export them before clearing device storage.');
  return value;
}
export function noteFor(book: Notebook, hole: number): DeviceNote { return book.notes[hole] ?? empty(hole); }
function write(book: Notebook) {
  try { localStorage.setItem(key(book.userId, book.courseId), JSON.stringify(book)); }
  catch { throw new Error('Could not save personal notes on this device. Keep your draft open and free storage before retrying.'); }
  window.dispatchEvent(new Event('golf-notebook-change'));
}
async function locked<T>(userId: number, courseId: number, action: () => T | Promise<T>, scope = 'edit'): Promise<T> {
  return navigator.locks ? navigator.locks.request(`${key(userId, courseId)}.${scope}`, action) : action();
}
export function readDraft(userId: number, courseId: number, hole: number): NoteDraft | null {
  const raw = localStorage.getItem(draftKey(userId, courseId, hole));
  if (!raw) return null;
  try { const draft = JSON.parse(raw); if (typeof draft.text === 'string' && draft.text.length <= 2000 && typeof draft.changeId === 'string') return draft; } catch { /* Show recovery instead of silently discarding. */ }
  throw new Error('This personal note draft needs recovery. Export it before clearing device storage.');
}
export function storeDraft(userId: number, courseId: number, hole: number, draft: NoteDraft) {
  try { localStorage.setItem(draftKey(userId, courseId, hole), JSON.stringify(draft)); }
  catch { throw new Error('Draft could not be saved on this device. Keep this screen open and free storage before leaving.'); }
}
export function savePersonalNote(userId: number, courseId: number, hole: number, draft: NoteDraft) {
  return locked(userId, courseId, () => {
    const book = readNotebook(userId, courseId), current = noteFor(book, hole);
    if (current.changeId !== draft.changeId) throw new Error('This note changed while you were editing. Review the saved note before replacing it.');
    if (draft.text.length > 2000) throw new Error('Personal notes can contain at most 2,000 characters.');
    book.notes[hole] = { ...current, text: draft.text, dirty: true, changeId: crypto.randomUUID() };
    write(book);
    const savedDraft = readDraft(userId, courseId, hole);
    if (savedDraft?.text === draft.text && savedDraft.changeId === draft.changeId) localStorage.removeItem(draftKey(userId, courseId, hole));
  });
}
export function resolvePersonalNote(userId: number, courseId: number, hole: number, expectedId: string, choice: 'device' | 'server') {
  return locked(userId, courseId, () => {
    const book = readNotebook(userId, courseId), current = noteFor(book, hole);
    if (current.changeId !== expectedId || !current.conflict) throw new Error('The note changed again. Review the latest versions.');
    book.notes[hole] = choice === 'server'
      ? { ...current.conflict, dirty: false, changeId: crypto.randomUUID() }
      : { ...current, revision: current.conflict.revision, conflict: undefined, changeId: crypto.randomUUID() };
    write(book);
  });
}
function merge(book: Notebook, remote: PersonalNote[]) {
  const server = new Map(remote.map(n => [n.hole_number, n]));
  for (const hole of new Set([...Object.keys(book.notes).map(Number), ...server.keys()])) {
    const local = noteFor(book, hole), latest = server.get(hole) ?? empty(hole);
    if (!local.dirty || local.text === latest.text) {
      book.notes[hole] = { ...latest, dirty: false, changeId: local.text === latest.text ? local.changeId : crypto.randomUUID() };
    } else if (local.revision !== latest.revision) {
      book.notes[hole] = { ...local, conflict: latest };
    }
  }
  book.fetchedAt = new Date().toISOString();
}
const requests = new Map<string, Promise<void>>();
export function syncNotebook(userId: number, courseId: number): Promise<void> {
  const id = key(userId, courseId), existing = requests.get(id);
  if (existing) return existing;
  const token = getToken();
  const checkAccount = () => { if (!token || token !== getToken()) throw new Error('The signed-in account changed. Reopen your personal notebook.'); };
  const request = locked(userId, courseId, async () => {
    checkAccount();
    const refresh = async () => {
      const remote = await apiGet<PersonalNote[]>(`/courses/${courseId}/personal-notes`, AbortSignal.timeout(12000));
      checkAccount();
      await locked(userId, courseId, () => { checkAccount(); const book = readNotebook(userId, courseId); merge(book, remote); write(book); });
    };
    await refresh();
    for (const note of Object.values(readNotebook(userId, courseId).notes)) {
      if (!note.dirty || note.conflict) continue;
      try {
        checkAccount();
        const result = await apiSend<PersonalNote>('PUT', `/courses/${courseId}/personal-notes/${note.hole_number}`, { text: note.text, expected_revision: note.revision }, AbortSignal.timeout(12000));
        checkAccount();
        await locked(userId, courseId, () => {
          checkAccount();
          const book = readNotebook(userId, courseId), current = noteFor(book, note.hole_number);
          // A save made while the request was in flight must remain pending.
          book.notes[note.hole_number] = current.changeId === note.changeId
            ? { ...result, dirty: false, changeId: current.changeId }
            : { ...current, revision: result.revision, updated_at: result.updated_at };
          write(book);
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) await refresh();
        else throw error;
      }
    }
  }, 'sync').finally(() => { requests.delete(id); });
  requests.set(id, request);
  return request;
}
export function exportNotebook(userId: number, courseId: number) {
  const drafts: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(`${draftPrefix}${userId}.${courseId}.`)) drafts[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ version: 1, userId, courseId, notebook: localStorage.getItem(key(userId, courseId)), drafts }, null, 2);
}
