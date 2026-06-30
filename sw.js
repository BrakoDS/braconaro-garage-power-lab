/* Service worker DESATIVADO (kill switch).
 *
 * O PWA offline foi removido temporariamente porque o cache do SW estava
 * servindo versões antigas / tela branca. Este SW se autodestrói: ao ser
 * detectado por qualquer navegador (o browser sempre revalida /sw.js), ele
 * limpa os caches, remove o próprio registro e recarrega as páginas abertas —
 * que voltam a carregar direto da rede, sempre na versão mais nova.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    } catch (_) { /* ignora */ }
  })());
});

// Sem handler de fetch: nada é servido do cache; tudo vai direto à rede.
