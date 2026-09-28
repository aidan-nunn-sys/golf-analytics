import { useState } from 'react';
import type { Club } from '../../api/types';
import { displayToYards, unitLabel, type Unit } from '../../units';
import { lies, shotDistance } from '../../offline/shotHistory';
import type { DeviceShot, Lie, ShotPosition } from '../../offline/storage';
import { yardsToDisplay } from '../../units';

export function ShotEditor({ initial, clubs, unit, onSave, onCancel, creating=false }: {
  initial:DeviceShot; clubs:Club[]; unit:Unit; onSave:(shot:DeviceShot)=>Promise<void>; onCancel:()=>void; creating?:boolean;
}) {
  const [club,setClub]=useState(initial.clubId ? String(initial.clubId) : '');
  const [sequence,setSequence]=useState(initial.sequence == null ? '' : String(initial.sequence));
  const [direction,setDirection]=useState(initial.direction);
  const [startLie,setStartLie]=useState<Lie>(initial.startLie ?? 'unknown');
  const [endLie,setEndLie]=useState<Lie>(initial.endLie ?? 'unknown');
  const [penalties,setPenalties]=useState(String(initial.penalties ?? 0));
  const [holed,setHoled]=useState(initial.holedOut ?? false);
  const [total,setTotal]=useState(initial.totalYards == null ? '' : String(yardsToDisplay(initial.totalYards,unit)));
  const [positions,setPositions]=useState([initial.start?.lat,initial.start?.lng,initial.end?.lat,initial.end?.lng].map(n=>n==null?'':String(n)));
  const [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const available=clubs.filter(c=>c.is_active || c.id===initial.clubId);
  const known=available.some(c=>c.id===initial.clubId);
  const positioned=positions.some(v=>v.trim());
  function position(offset:number,original:ShotPosition|null):ShotPosition {
    const lat=Number(positions[offset]),lng=Number(positions[offset+1]);
    if(!positions[offset].trim()||!positions[offset+1].trim()||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) throw new Error('Enter valid latitude and longitude for both endpoints, or clear all four coordinates.');
    return original && original.lat===lat && original.lng===lng ? original : {lat,lng,accuracy:null,timestamp:null};
  }
  return <form className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4" aria-label={creating?'Record shot':'Correct shot'} onSubmit={async e=>{
    e.preventDefault();setError('');
    try {
      const order=sequence.trim()?Number(sequence):null, penalty=Number(penalties);
      if(!club) throw new Error('Choose a club.');
      if(order!==null&&(!Number.isSafeInteger(order)||order<1||order>1000)) throw new Error('Use a shot number from 1 to 1,000, or leave unknown.');
      if(!penalties.trim()||!Number.isSafeInteger(penalty)||penalty<0||penalty>10) throw new Error('Use zero to ten penalty strokes.');
      const start=positioned?position(0,initial.start):null,end=positioned?position(2,initial.end):null;
      const measured=total.trim()?displayToYards(Number(total),unit):null;
      if(!positioned&&measured!==null&&(!Number.isFinite(measured)||measured<0||measured>2000)) throw new Error('Use a distance from zero to 2,000 yards, or leave it unknown.');
      const next:DeviceShot={...initial,clubId:Number(club),clubLabel:available.find(c=>c.id===Number(club))?.label ?? initial.clubLabel,
        sequence:order,direction,startLie,endLie,penalties:penalty,holedOut:holed,start,end,totalYards:positioned?null:measured};
      if(positioned) next.totalYards=shotDistance(next);
      setBusy(true);await onSave(next);
    } catch(err) {setError(err instanceof Error?err.message:'Could not save this shot.');} finally {setBusy(false);}
  }}>
    <h3 className="font-semibold">{creating?'Record this shot':'Correct this shot'}</h3>
    <label className="block text-sm font-semibold">Club<select className="field mt-2" value={club} onChange={e=>setClub(e.target.value)}><option value="">Choose club</option>{!known&&initial.clubId>0&&<option value={initial.clubId}>{initial.clubLabel}</option>}{available.map(c=><option key={c.id} value={c.id}>{c.label}{!c.is_active?' (inactive)':''}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Shot number<input className="field mt-2" type="number" min="1" max="1000" placeholder="Unknown" value={sequence} onChange={e=>setSequence(e.target.value)}/></label><label className="text-sm font-semibold">Shot direction<select className="field mt-2" value={direction} onChange={e=>setDirection(e.target.value as DeviceShot['direction'])}><option value="left">Left</option><option value="straight">Straight</option><option value="right">Right</option></select></label></div>
    <div className="grid grid-cols-2 gap-3">{(['Start lie','End lie'] as const).map((label,i)=><label key={label} className="text-sm font-semibold">{label}<select className="field mt-2" value={i===0?startLie:endLie} onChange={e=>i===0?setStartLie(e.target.value as Lie):setEndLie(e.target.value as Lie)}>{lies.map(lie=><option key={lie} value={lie}>{lie==='unknown'?'Not recorded':lie[0].toUpperCase()+lie.slice(1)}</option>)}</select></label>)}</div>
    <label className="block text-sm font-semibold">Penalty strokes on this shot<input className="field mt-2" type="number" min="0" max="10" value={penalties} onChange={e=>setPenalties(e.target.value)}/></label>
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={holed} onChange={e=>{setHoled(e.target.checked);if(e.target.checked)setEndLie('green');}}/>Ball holed out</label>
    {!positioned&&<label className="block text-sm font-semibold">Total distance ({unitLabel(unit)})<input className="field mt-2" type="number" min="0" step="any" placeholder="Not recorded" value={total} onChange={e=>setTotal(e.target.value)}/></label>}
    {positioned&&<p className="text-xs text-slate-600">Total distance is calculated from the saved positions. GPS includes roll and is not precise enough for putting distances.</p>}
    <details><summary className="text-sm font-semibold">Correct recorded positions</summary><p className="mt-2 text-xs text-slate-600">Latitude/longitude in decimal degrees. Changed coordinates have unknown accuracy and capture time. Clear all four to keep a distance-only record.</p><div className="mt-3 grid grid-cols-2 gap-3">{['Start latitude','Start longitude','End latitude','End longitude'].map((label,i)=><label key={label} className="text-xs">{label}<input className="field mt-1" type="number" step="any" value={positions[i]} onChange={e=>setPositions(values=>values.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div></details>
    <p className="text-xs text-slate-600">Shot records do not change your scorecard. Keep scores, putts and penalties up to date in Score.</p>
    {error&&<p role="alert" className="error-notice">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy||!club} type="submit">{busy?'Saving…':creating?'Save shot on device':'Save shot correction'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
