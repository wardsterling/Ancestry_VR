/* Cache only the application shell. Private archive requests remain network-only. */
const CACHE='living-wall-shell-v10';
const FILES=['./','index.html','styles.css','archive.css','archive-explorer.css','report-edition.css','photo-workspace.css','photo-research.js','photo-workspace.js','archive-model.js','archive-privacy.js','source-viewer.js','profile-presentation.js','archive-explorer.js','app.js','search-engine.js','search-ui.js','data.js','manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('living-wall-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(/\/api\/|\/source-people\.json$|\/wall-catalog\.json$|\/source-pages\/|\/archive-(data|tree|private-details)\.json$|\/source-documents\/|\/assets\/report-portraits\//.test(url.pathname)){
    event.respondWith(fetch(event.request,{cache:'no-store'}));return;
  }
  const relative=url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if(!FILES.includes(relative)&&relative!=='')return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
