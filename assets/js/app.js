/* =========================================================
   Glow Studio • Bianca Goldran — página + agenda online
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.GLOW_CONFIG || {};
  var SERVICOS = CFG.servicos || {};
  var MODO_DEMO = !CFG.apiUrl;
  var DIAS = CFG.diasNaAgenda || 21;

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  var ICON_RELOGIO = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  /* ---------------- Formatação ---------------- */
  function duracaoTexto(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  }
  function parseData(str) {
    var p = str.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function isoLocal(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var fmtSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
  var fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  var fmtLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  function semana(d) { return fmtSemana.format(d).replace('.', ''); }
  function mes(d) { return fmtMes.format(d).replace('.', ''); }
  function dataLonga(str) {
    var t = fmtLongo.format(parseData(str));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function linkWhats(msg) {
    return 'https://wa.me/' + String(CFG.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(msg);
  }
  function escapar(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Conteúdo vindo do config.js ---------------- */
  function preencherConteudo() {
    $$('[data-endereco]').forEach(function (el) { el.textContent = CFG.endereco || ''; });
    $$('[data-maps]').forEach(function (el) { el.href = CFG.mapsUrl || '#'; });
    $$('[data-instagram]').forEach(function (el) { el.href = 'https://instagram.com/' + (CFG.instagram || ''); });
    $$('[data-whatsapp]').forEach(function (el) {
      el.href = linkWhats(el.getAttribute('data-whatsapp'));
      el.target = '_blank';
      el.rel = 'noopener';
      el.addEventListener('click', function () { rastrear('Contact', { origem: 'whatsapp' }); });
    });

  }

  /* ---------------- Rastreamento (opcional) ---------------- */
  function carregarRastreamento() {
    if (CFG.metaPixelId) {
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', CFG.metaPixelId);
      window.fbq('track', 'PageView');
    }
    if (CFG.googleAnalyticsId) {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.googleAnalyticsId);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', CFG.googleAnalyticsId);
    }
  }
  function rastrear(evento, dados) {
    try {
      if (window.fbq) window.fbq('track', evento, dados || {});
      if (window.gtag) window.gtag('event', evento, dados || {});
    } catch (e) { /* nunca quebra a página */ }
  }

  /* ---------------- API ---------------- */
  var api = {
    disponibilidade: function (servico) {
      if (MODO_DEMO) return demo.disponibilidade(servico);
      var url = CFG.apiUrl + '?action=disponibilidade&servico=' + encodeURIComponent(servico) +
        '&inicio=' + isoLocal(new Date()) + '&dias=' + DIAS + '&_=' + Date.now();
      return fetch(url, { redirect: 'follow' }).then(lerJson);
    },
    agendar: function (dados) {
      if (MODO_DEMO) return demo.agendar(dados);
      dados.action = 'agendar';
      // text/plain evita a requisição "preflight" de CORS que o Apps Script não responde.
      return fetch(CFG.apiUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(dados),
      }).then(lerJson);
    },
  };
  function lerJson(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json().then(function (j) {
      if (!j.ok) { var e = new Error(j.erro || 'Erro'); e.usuario = true; throw e; }
      return j;
    });
  }

  /* ---------------- Modo demonstração ---------------- */
  var demo = (function () {
    var reservados = {};
    var expediente = { 2: [9, 19], 3: [9, 19], 4: [9, 19], 5: [9, 19], 6: [8, 16] };
    function pseudoAleatorio(seed) {
      var x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }
    function disponibilidade(servicoId) {
      var dur = SERVICOS[servicoId].duracaoMin / 60;
      var hoje = new Date();
      var dias = [];
      for (var i = 0; i < DIAS; i++) {
        var d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
        var exp = expediente[d.getDay()];
        var data = isoLocal(d);
        if (!exp) { dias.push({ data: data, fechado: true, horarios: [] }); continue; }
        var horarios = [];
        for (var h = exp[0]; h + dur <= exp[1]; h++) {
          if (i === 0 && h <= hoje.getHours() + 3) continue;
          var hora = String(h).padStart(2, '0') + ':00';
          var seed = d.getDate() * 31 + d.getMonth() * 7 + h;
          var ocupado = pseudoAleatorio(seed) < 0.45 || (h < 13 && h + dur > 12) || reservados[data + hora];
          horarios.push({ hora: hora, status: ocupado ? 'ocupado' : 'livre' });
        }
        dias.push({ data: data, fechado: false, horarios: horarios });
      }
      return esperar(450).then(function () { return { ok: true, servico: servicoId, dias: dias }; });
    }
    function agendar(b) {
      return esperar(900).then(function () {
        reservados[b.data + b.hora] = true;
        var ini = parseData(b.data);
        var p = b.hora.split(':');
        ini.setHours(+p[0], +p[1]);
        var fim = new Date(ini.getTime() + SERVICOS[b.servico].duracaoMin * 60e3);
        return {
          ok: true,
          agendamento: {
            servico: SERVICOS[b.servico].nome, data: b.data, hora: b.hora,
            fim: String(fim.getHours()).padStart(2, '0') + ':' + String(fim.getMinutes()).padStart(2, '0'),
            inicioISO: ini.toISOString(), fimISO: fim.toISOString(),
          },
        };
      });
    }
    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    return { disponibilidade: disponibilidade, agendar: agendar };
  })();

  /* ---------------- Agenda ---------------- */
  var estado = {
    servico: Object.keys(SERVICOS)[0],
    cache: {},          // servico -> { quando, dias }
    dia: null,          // 'yyyy-mm-dd'
    hora: null,         // 'HH:mm'
    carregando: false,
  };
  var el = {};

  function iniciarAgenda() {
    el.servicos = $('#servicos');
    el.dias = $('#dias');
    el.horarios = $('#horarios');
    el.form = $('#formulario');
    el.resumo = $('#resumo');
    el.erro = $('#erro');
    el.btn = $('#btn-confirmar');
    el.sucesso = $('#sucesso');

    if (MODO_DEMO) $('#aviso-demo').hidden = false;

    renderServicos();
    carregar(false);

    el.servicos.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) selecionarServico(b.getAttribute('data-id'));
    });
    el.servicos.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var ids = Object.keys(SERVICOS);
      var i = ids.indexOf(estado.servico) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
      selecionarServico(ids[(i + ids.length) % ids.length]);
      $('[aria-checked="true"]', el.servicos).focus();
      e.preventDefault();
    });
    el.dias.addEventListener('click', function (e) {
      var b = e.target.closest('.dia');
      if (b && !b.disabled) selecionarDia(b.getAttribute('data-data'));
    });
    el.horarios.addEventListener('click', function (e) {
      var b = e.target.closest('.horario');
      if (b && !b.disabled) selecionarHora(b.getAttribute('data-hora'));
      if (e.target.closest('[data-recarregar]')) carregar(true);
    });
    $$('[data-rolar]').forEach(function (b) {
      b.addEventListener('click', function () {
        el.dias.scrollBy({ left: Number(b.getAttribute('data-rolar')) * el.dias.clientWidth * 0.8, behavior: 'smooth' });
      });
    });

    // Botões "Agendar aplicação/manutenção" em qualquer lugar da página
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-servico]');
      if (a) selecionarServico(a.getAttribute('data-servico'));
      var cta = e.target.closest('[data-cta]');
      if (cta) rastrear('ViewContent', { origem: cta.getAttribute('data-cta') });
    });

    // Máscara do WhatsApp
    var tel = el.form.elements.telefone;
    tel.addEventListener('input', function () {
      var n = tel.value.replace(/\D/g, '').slice(0, 11);
      var f = n;
      if (n.length > 2) f = '(' + n.slice(0, 2) + ') ' + n.slice(2);
      if (n.length > 7) f = '(' + n.slice(0, 2) + ') ' + n.slice(2, n.length === 11 ? 7 : 6) + '-' + n.slice(n.length === 11 ? 7 : 6);
      tel.value = f;
    });
    $$('input', el.form).forEach(function (i) {
      i.addEventListener('input', function () { i.removeAttribute('aria-invalid'); });
    });

    el.form.addEventListener('submit', enviar);
    $('#novo-agendamento').addEventListener('click', function () {
      el.sucesso.hidden = true;
      $$('.passo:not(form)').forEach(function (p) { p.hidden = false; });
      estado.hora = null;
      carregar(true);
      $('#agenda').scrollIntoView();
    });

    // Atualiza os horários quando a cliente volta para a aba (alguém pode ter agendado)
    document.addEventListener('visibilitychange', function () {
      var c = estado.cache[estado.servico];
      if (!document.hidden && c && Date.now() - c.quando > 60e3 && el.sucesso.hidden) carregar(true);
    });
  }

  function renderServicos() {
    el.servicos.innerHTML = Object.keys(SERVICOS).map(function (id) {
      var s = SERVICOS[id];
      var ativo = id === estado.servico;
      return '<button type="button" class="servico" role="radio" data-id="' + id + '" aria-checked="' + ativo + '" tabindex="' + (ativo ? 0 : -1) + '">' +
        '<span class="servico__nome">' + escapar(s.nome) + '</span>' +
        '<span class="servico__dur">' + ICON_RELOGIO + '~' + duracaoTexto(s.duracaoMin) + '</span></button>';
    }).join('');
  }

  function selecionarServico(id) {
    if (!SERVICOS[id]) return;
    if (id === estado.servico) return;
    estado.servico = id;
    estado.hora = null;
    renderServicos();
    carregar(false);
  }

  function carregar(forcar) {
    var servico = estado.servico;
    var c = estado.cache[servico];
    if (c && !forcar && Date.now() - c.quando < 60e3) { aplicarDias(c.dias); return; }

    estado.carregando = true;
    el.dias.innerHTML = repetir('<div class="esqueleto"></div>', 7);
    el.horarios.innerHTML = '<div class="carregando">' + repetir('<div class="esqueleto"></div>', 6) + '</div>';
    esconderForm();

    api.disponibilidade(servico).then(function (r) {
      estado.cache[servico] = { quando: Date.now(), dias: r.dias };
      if (servico === estado.servico) aplicarDias(r.dias);
    }).catch(function () {
      if (servico !== estado.servico) return;
      el.dias.innerHTML = '';
      el.horarios.innerHTML = '<p class="vazio">Não conseguimos carregar a agenda agora. <button type="button" class="link" data-recarregar>Tentar de novo</button> ou <a href="' +
        linkWhats('Oi, Bianca! Quero agendar ' + SERVICOS[servico].nome + '.') + '" target="_blank" rel="noopener">agende pelo WhatsApp</a>.</p>';
    }).then(function () { estado.carregando = false; });
  }

  function aplicarDias(dias) {
    var vigente = dias.filter(function (d) { return d.data === estado.dia; })[0];
    var temVaga = function (d) { return d.horarios.some(function (h) { return h.status === 'livre'; }); };
    if (!vigente || !temVaga(vigente)) {
      var primeiro = dias.filter(temVaga)[0];
      estado.dia = primeiro ? primeiro.data : null;
      estado.hora = null;
    } else if (estado.hora && !vigente.horarios.some(function (h) { return h.hora === estado.hora && h.status === 'livre'; })) {
      estado.hora = null;
    }
    renderDias(dias);
    renderHorarios();
    atualizarForm();
  }

  function renderDias(dias) {
    el.dias.innerHTML = dias.map(function (d) {
      var data = parseData(d.data);
      var livres = d.horarios.filter(function (h) { return h.status === 'livre'; }).length;
      var cls = d.fechado ? ' dia--fechado' : (livres ? '' : ' dia--lotado');
      var etiqueta = d.fechado ? 'Fechado' : (livres ? livres + (livres > 1 ? ' vagas' : ' vaga') : 'Lotado');
      var sel = d.data === estado.dia;
      return '<button type="button" class="dia' + cls + '" role="option" data-data="' + d.data + '" aria-selected="' + sel + '"' +
        (livres ? '' : ' disabled') + ' aria-label="' + dataLonga(d.data) + ', ' + etiqueta + '">' +
        '<span class="dia__sem">' + semana(data) + '</span>' +
        '<span class="dia__num">' + data.getDate() + '</span>' +
        '<span class="dia__mes">' + mes(data) + '</span>' +
        '<span class="dia__vagas">' + etiqueta + '</span></button>';
    }).join('');
    var sel = $('[aria-selected="true"]', el.dias);
    if (sel) el.dias.scrollTo({ left: Math.max(0, sel.offsetLeft - el.dias.offsetLeft - 8) });
  }

  function diaAtual() {
    var c = estado.cache[estado.servico];
    if (!c) return null;
    return c.dias.filter(function (d) { return d.data === estado.dia; })[0] || null;
  }

  function renderHorarios() {
    var d = diaAtual();
    if (!d) {
      el.horarios.innerHTML = '<p class="vazio">Agenda lotada nos próximos dias. <a href="' +
        linkWhats('Oi, Bianca! Não achei horário livre na agenda online. Pode me colocar na lista de espera para ' + SERVICOS[estado.servico].nome + '?') +
        '" target="_blank" rel="noopener">Entre na lista de espera pelo WhatsApp</a>.</p>';
      return;
    }
    el.horarios.innerHTML = d.horarios.map(function (h) {
      var livre = h.status === 'livre';
      var sel = livre && h.hora === estado.hora;
      return '<button type="button" class="horario' + (livre ? '' : ' horario--ocupado') + '" data-hora="' + h.hora + '"' +
        (livre ? ' aria-pressed="' + sel + '"' : ' disabled') +
        ' aria-label="' + h.hora + (livre ? ' vago' : ' ocupado') + '">' +
        '<strong>' + h.hora + '</strong><span>' + (livre ? (sel ? 'Escolhido' : 'Vago') : 'Ocupado') + '</span></button>';
    }).join('');
  }

  function selecionarDia(data) {
    if (data === estado.dia) return;
    estado.dia = data;
    estado.hora = null;
    $$('.dia', el.dias).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-data') === data)); });
    renderHorarios();
    atualizarForm();
  }

  function selecionarHora(hora) {
    estado.hora = hora;
    renderHorarios();
    atualizarForm();
    var botao = $('[data-hora="' + hora + '"]', el.horarios);
    if (botao) botao.focus({ preventScroll: true });
    rastrear('InitiateCheckout', { servico: estado.servico });
    if (window.matchMedia('(max-width: 720px)').matches) {
      setTimeout(function () { el.form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
    }
  }

  function esconderForm() { el.form.hidden = true; }

  function atualizarForm() {
    if (!estado.dia || !estado.hora) { esconderForm(); return; }
    var s = SERVICOS[estado.servico];
    el.resumo.innerHTML = '<strong>' + escapar(s.nome) + '</strong><br>' + dataLonga(estado.dia) + ' às ' + estado.hora;
    el.erro.hidden = true;
    el.form.hidden = false;
  }

  function enviar(e) {
    e.preventDefault();
    if (el.btn.disabled) return;
    var f = el.form.elements;
    var dados = {
      servico: estado.servico,
      data: estado.dia,
      hora: estado.hora,
      nome: f.nome.value.trim(),
      telefone: f.telefone.value.replace(/\D/g, ''),
      email: f.email.value.trim(),
      observacoes: f.observacoes.value.trim(),
      website: f.website.value,
    };

    var invalido = null;
    if (dados.nome.length < 2) invalido = [f.nome, 'Informe seu nome.'];
    else if (dados.telefone.length < 10) invalido = [f.telefone, 'Informe seu WhatsApp com DDD.'];
    else if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) invalido = [f.email, 'Confira o e-mail digitado.'];
    if (invalido) {
      invalido[0].setAttribute('aria-invalid', 'true');
      invalido[0].focus();
      mostrarErro(invalido[1]);
      return;
    }

    el.btn.disabled = true;
    el.btn.textContent = 'Reservando seu horário…';
    el.erro.hidden = true;

    api.agendar(dados).then(function (r) {
      rastrear('Schedule', { servico: dados.servico });
      mostrarSucesso(r.agendamento, dados);
      delete estado.cache[dados.servico];
    }).catch(function (err) {
      mostrarErro(err.usuario ? err.message : 'Não foi possível confirmar agora. Verifique sua internet e tente de novo.');
      if (err.usuario) carregar(true); // horário pode ter sido ocupado: recarrega a grade
    }).then(function () {
      el.btn.disabled = false;
      el.btn.textContent = 'Confirmar agendamento';
    });
  }

  function mostrarErro(msg) {
    el.erro.textContent = msg;
    el.erro.hidden = false;
  }

  function mostrarSucesso(ag, dados) {
    var s = SERVICOS[dados.servico];
    var quando = dataLonga(ag.data) + ' às ' + ag.hora;
    $('#sucesso-texto').innerHTML = escapar(dados.nome.split(' ')[0]) + ', seu horário de <strong>' + escapar(s.nome) +
      '</strong> está reservado para <strong>' + quando + '</strong>. Te espero no Glow Studio! 💅';

    $('#sucesso-whats').href = linkWhats(
      'Oi, Bianca! Acabei de agendar pela página:\n' +
      '• ' + s.nome + '\n• ' + quando + '\n• Nome: ' + dados.nome
    );

    var gcal = function (iso) { return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    $('#sucesso-gcal').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(s.nome + ' – Glow Studio') +
      '&dates=' + gcal(ag.inicioISO) + '/' + gcal(ag.fimISO) +
      '&details=' + encodeURIComponent('Atendimento com Bianca Goldran. Dúvidas: wa.me/' + String(CFG.whatsapp || '').replace(/\D/g, '')) +
      '&location=' + encodeURIComponent(CFG.endereco || 'Glow Studio');

    el.form.reset();
    el.form.hidden = true;
    $$('.passo:not(form)').forEach(function (p) { p.hidden = true; });
    el.sucesso.hidden = false;
    el.sucesso.focus();
    $('#agenda').scrollIntoView({ behavior: 'smooth' });
  }

  function repetir(s, n) { return new Array(n + 1).join(s); }

  /* ---------------- Interface geral ---------------- */
  function iniciarInterface() {
    var topo = $('#topo');
    window.addEventListener('scroll', function () { topo.classList.toggle('rolou', window.scrollY > 8); }, { passive: true });
  }

  /* ---------------- Galeria ---------------- */
  function iniciarGaleria() {
    var trilho = $('#galeria');
    var dialogo = $('#foto-ampliada');
    var foto = $('img', dialogo);

    $$('[data-galeria]').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = trilho.querySelector('li');
        var passo = item ? item.getBoundingClientRect().width + 14 : trilho.clientWidth / 2;
        var dir = Number(b.getAttribute('data-galeria'));
        var fim = trilho.scrollLeft + trilho.clientWidth >= trilho.scrollWidth - 4;
        if (dir > 0 && fim) trilho.scrollTo({ left: 0, behavior: 'smooth' });
        else trilho.scrollBy({ left: dir * passo, behavior: 'smooth' });
      });
    });

    if (!dialogo.showModal) return; // navegador antigo: fotos continuam visíveis no carrossel
    trilho.addEventListener('click', function (e) {
      var img = e.target.closest('.galeria__item') && e.target.closest('.galeria__item').querySelector('img');
      if (!img) return;
      foto.src = img.currentSrc || img.src;
      foto.alt = img.alt;
      dialogo.showModal();
    });
    dialogo.addEventListener('click', function (e) {
      if (e.target === dialogo || e.target.closest('.foto-ampliada__fechar')) dialogo.close();
    });
  }

  preencherConteudo();
  carregarRastreamento();
  iniciarInterface();
  iniciarGaleria();
  iniciarAgenda();
})();
