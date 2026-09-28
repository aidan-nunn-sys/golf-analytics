import { useEffect, useState } from 'react';
import { MIN_SAMPLES, recommend, type BagProfile, type Measurement, type ProfileSource } from '../../bagAdvice';
import { downloadProfile, savedProfile } from '../../offline/bagProfile';
import { distanceYards } from '../../geo';
import { displayToYards, yardsToDisplay, unitLabel, type Unit } from '../../units';
import type { Hole } from '../../api/types';
import type { usePosition } from './usePosition';

export function PlayAdvice({ userId, hole, gps, unit }: { userId: number; hole?: Hole; gps: ReturnType<typeof usePosition>; unit: Unit }) {
  const [target, setTarget] = useState('');
  const [manual, setManual] = useState(false);
  const [mode, setMode] = useState<Measurement>('carry');
  const [source, setSource] = useState<ProfileSource>('all');
  const [profile, setProfile] = useState<BagProfile | null>(() => savedProfile(userId, 'all'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const read = () => setProfile(savedProfile(userId, source));
    read(); setError('');
    window.addEventListener('golf-offline-change', read); window.addEventListener('storage', read);
    return () => { window.removeEventListener('golf-offline-change', read); window.removeEventListener('storage', read); };
  }, [userId, source]);
  const mapped = hole?.green_lat != null && hole?.green_lng != null;
  const gpsTarget = mapped && gps.fresh && gps.position
    ? distanceYards(gps.position.lat, gps.position.lng, hole.green_lat!, hole.green_lng!) : null;
  const distance = manual ? (target.trim() ? displayToYards(Number(target), unit) : null) : gpsTarget;
  const valid = distance !== null && Number.isFinite(distance) && distance > 0 && distance <= 600;
  const choices = valid && profile ? recommend(profile, distance, mode) : [];
  const display = (yards: number | null) => yards == null ? '—' : `${yardsToDisplay(yards, unit)} ${unitLabel(unit)}`;
  return <section className="play-card space-y-4" aria-label="Plan your shot">
    <div><p className="play-eyebrow">Plan your shot</p><h2 className="mt-1 text-xl font-semibold">Club advice</h2></div>
    <div className="flex gap-2" role="group" aria-label="Target source">
      <button className="play-choice flex-1" aria-pressed={!manual} onClick={() => setManual(false)}>Green center</button>
      <button className="play-choice flex-1" aria-pressed={manual} onClick={() => setManual(true)}>Enter distance</button>
    </div>
    {manual ? <label className="block text-sm font-semibold">Target distance ({unitLabel(unit)})<input className="field mt-2" type="number" inputMode="decimal" min="1" value={target} onChange={e => setTarget(e.target.value)} /></label>
      : <div className="rounded-xl bg-slate-50 p-3"><p className="font-semibold">{gpsTarget === null ? 'Green-center distance unavailable' : `${display(Math.round(gpsTarget))} to green center`}</p><p className="mt-1 text-xs text-slate-600">{!mapped ? 'This green is not mapped. Enter a target distance.' : gpsTarget === null ? 'Use a fresh GPS fix or enter a target distance.' : 'Straight-line distance to the mapped center, not the pin.'}</p></div>}
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm font-semibold">Measurement<select className="field mt-2" value={mode} onChange={e => setMode(e.target.value as Measurement)}><option value="carry">Carry · flight</option><option value="total">Total · with roll</option></select></label>
      <label className="text-sm font-semibold">Shot source<select className="field mt-2" value={source} onChange={e => setSource(e.target.value as ProfileSource)}><option value="all">All sources</option><option value="manual">Manual</option><option value="gps">GPS</option><option value="launch_monitor">Launch monitor</option></select></label>
    </div>
    {manual && target.trim() && !valid && <p role="alert" className="error-notice">Enter a distance above zero and no more than {display(600)}.</p>}
    {!profile ? <p className="text-sm text-slate-600">No saved profile for this source. Connect and refresh your bag before using it offline.</p>
      : valid && <div aria-live="polite" className="space-y-3">{choices.length === 0 ? <p>Not enough {mode} data. Record at least {MIN_SAMPLES} measurements for a club with this source.</p> : choices.map(({ club, difference }, i) => <article key={club.club_id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <h3 className="font-semibold">{i === 0 ? 'Closest recorded distance' : 'Another option'} · {club.label}</h3>
        <p className="mt-1 text-sm">Typical {mode}: {display(club[mode].median)} · {display(Math.abs(difference))} {difference < 0 ? 'short of' : 'beyond'} target</p>
        <p className="mt-2 text-xs">Middle 80%: {display(club[mode].p10)}–{display(club[mode].p90)} · {club[mode].count} shots · last recorded {club[mode].last_played ?? 'unknown'}</p>
      </article>)}</div>}
    <p className="text-xs leading-relaxed text-slate-600">Recorded distances, not a predicted success rate. Wind, elevation, lie and hazards are not modeled. Partial swings and mishits are included. GPS shots measure total, not carry.</p>
    {profile && <p className="text-xs text-slate-500">Bag snapshot: {new Date(profile.generated_at).toLocaleString()}. Refresh after recording or correcting shots.</p>}
    <button className="btn-secondary w-full" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await downloadProfile(userId, source); } catch { setError('Could not refresh. Your saved bag remains available.'); } finally { setBusy(false); } }}>{busy ? 'Refreshing bag…' : 'Refresh bag for offline use'}</button>
    {error && <p role="status" className="text-sm text-amber-800">{error}</p>}
  </section>;
}
