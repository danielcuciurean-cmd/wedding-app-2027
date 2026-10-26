import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { fbApp } from './auth.js';

// Cache persistent => funcționează offline; scrierile se sincronizează la reconectare.
let db;
try {
  db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch { db = getFirestore(fbApp); }

const stamp = d => ({ ...d, updatedAt: Date.now() });

export const add = (col, data) => addDoc(collection(db, col), stamp(data)).then(r => r.id);
export const set = (col, id, data) => setDoc(doc(db, col, id), stamp(data));
export const update = (col, id, data) => updateDoc(doc(db, col, id), stamp(data));
export const remove = (col, id) => deleteDoc(doc(db, col, id));
export const get = async (col, id) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? { id: s.id, ...s.data() } : null; };

// Ascultă o colecție; cb primește lista [{id, ...}]. Returnează funcția de dezabonare.
export function listen(col, cb) {
  return onSnapshot(collection(db, col), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error('listen', col, err));
}
export function listenDoc(col, id, cb) {
  return onSnapshot(doc(db, col, id), s => cb(s.exists() ? { id: s.id, ...s.data() } : null));
}

// Operații în lot: ops = [{type:'set'|'update'|'delete', col, id, data}]
export async function batch(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const o of ops.slice(i, i + 400)) {
      const ref = doc(db, o.col, o.id);
      if (o.type === 'delete') b.delete(ref);
      else if (o.type === 'update') b.update(ref, stamp(o.data));
      else b.set(ref, stamp(o.data));
    }
    await b.commit();
  }
}
export const newId = col => doc(collection(db, col)).id;

// Magazin reactiv simplu: păstrează ultima stare a fiecărei colecții.
const store = {}, subs = new Set(), unsubs = [];
export const COLLECTIONS = ['groups', 'guests', 'tables', 'categories', 'expenses', 'payments', 'tasks', 'schedule', 'gifts'];
export const data = c => store[c] || [];
export let settings = {};
export const subscribe = fn => (subs.add(fn), () => subs.delete(fn));
const notify = () => subs.forEach(fn => fn());

export function startSync() {
  stopSync();
  COLLECTIONS.forEach(c => unsubs.push(listen(c, list => { store[c] = list; notify(); })));
  unsubs.push(listenDoc('settings', 'main', s => { settings = s || {}; notify(); }));
}
export function stopSync() { unsubs.splice(0).forEach(u => u()); for (const k in store) delete store[k]; settings = {}; }
export const saveSettings = patch => setDoc(doc(db, 'settings', 'main'), stamp(patch), { merge: true });
