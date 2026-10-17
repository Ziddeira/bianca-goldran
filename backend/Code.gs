/**
 * Agenda online · Bianca Gondran Nail Designer
 * ------------------------------------------------------------
 * Backend em Google Apps Script ligado ao Google Agenda da Bianca.
 * - GET  ?acao=mes&servico=aplicacao&mes=2026-10      -> status de cada dia do mês
 * - GET  ?acao=horarios&servico=aplicacao&data=2026-10-20 -> horários livres do dia
 * - POST {acao:'agendar', servico, data, hora, nome, telefone, obs} -> cria o evento
 *
 * Tudo que já estiver na agenda da Bianca (eventos, folgas de dia inteiro,
 * compromissos pessoais) bloqueia o horário automaticamente.
 * Para um evento NÃO bloquear a agenda, coloque #livre no título dele.
 *
 * Como publicar: veja LEIA-ME.md (passo a passo de 5 minutos).
 */

const CONFIG = {
  CALENDAR_ID: 'primary',              // agenda principal da conta que publicar o script
  DIAS_DE_ATENDIMENTO: [1, 2, 3, 4, 5], // 0=domingo, 1=segunda ... 6=sábado
  ABRE: '09:00',
  FECHA: '19:00',                       // o atendimento precisa TERMINAR até este horário
  PAUSAS: [],                           // ex.: [{ inicio: '12:00', fim: '13:00' }]
  PASSO_ENTRE_HORARIOS_MIN: 30,         // de quanto em quanto tempo oferecer horários
  FOLGA_ENTRE_CLIENTES_MIN: 15,         // respiro entre um atendimento e outro
  ANTECEDENCIA_MINIMA_HORAS: 3,         // não deixa marcar "para daqui a 10 minutos"
  DIAS_A_FRENTE: 60,                    // até quantos dias no futuro a agenda abre
  MAX_AGENDAMENTOS_FUTUROS_POR_TELEFONE: 2,
  MAX_AGENDAMENTOS_POR_HORA: 20,        // trava contra spam
  AVISAR_POR_EMAIL: true,               // manda e-mail para a Bianca a cada novo agendamento
  ENDERECO: 'R. Emerson Ferrari, 28 — Loja 17, Kobrasol, São José · SC',
  SERVICOS: {
    aplicacao:  { nome: 'Aplicação Molde F1',  duracaoMin: 150, cor: '4' }, // 4 = Flamingo
    manutencao: { nome: 'Manutenção Molde F1', duracaoMin: 90,  cor: '5' }, // 5 = Banana
  },
};

/* ===================== Rotas ===================== */

function doGet(e) {
  return responder_(() => {
    const p = (e && e.parameter) || {};
    const acao = p.acao || '';
    if (acao === 'mes') return statusDoMes_(p.servico, p.mes);
    if (acao === 'horarios') return horariosLivres_(p.servico, p.data);
    if (acao === 'config') return configPublica_();
    return { ok: true, msg: 'Agenda Bianca Gondran online' };
  });
}

function doPost(e) {
  return responder_(() => {
    let corpo = {};
    try { corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (err) { throw erro_('PEDIDO_INVALIDO', 'Não entendi o pedido enviado.'); }
    if (corpo.acao === 'agendar') return agendar_(corpo);
    throw erro_('ACAO_DESCONHECIDA', 'Ação desconhecida.');
  });
}

function responder_(fn) {
  let saida;
  try {
    saida = fn();
  } catch (err) {
    saida = { ok: false, codigo: err.codigo || 'ERRO', erro: err.codigo ? err.message : 'Não foi possível concluir agora. Tente de novo ou chame no WhatsApp.' };
    if (!err.codigo) console.error(err);
  }
  return ContentService.createTextOutput(JSON.stringify(saida)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Casos de uso ===================== */

function configPublica_() {
  const servicos = {};
  Object.keys(CONFIG.SERVICOS).forEach(k => {
    servicos[k] = { nome: CONFIG.SERVICOS[k].nome, duracaoMin: CONFIG.SERVICOS[k].duracaoMin };
  });
  return { ok: true, servicos, abre: CONFIG.ABRE, fecha: CONFIG.FECHA, diasDeAtendimento: CONFIG.DIAS_DE_ATENDIMENTO, diasAFrente: CONFIG.DIAS_A_FRENTE };
}

function statusDoMes_(servico, mes) {
  validarServico_(servico);
  if (!/^\d{4}-\d{2}$/.test(mes || '')) throw erro_('MES_INVALIDO', 'Mês inválido.');
  const [ano, m] = mes.split('-').map(Number);
  const inicio = new Date(ano, m - 1, 1);
  const fim = new Date(ano, m, 1);
  const ocupados = buscarOcupados_(inicio, fim);
  const agora = new Date();
  const dias = {};
  for (let d = new Date(inicio); d < fim; d.setDate(d.getDate() + 1)) {
    const data = fmtData_(d);
    dias[data] = statusDoDia(data, ocupados, servico, agora, CONFIG);
  }
  return { ok: true, servico, mes, dias };
}

function horariosLivres_(servico, data) {
  validarServico_(servico);
  validarData_(data);
  const dia = parseData_(data);
  const amanha = new Date(dia); amanha.setDate(amanha.getDate() + 1);
  const ocupados = buscarOcupados_(dia, amanha);
  return { ok: true, servico, data, horarios: slotsDoDia(data, ocupados, servico, new Date(), CONFIG) };
}

function agendar_(c) {
  // Robôs preenchem o campo escondido "site"; gente de verdade não.
  if (c.site) return { ok: true, ignorado: true };

  validarServico_(c.servico);
  validarData_(c.data);
  if (!/^\d{2}:\d{2}$/.test(c.hora || '')) throw erro_('HORA_INVALIDA', 'Horário inválido.');
  const nome = String(c.nome || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (nome.length < 2) throw erro_('NOME_INVALIDO', 'Informe seu nome.');
  const telefone = String(c.telefone || '').replace(/\D/g, '');
  if (telefone.length < 10 || telefone.length > 13) throw erro_('TELEFONE_INVALIDO', 'Informe um WhatsApp válido com DDD.');
  const obs = String(c.obs || '').trim().slice(0, 300);

  const cache = CacheService.getScriptCache();
  const chaveHora = 'ag_' + Math.floor(Date.now() / 3600000);
  if (Number(cache.get(chaveHora) || 0) >= CONFIG.MAX_AGENDAMENTOS_POR_HORA) {
    throw erro_('MUITOS_PEDIDOS', 'Muitos agendamentos agora. Chame a Bianca no WhatsApp.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw erro_('OCUPADO', 'A agenda está sendo atualizada. Tente de novo em instantes.');
  try {
    // Confere de novo, dentro da trava, se o horário continua livre.
    const livres = horariosLivres_(c.servico, c.data).horarios;
    if (livres.indexOf(c.hora) === -1) {
      throw erro_('HORARIO_INDISPONIVEL', 'Esse horário acabou de ser preenchido. Escolha outro, por favor.');
    }

    const cal = calendario_();
    const agora = new Date();
    const limite = new Date(agora.getTime() + CONFIG.DIAS_A_FRENTE * 86400000);
    const doMesmoNumero = cal.getEvents(agora, limite)
      .filter(ev => (ev.getDescription() || '').indexOf('Código: ' + telefone) !== -1);
    if (doMesmoNumero.length >= CONFIG.MAX_AGENDAMENTOS_FUTUROS_POR_TELEFONE) {
      throw erro_('LIMITE_TELEFONE', 'Você já tem horários marcados. Para mudar, chame a Bianca no WhatsApp.');
    }

    const servico = CONFIG.SERVICOS[c.servico];
    const inicio = combinar_(c.data, c.hora);
    const fim = new Date(inicio.getTime() + servico.duracaoMin * 60000);
    const zap = telefone.length <= 11 ? '55' + telefone : telefone;
    const descricao = [
      'Cliente: ' + nome,
      'WhatsApp: ' + formatarTelefone_(telefone),
      'Conversar: https://wa.me/' + zap,
      obs ? 'Observação: ' + obs : null,
      '',
      'Agendado pelo site em ' + formatarDataBR_(fmtData_(agora)) + ' às ' + fmtHora_(agora) + '.',
      'Código: ' + telefone,
    ].filter(l => l !== null).join('\n');

    const evento = cal.createEvent('💅 ' + servico.nome + ' — ' + nome, inicio, fim, {
      description: descricao,
      location: CONFIG.ENDERECO,
    });
    try { evento.setColor(servico.cor); } catch (err) { /* cor é opcional */ }
    try { evento.removeAllReminders(); evento.addPopupReminder(60); } catch (err) { /* lembrete é opcional */ }

    cache.put(chaveHora, String(Number(cache.get(chaveHora) || 0) + 1), 3600);

    if (CONFIG.AVISAR_POR_EMAIL) {
      try {
        MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
          'Novo agendamento: ' + servico.nome + ' · ' + formatarDataBR_(c.data) + ' às ' + c.hora,
          descricao + '\n\nJá está na sua Google Agenda.');
      } catch (err) { console.warn('E-mail não enviado: ' + err); }
    }

    return {
      ok: true,
      agendamento: { servico: c.servico, servicoNome: servico.nome, data: c.data, hora: c.hora, fim: fmtHora_(fim), nome },
    };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Regras de disponibilidade (puras, testáveis) ===================== */

/** Horários de início livres em um dia, considerando expediente, pausas, agenda e antecedência. */
function slotsDoDia(data, ocupados, servicoKey, agora, cfg) {
  const servico = cfg.SERVICOS[servicoKey];
  if (!servico) return [];
  const dia = parseData_(data);
  if (cfg.DIAS_DE_ATENDIMENTO.indexOf(dia.getDay()) === -1) return [];
  if (dia > limiteFuturo_(agora, cfg)) return [];

  const dur = servico.duracaoMin * 60000;
  const folga = cfg.FOLGA_ENTRE_CLIENTES_MIN * 60000;
  const minimo = agora.getTime() + cfg.ANTECEDENCIA_MINIMA_HORAS * 3600000;
  const abre = minutos_(cfg.ABRE), fecha = minutos_(cfg.FECHA);
  const pausas = (cfg.PAUSAS || []).map(p => ({
    start: combinar_(data, p.inicio).getTime(), end: combinar_(data, p.fim).getTime(),
  }));
  const bloqueios = ocupados.map(o => ({ start: o.start.getTime() - folga, end: o.end.getTime() + folga })).concat(pausas);

  const livres = [];
  for (let t = abre; t + servico.duracaoMin <= fecha; t += cfg.PASSO_ENTRE_HORARIOS_MIN) {
    const ini = dia.getTime() + t * 60000;
    if (ini < minimo) continue;
    const fim = ini + dur;
    const conflita = bloqueios.some(b => ini < b.end && fim > b.start);
    if (!conflita) livres.push(pad_(Math.floor(t / 60)) + ':' + pad_(t % 60));
  }
  return livres;
}

/** 'fechado' | 'passado' | 'lotado' | 'disponivel' */
function statusDoDia(data, ocupados, servicoKey, agora, cfg) {
  const dia = parseData_(data);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (dia < hoje) return 'passado';
  if (cfg.DIAS_DE_ATENDIMENTO.indexOf(dia.getDay()) === -1) return 'fechado';
  if (dia > limiteFuturo_(agora, cfg)) return 'fechado';
  const doDia = ocupados.filter(o => o.start < new Date(dia.getTime() + 86400000) && o.end > dia);
  return slotsDoDia(data, doDia, servicoKey, agora, cfg).length ? 'disponivel' : 'lotado';
}

function limiteFuturo_(agora, cfg) {
  const l = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  l.setDate(l.getDate() + cfg.DIAS_A_FRENTE);
  return l;
}

/* ===================== Agenda ===================== */

function calendario_() {
  const cal = CONFIG.CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw new Error('Agenda não encontrada: ' + CONFIG.CALENDAR_ID);
  return cal;
}

/** Intervalos ocupados (só horário, sem detalhes dos eventos) entre duas datas. */
function buscarOcupados_(inicio, fim) {
  return calendario_().getEvents(inicio, fim)
    .filter(ev => !/#livre/i.test(ev.getTitle() || ''))
    .filter(ev => {
      try { return ev.getMyStatus() !== CalendarApp.GuestStatus.NO; } catch (err) { return true; }
    })
    .map(ev => ({ start: ev.getStartTime(), end: ev.getEndTime() }));
}

/* ===================== Utilidades ===================== */

function validarServico_(s) {
  if (!CONFIG.SERVICOS[s]) throw erro_('SERVICO_INVALIDO', 'Serviço inválido.');
}
function validarData_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw erro_('DATA_INVALIDA', 'Data inválida.');
}
function erro_(codigo, msg) { const e = new Error(msg); e.codigo = codigo; return e; }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function minutos_(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
function parseData_(s) { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); }
function combinar_(data, hm) { const d = parseData_(data); const [h, m] = hm.split(':').map(Number); d.setHours(h, m, 0, 0); return d; }
function fmtData_(d) { return d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate()); }
function fmtHora_(d) { return pad_(d.getHours()) + ':' + pad_(d.getMinutes()); }
function formatarDataBR_(s) { const [a, m, d] = s.split('-'); return d + '/' + m + '/' + a; }
function formatarTelefone_(t) {
  const n = t.length > 11 ? t.slice(-11) : t;
  return n.length === 11 ? '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7) : '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6);
}

/* ===================== Para a Bianca rodar uma vez ===================== */

/** Rode esta função no editor uma vez: ela pede a autorização e mostra se está tudo certo. */
function testarConfiguracao() {
  const cal = calendario_();
  console.log('Agenda conectada: ' + cal.getName());
  const d = new Date();
  for (let i = 0; i < 10; i++) {
    const data = fmtData_(d);
    const r = horariosLivres_('aplicacao', data);
    console.log(data + ' -> ' + (r.horarios.length ? r.horarios.join(', ') : 'sem horários'));
    d.setDate(d.getDate() + 1);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { CONFIG, slotsDoDia, statusDoDia, doGet, doPost };
}
