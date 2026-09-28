import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { recommend, MIN_SAMPLES, type ProfileSource, type Measurement, type BagProfile } from '../bagAdvice';
import { downloadProfile, savedProfile } from '../offline/bagProfile';
import { displayToYards, yardsToDisplay, unitLabel } from '../units';

export function BagAdvice() {
  const { user } = useAuth();
  const unit = user!.unit_preference;
  const [source, setSource] = useState<ProfileSource>('all');
  const [mode, setMode] = useState<Measurement>('carry');
  const [target, setTarget] = useState('');
  const [profile, setProfile] = useState<BagProfile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setProfile(savedProfile(user!.id, source)); setError(''); setBusy(true);
    downloadProfile(user!.id, source).then(p => { if (active) setProfile(p); })
      .catch(() => { if (active) setError('Could not refresh. Any saved profile below remains available.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user!.id, source, refresh]);
  const distance = displayToYards(Number(target), unit);
  const valid = target.trim() !== '' && Number.isFinite(distance) && distance > 0 && distance <= 600;
  const choices = profile && valid ? recommend(profile, distance, mode) : [];
  const display = (v: number | null) => v == null ? '—' : `${yardsToDisplay(v, unit)} ${unitLabel(unit)}`;
  return <div className="space-y-5">
    <header><p className="eyebrow">Know your bag</p><h1 className="mt-2 text-3xl font-bold">Club advice</h1>
      <p className="mt-2 text-slate-600">Compare your recorded distances with the shot in front of you.</p></header>
    <section className="panel space-y-4" aria-label="Choose your shot">
      <div className="grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-semibold">Target distance ({unitLabel(unit)})<input className="field mt-2" inputMode="decimal" type="number" min="1" value={target} onChange={e => setTarget(e.target.value)} /></label>
      <label className="text-sm font-semibold">Measurement<select className="field mt-2" value={mode} onChange={e => setMode(e.target.value as Measurement)}><option value="carry">Carry · flight only</option><option value="total">Total · includes roll</option></select></label>
      <label className="text-sm font-semibold">Shot source<select className="field mt-2" value={source} onChange={e => setSource(e.target.value as ProfileSource)}><option value="all">All recorded shots</option><option value="manual">Manual</option><option value="gps">GPS</option><option value="launch_monitor">Launch monitor</option></select></label>
      </div>
      <p className="text-xs text-slate-500">GPS measures total distance, not carry. Partial swings and mishits are not separated in existing records. Review your samples before relying on advice.</p>
      {target && !valid && <p role="alert">Enter a distance above zero and no more than {display(600)}.</p>}
      {valid && profile && <div aria-live="polite" className="space-y-3">
        {choices.length === 0 ? <p>Not enough {mode} data. Record at least {MIN_SAMPLES} measurements for a club with this source.</p> : choices.map(({ club, difference }, i) => <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4" key={club.club_id}>
          <h2 className="text-lg font-semibold">{i === 0 ? 'Closest recorded distance' : 'Another option'} · {club.label}</h2>
          <p>Typical {mode}: {display(club[mode].median)} · {difference === 0 ? 'Matches your target' : `${display(Math.abs(difference))} ${difference < 0 ? 'short of' : 'beyond'} your target`}</p>
          <p className="mt-1 text-sm">Middle 80%: {display(club[mode].p10)}–{display(club[mode].p90)} · {club[mode].count} shots · last recorded {club[mode].last_played}</p>
        </article>)}
        <p className="text-xs text-slate-600">Distances describe your samples, not a predicted success rate. Wind, elevation, lie and hazards are not included. A closest club can still be a poor fit for this shot.</p>
      </div>}
    </section>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}>{busy ? 'Refreshing profile…' : 'Refresh and save for offline'}</button>
      {profile && <p className="text-xs text-slate-500">Saved snapshot: {new Date(profile.generated_at).toLocaleString()}. Refresh after recording or correcting shots.</p>}</div>
    {error && <p role="status" className="text-sm text-amber-800">{error}</p>}
    {!profile && !busy && <p>No saved profile for this source. Connect to your server to download it.</p>}
    {profile && <section className="panel space-y-3"><h2 className="text-xl font-semibold">Your {mode} distances</h2><p className="text-sm text-slate-600">Middle 80% is the 10th–90th percentile; all valid recorded distances are included.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Club</th><th>Typical</th><th>Middle 80%</th><th>Shots</th><th>Last recorded</th></tr></thead><tbody>{profile.clubs.map(c => <tr className="border-t" key={c.club_id}><th className="p-2"><Link className="text-emerald-800 underline" to={`/clubs/${c.club_id}`}>{c.label}</Link></th><td>{display(c[mode].median)}</td><td>{c[mode].count ? `${display(c[mode].p10)}–${display(c[mode].p90)}` : '—'}</td><td>{c[mode].count}{c[mode].excluded > 0 && <span className="block text-xs">{c[mode].excluded} invalid excluded</span>}</td><td>{c[mode].last_played ?? '—'}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}
