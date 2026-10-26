import { data, settings, saveSettings } from '../db.js';
import { h, fmtMoney, fmtDate, formModal } from '../ui.js';
import { stats } from './guests.js';
import { summary } from './budget.js';
import { upcoming } from './tasks.js';

export function render(el) {
  const date = settings.weddingDate || '2027-08-14';
  const days = Math.ceil((new Date(date + 'T12:00:00') - Date.now()) / 864e5);
  const g = stats(), b = summary(), tasks = upcoming(30).slice(0, 5);
  const free = data('guests').filter(x => x.rsvp !== 'refuzat' && !x.tableId).length;
  const card = (t, ...k) => h('div', { class: 'card' }, h('h3', {}, t), ...k);
  el.replaceChildren(
    card('Nunta', h('div', { class: 'big' }, days >= 0 ? `${days} zile` : 'A trecut'), h('p', { class: 'muted' }, fmtDate(date) + ' '),
      h('button', { class: 'btn small', onclick: () => formModal('Data nunții', [{ name: 'weddingDate', label: 'Data', type: 'date', required: true }], { weddingDate: date }, v => saveSettings(v)) }, 'Schimbă data')),
    card('Invitați', h('p', {}, `${g.confirmat} confirmați, ${g.asteptare} în așteptare, ${g.refuzat} refuzați (din ${g.total})`), h('p', { class: 'muted small' }, `${free} fără masă`), h('a', { href: '#/guests' }, 'Vezi invitații')),
    card('Buget', h('p', {}, `Estimat ${fmtMoney(b.total)} din ${fmtMoney(b.budget)}`), h('p', { class: 'muted small' }, `Plătit ${fmtMoney(b.paid)} · rest ${fmtMoney(b.rest)}`),
      b.over.length ? h('p', { class: 'late small' }, 'Depășit: ' + b.over.map(c => c.name).join(', ')) : null,
      b.upcoming.length ? h('p', { class: 'small' }, `Următoarea scadență: ${fmtDate(b.upcoming[0].dueDate)} · ${b.upcoming[0].expense.vendor}`) : null, h('a', { href: '#/budget' }, 'Vezi bugetul')),
    card('Sarcini următoare', tasks.length ? tasks.map(t => h('div', { class: 'small' }, `${fmtDate(t.due)} · ${t.title}`)) : h('p', { class: 'muted' }, 'Nimic scadent în 30 de zile.'), h('a', { href: '#/tasks' }, 'Toate sarcinile')));
}
