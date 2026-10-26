import { data, settings, add, update, remove, batch, saveSettings } from '../db.js';
import { h, formModal, confirmDialog, fmtMoney, fmtDate } from '../ui.js';

export const CATEGORIES = ['Locație', 'Mâncare/băutură', 'Muzică', 'Foto/video', 'Ținute', 'Decor', 'Invitații', 'Cazare', 'Transport', 'Diverse'];
const STATUS = [['ofertat', 'Ofertat'], ['contractat', 'Contractat'], ['partial', 'Plătit parțial'], ['platit', 'Plătit']];
const CUR = [['RON', 'RON'], ['EUR', 'EUR']];
const rate = () => Number(settings.exchangeRateEur) || 5;
export const toRon = (n, cur) => (cur === 'EUR' ? n * rate() : n) || 0;
const todayStr = () => new Date().toISOString().slice(0, 10);

export function summary() {
  const exps = data('expenses'), pays = data('payments'), cats = data('categories');
  const cur = Object.fromEntries(exps.map(e => [e.id, e.currency]));
  const total = exps.reduce((s, e) => s + toRon(e.total, e.currency), 0);
  const paid = pays.filter(p => p.paid).reduce((s, p) => s + toRon(p.amount, cur[p.expenseId]), 0);
  const limit = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const upcoming = pays.filter(p => !p.paid && p.dueDate && p.dueDate <= limit && cur[p.expenseId])
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => ({ ...p, expense: exps.find(e => e.id === p.expenseId) }));
  const perCat = cats.map(c => {
    const es = exps.filter(e => e.categoryId === c.id);
    return { ...c, spent: es.reduce((s, e) => s + toRon(e.total, e.currency), 0),
      paid: es.reduce((s, e) => s + pays.filter(p => p.expenseId === e.id && p.paid).reduce((x, p) => x + toRon(p.amount, e.currency), 0), 0) };
  });
  return { total, paid, rest: total - paid, budget: Number(settings.budgetTotal) || 0, upcoming, perCat, over: perCat.filter(c => c.budget && c.spent > c.budget) };
}

const catOptions = () => [['', '— fără categorie —'], ...data('categories').map(c => [c.id, c.name])];

function editSettings() {
  formModal('Buget total și curs', [
    { name: 'budgetTotal', label: 'Buget total (RON)', type: 'number' },
    { name: 'exchangeRateEur', label: 'Curs 1 EUR = ? RON', type: 'number', default: 5 }
  ], settings, v => saveSettings(v));
}
function editCategory(c) {
  formModal(c ? 'Editează categorie' : 'Categorie nouă', [
    { name: 'name', label: 'Nume', required: true }, { name: 'budget', label: 'Buget categorie (RON)', type: 'number' }
  ], c || {}, v => c ? update('categories', c.id, v) : add('categories', v));
}
function editExpense(e) {
  formModal(e ? 'Editează cheltuiala' : 'Cheltuială nouă', [
    { name: 'vendor', label: 'Furnizor', required: true },
    { name: 'categoryId', label: 'Categorie', type: 'select', options: catOptions() },
    { name: 'total', label: 'Sumă totală', type: 'number', required: true },
    { name: 'currency', label: 'Monedă', type: 'select', options: CUR, default: 'RON' },
    { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'ofertat' },
    { name: 'contract', label: 'Număr contract' },
    { name: 'notes', label: 'Note', type: 'textarea' }
  ], e || {}, v => e ? update('expenses', e.id, v) : add('expenses', v));
}
function editPayment(p, expenseId) {
  formModal(p ? 'Editează plata' : 'Plată / rată nouă', [
    { name: 'amount', label: 'Sumă', type: 'number', required: true },
    { name: 'dueDate', label: 'Scadență', type: 'date' },
    { name: 'paid', label: 'Plătită', type: 'checkbox' },
    { name: 'paidDate', label: 'Data plății', type: 'date' }
  ], p || {}, v => {
    if (v.paid && !v.paidDate) v.paidDate = todayStr();
    return p ? update('payments', p.id, v) : add('payments', { ...v, expenseId });
  });
}
async function delExpense(e) {
  if (!await confirmDialog(`Ștergi cheltuiala „${e.vendor}” și plățile ei?`)) return;
  await batch([...data('payments').filter(p => p.expenseId === e.id).map(p => ({ type: 'delete', col: 'payments', id: p.id })), { type: 'delete', col: 'expenses', id: e.id }]);
}
async function delCategory(c) {
  if (!await confirmDialog(`Ștergi categoria „${c.name}”?`)) return;
  await batch([...data('expenses').filter(e => e.categoryId === c.id).map(e => ({ type: 'update', col: 'expenses', id: e.id, data: { categoryId: '' } })), { type: 'delete', col: 'categories', id: c.id }]);
}

const bar = (v, max) => h('div', { class: `bar ${max && v > max ? 'over' : ''}` }, h('i', { style: `width:${max ? Math.min(100, v / max * 100) : 0}%` }));

function expenseCard(e) {
  const pays = data('payments').filter(p => p.expenseId === e.id).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  const paid = pays.filter(p => p.paid).reduce((s, p) => s + p.amount, 0), cat = data('categories').find(c => c.id === e.categoryId);
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('div', {}, h('strong', {}, e.vendor), ' ', h('span', { class: 'pill' }, STATUS.find(s => s[0] === e.status)?.[1] || e.status),
      h('div', { class: 'muted small' }, [cat?.name, e.contract && `contract ${e.contract}`].filter(Boolean).join(' · '))),
      h('div', {}, h('button', { class: 'btn small', onclick: () => editExpense(e) }, '✎'), ' ', h('button', { class: 'btn small', onclick: () => delExpense(e) }, '🗑'))),
    h('p', {}, `${fmtMoney(e.total, e.currency)} · plătit ${fmtMoney(paid, e.currency)} · rest `, h('b', {}, fmtMoney(e.total - paid, e.currency))),
    bar(paid, e.total), e.notes ? h('p', { class: 'muted small' }, e.notes) : null,
    pays.map(p => h('div', { class: 'pay' },
      h('input', { type: 'checkbox', checked: !!p.paid, onchange: ev => update('payments', p.id, { paid: ev.target.checked, paidDate: ev.target.checked ? todayStr() : '' }) }),
      h('span', { class: 'ginfo' }, `${fmtMoney(p.amount, e.currency)} · ${p.paid ? 'plătit ' + fmtDate(p.paidDate) : 'scadent ' + (fmtDate(p.dueDate) || '—')}`),
      !p.paid && p.dueDate && p.dueDate < todayStr() ? h('span', { class: 'pill warn' }, 'întârziat') : null,
      h('button', { class: 'btn small', onclick: () => editPayment(p) }, '✎'), h('button', { class: 'btn small', onclick: async () => (await confirmDialog('Ștergi plata?')) && remove('payments', p.id) }, '🗑'))),
    h('button', { class: 'btn small', onclick: () => editPayment(null, e.id) }, '+ plată / rată'));
}

export function render(el) {
  const s = summary(), stat = (n, l) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, l));
  el.replaceChildren(...[
    h('div', { class: 'stats' }, stat(fmtMoney(s.budget), 'buget'), stat(fmtMoney(s.total), 'estimat'), stat(fmtMoney(s.paid), 'plătit'), stat(fmtMoney(s.rest), 'rest de plată')),
    bar(s.total, s.budget), s.budget && s.total > s.budget ? h('p', { class: 'late' }, `Depășești bugetul cu ${fmtMoney(s.total - s.budget)}.`) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: editSettings }, 'Buget total / curs'),
      h('button', { class: 'btn primary', onclick: () => editExpense() }, '+ Cheltuială'),
      h('button', { class: 'btn', onclick: () => editCategory() }, '+ Categorie'),
      !data('categories').length ? h('button', { class: 'btn', onclick: () => batch(CATEGORIES.map(name => ({ type: 'set', col: 'categories', id: 'c' + name.replace(/\W/g, ''), data: { name, budget: 0 } }))) }, 'Adaugă categoriile standard') : null),
    s.upcoming.length ? h('div', { class: 'card' }, h('h3', {}, 'Scadențe în 30 de zile'),
      s.upcoming.map(p => h('div', { class: 'pay' }, h('span', { class: p.dueDate < todayStr() ? 'late' : '' }, fmtDate(p.dueDate)), h('span', { class: 'ginfo' }, p.expense.vendor), fmtMoney(p.amount, p.expense.currency)))) : null,
    s.perCat.length ? h('div', { class: 'card' }, h('h3', {}, 'Pe categorii'),
      s.perCat.map(c => h('div', {}, h('div', { class: 'row between' }, h('span', {}, c.name, c.budget && c.spent > c.budget ? h('span', { class: 'pill warn' }, 'depășit') : null),
        h('span', {}, `${fmtMoney(c.spent)} / ${fmtMoney(c.budget)} `, h('button', { class: 'btn small', onclick: () => editCategory(c) }, '✎'), ' ', h('button', { class: 'btn small', onclick: () => delCategory(c) }, '🗑'))), bar(c.spent, c.budget)))) : null,
    h('h3', {}, 'Cheltuieli'), ...(data('expenses').length ? data('expenses').sort((a, b) => a.vendor.localeCompare(b.vendor, 'ro')).map(expenseCard) : [h('p', { class: 'muted' }, 'Nicio cheltuială încă.')])].filter(Boolean));
}
