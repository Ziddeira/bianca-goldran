/**
 * Agenda online – Bianca Goldran • Glow Studio
 * ------------------------------------------------------------
 * Backend em Google Apps Script ligado ao Google Agenda da Bianca.
 *
 *  GET  ?action=disponibilidade&servico=aplicacao&inicio=2026-10-20&dias=21
 *       -> horários de cada dia marcados como "livre" ou "ocupado"
 *  POST {"action":"agendar","servico":"aplicacao","data":"2026-10-20","hora":"09:00",
 *        "nome":"...","telefone":"...","email":"...","observacoes":"..."}
 *       -> cria o evento na agenda (com trava contra agendamento duplo)
 *
 * Qualquer evento que a Bianca criar na agenda (cliente marcada pelo WhatsApp,
 * almoço, folga, compromisso pessoal) passa a aparecer como OCUPADO na página.
 * Os títulos dos eventos nunca são enviados para a página: só "livre"/"ocupado".
 */

const CONFIG = {
  // 'primary' = agenda principal da conta que publicar o script.
  // Para usar outra agenda: Google Agenda > Configurações da agenda > "ID da agenda".
  CALENDAR_ID: 'primary',

  // Precisam bater com os serviços de assets/js/config.js (a chave e a duração).
  SERVICOS: {
    aplicacao: { nome: 'Aplicação • Alongamento Molde F1', duracaoMin: 150 },
    manutencao: { nome: 'Manutenção • Molde F1', duracaoMin: 120 },
  },

  // Horário de atendimento por dia da semana (0 = domingo ... 6 = sábado).
  // null = fechado. Formato: ['abre', 'último horário em que o atendimento precisa terminar'].
  EXPEDIENTE: {
    0: null,
    1: null,
    2: ['09:00', '19:00'],
    3: ['09:00', '19:00'],
    4: ['09:00', '19:00'],
    5: ['09:00', '19:00'],
    6: ['08:00', '16:00'],
  },

  // Pausas fixas todos os dias (ex.: almoço). Deixe [] se preferir bloquear direto na agenda.
  PAUSAS: [['12:00', '13:00']],

  PASSO_GRADE_MIN: 60,               // de quanto em quanto tempo os horários são oferecidos
  INTERVALO_ENTRE_ATENDIMENTOS_MIN: 15, // folga para limpar a mesa entre clientes
  ANTECEDENCIA_MIN_HORAS: 3,         // não deixa marcar em cima da hora
  DIAS_A_FRENTE: 30,                 // até quantos dias à frente a agenda abre

  // Evento de "dia inteiro" (ex.: "Folga", "Férias") bloqueia o dia todo?
  EVENTO_DIA_INTEIRO_BLOQUEIA: true,

  // Cor do evento criado pela página (ID de cor do Google Agenda: '1'..'11'). '4' = flamingo.
  COR_EVENTO: '4',

  // Envia e-mail para a Bianca a cada novo agendamento (para a conta dona do script).
  NOTIFICAR_POR_EMAIL: true,

  // Anti-abuso: máximo de agendamentos pelo mesmo telefone em 6 horas.
  MAX_AGENDAMENTOS_POR_TELEFONE: 2,

  LOCAL: 'Glow Studio',
};

/* ===================== Rotas ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'disponibilidade') {
      return json_(disponibilidade_(p.servico, p.inicio, Number(p.dias) || 21));
    }
    return json_({ ok: true, servico: 'agenda-glow-studio' });
  } catch (err) {
    return json_({ ok: false, erro: mensagemErro_(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'agendar') return json_(agendar_(body));
    return json_({ ok: false, erro: 'Ação inválida.' });
  } catch (err) {
    return json_({ ok: false, erro: mensagemErro_(err) });
  }
}

/* ===================== Disponibilidade ===================== */

function disponibilidade_(servicoId, inicioStr, dias) {
  const servico = servicoOuErro_(servicoId);
  dias = Math.max(1, Math.min(dias, CONFIG.DIAS_A_FRENTE));

  const hoje = inicioDoDia_(new Date());
  let inicio = inicioStr ? parseData_(inicioStr) : hoje;
  if (inicio < hoje) inicio = hoje;

  const limite = addDias_(hoje, CONFIG.DIAS_A_FRENTE);
  const fim = addDias_(inicio, dias);
  const fimEfetivo = fim > limite ? limite : fim;

  const ocupados = intervalosOcupados_(inicio, fimEfetivo);
  const resultado = [];
  for (let d = new Date(inicio); d < fimEfetivo; d = addDias_(d, 1)) {
    resultado.push(gradeDoDia_(d, servico, ocupados));
  }
  return { ok: true, servico: servicoId, fuso: Session.getScriptTimeZone(), dias: resultado };
}

/** Monta os horários de um dia com status livre/ocupado. */
function gradeDoDia_(dia, servico, ocupados) {
  const data = formatar_(dia, 'yyyy-MM-dd');
  const expediente = CONFIG.EXPEDIENTE[dia.getDay()];
  if (!expediente) return { data: data, fechado: true, horarios: [] };

  const abre = comHora_(dia, expediente[0]);
  const fecha = comHora_(dia, expediente[1]);
  const minimo = new Date(Date.now() + CONFIG.ANTECEDENCIA_MIN_HORAS * 3600e3);
  const duracao = servico.duracaoMin * 60e3;
  const passo = CONFIG.PASSO_GRADE_MIN * 60e3;
  const pausas = CONFIG.PAUSAS.map(function (pz) {
    return { inicio: comHora_(dia, pz[0]), fim: comHora_(dia, pz[1]) };
  });

  const horarios = [];
  for (let t = abre.getTime(); t + duracao <= fecha.getTime(); t += passo) {
    if (t < minimo.getTime()) continue; // horários que já passaram nem aparecem
    const ini = new Date(t);
    const fim = new Date(t + duracao);
    const livre = !conflita_(ini, fim, ocupados) && !conflita_(ini, fim, pausas, 0);
    horarios.push({ hora: formatar_(ini, 'HH:mm'), status: livre ? 'livre' : 'ocupado' });
  }
  return { data: data, fechado: false, horarios: horarios };
}

/** Lê a agenda e devolve os intervalos ocupados (sem expor título/descrição). */
function intervalosOcupados_(inicio, fim) {
  const eventos = agenda_().getEvents(inicio, fim);
  const ocupados = [];
  eventos.forEach(function (ev) {
    // Convite recusado não ocupa horário.
    try {
      if (ev.getMyStatus && ev.getMyStatus() === CalendarApp.GuestStatus.NO) return;
    } catch (ignorado) { /* eventos sem convidados */ }
    if (ev.isAllDayEvent() && !CONFIG.EVENTO_DIA_INTEIRO_BLOQUEIA) return;
    ocupados.push({ inicio: ev.getStartTime(), fim: ev.getEndTime() });
  });
  return ocupados;
}

function conflita_(ini, fim, intervalos, folgaMin) {
  const folga = (folgaMin === undefined ? CONFIG.INTERVALO_ENTRE_ATENDIMENTOS_MIN : folgaMin) * 60e3;
  return intervalos.some(function (o) {
    return ini.getTime() < o.fim.getTime() + folga && fim.getTime() > o.inicio.getTime() - folga;
  });
}

/* ===================== Agendamento ===================== */

function agendar_(b) {
  if (b.website) throw erroUsuario_('Não foi possível agendar.'); // honeypot anti-robô

  const servico = servicoOuErro_(b.servico);
  const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
  const telefone = String(b.telefone || '').replace(/\D/g, '');
  const email = String(b.email || '').trim();
  const obs = String(b.observacoes || '').trim().slice(0, 500);

  if (nome.length < 2 || nome.length > 80) throw erroUsuario_('Informe seu nome.');
  if (telefone.length < 10 || telefone.length > 13) throw erroUsuario_('Informe um WhatsApp válido com DDD.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erroUsuario_('E-mail inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) {
    throw erroUsuario_('Escolha um dia e horário.');
  }

  const cache = CacheService.getScriptCache();
  const chaveTel = 'tel_' + telefone;
  const usados = Number(cache.get(chaveTel) || 0);
  if (usados >= CONFIG.MAX_AGENDAMENTOS_POR_TELEFONE) {
    throw erroUsuario_('Você já fez agendamentos agora há pouco. Fale com a Bianca pelo WhatsApp.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Confere de novo na hora de gravar: o horário precisa existir na grade e estar livre.
    const dia = parseData_(b.data);
    const grade = gradeDoDia_(dia, servico, intervalosOcupados_(dia, addDias_(dia, 1)));
    const slot = grade.horarios.filter(function (h) { return h.hora === b.hora; })[0];
    if (!slot) throw erroUsuario_('Esse horário não está disponível. Escolha outro.');
    if (slot.status !== 'livre') {
      throw erroUsuario_('Poxa, alguém acabou de reservar esse horário. Escolha outro, por favor.');
    }

    const inicio = comHora_(dia, b.hora);
    const fim = new Date(inicio.getTime() + servico.duracaoMin * 60e3);
    const telFmt = formatarTelefone_(telefone);
    const descricao = [
      'Agendado pela página online',
      '',
      'Cliente: ' + nome,
      'WhatsApp: ' + telFmt + '  →  https://wa.me/' + (telefone.length <= 11 ? '55' + telefone : telefone),
      email ? 'E-mail: ' + email : '',
      'Serviço: ' + servico.nome,
      obs ? 'Observações: ' + obs : '',
    ].filter(Boolean).join('\n');

    const opcoes = { description: descricao, location: CONFIG.LOCAL };
    if (email) { opcoes.guests = email; opcoes.sendInvites = true; }

    const evento = agenda_().createEvent('💅 ' + servico.nome + ' – ' + nome, inicio, fim, opcoes);
    evento.setColor(CONFIG.COR_EVENTO);
    evento.setTag('origem', 'landing-page');
    evento.setTag('telefone', telefone);
    evento.removeAllReminders();
    evento.addPopupReminder(60);

    cache.put(chaveTel, String(usados + 1), 6 * 3600);

    if (CONFIG.NOTIFICAR_POR_EMAIL) {
      try {
        MailApp.sendEmail(
          Session.getEffectiveUser().getEmail(),
          'Novo agendamento: ' + nome + ' – ' + formatar_(inicio, "dd/MM 'às' HH:mm"),
          descricao + '\n\nData: ' + formatar_(inicio, "dd/MM/yyyy 'às' HH:mm")
        );
      } catch (ignorado) { /* sem cota de e-mail: o evento já foi criado */ }
    }

    return {
      ok: true,
      agendamento: {
        servico: servico.nome,
        data: b.data,
        hora: b.hora,
        fim: formatar_(fim, 'HH:mm'),
        inicioISO: inicio.toISOString(),
        fimISO: fim.toISOString(),
      },
    };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Utilitários ===================== */

function agenda_() {
  const cal = CONFIG.CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error('Agenda não encontrada. Confira CALENDAR_ID.');
  return cal;
}

function servicoOuErro_(id) {
  const s = CONFIG.SERVICOS[id];
  if (!s) throw erroUsuario_('Serviço inválido.');
  return s;
}

// No Apps Script, new Date(a, m, d, h, min) usa o fuso do projeto (appsscript.json).
function parseData_(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) throw erroUsuario_('Data inválida.');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function comHora_(dia, hhmm) {
  const p = hhmm.split(':');
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), Number(p[0]), Number(p[1]));
}

function inicioDoDia_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDias_(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function formatar_(d, padrao) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), padrao);
}

function formatarTelefone_(t) {
  const n = t.length > 11 ? t.slice(-11) : t;
  return n.length === 11
    ? '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7)
    : '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6);
}

function erroUsuario_(msg) {
  const e = new Error(msg);
  e.usuario = true;
  return e;
}

function mensagemErro_(err) {
  if (err && err.usuario) return err.message;
  console.error(err);
  return 'Não foi possível concluir agora. Tente novamente ou chame no WhatsApp.';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rode esta função uma vez no editor para autorizar o acesso à agenda e testar. */
function testarConfiguracao() {
  const r = disponibilidade_('aplicacao', null, 7);
  console.log('Agenda: ' + agenda_().getName() + ' | fuso: ' + Session.getScriptTimeZone());
  r.dias.forEach(function (d) {
    const livres = d.horarios.filter(function (h) { return h.status === 'livre'; }).map(function (h) { return h.hora; });
    console.log(d.data + (d.fechado ? ' fechado' : ' livres: ' + livres.join(', ')));
  });
}
