/* Service Worker — Braconaro Garage Power Lab (PWA dos apps do Coach).
 * Estratégia:
 *  - navegação + código do app (MESMA ORIGEM): REDE PRIMEIRO — sempre pega a
 *    versão nova quando online; cai pro cache só quando offline. (Evita servir
 *    app.js/HTML antigos depois de um deploy.)
 *  - recursos externos (fontes, SDK do Firebase): cache primeiro (são estáveis
 *    e versionados) → garantem o funcionamento offline.
 * Bumpar CACHE invalida o cache antigo no activate.
 */
const CACHE = 'bgpl-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;

  // Navegação e código próprio (mesma origem): rede primeiro, cache offline.
  if (req.mode === 'navigate' || sameOrigin) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const copy = fresh.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || (req.mode === 'navigate' ? caches.match('/coach/index.html') : Response.error());
      }
    })());
    return;
  }

  // Externos (fontes, SDK Firebase): cache primeiro, atualiza em 2º plano.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
