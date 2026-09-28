// Kept as a pure generator so activation safety can be tested without a browser.
export function workerSource(cache: string, assets: string[]) {
  return `const CACHE=${JSON.stringify(cache)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('message',event=>{
  if(event.data?.type!=='INSTALL_UPDATE')return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const source=windows.find(client=>client.id===event.source?.id);
    // Client.url can retain the document's original URL after SPA navigation.
    // The application rechecks its live route and pending data before sending.
    if(windows.length!==1||!source||event.data.pathname!=='/updates'){
      event.source?.postMessage({type:'UPDATE_BLOCKED'});return;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('golf-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html')).then(cached=>cached||fetch(event.request)));return;
  }
  if(ASSETS.includes(url.pathname))event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(event.request)));
});`;
}
