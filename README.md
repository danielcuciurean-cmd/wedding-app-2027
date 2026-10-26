# Nunta 2027 (PWA)

Vanilla JS (module ES), Firebase Auth + Firestore + Hosting. Fără build.

## Configurare
1. Creează un proiect Firebase NOU; activează Auth (email+parolă), Firestore, Hosting.
2. Creează manual cele 2 conturi în Authentication; copiază UID-urile în `firestore.rules`.
3. Completează `js/firebase-config.js`.
4. Local: `npx serve .` (sau `firebase emulators:start`). Deploy: `firebase deploy`.

## Structură
`js/app.js` router hash + layout, `auth.js` login, `db.js` CRUD + sincronizare reactivă cu cache offline, `ui.js` helperi, `modules/*` ecranele.
La modificări de fișiere, crește `CACHE` în `sw.js`.
