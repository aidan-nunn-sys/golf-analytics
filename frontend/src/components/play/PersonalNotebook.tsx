import { useCallback, useEffect, useState } from 'react';
import { downloadFile } from '../../download';
import { draftKey, exportNotebook, noteFor, readDraft, readNotebook, resolvePersonalNote, savePersonalNote, storeDraft, syncNotebook, type DeviceNote, type Notebook, type NoteDraft } from '../../offline/notebook';

const message = (e: unknown) => e instanceof Error ? e.message : 'Personal notes could not be saved.';

export function PersonalNotebook({ userId, courseId, hole }: { userId: number; courseId: number; hole: number }) {
  const [book, setBook] = useState<Notebook | null>(null);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    try { setBook(readNotebook(userId, courseId)); setError(''); } catch (e) { setError(message(e)); }
  }, [userId, courseId]);
  const sync = useCallback(async () => {
    setBusy(true);
    try { await syncNotebook(userId, courseId); setSyncError(''); }
    catch (e) { setSyncError(`Personal notes could not sync. Saved notes and drafts stay on this device. ${message(e)}`); }
    finally { setBusy(false); }
  }, [userId, courseId]);
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh); window.addEventListener('golf-notebook-change', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('golf-notebook-change', refresh); };
  }, [refresh]);
  useEffect(() => {
    const attempt = () => { if (navigator.onLine) void sync(); };
    attempt(); const timer = setInterval(attempt, 30000);
    window.addEventListener('online', attempt); window.addEventListener('focus', attempt);
    return () => { clearInterval(timer); window.removeEventListener('online', attempt); window.removeEventListener('focus', attempt); };
  }, [sync]);
  const pending = book ? Object.values(book.notes).filter(n => n.dirty && !n.conflict).map(n => n.changeId).join('|') : '';
  useEffect(() => {
    if (!pending || !navigator.onLine) return;
    const timer = setTimeout(() => void sync(), 1200); return () => clearTimeout(timer);
  }, [pending, sync]);
  return <section className="play-card space-y-4" aria-label="Personal hole notebook">
    <div><p className="play-eyebrow">Your yardage book</p><h2 className="mt-1 text-xl font-semibold">Personal hole notes</h2><p className="mt-2 text-sm text-slate-600">Private strategy for hole {hole}, available on future rounds at this course. Keep today’s pin and green observations in Green.</p></div>
    {error ? <p role="alert" className="error-notice">{error}</p> : book && <NoteEditor key={`${userId}.${courseId}.${hole}`} userId={userId} courseId={courseId} hole={hole} note={noteFor(book, hole)} />}
    {book && !book.fetchedAt && <p className="text-xs text-amber-800">This course’s notes have not been checked with the server on this device. Connect to retrieve notes from other devices.</p>}
    {book?.fetchedAt && <p className="text-xs text-slate-500">Notebook checked: {new Date(book.fetchedAt).toLocaleString()}</p>}
    {syncError && <p role="status" className="text-sm text-amber-800">{syncError}</p>}
    <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy} onClick={() => void sync()}>{busy ? 'Syncing notes…' : 'Sync personal notes'}</button><button className="btn-secondary" onClick={() => { try { downloadFile(`course-${courseId}-personal-notes.json`, exportNotebook(userId, courseId)); } catch (e) { setError(message(e)); } }}>Export personal notes</button></div>
    <p className="text-xs text-slate-500">Personal notes and drafts are exported separately from the round backup.</p>
  </section>;
}

function NoteEditor({ userId, courseId, hole, note }: { userId: number; courseId: number; hole: number; note: DeviceNote }) {
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<'device' | 'server' | null>(null);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    try { setDraft(readDraft(userId, courseId, hole)); } catch (e) { setRecovery(true); setError(message(e)); }
  }, [userId, courseId, hole]);
  const text = draft?.text ?? note.text;
  return <div className="space-y-3">
    <label className="block text-sm font-semibold">Strategy for this hole<textarea className="field mt-2" rows={4} maxLength={2000} disabled={recovery || saving} value={text} onChange={e => {
      const next = { text: e.target.value, changeId: draft?.changeId ?? note.changeId };
      setDraft(next); setError('');
      try { storeDraft(userId, courseId, hole, next); } catch (e) { setError(message(e)); }
    }} /></label>
    <p className="text-xs text-slate-500">{text.length}/2,000 · {draft ? 'Draft on this device. Save to sync.' : note.dirty ? 'Saved on device · waiting to sync' : note.revision ? 'Personal note synced' : 'No personal note saved yet'}</p>
    <button className="btn-primary w-full" disabled={!draft || saving || recovery} onClick={async () => {
      if (!draft) return; setSaving(true); setError('');
      try { await savePersonalNote(userId, courseId, hole, draft); setDraft(null); } catch (e) { setError(message(e)); } finally { setSaving(false); }
    }}>{saving ? 'Saving…' : 'Save personal note'}</button>
    {draft && draft.changeId !== note.changeId && <div className="rounded-xl bg-amber-50 p-3 space-y-3"><p className="text-sm">The saved note changed while you were editing. Saved version:</p><p className="whitespace-pre-wrap text-sm">{note.text || '(empty)'}</p><button className="btn-secondary" onClick={() => { const next = { ...draft, changeId: note.changeId }; try { storeDraft(userId, courseId, hole, next); setDraft(next); setError(''); } catch (e) { setError(message(e)); } }}>Keep my draft for review</button><button className="btn-secondary" onClick={() => { localStorage.removeItem(draftKey(userId, courseId, hole)); setDraft(null); setError(''); }}>Use saved note</button><p className="text-xs">Keeping your draft requires saving it again to replace the reviewed version.</p></div>}
    {note.conflict && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3"><h3 className="font-semibold">Review personal note conflict</h3><p className="text-xs font-semibold">This device</p><p className="whitespace-pre-wrap text-sm">{note.text || '(empty)'}</p><p className="text-xs font-semibold">Other device</p><p className="whitespace-pre-wrap text-sm">{note.conflict.text || '(empty)'}</p><div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={!!draft} onClick={() => setChoice('device')}>Keep device note</button><button className="btn-secondary" disabled={!!draft} onClick={() => setChoice('server')}>Use other device note</button></div>{draft && <p className="text-xs">Save your draft before resolving this conflict.</p>}{choice && <div className="space-y-2"><p className="text-sm">{choice === 'device' ? 'Replace the reviewed server note with this device’s saved note?' : 'Replace this device’s saved note with the reviewed server note?'}</p><button className="btn-primary" onClick={async () => { try { await resolvePersonalNote(userId, courseId, hole, note.changeId, choice); setChoice(null); setError(''); } catch (e) { setError(message(e)); } }}>Confirm note choice</button><button className="btn-secondary ml-2" onClick={() => setChoice(null)}>Cancel</button></div>}</div>}
    {error && <p role="alert" className="error-notice">{error}</p>}
  </div>;
}
