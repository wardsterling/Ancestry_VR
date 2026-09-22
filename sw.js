/* Cache only the application shell. Private archive requests remain network-only. */
const CACHE='living-wall-shell-v3';
const FILES=['./','index.html','styles.css','archive.css','app.js','search-engine.js','search-ui.js','data.js','manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('living-wall-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/archive-data.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));return;
  }
  const relative=url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if(!FILES.includes(relative)&&relative!=='')return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
