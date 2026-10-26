import { data, settings, add, update, remove, batch, newId } from '../db.js';
import { h, formModal, confirmDialog, fmtDate, toast } from '../ui.js';

const OWNERS = [['daniel', 'Daniel'], ['mireasa', 'Mireasa']];
const TEMPLATE = [ // [zile înainte de nuntă, titlu, categorie]
  [365, 'Stabilește bugetul total', 'Buget'], [365, 'Alege locația', 'Locație'], [330, 'Întocmește lista preliminară de invitați', 'Invitați'],
  [300, 'Rezervă fotograf și videograf', 'Foto/video'], [300, 'Rezervă formația / DJ', 'Muzică'], [240, 'Alege nașii și cununia', 'Organizare'],
  [210, 'Caută rochia și costumul', 'Ținute'], [180, 'Alege decorul și florile', 'Decor'], [150, 'Stabilește meniul cu locația', 'Mâncare/băutură'],
  [120, 'Rezervă cazare pentru invitați', 'Cazare'], [120, 'Programează acte și cununia civilă', 'Organizare'], [100, 'Comandă invitațiile', 'Invitații'],
  [75, 'Trimite invitațiile', 'Invitați'], [60, 'Rezervă transportul', 'Transport'], [45, 'Probă finală rochie / costum', 'Ținute'],
  [30, 'Confirmă RSVP-urile', 'Invitați'], [21, 'Finalizează planul meselor', 'Mese'], [14, 'Confirmă toți furnizorii și programul zilei', 'Organizare'],
  [7, 'Plătește restul avansurilor', 'Buget'], [3, 'Pregătește plicurile și bagajele', 'Diverse']
];
const todayStr = () => new Date().toISOString().slice(0, 10);
export const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const weddingDate = () => settings.weddingDate || '2027-08-14';
let view = '30';

export const upcoming = (days = 30) => data('tasks').filter(t => !t.done && t.due && t.due <= addDays(todayStr(), days)).sort((a, b) => a.due.localeCompare(b.due));

const taskFields = () => [
  { name: 'title', label: 'Sarcină', required: true }, { name: 'due', label: 'Termen', type: 'date' }, { name: 'category', label: 'Categorie' },
  { name: 'owner', label: 'Responsabil', type: 'select', options: OWNERS, default: 'daniel' }, { name: 'done', label: 'Terminată', type: 'checkbox' }];
const editTask = t => formModal(t ? 'Editează sarcina' : 'Sarcină nouă', taskFields(), t || {}, v => t ? update('tasks', t.id, v) : add('tasks', v));
const editItem = i => formModal(i ? 'Editează' : 'Moment nou', [
  { name: 'time', label: 'Ora', type: 'time', required: true }, { name: 'title', label: 'Activitate', required: true }, { name: 'notes', label: 'Note', type: 'textarea' }],
  i || {}, v => i ? update('schedule', i.id, v) : add('schedule', v));

async function genTemplate() {
  const date = weddingDate();
  if (data('tasks').some(t => t.template) && !await confirmDialog('Există deja sarcini din șablon. Adaug din nou (posibile dubluri)?')) return;
  await batch(TEMPLATE.map(([d, title, category]) => ({ type: 'set', col: 'tasks', id: newId('tasks'), data: { title, category, due: [addDays(date, -d), todayStr()].sort().pop(), owner: 'daniel', done: false, template: true } })));
  toast(`${TEMPLATE.length} sarcini adăugate, calculate de la ${fmtDate(date)}`);
}

const row = t => h('div', { class: `grow task ${t.done ? 'done' : ''}` },
  h('input', { type: 'checkbox', checked: !!t.done, onchange: e => update('tasks', t.id, { done: e.target.checked }) }),
  h('div', { class: 'ginfo', onclick: () => editTask(t) }, h('strong', {}, t.title),
    h('div', { class: `small ${!t.done && t.due && t.due < todayStr() ? 'late' : 'muted'}` }, [fmtDate(t.due), t.category, OWNERS.find(o => o[0] === t.owner)?.[1]].filter(Boolean).join(' · '))),
  h('button', { class: 'btn small', onclick: async () => (await confirmDialog('Ștergi sarcina?')) && remove('tasks', t.id) }, '🗑'));

export function render(el) {
  const tasks = data('tasks').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const tab = (v, l) => h('button', { class: `btn ${view === v ? 'active' : ''}`, onclick: () => { view = v; render(el); } }, l);
  let body;
  if (view === 'day') {
    const items = data('schedule').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    body = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', {}, `Programul zilei · ${fmtDate(weddingDate())}`), h('button', { class: 'btn primary', onclick: () => editItem() }, '+ Moment')),
      items.length ? items.map(i => h('div', { class: 'grow' }, h('b', {}, i.time), h('div', { class: 'ginfo', onclick: () => editItem(i) }, i.title, i.notes ? h('div', { class: 'muted small' }, i.notes) : null),
        h('button', { class: 'btn small', onclick: async () => (await confirmDialog('Ștergi?')) && remove('schedule', i.id) }, '🗑'))) : h('p', { class: 'muted' }, 'Niciun moment încă.'));
  } else if (view === 'months') {
    const by = {};
    tasks.forEach(t => { const k = t.due ? t.due.slice(0, 7) : 'fără termen'; (by[k] ||= []).push(t); });
    body = Object.entries(by).map(([k, l]) => h('div', { class: 'card' }, h('h3', {}, k === 'fără termen' ? k : new Date(k + '-15').toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' }), h('span', { class: 'muted small' }, ` (${l.filter(t => t.done).length}/${l.length})`)), l.map(row)));
    if (!body.length) body = h('p', { class: 'muted' }, 'Nicio sarcină. Generează din șablon.');
  } else {
    const l = upcoming(30), late = l.filter(t => t.due < todayStr());
    body = h('div', { class: 'card' }, h('h3', {}, 'Ce urmează în 30 de zile'), late.length ? h('p', { class: 'late small' }, `${late.length} întârziate`) : null,
      l.length ? l.map(row) : h('p', { class: 'muted' }, 'Nimic scadent în 30 de zile.'));
  }
  el.replaceChildren(h('div', { class: 'tabs' }, tab('30', '30 de zile'), tab('months', 'Pe luni'), tab('day', 'Ziua nunții')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => editTask() }, '+ Sarcină'), h('button', { class: 'btn', onclick: genTemplate }, 'Generează din șablon')), ...[].concat(body));
}
