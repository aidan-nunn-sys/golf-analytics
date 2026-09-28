import { downloadFile } from "../download";
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiSend } from '../api/client';
import type { Course, TeeSet } from '../api/types';

interface Preview { card: { name: string; holes: { number: number; par: number | null }[]; tees: TeeSet[] }; duplicates: { id: number; name: string; archived: boolean }[]; warnings: string[] }
export function CourseFileImport() {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate(); const qc = useQueryClient();
  const reset = () => { setPreview(null); setDuplicate(false); setError(''); };
  async function submit(apply: boolean) {
    setBusy(true); setError('');
    try {
      const body = { format, content, allow_duplicate: duplicate };
      if (apply) {
        const course = await apiSend<Course>('POST', '/courses/file/apply', body);
        await qc.invalidateQueries({ queryKey: ['courseLibrary'] }); navigate(`/courses/${course.id}`);
      } else setPreview(await apiSend<Preview>('POST', '/courses/file/preview', body));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import this file.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <Link className="text-sm font-semibold text-emerald-800" to="/courses">← Your courses</Link>
    <header><p className="eyebrow">Bring your own scorecard</p><h1 className="mt-2 text-3xl">Import a course</h1><p className="mt-2 text-slate-500">Upload a CSV scorecard or a Golf Analytics JSON export. Review every import before saving.</p></header>
    <section className="panel space-y-4"><h2 className="text-xl">Choose your file</h2>
      <p className="text-sm text-slate-500">CSV requires course, hole, and par columns. Add tee and yardage for distances; repeat each hole for each tee. JSON also supports ratings. Yardages are in yards.</p>
      <button className="btn-secondary" onClick={() => downloadFile('course-template.csv', 'course,hole,par,stroke_index,tee,yardage,green_lat,green_lng\n' + Array.from({length:18}, (_, i) => `My course,${i+1},4,${i+1},Blue,350,,`).join('\n'), 'text/csv')}>Download CSV template</button>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm font-semibold">Scorecard file<input className="mt-2 block w-full text-sm" type="file" accept=".csv,.json,text/csv,application/json" onChange={async e => { const file = e.target.files?.[0]; reset(); if (!file) return; if (file.size > 500_000) { setError('Choose a file smaller than 500 KB.'); return; } try { setContent(await file.text()); setFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv'); } catch { setError('Could not read that file.'); } }} /></label>
        <label className="block text-sm font-semibold">Format<select className="field mt-2" value={format} onChange={e => { setFormat(e.target.value as 'csv' | 'json'); reset(); }}><option value="csv">CSV scorecard</option><option value="json">Golf Analytics JSON</option></select></label>
        <label className="block text-sm font-semibold">File contents<textarea className="field mt-2 font-mono text-xs" rows={8} value={content} maxLength={500000} onChange={e => { setContent(e.target.value); reset(); }} /></label>
        <button className="btn-primary" disabled={!content.trim()} onClick={() => void submit(false)}>{busy ? 'Reading…' : 'Preview import'}</button>
      </fieldset>
    </section>
    {error && <p role="alert" className="error-notice whitespace-pre-wrap">{error}</p>}
    {preview && <section className="panel space-y-4"><div><p className="eyebrow">Import preview</p><h2 className="mt-2 text-2xl">{preview.card.name}</h2><p className="mt-2 text-sm text-slate-500">{preview.card.holes.length} holes · {preview.card.tees.length} tees · Par {preview.card.holes.reduce((n,h) => n + (h.par ?? 0), 0)}</p></div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{preview.card.holes.map(h => <div key={h.number} className="rounded-xl bg-slate-50 p-3 text-sm"><strong>Hole {h.number}</strong><p>Par {h.par ?? 'needed'}</p></div>)}</div>
      {preview.card.tees.map(t => <p key={t.name} className="text-sm">{t.name} · {t.yardage ?? 'Unknown'} yd · {t.ratings.length} ratings</p>)}
      {preview.warnings.map(w => <p className="notice" key={w}>{w}</p>)}
      {!!preview.duplicates.length && <div className="notice space-y-3"><p>A course with this name is already saved:</p>{preview.duplicates.map(d => <Link key={d.id} className="block underline" to={`/courses/${d.id}`}>{d.name}{d.archived ? ' (archived)' : ''}</Link>)}<label className="flex items-center gap-3"><input type="checkbox" checked={duplicate} onChange={e => setDuplicate(e.target.checked)} />Import another copy</label></div>}
      <button className="btn-primary w-full" disabled={busy || (!!preview.duplicates.length && !duplicate)} onClick={() => void submit(true)}>{busy ? 'Importing…' : 'Save course to library'}</button>
    </section>}
  </div>;
}
