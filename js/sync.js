// Аккаунты и синхронизация прогресса через Firebase (Auth + Firestore).
// Без js/firebase-config.js приложение работает локально, прогресс — только в браузере.
(function () {
  const cfg = window.FIREBASE_CONFIG;
  const Sync = window.Sync = { enabled: !!(cfg && window.firebase), user: null, status: '' };
  if (!Sync.enabled) return;

  firebase.initializeApp(cfg);
  const auth = firebase.auth(), db = firebase.firestore();
  const E = window.Engine;
  let ready = false;
  const ref = () => db.collection('users').doc(Sync.user.uid);
  const weight = s => (s.log ? s.log.length : 0) + Object.keys(s.artists || {}).length * 10;

  async function push() {
    if (!Sync.user || !ready) return;
    try {
      await ref().set({ state: JSON.stringify(E.S), updatedAt: Date.now(), email: Sync.user.email || '' });
      Sync.status = 'Сохранено ' + new Date().toLocaleTimeString('ru');
    } catch (e) { Sync.status = 'Не удалось сохранить: ' + e.message; }
  }
  // на сервер — только в конце занятия (Sync.flush из app.js); по ходу лишь помечаем, что есть несохранённое.
  // Страховка: если вкладку закрыли или свернули посреди занятия — отправляем то, что накопилось.
  let dirty = false;
  E.onSave = () => { if (Sync.user && ready) dirty = true; };
  Sync.flush = () => { if (dirty) { dirty = false; return push(); } };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Sync.flush(); });

  // При входе: если локальный прогресс гостевой — берём тот, где больше сделано;
  // если он уже принадлежит этому аккаунту — более свежий; чужой локальный — заменяем.
  auth.onAuthStateChanged(async u => {
    Sync.user = u; ready = false;
    if (u) {
      try {
        const snap = await ref().get();
        const remote = snap.exists ? JSON.parse(snap.data().state) : null;
        const local = E.S;
        let useRemote;
        if (!remote) useRemote = false;
        else if (!local.owner) useRemote = weight(remote) >= weight(local);
        else if (local.owner === u.uid) useRemote = (remote.updatedAt || 0) >= (local.updatedAt || 0);
        else useRemote = true;
        if (useRemote) E.importState(remote, { silent: true });
        else if (local.owner && local.owner !== u.uid) E.importState({}, { silent: true });
        E.S.owner = u.uid;
        ready = true;
        if (!useRemote) await push(); else Sync.status = 'Прогресс загружен из аккаунта';
      } catch (e) { Sync.status = 'Ошибка синхронизации: ' + e.message; ready = true; }
    }
    window.App && App.refresh();
  });

  Sync.emailAuth = (create, email, pass) => create
    ? auth.createUserWithEmailAndPassword(email, pass)
    : auth.signInWithEmailAndPassword(email, pass);
  Sync.google = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  Sync.signOut = async () => { await push(); await auth.signOut(); E.importState({}, { silent: true }); };
  Sync.errText = e => ({
    'auth/invalid-credential': 'Неверный email или пароль',
    'auth/wrong-password': 'Неверный пароль',
    'auth/user-not-found': 'Такого аккаунта нет — создайте его',
    'auth/email-already-in-use': 'Аккаунт с таким email уже есть — войдите',
    'auth/weak-password': 'Пароль должен быть не короче 6 символов',
    'auth/invalid-email': 'Неверный формат email',
    'auth/popup-closed-by-user': 'Окно входа закрыто',
    'auth/network-request-failed': 'Нет связи с сервером входа'
  }[e.code] || e.message);
})();
