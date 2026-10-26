import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

export const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);

export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const currentUser = () => auth.currentUser;

// Gardă: apelează cb(user|null) la fiecare schimbare de stare.
export const onAuth = cb => onAuthStateChanged(auth, cb);

export function authErrorMessage(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Email sau parolă greșite.';
  if (c.includes('network')) return 'Fără conexiune la internet.';
  if (c.includes('too-many-requests')) return 'Prea multe încercări. Mai încearcă puțin mai târziu.';
  return 'Autentificare eșuată.';
}
