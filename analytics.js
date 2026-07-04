// Analytics da landing: Google Analytics 4 + Meta Pixel + rastreamento central
// de eventos de conversão (WhatsApp, aula grátis, planos).
//
// Para ativar: troque GA4_ID e META_PIXEL_ID abaixo pelos IDs reais.
// Enquanto estiverem com os valores de exemplo, nada é carregado (sem erro,
// sem custo, sem enviar dado nenhum).
(function () {
  var GA4_ID = 'G-XXXXXXX';            // Google Analytics 4 → Measurement ID
  var META_PIXEL_ID = '0000000000000'; // Meta (Facebook/Instagram) → Pixel ID

  var temGA4 = GA4_ID.indexOf('XXXXXXX') === -1;
  var temMeta = META_PIXEL_ID.indexOf('0000000000000') === -1;

  // ---------- Google Analytics 4 ----------
  if (temGA4) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID);
  }

  // ---------- Meta Pixel ----------
  if (temMeta) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  /**
   * Registra um evento de conversão no GA4 e no Meta Pixel ao mesmo tempo.
   * @param {string} nomeGA4 nome do evento no GA4 (ex.: "clique_whatsapp")
   * @param {Object} params parâmetros extras (ex.: { local: 'nav' })
   * @param {string} [nomeMeta] evento padrão do Meta (Lead, Contact, Schedule…)
   */
  window.trackEvento = function (nomeGA4, params, nomeMeta) {
    try { if (window.gtag) window.gtag('event', nomeGA4, params || {}); } catch (e) {}
    try { if (window.fbq) window.fbq('track', nomeMeta || 'Contact', params || {}); } catch (e) {}
  };

  // Clique automático em qualquer elemento marcado com data-track="nome_evento"
  // (e opcionalmente data-track-meta="EventoMeta").
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-track]') : null;
    if (!el) return;
    var nome = el.getAttribute('data-track');
    var meta = el.getAttribute('data-track-meta') || 'Contact';
    window.trackEvento(nome, { local: nome }, meta);
  });
})();
