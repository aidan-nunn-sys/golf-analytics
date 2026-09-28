import { refreshShotHistory } from '../offline/shotHistory';
import { lazy,Suspense,useCallback,useEffect,useRef,useState } from 'react';
import { Link,useParams,useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiGet,getToken } from '../api/client';
import type { Course,Round,RoundHole } from '../api/types';
import { editDownload,listDownloads,makeDownload,readDownload,rememberUser,storageLock,updateDevice,type DownloadedRound } from '../offline/storage';
import { syncDownload,SyncConflict,acceptServerCopy } from '../offline/sync';
import { downloadProfile } from '../offline/bagProfile';
import { downloadClubs } from '../offline/clubs';
import { downloadFile } from '../download';
import { DistancePanel } from '../components/play/DistancePanel';
import { QuickScore } from '../components/play/QuickScore';
import { GreenNotebook } from '../components/play/GreenNotebook';
import { ShotTracker } from '../components/play/ShotTracker';
import { PlayAdvice } from '../components/play/PlayAdvice';
import { PersonalNotebook } from '../components/play/PersonalNotebook';
import { usePosition } from '../components/play/usePosition';
const RoundMap=lazy(()=>import('../components/RoundMap').then(m=>({default:m.RoundMap})));
import { yardsToDisplay,unitLabel } from '../units';

const message=(e:unknown)=>e instanceof Error?e.message:'Could not save your change.';
const pending=(e:DownloadedRound)=>e.dirty||!!e.shots?.some(s=>!s.synced);
export function OnCourseRound() {
  const requestedId=Number(useParams().id);const {user}=useAuth();const userId=user!.id;const unit=user?.unit_preference??'yards';const qc=useQueryClient();const userRef=useRef(user);userRef.current=user;
  const [entry,setEntry]=useState<DownloadedRound|null>(null);const [loadError,setLoadError]=useState('');const [retry,setRetry]=useState(0);
  const [search]=useSearchParams();
  const [tab,setTab]=useState<'score'|'plan'|'green'|'shots'>(()=>search.get('view')==='shots'?'shots':'score');const [actionError,setActionError]=useState('');const [syncError,setSyncError]=useState('');const [syncing,setSyncing]=useState(false);const inFlight=useRef(false);
  const [conflict,setConflict]=useState<{server:Round;changeId:string}|null>(null);const [choice,setChoice]=useState<'device'|'server'|null>(null);const [finish,setFinish]=useState(false);const [showCard,setShowCard]=useState(false);const [showMap,setShowMap]=useState(false);
  const [undo,setUndo]=useState<{hole:RoundHole;changeId:string}|null>(null);const gps=usePosition();
  const refresh=useCallback(()=>{try{const found=listDownloads(userId).find(e=>e.round.id===requestedId||e.serverId===requestedId);setEntry(found??null);}catch(e){setLoadError(message(e));}},[userId,requestedId]);
  useEffect(()=>{refresh();window.addEventListener('storage',refresh);window.addEventListener('golf-offline-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('golf-offline-change',refresh);};},[refresh]);
  useEffect(()=>{
    let stopped=false;const token=getToken();setLoadError('');
    async function prepare() {
      try {
        const existing=listDownloads(userId).find(e=>e.round.id===requestedId||e.serverId===requestedId);
        if(existing){setEntry(existing);return;}
        if(requestedId<1)throw new Error('This round is not saved on this device. Restore its device backup to continue.');
        const r=await apiGet<Round>(`/rounds/${requestedId}`,AbortSignal.timeout(12000));
        const course=await apiGet<Course>(`/courses/${r.course_id}`,AbortSignal.timeout(12000));
        if(stopped)return;if(getToken()!==token)throw new Error('Your account changed. Reopen this round.');
        await storageLock(userId,r.id,()=>{if(!readDownload(userId,r.id))makeDownload(userId,r,course);});
        if(token)rememberUser(userRef.current!,token);void navigator.storage?.persist?.().catch(()=>{});refresh();
      }catch(e){if(!stopped)setLoadError(message(e));}
    }
    void prepare();if(navigator.onLine){void downloadClubs(userId).catch(()=>{});void downloadProfile(userId).catch(()=>{});}
    return()=>{stopped=true;};
  },[userId,requestedId,retry,refresh]); // A route is prepared once; device data wins over background fetches.
  async function sync(revision?:number,changeId?:string) {
    if(!entry||inFlight.current||(!navigator.onLine&&revision===undefined)||(!revision&&conflict))return;
    inFlight.current=true;setSyncing(true);
    try {
      await syncDownload(userId,entry.round.id,revision,changeId);await refreshShotHistory(userId,entry.round.id);setSyncError('');setConflict(null);setChoice(null);
      for(const key of ['round','rounds','roundStats','handicap','roundTrends','dashboard','gapping','clubStats'])void qc.invalidateQueries({queryKey:[key]});
    }catch(e){if(e instanceof SyncConflict){const latest=readDownload(userId,entry.round.id);if(latest)setConflict({server:e.server,changeId:latest.changeId});}else setSyncError(message(e));}
    finally{inFlight.current=false;setSyncing(false);}
  }
  const syncRef=useRef(sync);syncRef.current=sync;
  useEffect(()=>{const attempt=()=>void syncRef.current();const timer=setInterval(attempt,30000);window.addEventListener('online',attempt);window.addEventListener('focus',attempt);return()=>{clearInterval(timer);window.removeEventListener('online',attempt);window.removeEventListener('focus',attempt);};},[]);
  // Debounce changes without tying local saving to the network request.
  const needsSync=entry?pending(entry):false;const changeId=entry?.changeId;const shots=entry?.shots;
  useEffect(()=>{if(!needsSync||conflict)return;const t=setTimeout(()=>void syncRef.current(),1200);return()=>clearTimeout(t);},[changeId,shots,needsSync,conflict]);
  // Refresh a clean card when opened, without ever replacing a local edit.
  const localId=entry?.round.id;
  useEffect(()=>{if(localId!=null)void refreshShotHistory(userId,localId).catch(e=>setSyncError(message(e)));},[userId,localId]);
  useEffect(()=>{if(localId===undefined)return;const current=readDownload(userId,localId);if(!current||current.dirty||localId<0&&!current.serverId)return;const expected=current.changeId;void apiGet<Round>(`/rounds/${current.serverId??localId}`,AbortSignal.timeout(12000)).then(server=>updateDevice(userId,localId,latest=>latest.dirty||latest.changeId!==expected?latest:{...latest,round:{...server,id:localId},baseRevision:server.revision??1,changeId:server.revision===latest.baseRevision?latest.changeId:crypto.randomUUID()})).catch(()=>{});},[userId,localId]);
  const hole=entry?.round.holes.find(h=>h.hole_number===entry.round.current_hole)??entry?.round.holes[0];
  async function change(transform:(r:Round)=>Round) {
    if(!entry)throw new Error('Scorecard not ready.');
    const updated=await storageLock(userId,entry.round.id,()=>editDownload(userId,entry.round.id,entry.changeId,transform));setActionError('');return updated;
  }
  async function score(values:Partial<RoundHole>) {
    if(!hole)return;
    const next={...hole,...values};
    if((next.strokes!==null&&(!Number.isSafeInteger(next.strokes)||next.strokes<1))||(next.putts!==null&&(!Number.isSafeInteger(next.putts)||next.putts<0))||!Number.isSafeInteger(next.penalties)||next.penalties<0||(next.strokes!==null&&(next.putts??0)+next.penalties>next.strokes)){setActionError('Use whole numbers. Putts and penalties cannot exceed strokes.');return;}
    try{const updated=await change(r=>({...r,holes:r.holes.map(h=>h.hole_number===hole.hole_number?next:h)}));setUndo({hole,changeId:updated.changeId});}catch(e){setActionError(message(e));}
  }
  async function go(number:number) {
    if(entry?.shotStart){setActionError('Save or cancel your shot measurement before changing holes.');return;}
    try{await change(r=>({...r,current_hole:number}));setActionError('');setShowCard(false);setUndo(null);setFinish(false);}catch(e){setActionError(message(e));}
  }
  if(!entry||!hole)return <div className="panel space-y-4"><p className="eyebrow">Getting you ready</p><h1 className="text-2xl">Your on-course scorecard</h1>{loadError?<><p className="error-notice" role="alert">{loadError}</p><button className="btn-primary" onClick={()=>setRetry(n=>n+1)}>Try again</button><Link className="btn-secondary ml-2" to="/offline">Saved rounds</Link></>:<p role="status">Saving this round and course to your device…</p>}</div>;
  const round=entry.round;const idx=round.holes.findIndex(h=>h.hole_number===hole.hole_number);const scored=round.holes.filter(h=>h.strokes!==null);const total=scored.reduce((n,h)=>n+h.strokes!,0);const relative=total-scored.reduce((n,h)=>n+h.par,0);const serverId=entry.serverId??(round.id>0?round.id:null);const courseHole=entry.course.holes.find(h=>h.number===hole.hole_number);const yardage=round.hole_yardages?.[hole.hole_number];
  return <div className={`play-shell ${tab==='score'?'play-scoring':''}`}><div className="flex flex-wrap items-center justify-between gap-2"><Link to="/offline" className="text-sm font-semibold text-emerald-800">← Your rounds</Link><button className="text-xs font-semibold text-slate-500 underline" onClick={()=>downloadFile(`round-${round.id}-device-backup.json`,JSON.stringify(entry,null,2))}>Export backup</button></div>
    <header className="play-heading"><div className="min-w-0"><p className="play-eyebrow truncate">{round.course_name||entry.course.name}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Hole {hole.hole_number}<span className="ml-3 text-lg font-normal text-slate-500">Par {hole.par}</span></h1><p className="mt-2 text-sm text-slate-500">{round.tee_name||'Score only'}{yardage?` · ${Math.round(yardsToDisplay(yardage,unit))} ${unitLabel(unit)}`:''} · {idx+1} of {round.hole_count}</p></div><button className="play-total" aria-label="Open scorecard" onClick={()=>setShowCard(!showCard)}><span className="text-3xl font-semibold">{scored.length?total:'—'}</span><span className="text-xs">{scored.length?relative===0?'Even par':`${relative>0?'+':''}${relative} to par`:'Scorecard'}</span></button></header>
    <div className="play-sync" role="status"><span className={`h-2 w-2 shrink-0 rounded-full ${pending(entry)?'bg-amber-500':'bg-emerald-600'}`}/><span className="flex-1">{syncing?'Saved on device · syncing':pending(entry)?'Saved on device · waiting to sync':'Saved on device · synced'}</span><button className="font-semibold underline" disabled={syncing||!!conflict} onClick={()=>void sync()}>{syncing?'Syncing':'Sync now'}</button></div>
    {syncError&&<details className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><summary>Server unavailable or sync needs attention. Your saved changes stay here.</summary><p className="mt-2">{syncError}</p></details>}
    {round.status!=='in_progress'&&<div className="notice flex flex-wrap items-center justify-between gap-3"><p>Round {round.status}. You can still correct your scores.</p><button className="font-semibold underline" onClick={()=>void change(r=>({...r,status:'in_progress'})).catch(e=>setActionError(message(e)))}>Reopen round</button>{serverId&&!entry.dirty&&<Link className="font-semibold underline" to={`/rounds/${serverId}/summary`}>Round review →</Link>}</div>}
    {showCard&&<section className="play-card space-y-3"><h2 className="text-lg font-semibold">Your scorecard</h2><div className="grid grid-cols-6 gap-2 sm:grid-cols-9">{round.holes.map(h=><button key={h.hole_number} className={`play-hole ${h.hole_number===hole.hole_number?'play-selected':''}`} aria-label={`Go to hole ${h.hole_number}`} aria-current={h.hole_number===hole.hole_number?'step':undefined} onClick={()=>void go(h.hole_number)}><span className="text-xs">{h.hole_number}</span><strong>{h.strokes??'—'}</strong></button>)}</div><p className="text-xs text-slate-500">{scored.length} of {round.hole_count} holes scored</p></section>}
    {conflict&&<section className="play-card space-y-4"><h2 className="text-xl font-semibold">Review a sync conflict</h2><p className="text-sm text-slate-600">Another device changed this round. Review both versions before choosing which complete scorecard to keep. Export a backup above to keep a separate copy.</p><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Hole</th><th>Device: strokes / putts / penalties / fairway</th><th>Server</th></tr></thead><tbody>{round.holes.map(h=>{const s=conflict.server.holes.find(x=>x.hole_number===h.hole_number);const text=(x:RoundHole)=>`${x.strokes??'—'} / ${x.putts??'—'} / ${x.penalties} / ${x.fairway_hit===null?'—':x.fairway_hit?'hit':'miss'}`;return <tr key={h.hole_number} className="border-t"><th className="p-2">{h.hole_number}</th><td>{text(h)}</td><td>{s?text(s):'Missing'}</td></tr>;})}{(['date','status','current_hole','notes','green_notes'] as const).map(k=><tr key={k} className="border-t align-top"><th className="p-2">{k.replace('_',' ')}</th><td className="max-w-48 whitespace-pre-wrap break-words p-2">{k==='green_notes'?JSON.stringify(round[k]??{}):String(round[k])}</td><td className="max-w-48 whitespace-pre-wrap break-words p-2">{k==='green_notes'?JSON.stringify(conflict.server[k]??{}):String(conflict.server[k])}</td></tr>)}</tbody></table></div><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>setChoice('device')}>Keep device scorecard</button><button className="btn-secondary" onClick={()=>setChoice('server')}>Keep server scorecard</button></div>{choice&&<div className="notice space-y-3"><p>{choice==='device'?'Replace the server scorecard with this saved device version?':'Replace device scores and green notes with the server version shown above? Saved GPS shots stay on this device.'}</p><button className="btn-primary" disabled={syncing} onClick={async()=>{if(choice==='device')await sync(conflict.server.revision,conflict.changeId);else try{await acceptServerCopy(userId,round.id,conflict.changeId,conflict.server);setConflict(null);setChoice(null);}catch(e){setActionError(message(e));}}}>Confirm choice</button><button className="btn-secondary ml-2" onClick={()=>setChoice(null)}>Cancel</button></div>}</section>}
    <div className="play-content"><div className="space-y-4"><DistancePanel hole={courseHole} gps={gps} unit={unit} compact={tab==='score'||tab==='plan'}/><div className="flex items-center justify-between gap-2"><button className="play-choice flex-1" disabled={idx===0} onClick={()=>void go(round.holes[idx-1].hole_number)}>← Previous</button><button className="play-choice flex-1" onClick={()=>setShowCard(!showCard)}>All holes</button><button className="play-choice flex-1" disabled={idx===round.holes.length-1} onClick={()=>void go(round.holes[idx+1].hole_number)}>Next →</button></div><p className="px-1 text-xs leading-relaxed text-slate-500">Center GPS and scoring work from your saved course. Front/back edges and today’s pin are not mapped.</p></div><div className="space-y-4"><div className="play-tabs" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))'}} role="tablist" aria-label="On-course tools">{(['score','plan','green','shots'] as const).map(t=><button role="tab" key={t} id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={tab===t} className={tab===t?'active':''} onClick={()=>{setTab(t);setActionError('');}}>{t==='score'?'Score':t==='plan'?'Plan':t==='green'?'Green':'Shots'}</button>)}</div><div hidden={tab!=='plan'} role="tabpanel" id="panel-plan" aria-labelledby="tab-plan" className="space-y-4"><PlayAdvice key={`${userId}.${round.course_id}.${hole.hole_number}`} userId={userId} hole={courseHole} gps={gps} unit={unit}/><PersonalNotebook key={`${userId}.${round.course_id}`} userId={userId} courseId={round.course_id} hole={hole.hole_number}/></div><div hidden={tab==='plan'} role="tabpanel" id={tab==='plan'?undefined:`panel-${tab}`} aria-labelledby={tab==='plan'?undefined:`tab-${tab}`}>
      {tab==='score'&&<><QuickScore hole={hole} onChange={v=>void score(v)} error={actionError} next={<button className="play-next" disabled={!!entry.shotStart} onClick={()=>idx<round.holes.length-1?void go(round.holes[idx+1].hole_number):setFinish(true)}>{idx<round.holes.length-1?'Next hole →':'Finish round'}</button>}/>{undo&&<button className="mt-3 text-sm font-semibold text-emerald-800 underline" onClick={async()=>{try{await storageLock(userId,round.id,()=>editDownload(userId,round.id,undo.changeId,r=>({...r,holes:r.holes.map(h=>h.hole_number===undo.hole.hole_number?undo.hole:h)})));setUndo(null);setActionError('');}catch(e){setActionError(message(e));}}}>Undo last score change</button>}</>}
      {tab==='green'&&<div className="space-y-4"><GreenNotebook key={`${round.id}-${hole.hole_number}`} draftKey={`golf.green-draft.${userId}.${round.id}.${hole.hole_number}`} value={round.green_notes?.[hole.hole_number]} onSave={async note=>{await change(r=>({...r,green_notes:{...r.green_notes,[hole.hole_number]:note}}));}}/>{courseHole?.green_lat!=null&&courseHole.green_lng!=null&&<div className="play-card space-y-3"><button className="btn-secondary w-full" onClick={()=>setShowMap(!showMap)}>{showMap?'Hide map':'Open green-center map'}</button>{showMap&&<Suspense fallback={<p>Loading map…</p>}><RoundMap center={[courseHole.green_lat,courseHole.green_lng]} markerPosition={gps.fresh&&gps.position?[gps.position.lat,gps.position.lng]:null}/></Suspense>}<p className="text-xs text-slate-500">Map imagery requires a connection. This is a location map, not a green contour survey.</p></div>}</div>}
      {tab==='shots'&&<ShotTracker entry={entry} hole={hole.hole_number} gps={gps} unit={unit}/>}
    </div>{tab!=='score'&&actionError&&<p className="error-notice" role="alert">{actionError}</p>}
    {tab!=='score'&&<button className="play-next" disabled={!!entry.shotStart} onClick={()=>idx<round.holes.length-1?void go(round.holes[idx+1].hole_number):setFinish(true)}>{idx<round.holes.length-1?'Next hole →':'Finish round'}</button>}<button className="w-full text-xs font-semibold text-slate-500 underline" onClick={()=>setFinish(true)}>Finish or end a partial round</button>
    {finish&&<section className="play-card space-y-3"><h2 className="text-xl font-semibold">Finish this round?</h2><p className="text-sm text-slate-500">{scored.length} of {round.hole_count} holes scored. Your round saves here and syncs when connected. You can reopen it later.</p><button className="btn-primary" disabled={!!entry.shotStart} onClick={()=>void change(r=>({...r,status:'completed'})).then(()=>setFinish(false)).catch(e=>setActionError(message(e)))}>Confirm finish</button><button className="btn-secondary ml-2" onClick={()=>setFinish(false)}>Keep playing</button></section>}
    </div></div>
    <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-500"><span>{scored.length} holes scored · {entry.shots?.filter(s=>!s.deleted).length??0} shots tracked</span>{serverId&&<Link className="font-semibold text-emerald-800" to={`/rounds/${serverId}/edit`}>Round details</Link>}</footer>
  </div>;
}
