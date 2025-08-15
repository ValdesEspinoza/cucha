const CACHE_NAME="cucha-cache-neutral-v1";const APP_SHELL=["/","/index.html","/manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE_NAME&&caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const r=e.request;if(r.mode==="navigate"){e.respondWith(fetch(r).catch(()=>caches.match("/index.html")));return;}
e.respondWith(caches.match(r).then(cached=>{const nf=fetch(r).then(resp=>{const cp=resp.clone();caches.open(CACHE_NAME).then(c=>c.put(r,cp));return resp;}).catch(()=>cached);return cached||nf;}));});
