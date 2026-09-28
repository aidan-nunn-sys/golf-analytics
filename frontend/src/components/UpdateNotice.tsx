import { Link } from 'react-router-dom';
import { useAppUpdate } from '../appUpdate';
export function UpdateNotice() {
  const update = useAppUpdate();
  return update.available ? <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900" role="status">An app update is ready. <Link className="font-semibold underline" to="/updates">Review update</Link>. Install when you have finished playing.</p> : null;
}
