import { data, add, update, remove, batch } from '../db.js';
import { h, formModal, confirmDialog, modal, toast } from '../ui.js';
import { editGuest } from './guests.js';

const SHAPES = [['round', 'Rotundă'], ['rect', 'Dreptunghiulară'], ['honor', 'Masă de onoare']];
const SIZE = { round: [110, 110], rect: [160, 80], honor: [260, 70] };
export let noAutoRender = false;
let selTable = '', selGuest = '', onRedraw = null, onKey = null, redrawFn = null, moveMode = false, poolQ = '';

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ro', { numeric: true });
const seated = id => data('guests').filter(g => g.tableId === id && g.rsvp !== 'refuzat');
const w = g => 1 + (Number(g.kidsCount) || 0); // un invitat cu copii ocupă mai multe locuri
const confirmedCount = id => seated(id).filter(g => g.rsvp === 'confirmat').length;
const toggleRsvp = g => update('guests', g.id, { rsvp: g.rsvp === 'confirmat' ? 'necunoscut' : 'confirmat' });
const confirmBox = g => {
  const b = h('input', { type: 'checkbox', class: 'rsvp-box', title: 'Confirmat', checked: g.rsvp === 'confirmat', onchange: () => toggleRsvp(g) });
  ['click', 'pointerdown'].forEach(ev => b.addEventListener(ev, e => e.stopPropagation()));
  return b;
};
const used = id => seated(id).reduce((n, g) => n + w(g), 0);

const CELL_W = 200, CELL_H = 150, COLS = 5;
const gridPos = i => ({ x: 20 + (i % COLS) * CELL_W, y: 20 + Math.floor(i / COLS) * CELL_H });
function freeSpot() {
  const ts = data('tables');
  for (let i = 0; i < 200; i++) {
    const p = gridPos(i);
    if (!ts.some(t => Math.abs((t.x || 0) - p.x) < 120 && Math.abs((t.y || 0) - p.y) < 100)) return p;
  }
  return gridPos(ts.length);
}
async function arrange() {
  if (!await confirmDialog('Aranjez toate mesele în grilă? Pozițiile actuale se pierd.')) return;
  await batch(data('tables').sort(byName).map((t, i) => ({ type: 'update', col: 'tables', id: t.id, data: gridPos(i) })));
}
const nudge = (t, dx, dy) => update('tables', t.id, { x: Math.max(0, (t.x || 0) + dx), y: Math.max(0, (t.y || 0) + dy) });

function editTable(t) {
  formModal(t ? 'Editează masa' : 'Masă nouă', [
    { name: 'name', label: 'Nume / număr', required: true },
    { name: 'shape', label: 'Formă', type: 'select', options: SHAPES, default: 'round' },
    { name: 'capacity', label: 'Capacitate (locuri)', type: 'number', default: 10, required: true },
    { name: 'rotation', label: 'Rotație (grade, doar pentru mese dreptunghiulare)', type: 'number', default: 0 }
  ], t || {}, async v => {
    if (t) await update('tables', t.id, v);
    else await add('tables', { ...v, ...freeSpot() });
  });
}

async function assign(guestIds, tableId) {
  const t = data('tables').find(x => x.id === tableId); if (!t) return;
  guestIds = guestIds.filter(id => data('guests').find(g => g.id === id)?.tableId !== tableId); // deja la masa aceea
  if (!guestIds.length) return;
  const need = guestIds.reduce((n, id) => n + w(data('guests').find(g => g.id === id) || {}), 0);
  const free = t.capacity - used(tableId);
  if (need > free && !await confirmDialog(`Masa „${t.name}” are ${Math.max(free, 0)} locuri libere, iar tu aloci ${need} locuri. Depășești capacitatea. Continui?`)) return;
  await batch(guestIds.map(id => ({ type: 'update', col: 'guests', id, data: { tableId } })));
  selGuest = '';
}

function assignGroup(gr, presetTable) {
  const ids = data('guests').filter(g => g.groupId === gr.id && !g.tableId && g.rsvp !== 'refuzat').map(g => g.id);
  if (!ids.length) return toast('Nimeni nealocat în grup');
  if (presetTable) return assign(ids, presetTable);
  formModal(`Alocă „${gr.name}” (${ids.length})`, [
    { name: 'tableId', label: 'Masa', type: 'select', options: data('tables').sort(byName).map(t => [t.id, `${t.name} (${used(t.id)}/${t.capacity})`]) }
  ], {}, v => assign(ids, v.tableId));
}

function pickGroup() {
  const groups = data('groups').sort(byName).filter(g => data('guests').some(x => x.groupId === g.id && !x.tableId && x.rsvp !== 'refuzat'));
  if (!groups.length) return toast('Niciun grup cu invitați nealocați');
  formModal('Alocă un grup întreg', [
    { name: 'groupId', label: 'Grup', type: 'select', options: groups.map(g => [g.id, g.name]) },
    { name: 'tableId', label: 'Masa', type: 'select', options: data('tables').sort(byName).map(t => [t.id, `${t.name} (${used(t.id)}/${t.capacity})`]) }
  ], {}, v => assignGroup(data('groups').find(g => g.id === v.groupId), v.tableId));
}

function pickGuests(t) {
  const groups = Object.fromEntries(data('groups').map(g => [g.id, g.name]));
  const free = data('guests').filter(g => g.rsvp !== 'refuzat' && !g.tableId).sort(byName);
  if (!free.length) return toast('Nu mai sunt invitați nealocați');
  const picked = new Set();
  const list = h('div', { class: 'picklist' });
  const q = h('input', { type: 'search', placeholder: 'Caută invitat…' });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Alocă');
  const upd = () => { btn.textContent = `Alocă (${picked.size})`; };
  const draw = () => {
    const term = q.value.toLowerCase();
    list.replaceChildren(...free.filter(g => !term || g.name.toLowerCase().includes(term) || (groups[g.groupId] || '').toLowerCase().includes(term)).map(g =>
      h('label', { class: 'check pick' }, h('input', { type: 'checkbox', checked: picked.has(g.id), onchange: e => { e.target.checked ? picked.add(g.id) : picked.delete(g.id); upd(); } }),
        h('span', {}, g.name, h('span', { class: 'muted small' }, (groups[g.groupId] ? ` · ${groups[g.groupId]}` : '') + (g.kidsCount > 0 ? ` · +${g.kidsCount} copii` : ''))))));
  };
  q.addEventListener('input', draw); draw(); upd();
  const m = modal(`Alocă la ${t.name} (${Math.max(t.capacity - used(t.id), 0)} libere)`, h('div', {}, q, list, h('div', { class: 'row end' }, btn)));
  btn.addEventListener('click', async () => { if (!picked.size) return; m.close(); await assign([...picked], t.id); });
}

function dragTable(e, t, el) {
  if (e.button > 0) return;
  if (e.pointerType === 'touch' && !moveMode) return; // pe telefon: atingere = selectare, mutarea se activează explicit
  el._h = true;
  selTable = t.id;
  const sx = e.clientX, sy = e.clientY, ox = t.x || 0, oy = t.y || 0;
  let moved = false;
  noAutoRender = true;
  el.setPointerCapture(e.pointerId);
  const mv = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    el.style.left = Math.max(0, ox + dx) + 'px'; el.style.top = Math.max(0, oy + dy) + 'px';
  };
  const up = async ev => {
    el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    noAutoRender = false;
    if (moved) await update('tables', t.id, { x: Math.max(0, Math.round(ox + ev.clientX - sx)), y: Math.max(0, Math.round(oy + ev.clientY - sy)) });
    else if (selGuest) await assign([selGuest], t.id);
    else document.dispatchEvent(new Event('tables-redraw'));
  };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

// Drag cu mouse pentru invitați; pe touch: atingi invitatul, apoi masa.
function dragGuest(e, g, chip) {
  if (e.pointerType !== 'mouse' || e.button > 0) return;
  const ghost = h('div', { class: 'ghost' }, g.name); document.body.append(ghost);
  document.body.classList.add('dragging-guest'); // fereastra mesei devine transparentă ca să se poată lăsa numele pe mesele de sub ea
  noAutoRender = true;
  const pos = ev => { ghost.style.left = ev.clientX + 8 + 'px'; ghost.style.top = ev.clientY + 8 + 'px'; };
  pos(e);
  let moved = false;
  const mv = ev => { moved = true; pos(ev); };
  const up = async ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    const tgt = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-table]');
    ghost.remove(); noAutoRender = false; document.body.classList.remove('dragging-guest');
    if (moved && tgt) await assign([g.id], tgt.dataset.table);
    else if (moved) document.dispatchEvent(new Event('tables-redraw'));
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

export function cleanup() {
  if (onKey) document.removeEventListener('keydown', onKey); onKey = null;
  if (onRedraw) document.removeEventListener('tables-redraw', onRedraw); onRedraw = null; }

export function render(el) {
  const tables = data('tables').sort(byName), guests = data('guests'), groups = data('groups');
  const active = guests.filter(g => g.rsvp !== 'refuzat');
  const free = active.filter(g => !g.tableId || !tables.some(t => t.id === g.tableId));
  const redraw = () => render(el);
  el.classList.add('wide');
  cleanup();
  // Esc închide fereastra mesei (sau deselectează invitatul), dacă nu e un modal deschis.
  onKey = e => { if (e.key === 'Escape' && !document.querySelector('.modal-back') && (selTable || selGuest)) { selTable = ''; selGuest = ''; redraw(); } };
  document.addEventListener('keydown', onKey);
  onRedraw = () => { cleanup(); redraw(); };
  document.addEventListener('tables-redraw', onRedraw);

  const canvas = h('div', { class: `canvas ${moveMode ? 'moving' : ''}` }, tables.map(t => {
    const [w, hh] = SIZE[t.shape] || SIZE.round, n = used(t.id), over = n > t.capacity, ok = confirmedCount(t.id), allOk = n > 0 && ok === seated(t.id).length, rot = t.shape === 'round' ? 0 : (t.rotation || 0);
    const node = h('div', { class: `tbl ${t.shape} ${t.id === selTable ? 'sel' : ''} ${over ? 'over' : ''} ${allOk && !over ? 'allok' : ''}`, 'data-table': t.id,
      style: `left:${t.x || 0}px;top:${t.y || 0}px;width:${w}px;height:${hh}px;transform:rotate(${rot}deg)` },
      h('div', { class: 'tlabel', style: `transform:rotate(${-rot}deg)` }, h('b', {}, t.name), h('span', {}, `${n}/${t.capacity}`), seated(t.id).length ? h('span', { class: 'okline' }, `✓ ${ok}/${seated(t.id).length}`) : ''));
    node.addEventListener('pointerdown', e => dragTable(e, t, node));
    node.addEventListener('click', async () => {
      if (node._h) { node._h = false; return; }
      selTable = t.id;
      if (selGuest) await assign([selGuest], t.id); else redraw();
    });
    return node;
  }));

  const sel = tables.find(t => t.id === selTable);
  const selSize = sel ? (SIZE[sel.shape] || SIZE.round) : [0, 0];
  const detail = sel ? h('div', { class: 'card pop no-print', style: `left:${(sel.x || 0) + selSize[0] + 14}px;top:${sel.y || 0}px`, onpointerdown: e => e.stopPropagation() },
    h('div', { class: 'row between' }, h('h3', {}, `${sel.name} · ${used(sel.id)}/${sel.capacity}`),
      h('span', {}, h('button', { class: 'btn small', title: 'Închide', onclick: () => { selTable = ''; redraw(); } }, '✕'), ' ', h('button', { class: 'btn small', onclick: () => editTable(sel) }, '✎'), ' ',
        h('button', { class: 'btn small', onclick: async () => {
          if (!await confirmDialog(`Ștergi masa „${sel.name}”? Invitații vor deveni nealocați.`)) return;
          await batch([...guests.filter(g => g.tableId === sel.id).map(g => ({ type: 'update', col: 'guests', id: g.id, data: { tableId: '' } })),
            { type: 'delete', col: 'tables', id: sel.id }]);
          selTable = '';
        } }, '🗑'))),
    h('p', { class: 'muted small' }, `Locuri libere: ${Math.max(sel.capacity - used(sel.id), 0)}`),
    h('button', { class: 'btn primary', onclick: () => pickGuests(sel) }, '+ Alocă invitați'),
    h('div', { class: 'row', style: 'margin:.6rem 0' }, h('span', { class: 'muted small' }, 'Mută masa:'),
      [['◀', -30, 0], ['▲', 0, -30], ['▼', 0, 30], ['▶', 30, 0]].map(([l, dx, dy]) => h('button', { class: 'btn small', onclick: () => nudge(sel, dx, dy) }, l))),
    seated(sel.id).sort(byName).map(g => {
      const row = h('div', { class: `grow prow-move ${g.rsvp === 'confirmat' ? 'okrow' : ''}`, title: 'Trage pe altă masă ca să muți' }, confirmBox(g), h('span', { class: 'ginfo' }, g.name, g.kidsCount > 0 ? h('span', { class: 'tag' }, `+${g.kidsCount}`) : ''),
        h('select', { class: 'mv', title: 'Mută la altă masă', onchange: e => e.target.value && assign([g.id], e.target.value) },
          h('option', { value: '' }, '⇄'), tables.filter(x => x.id !== sel.id).map(x => h('option', { value: x.id }, `${x.name} (${used(x.id)}/${x.capacity})`))),
        h('button', { class: 'btn small', onclick: () => update('guests', g.id, { tableId: '' }) }, 'Scoate'));
      row.addEventListener('pointerdown', e => dragGuest(e, g, row));
      return row;
    })) : null;

  if (detail) canvas.append(detail);
  const gname = Object.fromEntries(groups.map(g => [g.id, g.name]));
  const item = g => {
    const c = h('div', { class: `pitem ${g.id === selGuest ? 'sel' : ''} ${g.rsvp === 'confirmat' ? 'okrow' : ''}`, onclick: () => { selGuest = selGuest === g.id ? '' : g.id; redraw(); } },
      h('span', { class: 'prow' }, confirmBox(g), g.name, g.kidsCount > 0 ? h('span', { class: 'tag' }, `+${g.kidsCount}`) : ''), h('span', { class: 'muted small' }, gname[g.groupId] || ''));
    c.addEventListener('pointerdown', e => dragGuest(e, g, c));
    return c;
  };
  const listBox = h('div', { class: 'plist' });
  const drawPool = () => {
    const q = poolQ.toLowerCase();
    const m = free.filter(g => !q || g.name.toLowerCase().includes(q) || (gname[g.groupId] || '').toLowerCase().includes(q)).sort(byName);
    listBox.replaceChildren(...(m.length ? m.map(item) : [h('p', { class: 'muted small' }, 'Niciun invitat nealocat.')]));
  };
  const search = h('input', { type: 'search', placeholder: 'Caută nealocat…', value: poolQ, oninput: e => { poolQ = e.target.value; drawPool(); } });
  const side = h('div', { class: 'card tbl-side no-print' },
    h('div', { class: 'row between' }, h('h3', {}, `Nealocați (${free.length})`),
      h('button', { class: 'btn small', onclick: pickGroup }, 'Alocă un grup')),
    h('p', { class: 'muted small' }, selGuest ? 'Atinge acum o masă ca să-l aloci.' : 'Trage un nume pe masă (mouse) sau atinge-l, apoi atinge masa. Bifa = confirmat.'),
    search, listBox);
  drawPool();

  const printList = h('div', { class: 'print-only' }, h('h2', {}, 'Plan mese'),
    tables.map(t => h('div', { class: 'ptable' }, h('b', {}, `${t.name} (${used(t.id)}/${t.capacity})`), ': ', seated(t.id).sort(byName).map(g => g.name).join(', ') || '—')));

  el.replaceChildren(
    h('div', { class: 'row no-print' },
      h('button', { class: 'btn primary', onclick: () => editTable() }, '+ Masă'),
      h('button', { class: 'btn primary', onclick: () => editGuest() }, '+ Invitat'),
      h('button', { class: 'btn', onclick: () => window.print() }, 'Printează / PDF'),
      h('button', { class: 'btn', onclick: arrange }, 'Aranjează în grilă'),
      h('button', { class: `btn ${moveMode ? 'primary' : ''}`, onclick: () => { moveMode = !moveMode; redraw(); } }, moveMode ? 'Mutare: ACTIVĂ' : 'Mută mesele'),
      h('span', { class: 'muted small' }, `${tables.reduce((s, t) => s + t.capacity, 0)} locuri, ${active.length - free.length} alocați`)),
    moveMode ? h('p', { class: 'muted small no-print' }, 'Mutare activă: trage mesele cu degetul. Dezactivează pentru a derula pagina.') : '',
    h('div', { class: 'tbl-layout' }, h('div', { class: 'canvas-wrap' }, canvas), side),
    printList);
}
