import { useEffect, useState } from 'react';
import { savedCourses } from '../offline/courses';
import { savedClubs } from '../offline/clubs';
import { hasPending, listDownloads } from '../offline/storage';
import { savedProfile } from '../offline/bagProfile';
import { Link } from 'react-router-dom';

export function PlayReadiness({ userId, courseId, teeId, holeCount, nine }: {
  userId: number; courseId?: number; teeId?: string; holeCount?: number; nine?: string;
}) {
  const [checks, setChecks] = useState<string[]>([]);
  const [shell, setShell] = useState('Checking offline app…');
  const [gps, setGps] = useState('GPS permission is checked when you enable it in Play.');
  useEffect(() => {
    const refresh = () => {
      try {
        const courses = savedCourses(userId).filter(c => courseId == null || (c.course.id === courseId && (c.round.tee_set_id ?? 0) === Number(teeId || 0) && c.round.hole_count === holeCount && (holeCount === 18 || c.round.nine === nine)));
        const pending = listDownloads(userId).filter(hasPending).length;
        setChecks([
          courses.length ? `${courseId ? 'Selected course and tees' : `${courses.length} course setups`} saved on this device.` : 'Download your course and selected tees before leaving.',
          savedClubs(userId).length ? 'Bag saved for shot tracking.' : 'Bag not saved yet. Connect and download a course or open Play.',
          savedProfile(userId, 'all') ? 'Club advice snapshot saved.' : 'Open Club advice while connected to save its distance profile.',
          pending ? `${pending} rounds have pending scores or shots. They remain on this device.` : 'No pending round changes.',
        ]);
      } catch { setChecks(['Device storage needs attention. Open Offline rounds before leaving.']); }
    };
    refresh(); window.addEventListener('golf-offline-change', refresh); window.addEventListener('storage', refresh);
    let active = true;
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => { if (active) setShell(r?.active && navigator.serviceWorker.controller ? 'Offline app installed on this browser.' : 'Offline app not ready. Open the production app online, then reopen it.'); }).catch(() => { if (active) setShell('Could not check the offline app.'); });
    else setShell('Offline app installation is unavailable in this browser.');
    navigator.permissions?.query({ name: 'geolocation' }).then(p => { if (active) setGps(p.state === 'granted' ? 'GPS permission allowed; reception is checked in Play.' : p.state === 'denied' ? 'GPS permission denied. Scoring still works.' : 'GPS permission will be requested only when you enable it.'); }).catch(() => {});
    return () => { active = false; window.removeEventListener('golf-offline-change', refresh); window.removeEventListener('storage', refresh); };
  }, [userId, courseId, teeId, holeCount, nine]);
  return <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">Ready for the course?</summary><ul className="my-3 list-disc space-y-2 pl-5">{[...checks, shell, gps].map(c => <li key={c}>{c}</li>)}</ul><Link to="/advice" className="text-emerald-800 underline">Club advice</Link> · <Link to="/offline" className="text-emerald-800 underline">Offline rounds</Link></details>;
}
