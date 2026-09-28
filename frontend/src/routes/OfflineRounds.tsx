import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasPending, listDownloads, removeDownload, storageLock, type DownloadedRound } from '../offline/storage';
import { OfflineLibrary, RestoreDeviceBackup } from '../components/OfflineLibrary';
import { PlayReadiness } from '../components/PlayReadiness';
import { downloadFile } from '../download';

function errorMessage(error:unknown) { return error instanceof Error ? error.message : 'Could not save this scorecard.'; }
function useDeviceRounds(userId:number) {
  const [entries,setEntries]=useState<DownloadedRound[]>([]); const [error,setError]=useState('');
  const refresh=useCallback(()=>{try{setEntries(listDownloads(userId));setError('');}catch(e){setError(errorMessage(e));}},[userId]);
  useEffect(()=>{refresh();window.addEventListener('storage',refresh);window.addEventListener('golf-offline-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('golf-offline-change',refresh);};},[refresh]);
  return {entries,error,refresh};
}
export function OfflineRounds() {
  const {user}=useAuth();const {entries,error}=useDeviceRounds(user!.id);const [actionError,setActionError]=useState('');
  const [ready,setReady]=useState(()=>'serviceWorker' in navigator && !!navigator.serviceWorker.controller);
  useEffect(()=>{if(!('serviceWorker' in navigator))return;const update=()=>setReady(!!navigator.serviceWorker.controller);navigator.serviceWorker.addEventListener('controllerchange',update);return()=>navigator.serviceWorker.removeEventListener('controllerchange',update);},[]);
  return <div className="space-y-6"><header><p className="eyebrow">Ready for the course</p><h1 className="mt-2 text-3xl">Offline rounds</h1><p className="mt-2 text-slate-500">Your downloaded scorecards, saved on this device. Open a round to score and sync.</p></header>
    <div className="panel space-y-3"><h2 className="text-xl">Before you leave</h2><p className="text-sm text-slate-600">Download a course and your preferred tees while connected. Then start and score rounds here even when your server is unreachable. You can also download an existing round from its live scorecard.</p><p className="text-sm text-slate-600">{ready ? 'The app shell is available offline on this device.' : import.meta.env.DEV ? 'Offline reload needs the production build. This development preview can save scores locally while it stays open.' : 'The app shell is not ready for offline reload yet. Stay connected until this message changes; use HTTPS and allow browser storage.'}</p><Link className="btn-primary" to="/courses">Choose a course</Link><Link className="btn-secondary ml-2" to="/rounds">Your rounds</Link></div>
    <PlayReadiness userId={user!.id}/>
    <OfflineLibrary userId={user!.id}/>
    {(error||actionError)&&<p role="alert" className="error-notice">{error||actionError}</p>}
    {!entries.length&&!error&&<p className="panel py-10 text-center text-slate-500">No downloaded rounds yet.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{entries.map(entry=><article className="panel space-y-4" key={entry.round.id}><Link className="block" to={`/offline/${entry.round.id}`}><div className="flex items-start justify-between gap-3"><h2 className="text-xl">{entry.round.course_name || entry.course.name}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${hasPending(entry)?'bg-amber-100 text-amber-900':'bg-emerald-50 text-emerald-800'}`}>{hasPending(entry)?'Waiting to sync':'Synced'}</span></div><p className="mt-2 text-sm text-slate-500">{entry.round.date} · {entry.round.hole_count} holes · {entry.round.status.replace('_',' ')}</p><p className="mt-3 text-sm font-semibold text-emerald-800">Open scorecard →</p></Link><div className="flex flex-wrap gap-3"><button className="text-sm underline" onClick={()=>downloadFile(`round-${entry.round.id}-device-backup.json`,JSON.stringify(entry,null,2))}>Export device backup</button>{!hasPending(entry)&&<button className="text-sm text-slate-500 underline" onClick={async()=>{try{await storageLock(user!.id,entry.round.id,()=>removeDownload(user!.id,entry.round.id));}catch(e){setActionError(errorMessage(e));}}}>Remove download</button>}</div></article>)}</div>
    <RestoreDeviceBackup userId={user!.id}/>
    <p className="text-xs leading-relaxed text-slate-500">Downloads are specific to this device and account. Do not clear browser storage while scores are waiting to sync. Export a device backup if you need a separate copy. GPS distances and saved shot measurements work on the Play screen. Map imagery requires a connection.</p>
  </div>;
}
