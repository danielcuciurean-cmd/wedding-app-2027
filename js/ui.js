export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, type = 'info') {
  const t = h('div', { class: `toast ${type}` }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

export function modal(title, content, { onClose } = {}) {
  const close = () => { back.remove(); onClose?.(); };
  const back = h('div', { class: 'modal-back', onclick: e => e.target === back && close() },
    h('div', { class: 'modal card', role: 'dialog' },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'btn small', onclick: close }, '✕')),
      content));
  document.body.append(back);
  return { close, el: back };
}

export function confirmDialog(msg) {
  return new Promise(res => {
    const m = modal('Confirmare', h('div', {},
      h('p', {}, msg),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => { m.close(); res(false); } }, 'Anulează'),
        h('button', { class: 'btn danger', onclick: () => { m.close(); res(true); } }, 'Confirmă'))),
      { onClose: () => res(false) });
  });
}

// fields: [{name,label,type:'text'|'number'|'date'|'select'|'checkbox'|'textarea', options:[[value,label]], required}]
export function formModal(title, fields, values = {}, onSubmit) {
  const form = h('form', { class: 'form' },
    fields.map(f => {
      let input;
      const v = values[f.name] ?? f.default ?? '';
      if (f.type === 'select')
        input = h('select', { name: f.name }, f.options.map(([val, lab]) => h('option', { value: val, selected: String(val) === String(v) }, lab)));
      else if (f.type === 'textarea') input = h('textarea', { name: f.name, rows: 3 }, v);
      else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', name: f.name, checked: !!v });
      else input = h('input', { type: f.type || 'text', name: f.name, value: v, required: f.required, step: f.type === 'number' ? 'any' : null });
      return h('label', { class: f.type === 'checkbox' ? 'check' : '' }, f.label, input);
    }),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'submit' }, 'Salvează')));
  const m = modal(title, form);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value.trim();
    }
    try { await onSubmit(out); m.close(); } catch (err) { console.error(err); toast('Eroare la salvare', 'error'); }
  });
  return m;
}

export const fmtMoney = (n, cur = 'RON') => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0);
export const fmtDate = d => d ? new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
