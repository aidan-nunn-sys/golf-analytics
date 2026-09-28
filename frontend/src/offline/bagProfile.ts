import { apiGet, getToken } from '../api/client';
import type { BagProfile, ProfileSource } from '../bagAdvice';
const key = (userId: number, source: ProfileSource) => `golf.bag-profile.v1.${userId}.${source}`;
export function savedProfile(userId: number, source: ProfileSource): BagProfile | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId, source)) ?? 'null');
    return saved?.source === source && Array.isArray(saved.clubs) && saved.generated_at ? saved : null;
  } catch { return null; }
}
export async function downloadProfile(userId: number, source: ProfileSource = 'all') {
  const token = getToken();
  const result = await apiGet<BagProfile>(`/stats/bag-profile?source=${source}`, AbortSignal.timeout(12000));
  if (token !== getToken()) throw new Error('The signed-in account changed.');
  localStorage.setItem(key(userId, source), JSON.stringify(result));
  window.dispatchEvent(new Event('golf-offline-change'));
  return result;
}
