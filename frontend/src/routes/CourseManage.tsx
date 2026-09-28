import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend } from '../api/client';
import { useCourse } from '../api/hooks';
import type { Course } from '../api/types';
import { AsyncBoundary } from '../components/AsyncBoundary';
import { downloadFile } from '../download';

type Row = { number: number; par: string; stroke_index: string; green_lat: string; green_lng: string };
function Editor({ course }: { course: Course }) {
  const [name, setName] = useState(course.name);
  const [holes, setHoles] = useState<Row[]>(course.holes.map(h => ({ number: h.number, par: String(h.par ?? ''), stroke_index: String(h.stroke_index ?? ''), green_lat: String(h.green_lat ?? ''), green_lng: String(h.green_lng ?? '') })));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const navigate = useNavigate(); const qc = useQueryClient();
  async function perform(action: 'save' | 'archive' | 'restore' | 'export') {
    setError(''); setBusy(true);
    try {
      if (action === 'export') { downloadFile(`${course.name.replace(/[^a-z0-9]/gi, '-')}.json`, JSON.stringify(await apiGet(`/courses/${course.id}/export`), null, 2)); return; }
      if (action === 'save') {
        await apiSend('PUT', `/courses/${course.id}/details`, { name, holes: holes.map(h => ({ number: h.number, ...Object.fromEntries(['par','stroke_index','green_lat','green_lng'].map(k => [k, h[k as keyof Row] === '' ? null : Number(h[k as keyof Row])])) })) });
      } else await apiSend('POST', `/courses/${course.id}/${action}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ['courseLibrary'] }), qc.invalidateQueries({queryKey:['course',course.id]}), qc.invalidateQueries({queryKey:['tees',course.id]})]);
      navigate(action === 'archive' ? '/courses?view=archived' : `/courses/${course.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes.'); }
    finally { setBusy(false); }
  }
  function update(number: number, key: keyof Omit<Row, 'number'>, value: string) { setHoles(rows => rows.map(h => h.number === number ? {...h, [key]: value} : h)); }
  return <div className="space-y-6"><Link className="text-sm font-semibold text-emerald-800" to={`/courses/${course.id}`}>← Back to course</Link>
    <header><p className="eyebrow">Your course library</p><h1 className="mt-2 text-3xl">Manage course</h1><p className="mt-2 text-slate-500">Correct the scorecard and green locations. Existing round scores and snapshots stay intact.</p></header>
    {error && <p role="alert" className="error-notice">{error}</p>}
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); void perform('save'); }}><fieldset disabled={busy} className="space-y-5">
      <section className="panel space-y-4"><label className="block text-sm font-semibold">Course name<input className="field mt-2" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="flex flex-wrap gap-3"><Link className="btn-secondary" to={`/courses/${course.id}/tees`}>Manage tees & ratings</Link><button type="button" className="btn-secondary" onClick={() => void perform('export')}>Export JSON</button></div>
      </section>
      <section className="space-y-3"><h2 className="text-xl">Hole details</h2><p className="text-sm text-slate-500">Leave unknown values blank. Changes that invalidate a tee’s rating remove that rating for future rounds; you can enter the verified replacement in tee setup.</p>
        <div className="grid gap-3 lg:grid-cols-2">{holes.map(h => <fieldset key={h.number} className="panel space-y-3"><legend className="sr-only">Hole {h.number}</legend><div className="flex items-center justify-between"><h3 className="font-semibold">Hole {h.number}</h3><button type="button" className="text-sm text-red-700 underline" onClick={() => setHoles(rows => rows.filter(row => row.number !== h.number))}>Remove hole {h.number}</button></div><div className="grid grid-cols-2 gap-3">{(['par','stroke_index','green_lat','green_lng'] as const).map(key => <label key={key} className="text-xs font-semibold text-slate-600">{{par:'Par',stroke_index:'Stroke index',green_lat:'Green latitude',green_lng:'Green longitude'}[key]}<input className="field mt-1" aria-label={`Hole ${h.number} ${{par:"par",stroke_index:"stroke index",green_lat:"green latitude",green_lng:"green longitude"}[key]}`} type="number" step={key.startsWith('green') ? 'any' : '1'} min={key === 'par' ? 3 : key === 'stroke_index' ? 1 : key === 'green_lat' ? -90 : -180} max={key === 'par' ? 6 : key === 'stroke_index' ? 18 : key === 'green_lat' ? 90 : 180} value={h[key]} onChange={e => update(h.number,key,e.target.value)} /></label>)}</div></fieldset>)}</div>
        <button type="button" className="btn-secondary" disabled={holes.length >= 18} onClick={() => { const n = Array.from({length:18},(_,i)=>i+1).find(n=>!holes.some(h=>h.number===n))!; setHoles(rows => [...rows,{number:n,par:'',stroke_index:'',green_lat:'',green_lng:''}].sort((a,b)=>a.number-b.number)); }}>Add hole</button>
      </section><button className="btn-primary w-full" disabled={!holes.length}>{busy ? 'Saving…' : 'Save course changes'}</button>
    </fieldset></form>
    <section className="panel space-y-3"><h2 className="text-xl">{course.archived_at ? 'Restore course' : 'Archive course'}</h2><p className="text-sm text-slate-500">Archived courses leave your active library. Past and in-progress rounds remain available, and you can restore the course at any time.</p>
      {course.archived_at ? <button disabled={busy} className="btn-secondary" onClick={() => void perform('restore')}>Restore course</button> : confirm ? <div className="notice space-y-3"><p>Archive {course.name}? Unsaved edits on this page will be discarded.</p><div className="flex gap-3"><button disabled={busy} className="btn-primary" onClick={() => void perform('archive')}>Confirm archive</button><button className="btn-secondary" onClick={() => setConfirm(false)}>Cancel</button></div></div> : <button className="btn-secondary" onClick={() => setConfirm(true)}>Archive course</button>}
    </section>
  </div>;
}
export function CourseManage() { const {data, isLoading, error} = useCourse(Number(useParams().id)); return <AsyncBoundary loading={isLoading} error={error}>{data && <Editor key={data.id} course={data} />}</AsyncBoundary>; }
