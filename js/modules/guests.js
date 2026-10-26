import { data, add, update, remove, batch, newId } from '../db.js';
import { h, formModal, confirmDialog, modal, toast } from '../ui.js';

export const SIDES = [['comun', 'Comun'], ['mire', 'Mire'], ['mireasa', 'Mireasă']];
export const RSVP = [['necunoscut', 'Necunoscut'], ['confirmat', 'Confirmat'], ['refuzat', 'Refuzat']];
export const MEALS = [['standard', 'Standard'], ['vegetarian', 'Vegetarian'], ['copil', 'Copil'], ['alt', 'Alt']];
const lab = (list, v) => (list.find(x => x[0] === v) || [, v || ''])[1];

// Starea filtrelor rămâne între re-desenări.
const F = { q: '', rsvp: '', side: '', group: '', lodging: '' };

const guestFields = () => [
  { name: 'name', label: 'Nume', required: true },
  { name: 'groupId', label: 'Grup', type: 'select', options: [['', '— fără grup —'], ...data('groups').sort(byName).map(g => [g.id, g.name])] },
  { name: 'newGroup', label: 'sau grup nou (nume)' },
  { name: 'side', label: 'Parte', type: 'select', options: SIDES, default: 'comun' },
  { name: 'isChild', label: 'Copil', type: 'checkbox' },
  { name: 'rsvp', label: 'RSVP', type: 'select', options: RSVP, default: 'necunoscut' },
  { name: 'meal', label: 'Meniu', type: 'select', options: MEALS, default: 'standard' },
  { name: 'dietary', label: 'Restricții alimentare' },
  { name: 'lodging', label: 'Cazare', type: 'checkbox' },
  { name: 'notes', label: 'Observații', type: 'textarea' }
];
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ro');

async function resolveGroup(v) {
  const name = (v.newGroup || '').trim();
  delete v.newGroup;
  if (name) {
    const ex = data('groups').find(g => g.name.toLowerCase() === name.toLowerCase());
    v.groupId = ex ? ex.id : await add('groups', { name, side: v.side, notes: '' });
  }
  return v;
}

function editGuest(g) {
  formModal(g ? 'Editează invitat' : 'Invitat nou', guestFields(), g || { groupId: F.group }, async v => {
    v = await resolveGroup(v);
    if (g) await update('guests', g.id, v); else await add('guests', { ...v, tableId: '', seat: null });
  });
}

function editGroup(g) {
  formModal(g ? 'Editează grup' : 'Grup nou', [
    { name: 'name', label: 'Nume grup', required: true },
    { name: 'side', label: 'Parte', type: 'select', options: SIDES, default: 'comun' },
    { name: 'notes', label: 'Observații', type: 'textarea' }
  ], g || {}, v => g ? update('groups', g.id, v) : add('groups', v));
}

async function delGuest(g) {
  if (await confirmDialog(`Ștergi invitatul „${g.name}”?`)) await remove('guests', g.id);
}
async function delGroup(g) {
  const n = data('guests').filter(x => x.groupId === g.id).length;
  if (!await confirmDialog(`Ștergi grupul „${g.name}”${n ? ` și cei ${n} invitați ai lui` : ''}?`)) return;
  await batch([
    ...data('guests').filter(x => x.groupId === g.id).map(x => ({ type: 'delete', col: 'guests', id: x.id })),
    { type: 'delete', col: 'groups', id: g.id }]);
}

export function stats(guests = data('guests')) {
  const c = r => guests.filter(g => g.rsvp === r).length;
  const meals = {};
  guests.filter(g => g.rsvp !== 'refuzat').forEach(g => { meals[g.meal || 'standard'] = (meals[g.meal || 'standard'] || 0) + 1; });
  return {
    total: guests.length, confirmat: c('confirmat'), refuzat: c('refuzat'), asteptare: c('necunoscut'),
    copii: guests.filter(g => g.isChild && g.rsvp !== 'refuzat').length,
    cazare: guests.filter(g => g.lodging && g.rsvp !== 'refuzat').length, meals
  };
}

function filtered() {
  const q = F.q.toLowerCase(), groups = Object.fromEntries(data('groups').map(g => [g.id, g]));
  return data('guests').filter(g =>
    (!q || [g.name, g.dietary, g.notes, groups[g.groupId]?.name].some(s => (s || '').toLowerCase().includes(q))) &&
    (!F.rsvp || g.rsvp === F.rsvp) && (!F.side || g.side === F.side) &&
    (!F.group || (F.group === '_none' ? !g.groupId : g.groupId === F.group)) &&
    (!F.lodging || (F.lodging === 'da') === !!g.lodging));
}

function guestRow(g) {
  return h('div', { class: 'grow' },
    h('div', { class: 'ginfo', onclick: () => editGuest(g) },
      h('strong', {}, g.name), g.isChild ? h('span', { class: 'tag' }, 'copil') : null,
      h('div', { class: 'muted small' }, [lab(SIDES, g.side), lab(MEALS, g.meal), g.dietary, g.lodging ? 'cazare' : ''].filter(Boolean).join(' · '))),
    h('select', { class: `rsvp ${g.rsvp}`, onchange: e => update('guests', g.id, { rsvp: e.target.value }) },
      RSVP.map(([v, l]) => h('option', { value: v, selected: g.rsvp === v }, l))),
    h('button', { class: 'btn small', title: 'Șterge', onclick: () => delGuest(g) }, '🗑'));
}

function drawList(box, cnt) {
  const list = filtered(), groups = data('groups').sort(byName);
  cnt.textContent = `${list.length} din ${data('guests').length} invitați`;
  const blocks = [];
  for (const gr of [...groups, { id: '', name: 'Fără grup' }]) {
    const m = list.filter(x => (x.groupId || '') === gr.id).sort(byName);
    if (!m.length && (gr.id === '' || F.q || F.rsvp || F.side || F.lodging)) continue;
    if (!m.length && F.group && F.group !== gr.id) continue;
    blocks.push(h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('h3', {}, `${gr.name} `, h('span', { class: 'muted small' }, `(${m.length})`)),
        gr.id ? h('span', {}, h('button', { class: 'btn small', onclick: () => editGroup(gr) }, '✎'), ' ',
          h('button', { class: 'btn small', onclick: () => delGroup(gr) }, '🗑')) : null),
      m.map(guestRow)));
  }
  box.replaceChildren(...(blocks.length ? blocks : [h('p', { class: 'muted' }, 'Niciun invitat.')]));
}

// ---- CSV ----
const COLS = ['nume', 'grup', 'parte', 'copil', 'rsvp', 'meniu', 'restrictii', 'cazare', 'observatii'];
const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;

function exportCsv() {
  const gn = Object.fromEntries(data('groups').map(g => [g.id, g.name]));
  const rows = data('guests').sort(byName).map(g => [g.name, gn[g.groupId] || '', g.side, g.isChild ? 'da' : 'nu', g.rsvp, g.meal, g.dietary, g.lodging ? 'da' : 'nu', g.notes]);
  const csv = '﻿' + [COLS, ...rows].map(r => r.map(q).join(',')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'invitati.csv' });
  document.body.append(a); a.click(); a.remove();
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

async function importCsv(file) {
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return toast('Fișier gol', 'error');
  const head = rows[0].map(s => s.trim().toLowerCase());
  const col = n => head.indexOf(n);
  if (col('nume') < 0) return toast('Lipsește coloana „nume”', 'error');
  const oneOf = (v, list, d) => { v = (v || '').trim().toLowerCase(); return list.some(x => x[0] === v) ? v : d; };
  const yes = v => ['da', 'yes', 'true', '1', 'x'].includes((v || '').trim().toLowerCase());
  const ops = [], gid = Object.fromEntries(data('groups').map(g => [g.name.toLowerCase(), g.id]));
  let n = 0;
  for (const r of rows.slice(1)) {
    const get = k => (r[col(k)] ?? '').trim();
    const name = get('nume'); if (!name) continue;
    const gname = get('grup'), side = oneOf(get('parte'), SIDES, 'comun');
    let groupId = '';
    if (gname) {
      const key = gname.toLowerCase();
      if (!gid[key]) { gid[key] = newId('groups'); ops.push({ type: 'set', col: 'groups', id: gid[key], data: { name: gname, side, notes: '' } }); }
      groupId = gid[key];
    }
    ops.push({ type: 'set', col: 'guests', id: newId('guests'), data: {
      name, groupId, side, isChild: yes(get('copil')), rsvp: oneOf(get('rsvp'), RSVP, 'necunoscut'),
      meal: oneOf(get('meniu'), MEALS, 'standard'), dietary: get('restrictii'), lodging: yes(get('cazare')),
      notes: get('observatii'), tableId: '', seat: null } });
    n++;
  }
  await batch(ops);
  toast(`${n} invitați importați`);
}

function pickCsv() {
  const inp = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async () => {
    if (inp.files[0]) try { await importCsv(inp.files[0]); } catch (e) { console.error(e); toast('Import eșuat', 'error'); }
  } });
  inp.click();
}

// ---- Randare ----
export function render(el) {
  const s = stats(), groups = data('groups').sort(byName);
  const stat = (n, l) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, l));
  const sel = (key, opts, ph) => h('select', { onchange: e => { F[key] = e.target.value; drawList(box, cnt); } },
    h('option', { value: '' }, ph), opts.map(([v, l]) => h('option', { value: v, selected: F[key] === v }, l)));
  const cnt = h('p', { class: 'muted small' });
  const box = h('div', {});
  el.replaceChildren(
    h('div', { class: 'stats' }, stat(s.total, 'total'), stat(s.confirmat, 'confirmați'), stat(s.asteptare, 'în așteptare'),
      stat(s.refuzat, 'refuzați'), stat(s.copii, 'copii'), stat(s.cazare, 'cazare')),
    h('p', { class: 'muted small' }, 'Meniuri (fără refuzați): ' + (Object.entries(s.meals).map(([k, v]) => `${lab(MEALS, k)} ${v}`).join(', ') || '—')),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => editGuest() }, '+ Invitat'),
      h('button', { class: 'btn', onclick: () => editGroup() }, '+ Grup'),
      h('button', { class: 'btn', onclick: exportCsv }, 'Export CSV'),
      h('button', { class: 'btn', onclick: pickCsv }, 'Import CSV')),
    h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: 'Caută…', value: F.q, oninput: e => { F.q = e.target.value; drawList(box, cnt); } }),
      sel('rsvp', RSVP, 'RSVP: toate'), sel('side', SIDES, 'Parte: toate'),
      sel('group', [['_none', 'Fără grup'], ...groups.map(g => [g.id, g.name])], 'Grup: toate'),
      sel('lodging', [['da', 'Cu cazare'], ['nu', 'Fără cazare']], 'Cazare: toate')),
    cnt, box);
  drawList(box, cnt);
}
