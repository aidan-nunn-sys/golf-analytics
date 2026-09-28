import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '../api/client';
import type { TeeSet, Hole } from '../api/types';
export function TeeEditor({ tee, holes }: { tee: TeeSet; holes: Hole[] }) {
  const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const [name, setName] = useState(tee.name); const [total, setTotal] = useState(String(tee.yardage ?? ''));
  const [yards, setYards] = useState<Record<string,string>>(Object.fromEntries(Object.entries(tee.hole_yardages ?? {}).map(([n,y])=>[n,String(y)])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false);
  async function save(remove = false) {
    setBusy(true); setError('');
    try {
      const values = Object.fromEntries(Object.entries(yards).filter(([,y])=>y!=='').map(([n,y])=>[n,Number(y)]));
      const complete = holes.length > 0 && holes.every(h=>values[h.number]!=null);
      await apiSend(remove ? 'DELETE' : 'PATCH', `/tees/${tee.id}`, remove ? undefined : {name, yardage:complete ? Object.values(values).reduce((a,b)=>a+b,0) : total==='' ? null : Number(total), hole_yardages:values});
      await qc.invalidateQueries({queryKey:['tees',tee.course_id]}); setOpen(false); setConfirm(false);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not save tee.'); } finally { setBusy(false); }
  }
  return <div className="mt-2"><button className="text-sm font-semibold text-emerald-800 underline" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Edit {tee.name}</button>{open && <form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="space-y-3">
    <label className="block text-sm">Tee name<input className="field mt-1" required maxLength={60} value={name} onChange={e=>setName(e.target.value)} /></label>
    <label className="block text-sm">Total yardage<input className="field mt-1" type="number" min={0} value={total} onChange={e=>setTotal(e.target.value)} /></label>
    <p className="text-xs text-slate-500">Enter yards per hole. The total is calculated when every hole has a yardage.</p>
    <div className="grid grid-cols-3 gap-2">{holes.map(h=><label key={h.number} className="text-xs">Hole {h.number}<input aria-label={`${tee.name} hole ${h.number} yards`} className="field mt-1" type="number" min={1} max={1500} value={yards[h.number] ?? ''} onChange={e=>setYards(v=>({...v,[h.number]:e.target.value}))}/></label>)}</div>
    {error && <p className="error-notice" role="alert">{error}</p>}<div className="flex flex-wrap gap-2"><button className="btn-primary">Save tee</button><button type="button" className="btn-secondary" onClick={()=>setOpen(false)}>Close</button><button type="button" className="btn-secondary" onClick={()=>setConfirm(true)}>Delete tee</button></div>
    {confirm && <div className="notice"><p>Delete {tee.name}? Past rounds keep their saved tee details.</p><button className="mt-2 font-semibold underline" type="button" onClick={()=>void save(true)}>Confirm delete tee</button><button className="ml-4 underline" type="button" onClick={()=>setConfirm(false)}>Cancel deletion</button></div>}
  </fieldset></form>}</div>;
}
