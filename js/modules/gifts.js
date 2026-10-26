import { data, add, set, remove, subscribe } from '../db.js';
import { h, formModal, confirmDialog, fmtMoney } from '../ui.js';

// Câmpurile se salvează la „change"; ecranul nu se redesenează automat ca să nu se piardă cursorul.
export const noAutoRender = true;
const LIMIT = 60;
let query = '', onlyGifts = false, unsub = null;

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ro');
const giftFor = id => data('gifts').find(g => g.id === id);

function totals() {
  const t = { RON: 0, EUR: 0, n: 0 };
  data('gifts').forEach(g => { if (g.amount > 0) { t[g.currency === 'EUR' ? 'EUR' : 'RON'] += g.amount; t.n++; } });
  return t;
}

async function save(guest, amount, currency) {
  const old = giftFor(guest.id);
  if (!(amount > 0)) { if (old) await remove('gifts', guest.id); return; }
  await set('gifts', guest.id, { guestId: guest.id, name: guest.name, amount, currency });
}

function row(guest, groups) {
  const g = giftFor(guest.id);
  const amount = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'sumă', value: g?.amount || '' });
  const cur = h('select', {}, ['RON', 'EUR'].map(c => h('option', { value: c, selected: (g?.currency || 'RON') === c }, c)));
  const go = () => save(guest, Number(amount.value), cur.value);
  amount.addEventListener('change', go); cur.addEventListener('change', go);
  return h('div', { class: 'grow gift' },
    h('div', { class: 'ginfo' }, h('strong', {}, guest.name), h('div', { class: 'muted small' }, groups[guest.groupId] || '')), amount, cur);
}

function extraRow(g) {
  return h('div', { class: 'grow gift' },
    h('div', { class: 'ginfo' }, h('strong', {}, g.name), g.notes ? h('div', { class: 'muted small' }, g.notes) : null),
    h('b', {}, fmtMoney(g.amount, g.currency || 'RON')),
    h('button', { class: 'btn small', onclick: async () => (await confirmDialog(`Ștergi cadoul de la „${g.name}”?`)) && remove('gifts', g.id) }, '🗑'));
}

export function cleanup() { unsub?.(); unsub = null; }

export function render(el) {
  cleanup();
  const groups = Object.fromEntries(data('groups').map(g => [g.id, g.name]));
  const tot = h('div', { class: 'stats three' });
  const list = h('div', { class: 'card' });
  const extras = h('div', { class: 'card' });

  const drawTotals = () => {
    const t = totals(), s = (n, l) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, l));
    tot.replaceChildren(s(fmtMoney(t.RON), 'RON'), s(fmtMoney(t.EUR, 'EUR'), 'EUR'), s(t.n, 'cadouri'));
    const ex = data('gifts').filter(g => !g.guestId).sort(byName);
    extras.replaceChildren(...(ex.length ? [h('h3', {}, 'Alte cadouri (nu sunt în listă)'), ...ex.map(extraRow)] : []));
    extras.classList.toggle('hidden', !ex.length);
  };
  const drawList = () => {
    const q = query.toLowerCase();
    const all = data('guests').filter(g => (!q || g.name.toLowerCase().includes(q) || (groups[g.groupId] || '').toLowerCase().includes(q)) && (!onlyGifts || giftFor(g.id))).sort(byName);
    list.replaceChildren(
      h('p', { class: 'muted small' }, all.length > LIMIT ? `Se arată ${LIMIT} din ${all.length}. Scrie în căutare ca să restrângi.` : `${all.length} invitați`),
      ...all.slice(0, LIMIT).map(g => row(g, groups)));
  };

  el.replaceChildren(tot,
    h('div', { class: 'row' },
      h('input', { type: 'search', placeholder: 'Caută invitat…', value: query, oninput: e => { query = e.target.value; drawList(); }, style: 'flex:1;min-width:160px;margin:0' }),
      h('label', { class: 'check', style: 'margin:0' }, h('input', { type: 'checkbox', checked: onlyGifts, onchange: e => { onlyGifts = e.target.checked; drawList(); } }), 'doar cu cadou'),
      h('button', { class: 'btn', onclick: () => formModal('Cadou de la altcineva', [
        { name: 'name', label: 'De la cine', required: true }, { name: 'amount', label: 'Sumă', type: 'number', required: true },
        { name: 'currency', label: 'Monedă', type: 'select', options: [['RON', 'RON'], ['EUR', 'EUR']], default: 'RON' }, { name: 'notes', label: 'Note' }],
        {}, v => add('gifts', { ...v, guestId: '' })) }, '+ Alt cadou')),
    list, extras);
  drawTotals(); drawList();
  unsub = subscribe(drawTotals);
}
