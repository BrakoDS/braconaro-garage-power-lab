// Envia o lead do formulário de aula experimental para o Firestore, além de
// abrir o WhatsApp (que continua sendo o canal principal). Assim o coach
// consegue ver, na Gestão de Alunos, todo mundo que pediu aula grátis — mesmo
// que a pessoa desista de mandar a mensagem no WhatsApp depois.
//
// Falha em silêncio se a nuvem estiver fora do ar: nunca atrapalha o fluxo
// principal (o WhatsApp já abriu de qualquer forma).
(function () {
  var V = '10.12.2';
  var _promise = null;

  function initFirebase() {
    if (_promise) return _promise;
    _promise = Promise.all([
      import('https://www.gstatic.com/firebasejs/' + V + '/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/' + V + '/firebase-firestore.js'),
      import('./montador/cloud-config.js'),
    ]).then(function (mods) {
      var appMod = mods[0], fsMod = mods[1], cfg = mods[2];
      if (!cfg.CLOUD_ATIVO || !cfg.firebaseConfig || !cfg.firebaseConfig.apiKey) throw new Error('cloud-inativa');
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg.firebaseConfig);
      return { db: fsMod.getFirestore(app), fns: fsMod };
    });
    return _promise;
  }

  /** @param {{nome:string, whatsapp:string, objetivo?:string, horario?:string, indicadoPor?:string, origem?:string}} dados */
  window.enviarLeadFirestore = function (dados) {
    initFirebase().then(function (ctx) {
      var id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      var doc = {
        nome: dados.nome || '',
        whatsapp: dados.whatsapp || '',
        objetivo: dados.objetivo || '',
        horario: dados.horario || '',
        origem: dados.origem || 'landing',
        status: 'novo',
        criadoEm: Date.now(),
      };
      if (dados.indicadoPor) doc.indicadoPor = dados.indicadoPor;
      return ctx.fns.setDoc(ctx.fns.doc(ctx.db, 'leads', id), doc);
    }).catch(function (e) { console.warn('Lead:', e && e.message); });
  };
})();
