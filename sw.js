const CACHE = 'aqsat-v3';
const ASSETS = ['./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.hostname.includes('googleapis.com')||url.hostname.includes('firebase')||url.hostname.includes('gstatic.com')&&url.pathname.includes('firebasejs')){
    e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));
    return;
  }
  if(url.hostname.includes('fonts.gstatic.com')||url.hostname.includes('fonts.googleapis.com')){
    e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(r=>{
      if(r)return r;
      return fetch(e.request).then(res=>{c.put(e.request,res.clone());return res;}).catch(()=>r);
    })));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>{
    if(r)return r;
    return fetch(e.request).then(res=>{
      if(res&&res.status===200){caches.open(CACHE).then(c=>c.put(e.request,res.clone()));}
      return res;
    }).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):undefined);
  }));
});

self.addEventListener('sync',e=>{
  if(e.tag==='fb-sync')e.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.forEach(c=>c.postMessage({type:'SYNC_NOW'}))));
});

self.addEventListener('message',e=>{
  if(e.data?.type==='SKIP_WAITING')self.skipWaiting();
});
