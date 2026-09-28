import { resumeChoices } from '../offline/resume';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import type { Round } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { listDownloads, type DownloadedRound } from '../offline/storage';

export function ResumeRounds() {
  const { user } = useAuth();
  const [local, setLocal] = useState<DownloadedRound[]>([]);
  const [server, setServer] = useState<Round[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setServer([]);
    const read = () => { try { setLocal(listDownloads(user.id)); setError(''); } catch { setError('A saved round needs attention. Open Offline rounds to recover it.'); } };
    read();
    apiGet<Round[]>('/rounds', AbortSignal.timeout(12000)).then(r => { if (active) setServer(r); }).catch(() => {});
    window.addEventListener('storage', read); window.addEventListener('golf-offline-change', read);
    return () => { active = false; window.removeEventListener('storage', read); window.removeEventListener('golf-offline-change', read); };
  }, [user?.id]);
  const choices = resumeChoices(local, server);
  if (!choices.length && !error) return null;
  return <section className="panel mb-6 space-y-3" aria-label="Resume your round"><h2 className="text-xl font-semibold">Pick up your round</h2>
    {error && <p role="status">{error}</p>}
    {choices.slice(0, 3).map(c => <Link key={c.key} to={c.path} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900"><span><strong>{c.name}</strong><span className="block text-xs">{c.date} · Hole {c.hole}{c.pending ? ' · Changes saved on this device' : ''}</span></span><strong>Resume →</strong></Link>)}
    <Link className="text-sm underline" to="/offline">All saved rounds and recovery</Link>
  </section>;
}
