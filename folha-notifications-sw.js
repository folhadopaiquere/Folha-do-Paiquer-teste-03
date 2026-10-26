/* Folha do Paiquerê PWA shell: network-first keeps published code fresh and offers a basic offline fallback. */
const FP_PAIQUERE_PWA_V184 = 'fp-paiquere-pwa-v184';
const FP_PAIQUERE_SCOPE = self.registration.scope;
const FP_PAIQUERE_PRECACHE_V184 = [
  'index.html',
  'painel.html',
  'manifest.webmanifest',
  'assets/branding/brasao-folha-paiquere.png',
  'assets/branding/brasao-folha-paiquere-192.png',
  'assets/branding/brasao-folha-paiquere-512.png',
  'pwa.js',
  'fp-v181-interface-polish.css',
  'fp-v184-role-navigation-fix.css',
].map(path => new URL(path, FP_PAIQUERE_SCOPE).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { const cache = await caches.open(FP_PAIQUERE_PWA_V184); await cache.addAll(FP_PAIQUERE_PRECACHE_V184); }
    catch (_) { /* Não bloqueia instalação caso um recurso opcional falhe. */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('fp-paiquere-pwa-') && key !== FP_PAIQUERE_PWA_V184).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Network-first for navigation and same-origin assets; keep current deployment whenever online.
  event.respondWith((async () => {
    const cache = await caches.open(FP_PAIQUERE_PWA_V184);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        return (await cache.match(new URL('index.html', FP_PAIQUERE_SCOPE).href)) || Response.error();
      }
      return Response.error();
    }
  })());
});

self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification?.data?.url;if(!url)return;event.waitUntil((async()=>{const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clientsList){try{await client.navigate(url);await client.focus();return;}catch(_){}}if(self.clients.openWindow)await self.clients.openWindow(url);})());});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json?.()||{}}catch(_){}const n=data.notification||data;event.waitUntil(self.registration.showNotification(n.title||'Folha do Paiquerê',{body:n.body||'',icon:n.icon||new URL('assets/branding/brasao-folha-paiquere.png',FP_PAIQUERE_SCOPE).href,badge:n.badge||new URL('assets/branding/brasao-folha-paiquere.png',FP_PAIQUERE_SCOPE).href,data:{url:n.url||n.link||new URL('index.html',FP_PAIQUERE_SCOPE).href}}));});
