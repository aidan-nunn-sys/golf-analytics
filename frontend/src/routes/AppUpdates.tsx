import { Link } from 'react-router-dom';
import { BUILD_ID, checkForUpdate, installUpdate, useAppUpdate } from '../appUpdate';
export function AppUpdates() {
  const update = useAppUpdate();
  return <section className="panel space-y-4"><h1 className="text-2xl font-bold">App updates</h1><p className="text-sm text-slate-500">Installed build: {BUILD_ID}</p>
    <p>Updates reload this screen. Save your work and close other Golf tabs or app windows first. Pending scores, shots, personal notes and note drafts must be saved and synced before installing.</p>
    <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={update.busy} onClick={() => void checkForUpdate()}>Check for updates</button>{update.available && <button className="btn-primary" disabled={update.busy} onClick={installUpdate}>Install update and reload</button>}</div>
    {update.message && <p role="status">{update.message}</p>}<p className="text-sm">Your saved course and round data stays on this device.</p><Link className="text-emerald-800 underline" to="/offline">Review saved rounds</Link>
  </section>;
}
