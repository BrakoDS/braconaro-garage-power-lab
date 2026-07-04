/* ============================================================
   BRACONARO GARAGE POWER LAB — app.js
   ============================================================ */
(function () {
  'use strict';

  var WA = 'https://wa.me/5514998660352';

  /* ---------- year ---------- */
  var yEl = document.getElementById('year');
  if (yEl) yEl.textContent = new Date().getFullYear();

  /* ---------- nav scroll state ---------- */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 24) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  function closeMenu() { if (links) links.classList.remove('open'); if (nav) nav.classList.remove('menu-open'); }
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
      nav.classList.toggle('menu-open');
    });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  }

  /* ---------- PLANS ---------- */
  var PLANS = {
    mensal: {
      note: 'Mês de 4 semanas. Quando houver 5 semanas, a 5ª não será cobrada.',
      per: '/mês',
      rows: [
        { freq: '3x', sub: 'por semana', price: '130', obs: '4 semanas' },
        { freq: '4x', sub: 'por semana', price: '150', obs: '4 semanas', featured: true },
        { freq: '5x', sub: 'por semana', price: '170', obs: '4 semanas' }
      ]
    },
    tri: {
      note: 'Valores reduzidos por fidelidade (plano trimestral). Mesma regra das 4 semanas, com a 5ª semana não cobrada.',
      per: '/mês no trimestral',
      rows: [
        { freq: '3x', sub: 'por semana', price: '125', obs: 'Economia por fidelidade' },
        { freq: '4x', sub: 'por semana', price: '140', obs: 'Economia por fidelidade', featured: true },
        { freq: '5x', sub: 'por semana', price: '150', obs: 'Economia por fidelidade' }
      ]
    }
  };

  var grid = document.getElementById('plansGrid');
  var noteEl = document.getElementById('toggleNote');

  function renderPlans(key) {
    if (!grid) return;
    var p = PLANS[key];
    var planName = key === 'mensal' ? 'Mensal' : 'Trimestral';
    grid.innerHTML = p.rows.map(function (r) {
      var msg = encodeURIComponent('Olá! Tenho interesse no plano ' + planName + ' ' + r.freq + ' por semana (R$ ' + r.price + '). Pode me passar mais informações?');
      return '' +
        '<div class="plan reveal in' + (r.featured ? ' featured' : '') + '">' +
          (r.featured ? '<span class="pop">Mais popular</span>' : '') +
          '<div class="freq">' + r.freq + '<small>' + r.sub + '</small></div>' +
          '<div class="price"><span class="cur">R$</span><span class="val">' + r.price + '</span><span class="per">' + p.per + '</span></div>' +
          '<div class="obs">' + r.obs + '</div>' +
          '<a class="btn ' + (r.featured ? 'btn-primary' : 'btn-ghost') + '" href="' + WA + '?text=' + msg + '" target="_blank" rel="noopener" data-track="clique_plano_' + key + '_' + r.freq + '" data-track-meta="Lead">Quero esse plano</a>' +
        '</div>';
    }).join('');
    if (noteEl) noteEl.textContent = p.note;
  }

  var toggleWrap = document.getElementById('plansToggle');
  if (toggleWrap) {
    toggleWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      toggleWrap.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderPlans(btn.dataset.plan);
    });
  }
  renderPlans('mensal');

  /* ---------- HOURS ---------- */
  var DAYS = [
    { name: 'Segunda', dow: 1, slots: ['06:00 – 13:00', '15:00 – 20:00'] },
    { name: 'Terça',   dow: 2, slots: ['06:00 – 13:00', '15:00 – 20:00'] },
    { name: 'Quarta',  dow: 3, slots: ['06:00 – 13:00', '15:00 – 20:00'] },
    { name: 'Quinta',  dow: 4, slots: ['06:00 – 13:00', '15:00 – 20:00'] },
    { name: 'Sexta',   dow: 5, slots: ['06:00 – 13:00', '15:00 – 19:00'] },
    { name: 'Sábado',  dow: 6, slots: ['Aula às 09:00'] },
    { name: 'Domingo', dow: 0, slots: [], closed: true }
  ];
  var todayDow = new Date().getDay();
  var hoursGrid = document.getElementById('hoursGrid');
  if (hoursGrid) {
    hoursGrid.innerHTML = DAYS.map(function (d) {
      var isToday = d.dow === todayDow;
      var slotsHtml = d.closed
        ? '<span class="slot none">Fechado</span>'
        : d.slots.map(function (s) { return '<span class="slot">' + s + '</span>'; }).join('');
      return '' +
        '<div class="day reveal' + (d.closed ? ' closed' : '') + (isToday ? ' today' : '') + '">' +
          '<div class="dname">' + d.name + (isToday ? '<span class="tag">Hoje</span>' : '') + '</div>' +
          '<div class="slots">' + slotsHtml + '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- reveal on scroll (with bulletproof fallbacks) ---------- */
  function forceInstant() { document.documentElement.classList.add('reveal-instant'); }
  function revealAll() {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }
  function revealInView() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add('in');
    });
  }
  // If the page is rendered while hidden (offscreen capture / export), CSS
  // transitions freeze — snap content visible instantly instead.
  if (document.visibilityState === 'hidden') forceInstant();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { forceInstant(); revealAll(); }
  });
  // 1) reveal anything already on screen right away (never leave the hero blank)
  revealInView();
  // 2) IntersectionObserver for the rest as the user scrolls
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) { io.observe(el); });
  } else {
    forceInstant(); revealAll();
  }
  // 3) safety: if IO never fires (offscreen render / print / export), force everything visible
  setTimeout(function () { forceInstant(); revealAll(); }, 1500);
  window.addEventListener('load', revealInView);
})();

/* ============================================================
   Aula experimental — envia o lead para o WhatsApp do coach
   ============================================================ */
(function () {
  var form = document.getElementById('exp-form');
  if (!form) return;
  var COACH = '5514998660352';
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = new FormData(form);
    var nome = (d.get('nome') || '').toString().trim();
    var whats = (d.get('whats') || '').toString().trim();
    if (!nome || !whats) return;
    var obj = (d.get('objetivo') || '').toString().trim();
    var hor = (d.get('horario') || '').toString().trim();
    var msg = 'Olá! Quero agendar uma AULA EXPERIMENTAL grátis no Braconaro Garage Power Lab.\n\n'
      + 'Nome: ' + nome + '\n'
      + 'Meu WhatsApp: ' + whats
      + (obj ? '\nObjetivo: ' + obj : '')
      + (hor ? '\nMelhor horário: ' + hor : '');
    if (window.trackEvento) window.trackEvento('envio_aula_gratis', { local: 'exp-form' }, 'Lead');
    if (window.enviarLeadFirestore) window.enviarLeadFirestore({ nome: nome, whatsapp: whats, objetivo: obj, horario: hor, origem: 'aula-experimental' });
    window.open('https://wa.me/' + COACH + '?text=' + encodeURIComponent(msg), '_blank');
  });
})();
