import type { Club } from '../api/types';
import { apiGet, getToken } from '../api/client';
const key=(id:number)=>`golf.bag.v1.${id}`;
export function savedClubs(userId:number):Club[] {try{return JSON.parse(localStorage.getItem(key(userId))??'[]');}catch{return [];}}
export async function downloadClubs(userId:number) {
  const token=getToken();const clubs=await apiGet<Club[]>('/clubs',AbortSignal.timeout(12000));
  if(token!==getToken())throw new Error('The signed-in account changed.');
  localStorage.setItem(key(userId),JSON.stringify(clubs));return clubs;
}
