import { data, add, update, remove, batch } from '../db.js';
import { h, formModal, confirmDialog, modal, toast } from '../ui.js';

const SHAPES = [['round', 'Rotundă'], ['rect', 'Dreptunghiulară'], ['honor', 'Masă de onoare']];
const SIZE = { round: [110, 110], rect: [160, 80], honor: [260, 70] };
export let noAutoRender = false;
let selTable = '', selGuest = '', onRedraw = null, moveMode = false;

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ro', { numeric: true });
const seated = id => data('guests').filter(g => g.tableId === id && g.rsvp !== 'refuzat');

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
  const free = t.capacity - seated(tableId).length;
  if (guestIds.length > free && !await confirmDialog(`Masa „${t.name}” are ${Math.max(free, 0)} locuri libere, iar tu aloci ${guestIds.length}. Depășești capacitatea. Continui?`)) return;
  await batch(guestIds.map(id => ({ type: 'update', col: 'guests', id, data: { tableId } })));
  selGuest = '';
}

function assignGroup(gr) {
  const ids = data('guests').filter(g => g.groupId === gr.id && !g.tableId && g.rsvp !== 'refuzat').map(g => g.id);
  if (!ids.length) return toast('Nimeni nealocat în grup');
  formModal(`Alocă „${gr.name}” (${ids.length})`, [
    { name: 'tableId', label: 'Masa', type: 'select', options: data('tables').sort(byName).map(t => [t.id, `${t.name} (${seated(t.id).length}/${t.capacity})`]) }
  ], {}, v => assign(ids, v.tableId));
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
        h('span', {}, g.name, h('span', { class: 'muted small' }, groups[g.groupId] ? ` · ${groups[g.groupId]}` : '')))));
  };
  q.addEventListener('input', draw); draw(); upd();
  const m = modal(`Alocă la ${t.name} (${Math.max(t.capacity - seated(t.id).length, 0)} libere)`, h('div', {}, q, list, h('div', { class: 'row end' }, btn)));
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
  noAutoRender = true;
  const pos = ev => { ghost.style.left = ev.clientX + 8 + 'px'; ghost.style.top = ev.clientY + 8 + 'px'; };
  pos(e);
  let moved = false;
  const mv = ev => { moved = true; pos(ev); };
  const up = async ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    ghost.remove(); noAutoRender = false;
    const tgt = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-table]');
    if (moved && tgt) await assign([g.id], tgt.dataset.table);
    else if (moved) document.dispatchEvent(new Event('tables-redraw'));
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

export function cleanup() { if (onRedraw) document.removeEventListener('tables-redraw', onRedraw); onRedraw = null; }

export function render(el) {
  const tables = data('tables').sort(byName), guests = data('guests'), groups = data('groups');
  const active = guests.filter(g => g.rsvp !== 'refuzat');
  const free = active.filter(g => !g.tableId || !tables.some(t => t.id === g.tableId));
  const redraw = () => render(el);
  cleanup();
  onRedraw = () => { cleanup(); redraw(); };
  document.addEventListener('tables-redraw', onRedraw);

  const canvas = h('div', { class: `canvas ${moveMode ? 'moving' : ''}` }, tables.map(t => {
    const [w, hh] = SIZE[t.shape] || SIZE.round, n = seated(t.id).length, over = n > t.capacity, rot = t.shape === 'round' ? 0 : (t.rotation || 0);
    const node = h('div', { class: `tbl ${t.shape} ${t.id === selTable ? 'sel' : ''} ${over ? 'over' : ''}`, 'data-table': t.id,
      style: `left:${t.x || 0}px;top:${t.y || 0}px;width:${w}px;height:${hh}px;transform:rotate(${rot}deg)` },
      h('div', { class: 'tlabel', style: `transform:rotate(${-rot}deg)` }, h('b', {}, t.name), h('span', {}, `${n}/${t.capacity}`)));
    node.addEventListener('pointerdown', e => dragTable(e, t, node));
    node.addEventListener('click', async () => {
      if (node._h) { node._h = false; return; }
      selTable = t.id;
      if (selGuest) await assign([selGuest], t.id); else redraw();
    });
    return node;
  }));

  const sel = tables.find(t => t.id === selTable);
  const detail = sel ? h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h3', {}, `${sel.name} · ${seated(sel.id).length}/${sel.capacity}`),
      h('span', {}, h('button', { class: 'btn small', onclick: () => editTable(sel) }, '✎'), ' ',
        h('button', { class: 'btn small', onclick: async () => {
          if (!await confirmDialog(`Ștergi masa „${sel.name}”? Invitații vor deveni nealocați.`)) return;
          await batch([...guests.filter(g => g.tableId === sel.id).map(g => ({ type: 'update', col: 'guests', id: g.id, data: { tableId: '' } })),
            { type: 'delete', col: 'tables', id: sel.id }]);
          selTable = '';
        } }, '🗑'))),
    h('p', { class: 'muted small' }, `Locuri libere: ${Math.max(sel.capacity - seated(sel.id).length, 0)}`),
    h('button', { class: 'btn primary', onclick: () => pickGuests(sel) }, '+ Alocă invitați'),
    h('div', { class: 'row', style: 'margin:.6rem 0' }, h('span', { class: 'muted small' }, 'Mută masa:'),
      [['◀', -30, 0], ['▲', 0, -30], ['▼', 0, 30], ['▶', 30, 0]].map(([l, dx, dy]) => h('button', { class: 'btn small', onclick: () => nudge(sel, dx, dy) }, l))),
    seated(sel.id).sort(byName).map(g => h('div', { class: 'grow' }, h('span', { class: 'ginfo' }, g.name),
      h('button', { class: 'btn small', onclick: () => update('guests', g.id, { tableId: '' }) }, 'Scoate')))) : null;

  const chip = g => {
    const c = h('div', { class: `chip ${g.id === selGuest ? 'sel' : ''}`, onclick: () => { selGuest = selGuest === g.id ? '' : g.id; redraw(); } }, g.name);
    c.addEventListener('pointerdown', e => dragGuest(e, g, c));
    return c;
  };
  const pool = h('div', { class: 'card no-print' }, h('h3', {}, `Nealocați (${free.length})`),
    selGuest ? h('p', { class: 'muted small' }, 'Atinge acum o masă ca să-l aloci.') : h('p', { class: 'muted small' }, 'Trage un invitat pe masă (mouse) sau atinge-l, apoi atinge masa.'),
    [...groups.sort(byName), { id: '', name: 'Fără grup' }].map(gr => {
      const m = free.filter(g => (g.groupId || '') === gr.id).sort(byName); if (!m.length) return null;
      return h('div', {}, h('div', { class: 'row between' }, h('strong', {}, `${gr.name} (${m.length})`),
        gr.id ? h('button', { class: 'btn small', onclick: () => assignGroup(gr) }, 'Alocă grupul') : null),
        h('div', { class: 'chips' }, m.map(chip)));
    }));

  const printList = h('div', { class: 'print-only' }, h('h2', {}, 'Plan mese'),
    tables.map(t => h('div', { class: 'ptable' }, h('b', {}, `${t.name} (${seated(t.id).length}/${t.capacity})`), ': ', seated(t.id).sort(byName).map(g => g.name).join(', ') || '—')));

  el.replaceChildren(
    h('div', { class: 'row no-print' },
      h('button', { class: 'btn primary', onclick: () => editTable() }, '+ Masă'),
      h('button', { class: 'btn', onclick: () => window.print() }, 'Printează / PDF'),
      h('button', { class: 'btn', onclick: arrange }, 'Aranjează în grilă'),
      h('button', { class: `btn ${moveMode ? 'primary' : ''}`, onclick: () => { moveMode = !moveMode; redraw(); } }, moveMode ? 'Mutare: ACTIVĂ' : 'Mută mesele'),
      h('span', { class: 'muted small' }, `${tables.reduce((s, t) => s + t.capacity, 0)} locuri, ${active.length - free.length} alocați`)),
    moveMode ? h('p', { class: 'muted small no-print' }, 'Mutare activă: trage mesele cu degetul. Dezactivează pentru a derula pagina.') : '',
    h('div', { class: 'canvas-wrap' }, canvas),
    h('div', { class: 'no-print' }, detail || '', pool), printList);
}
