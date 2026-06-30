/* Service Worker — Braconaro Garage Power Lab (PWA dos apps do Coach).
 * Estratégia:
 *  - navegação (páginas): rede primeiro, cai pro cache quando offline;
 *  - estáticos (js/css/imagens/fontes/SDK): stale-while-revalidate
 *    (serve do cache na hora e atualiza em segundo plano).
 * Bumpar CACHE invalida o cache antigo no próximo carregamento online.
 */
const CACHE = 'bgpl-v1';

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

  // Páginas: rede primeiro (pega deploy novo), cache como reserva offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || (await caches.match('/coach/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Demais GET: stale-while-revalidate.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone(); // clona ANTES de devolver à página (senão o corpo já foi consumido)
        e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
