import { onAuth, login, logout, authErrorMessage } from './auth.js';
import { startSync, stopSync, subscribe } from './db.js';
import { $, h, toast } from './ui.js';

// Fiecare modul exportă { title, icon, render(container) } și opțional cleanup().
const ROUTES = [
  { path: 'dashboard', title: 'Acasă', icon: '🏠', load: () => import('./modules/dashboard.js') },
  { path: 'guests', title: 'Invitați', icon: '👥', load: () => import('./modules/guests.js') },
  { path: 'tables', title: 'Mese', icon: '🪑', load: () => import('./modules/tables.js') },
  { path: 'budget', title: 'Buget', icon: '💶', load: () => import('./modules/budget.js') },
  { path: 'gifts', title: 'Cadouri', icon: '🎁', load: () => import('./modules/gifts.js') },
  { path: 'tasks', title: 'Sarcini', icon: '✅', load: () => import('./modules/tasks.js') }
];

let current = null, unsubRender = null;

function buildNav() {
  const nav = $('#nav');
  nav.replaceChildren(...ROUTES.map(r => h('a', { href: `#/${r.path}`, 'data-path': r.path }, h('span', {}, r.icon), r.title)));
}

async function route() {
  const path = location.hash.replace(/^#\/?/, '').split('/')[0] || 'dashboard';
  const r = ROUTES.find(x => x.path === path) || ROUTES[0];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.path === r.path));
  current?.cleanup?.(); unsubRender?.();
  const view = $('#view');
  view.replaceChildren(h('p', { class: 'muted' }, 'Se încarcă…'));
  try {
    const mod = await r.load();
    current = mod;
    const draw = () => mod.render(view);
    draw();
    // Re-desenează la schimbări de date, dar nu cât timp un formular/modal este deschis.
    unsubRender = subscribe(() => { if (!document.querySelector('.modal-back') && !mod.noAutoRender) draw(); });
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('p', { class: 'error' }, 'Modulul nu a putut fi încărcat.'));
  }
}

function showLogin(show) {
  $('#login').classList.toggle('hidden', !show);
  $('#app').classList.toggle('hidden', show);
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target; $('#login-error').textContent = '';
  try { await login(f.email.value.trim(), f.password.value); }
  catch (err) { $('#login-error').textContent = authErrorMessage(err); }
});
$('#logout').addEventListener('click', () => logout());

function updateOnline() { $('#offline-badge').classList.toggle('hidden', navigator.onLine); }
addEventListener('online', updateOnline); addEventListener('offline', updateOnline);

let started = false;
onAuth(user => {
  if (!user) { stopSync(); showLogin(true); return; }
  showLogin(false); updateOnline();
  startSync();
  if (!started) { started = true; buildNav(); addEventListener('hashchange', route); }
  route();
});

if ('serviceWorker' in navigator) {
  // Actualizare automată: când se activează un service worker nou, reîncarcă o singură dată.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
}
