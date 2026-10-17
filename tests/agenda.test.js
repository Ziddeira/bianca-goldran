// Testes da lógica da agenda com um Google Agenda simulado.
// Rodar com:  TZ=America/Sao_Paulo node --test tests/
process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const igual = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));

function carregar() {
  const eventos = [];
  const emails = [];
  const cache = new Map();
  const calendario = {
    getName: () => 'Bianca',
    getEvents: (ini, fim) => eventos.filter(e => e.start < fim && e.end > ini).map(e => ({
      getTitle: () => e.title, getStartTime: () => e.start, getEndTime: () => e.end,
      getDescription: () => e.description || '', getMyStatus: () => e.status || 'OWNER',
    })),
    createEvent: (title, start, end, opts) => {
      const e = { title, start, end, description: opts.description, location: opts.location };
      eventos.push(e);
      return { setColor: c => { e.color = c; }, removeAllReminders() {}, addPopupReminder(m) { e.reminder = m; } };
    },
  };
  const ctx = {
    console, Date, JSON, Math, Number, String, Object, Error,
    CalendarApp: { getDefaultCalendar: () => calendario, getCalendarById: () => calendario, GuestStatus: { NO: 'NO' } },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) },
    MailApp: { sendEmail: (to, assunto, corpo) => emails.push({ to, assunto, corpo }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'bianca@example.com' }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8') + '\n;globalThis.CONFIG = CONFIG;', ctx);
  const get = p => JSON.parse(ctx.doGet({ parameter: p }).s);
  const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
  return { ctx, eventos, emails, get, post };
}

const d = (s, hm = '00:00') => { const [a, m, dd] = s.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(a, m - 1, dd, h, mi); };
const fmt = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
function proximaSegunda(diasMin = 3) {
  const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + diasMin);
  while (x.getDay() !== 1) x.setDate(x.getDate() + 1);
  return fmt(x);
}

// Segunda-feira 19/10/2026; "agora" = sexta anterior
const SEG = '2026-10-19';
const AGORA = d('2026-10-16', '08:00');

test('dia livre: aplicação (2h30) oferece 09:00 até 16:30', () => {
  const { ctx } = carregar();
  const s = ctx.slotsDoDia(SEG, [], 'aplicacao', AGORA, ctx.CONFIG);
  assert.strictEqual(s[0], '09:00');
  assert.strictEqual(s[s.length - 1], '16:30');
  assert.strictEqual(s.length, 16);
});

test('dia livre: manutenção (1h30) termina às 17:30', () => {
  const { ctx } = carregar();
  const s = ctx.slotsDoDia(SEG, [], 'manutencao', AGORA, ctx.CONFIG);
  assert.strictEqual(s[s.length - 1], '17:30');
});

test('evento na agenda bloqueia o horário com folga de 15 min', () => {
  const { ctx } = carregar();
  const ocupado = [{ start: d(SEG, '11:00'), end: d(SEG, '12:00') }];
  const s = ctx.slotsDoDia(SEG, ocupado, 'aplicacao', AGORA, ctx.CONFIG);
  igual(s, ['12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30']);
  const m = ctx.slotsDoDia(SEG, ocupado, 'manutencao', AGORA, ctx.CONFIG);
  assert.ok(m.includes('09:00') && !m.includes('09:30'), 'manutenção 09:00–10:30 cabe, 09:30–11:00 não');
});

test('sábado e domingo ficam fechados', () => {
  const { ctx } = carregar();
  igual(ctx.slotsDoDia('2026-10-24', [], 'aplicacao', AGORA, ctx.CONFIG), []);
  assert.strictEqual(ctx.statusDoDia('2026-10-25', [], 'aplicacao', AGORA, ctx.CONFIG), 'fechado');
});

test('respeita antecedência mínima de 3h no próprio dia', () => {
  const { ctx } = carregar();
  const s = ctx.slotsDoDia(SEG, [], 'manutencao', d(SEG, '10:10'), ctx.CONFIG);
  assert.strictEqual(s[0], '13:30');
});

test('folga de dia inteiro deixa o dia lotado; dia passado e além de 60 dias', () => {
  const { ctx } = carregar();
  const folga = [{ start: d(SEG), end: d('2026-10-20') }];
  assert.strictEqual(ctx.statusDoDia(SEG, folga, 'aplicacao', AGORA, ctx.CONFIG), 'lotado');
  assert.strictEqual(ctx.statusDoDia('2026-10-15', [], 'aplicacao', AGORA, ctx.CONFIG), 'passado');
  assert.strictEqual(ctx.statusDoDia('2027-01-04', [], 'aplicacao', AGORA, ctx.CONFIG), 'fechado');
  assert.strictEqual(ctx.statusDoDia(SEG, [], 'aplicacao', AGORA, ctx.CONFIG), 'disponivel');
});

test('API: agenda, grava na agenda da Bianca e não deixa marcar o mesmo horário duas vezes', () => {
  const { get, post, eventos, emails } = carregar();
  const data = proximaSegunda();
  const antes = get({ acao: 'horarios', servico: 'aplicacao', data });
  assert.ok(antes.ok && antes.horarios.includes('09:00'));

  const r = post({ acao: 'agendar', servico: 'aplicacao', data, hora: '09:00', nome: 'Maria Souza', telefone: '(48) 99999-1234', obs: 'Primeira vez' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.strictEqual(eventos.length, 1);
  assert.match(eventos[0].title, /Aplicação Molde F1 — Maria Souza/);
  assert.match(eventos[0].description, /wa\.me\/5548999991234/);
  assert.strictEqual(eventos[0].end - eventos[0].start, 150 * 60000);
  assert.strictEqual(emails.length, 1);

  const depois = get({ acao: 'horarios', servico: 'aplicacao', data });
  assert.ok(!depois.horarios.includes('09:00') && !depois.horarios.includes('11:00'));
  assert.ok(depois.horarios.includes('11:45') === false && depois.horarios.includes('12:00'));

  const dup = post({ acao: 'agendar', servico: 'manutencao', data, hora: '09:00', nome: 'Ana', telefone: '48988887777' });
  assert.strictEqual(dup.codigo, 'HORARIO_INDISPONIVEL');
});

test('API: mês mostra status de cada dia e não vaza detalhes dos eventos', () => {
  const { get, post } = carregar();
  const data = proximaSegunda();
  post({ acao: 'agendar', servico: 'aplicacao', data, hora: '09:00', nome: 'Maria', telefone: '48999991234' });
  const r = get({ acao: 'mes', servico: 'aplicacao', mes: data.slice(0, 7) });
  assert.ok(r.ok);
  assert.strictEqual(r.dias[data], 'disponivel');
  assert.ok(!JSON.stringify(r).includes('Maria'));
  const sabados = Object.keys(r.dias).filter(k => d(k).getDay() === 6);
  assert.ok(sabados.every(k => ['fechado', 'passado'].includes(r.dias[k])));
});

test('API: validações, robô e limite por telefone', () => {
  const { post, eventos } = carregar();
  const data = proximaSegunda();
  assert.strictEqual(post({ acao: 'agendar', servico: 'aplicacao', data, hora: '09:00', nome: 'Jo', telefone: '123' }).codigo, 'TELEFONE_INVALIDO');
  assert.strictEqual(post({ acao: 'agendar', servico: 'unha-de-porcelana', data, hora: '09:00', nome: 'Jo', telefone: '48999991234' }).codigo, 'SERVICO_INVALIDO');
  assert.ok(post({ acao: 'agendar', servico: 'aplicacao', data, hora: '09:00', nome: 'Bot', telefone: '48999991234', site: 'spam.com' }).ignorado);
  assert.strictEqual(eventos.length, 0);

  assert.ok(post({ acao: 'agendar', servico: 'manutencao', data, hora: '09:00', nome: 'Lia', telefone: '48911112222' }).ok);
  assert.ok(post({ acao: 'agendar', servico: 'manutencao', data, hora: '14:00', nome: 'Lia', telefone: '48911112222' }).ok);
  assert.strictEqual(post({ acao: 'agendar', servico: 'manutencao', data, hora: '16:00', nome: 'Lia', telefone: '48911112222' }).codigo, 'LIMITE_TELEFONE');
});

test('eventos marcados com #livre não bloqueiam', () => {
  const { get, eventos } = carregar();
  const data = proximaSegunda();
  eventos.push({ title: 'Lembrete #livre', start: d(data, '09:00'), end: d(data, '19:00') });
  eventos.push({ title: 'Convite recusado', start: d(data, '09:00'), end: d(data, '19:00'), status: 'NO' });
  assert.strictEqual(get({ acao: 'horarios', servico: 'aplicacao', data }).horarios.length, 16);
});
