import { useEffect,useState } from 'react';
import type { Club } from '../../api/types';
import { savedClubs,downloadClubs } from '../../offline/clubs';
import { updateDevice,type DeviceShot,type DownloadedRound } from '../../offline/storage';
import { distanceYards } from '../../geo';
import { unitLabel,yardsToDisplay,type Unit } from '../../units';
import type { usePosition } from './usePosition';
import { ShotEditor } from './ShotEditor';
import { ShotTimeline } from './ShotTimeline';

export function ShotTracker({entry,hole,gps,unit}:{entry:DownloadedRound;hole:number;gps:ReturnType<typeof usePosition>;unit:Unit}) {
  const [clubs,setClubs]=useState<Club[]>(()=>savedClubs(entry.userId));
  const [manual,setManual]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(navigator.onLine)void downloadClubs(entry.userId).then(setClubs).catch(()=>{});},[entry.userId]);
  const endpoint=entry.shotEnd??gps.position;
  const measured=entry.shotStart&&endpoint?distanceYards(entry.shotStart.position.lat,entry.shotStart.position.lng,endpoint.lat,endpoint.lng):null;
  async function action(fn:()=>Promise<unknown>) {try{await fn();setError('');}catch(e){setError(e instanceof Error?e.message:'Could not save shot.');}}
  const initial:DeviceShot={clientId:crypto.randomUUID(),hole,clubId:0,clubLabel:'',direction:'straight',
    start:manual?null:entry.shotStart?.position??null,end:manual?null:entry.shotEnd??null,
    sequence:Math.max(0,...(entry.shots??[]).filter(s=>s.hole===hole&&!s.deleted).map(s=>s.sequence??0))+1,
    source:manual?'manual':'gps',revision:0,changeId:crypto.randomUUID(),synced:false};
  return <div className="space-y-4"><section className="play-card space-y-4">
    <div><p className="play-eyebrow">Know your game</p><h2 className="mt-1 text-xl font-semibold">Track a shot</h2><p className="mt-2 text-sm text-slate-500">Mark your start, walk to the ball, then save the club and result. GPS measures total distance including roll. Tracking is optional.</p></div>
    {!gps.enabled&&!manual&&<button className="btn-secondary w-full" onClick={gps.enable}>Enable GPS for shots</button>}
    {entry.shotStart&&<div className="rounded-2xl bg-emerald-50 p-5 text-center"><p className="text-xs uppercase tracking-widest text-emerald-700">{entry.shotEnd?'Measured shot':'Tracking shot'}</p><p className="mt-2 text-5xl font-semibold text-emerald-950">{measured===null?'—':Math.round(yardsToDisplay(measured,unit))}<span className="ml-2 text-base">{unitLabel(unit)}</span></p><p className="mt-2 text-xs text-emerald-800">Hole {entry.shotStart.hole} · start saved on device</p></div>}
    {!manual&&!entry.shotStart&&<button className="btn-primary min-h-14 w-full" disabled={!gps.fresh} onClick={()=>void action(()=>updateDevice(entry.userId,entry.round.id,e=>{
      if(e.shotStart)throw new Error('A shot is already being measured.');
      return {...e,shotStart:{hole,position:gps.position!},shotEnd:undefined};
    }))}>Mark shot start</button>}
    {!manual&&entry.shotStart&&!entry.shotEnd&&<button className="btn-primary min-h-14 w-full" disabled={!gps.fresh} onClick={()=>void action(()=>updateDevice(entry.userId,entry.round.id,e=>{
      if(!e.shotStart||e.shotStart.position.timestamp!==entry.shotStart?.position.timestamp)throw new Error('This measurement changed in another tab.');
      return {...e,shotEnd:gps.position!};
    }))}>I’m at my ball</button>}
    {!entry.shotStart&&!manual&&<button className="btn-secondary w-full" onClick={()=>setManual(true)}>Add shot without GPS</button>}
    {(manual||entry.shotStart&&entry.shotEnd)&&<ShotEditor key={`${hole}.${manual?'manual':entry.shotEnd?.timestamp}`} initial={initial} clubs={clubs} unit={unit} creating onCancel={()=>{if(manual)setManual(false);else void action(()=>updateDevice(entry.userId,entry.round.id,e=>({...e,shotStart:undefined,shotEnd:undefined})));}} onSave={async shot=>{
      await updateDevice(entry.userId,entry.round.id,e=>{
        if(!manual&&(!e.shotStart||!e.shotEnd||e.shotStart.position.timestamp!==entry.shotStart?.position.timestamp||e.shotEnd.timestamp!==entry.shotEnd?.timestamp))throw new Error('This measurement changed in another tab.');
        if(e.shots?.some(s=>s.clientId===shot.clientId))return e;
        return {...e,shots:[...(e.shots??[]),{...shot,createdAt:new Date().toISOString(),changeId:crypto.randomUUID(),synced:false}],shotStart:undefined,shotEnd:undefined,savedAt:new Date().toISOString()};
      });
      setManual(false);setError('');
    }}/>}
    {!gps.fresh&&gps.enabled&&!entry.shotEnd&&!manual&&<p className="text-sm text-amber-800">Waiting for a fresh GPS fix within 25 meters accuracy. Manual entry is available without GPS.</p>}
    {!clubs.length&&<p className="text-sm text-slate-500">No saved clubs. Download your bag while connected.</p>}
    <button className="text-xs font-semibold text-emerald-800 underline" onClick={()=>void action(async()=>setClubs(await downloadClubs(entry.userId)))}>Refresh bag</button>
    {entry.shotStart&&!entry.shotEnd&&<button className="block text-sm text-slate-500 underline" onClick={()=>void action(()=>updateDevice(entry.userId,entry.round.id,e=>({...e,shotStart:undefined,shotEnd:undefined})))}>Cancel measurement</button>}
    {error&&<p className="error-notice" role="alert">{error}</p>}
  </section><ShotTimeline key={`${entry.round.id}.${hole}`} entry={entry} hole={hole} clubs={clubs} unit={unit}/></div>;
}
