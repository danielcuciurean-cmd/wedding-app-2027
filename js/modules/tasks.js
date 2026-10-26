import { h } from '../ui.js';

export function render(el) {
  el.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'tasks'), h('p', { class: 'muted' }, 'În curând.')));
}
