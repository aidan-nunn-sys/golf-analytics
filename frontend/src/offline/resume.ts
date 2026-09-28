import type { Round } from '../api/types';
import { hasPending, type DownloadedRound } from './storage';

export function resumeChoices(local: DownloadedRound[], server: Round[]) {
  const known = new Set(local.map(e => e.serverId ?? e.round.id));
  return [
    ...local.filter(e => e.round.status === 'in_progress' || hasPending(e)).map(e => ({
      key: `local-${e.round.id}`, path: `/offline/${e.round.id}`, name: e.round.course_name || e.course.name,
      hole: e.round.current_hole, pending: hasPending(e), date: e.round.date,
    })),
    ...server.filter(r => r.status === 'in_progress' && !known.has(r.id)).map(r => ({
      key: `server-${r.id}`, path: `/rounds/${r.id}`, name: r.course_name || 'Your round',
      hole: r.current_hole, pending: false, date: r.date,
    })),
  ].sort((a, b) => Number(b.pending) - Number(a.pending) || b.date.localeCompare(a.date));
}
