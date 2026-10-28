// Executa Codigo.gs com serviços do Google simulados
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(process.argv[2], 'utf8');
const TZ = 'America/Sao_Paulo';
const eventos = [];
function ev(ini, fim, extra = {}) {
  return { getStartTime: () => ini, getEndTime: () => fim, isAllDayEvent: () => !!extra.allDay,
    getMyStatus: () => extra.status || 'OWNER', setColor(){}, setTag(){}, removeAllReminders(){}, addPopupReminder(){}, titulo: extra.titulo };
}
const cal = {
  getName: () => 'Bianca',
  getEvents: (a, b) => eventos.filter(e => e.getStartTime() < b && e.getEndTime() > a),
  createEvent: (t, a, b, o) => { const e = ev(a, b, { titulo: t }); eventos.push(e); return e; },
};
const cache = {};
const pad = n => String(n).padStart(2, '0');
const ctx = {
  console,
  CalendarApp: { getDefaultCalendar: () => cal, GuestStatus: { NO: 'NO' } },
  Session: { getScriptTimeZone: () => TZ, getEffectiveUser: () => ({ getEmail: () => 'b@x' }) },
  Utilities: { formatDate: (d, tz, p) => p
    .replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace(/'/g, '') },
  CacheService: { getScriptCache: () => ({ get: k => cache[k], put: (k, v) => cache[k] = v }) },
  LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
  MailApp: { sendEmail: (...a) => (ctx.emails = (ctx.emails || 0) + 1) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
};
vm.createContext(ctx); vm.runInContext(code, ctx);

// Próxima terça-feira a partir de amanhã
const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
const data = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const at = (h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
const disp = () => ctx.doGet({ parameter: { action: 'disponibilidade', servico: 'manutencao', inicio: data, dias: '1' } });
const fmt = r => r.dias[0].horarios.map(h => h.hora + (h.status === 'livre' ? '✓' : '✗')).join(' ');
let ok = true; const check = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) ok = false; };

let r = disp();
console.log('Sem eventos:', fmt(r));
// manutenção 2h, almoço 12-13, expediente 9-19, passo 60
check(fmt(r) === '09:00✓ 10:00✓ 11:00✗ 12:00✗ 13:00✓ 14:00✓ 15:00✓ 16:00✓ 17:00✓', 'grade padrão respeita almoço e fim do expediente');

eventos.push(ev(at(14), at(15, 30), { titulo: 'Cliente WhatsApp' }));
r = disp(); console.log('Com evento 14:00-15:30:', fmt(r));
check(r.dias[0].horarios.find(h => h.hora === '15:00').status === 'ocupado', 'evento manual deixa horário ocupado');
check(r.dias[0].horarios.find(h => h.hora === '16:00').status === 'livre', '16:00 livre (15:30 + 15min de intervalo)');
check(r.dias[0].horarios.find(h => h.hora === '13:00').status === 'ocupado', '13:00 ocupado (terminaria 15:00, conflita)');
check(!JSON.stringify(r).includes('Cliente WhatsApp'), 'título do evento não vaza para a página');

eventos.push(ev(at(16), at(17), { status: 'NO' }));
r = disp(); check(r.dias[0].horarios.find(h => h.hora === '16:00').status === 'livre', 'convite recusado não bloqueia');

const book = (extra = {}) => ctx.doPost({ postData: { contents: JSON.stringify(Object.assign(
  { action: 'agendar', servico: 'manutencao', data, hora: '09:00', nome: 'Maria Teste', telefone: '(11) 98765-4321' }, extra)) } });
let b = book(); check(b.ok && b.agendamento.fim === '11:00', 'agendamento criado 09:00–11:00');
check(eventos.some(e => /Maria Teste/.test(e.titulo || '')), 'evento gravado na agenda');
b = book({ telefone: '11911112222' }); check(!b.ok && /acabou de reservar/.test(b.erro), 'agendamento duplo bloqueado: ' + b.erro);
b = book({ hora: '09:30', telefone: '11933334444' }); check(!b.ok, 'horário fora da grade recusado: ' + b.erro);
b = book({ hora: '17:00' }); check(b.ok, '2º agendamento do mesmo telefone permitido');
b = book({ hora: '16:00' }); check(!b.ok && /agora há pouco/.test(b.erro), 'limite por telefone: ' + b.erro);
b = book({ website: 'spam', telefone: '11955556666', hora: '16:00' }); check(!b.ok, 'honeypot bloqueia robô');
b = book({ nome: 'x', telefone: '11977778888' }); check(!b.ok, 'validação de nome');
r = disp(); console.log('Final:', fmt(r));

// Domingo fechado e dia inteiro bloqueado
const dom = new Date(d); dom.setDate(d.getDate() + 5);
const s = `${dom.getFullYear()}-${pad(dom.getMonth()+1)}-${pad(dom.getDate())}`;
r = ctx.doGet({ parameter: { action: 'disponibilidade', servico: 'aplicacao', inicio: s, dias: '1' } });
check(r.dias[0].fechado === true, 'domingo fechado');
const qua = new Date(d); qua.setDate(d.getDate() + 1);
eventos.push(ev(new Date(qua.getFullYear(), qua.getMonth(), qua.getDate()), new Date(qua.getFullYear(), qua.getMonth(), qua.getDate() + 1), { allDay: true }));
r = ctx.doGet({ parameter: { action: 'disponibilidade', servico: 'aplicacao', inicio: data, dias: '2' } });
check(r.dias[1].horarios.every(h => h.status === 'ocupado'), 'evento de dia inteiro (folga) bloqueia o dia');
console.log('Aplicação terça:', fmt(r));
check(ctx.emails === 2, 'e-mail de aviso enviado a cada agendamento');
process.exit(ok ? 0 : 1);
