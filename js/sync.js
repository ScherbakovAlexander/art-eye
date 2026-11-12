// Аккаунты и синхронизация прогресса через Firebase (Auth + Firestore).
// Без js/firebase-config.js приложение работает локально, прогресс — только в браузере.
(function () {
  const cfg = window.FIREBASE_CONFIG;
  // user — вошедший по email/Google; anonId — анонимный номер браузера (стенд): прогресс гостя тоже уходит на сервер
  const Sync = window.Sync = { enabled: !!(cfg && window.firebase), user: null, anonId: null, status: '' };
  const ANON = !!window.BETA;   // анонимный аккаунт для гостей — пока только на стенде
  if (!Sync.enabled) return;

  firebase.initializeApp(cfg);
  const auth = firebase.auth(), db = firebase.firestore();
  const E = window.Engine;
  let ready = false;
  const cur = () => auth.currentUser;
  const ref = () => db.collection('users').doc(cur().uid);
  // тестовый стенд хранит прогресс в отдельном поле того же документа — основной не трогается
  const FIELD = window.BETA ? 'stateBeta' : 'state';
  const weight = s => (s.log ? s.log.length : 0) + Object.keys(s.artists || {}).length * 10;

  async function push() {
    if (!cur() || !ready) return;
    try {
      await ref().set({ [FIELD]: JSON.stringify(E.S), updatedAt: Date.now(), email: cur().email || '', anon: cur().isAnonymous }, { merge: true });
      Sync.status = 'Сохранено ' + new Date().toLocaleTimeString('ru');
    } catch (e) { Sync.status = 'Не удалось сохранить: ' + e.message; }
  }
  // на сервер — только в конце занятия (Sync.flush из app.js); по ходу лишь помечаем, что есть несохранённое.
  // Страховка: если вкладку закрыли или свернули посреди занятия — отправляем то, что накопилось.
  let dirty = false;
  E.onSave = () => { if (cur() && ready) dirty = true; };
  Sync.flush = () => { if (dirty) { dirty = false; return push(); } };
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Sync.flush(); });

  const setUser = u => { Sync.user = u && !u.isAnonymous ? u : null; Sync.anonId = u && u.isAnonymous ? u.uid : null; };
  // При входе: если локальный прогресс этого аккаунта — берём более свежий;
  // гостевой (без владельца или анонимного номера) — тот, где больше сделано; чужой (другого аккаунта) — заменяем.
  auth.onAuthStateChanged(async u => {
    setUser(u); ready = false;
    if (!u && ANON) { auth.signInAnonymously().catch(() => { }); return; }   // не включён в консоли — остаёмся гостем
    if (u) {
      try {
        const snap = await ref().get();
        const remote = snap.exists && snap.data()[FIELD] ? JSON.parse(snap.data()[FIELD]) : null;
        const local = E.S, guest = !local.owner || local.ownerAnon || u.isAnonymous;
        let useRemote;
        if (!remote) useRemote = false;
        else if (local.owner === u.uid) useRemote = (remote.updatedAt || 0) >= (local.updatedAt || 0);
        else if (guest) useRemote = weight(remote) >= weight(local);
        else useRemote = true;
        if (useRemote) E.importState(remote, { silent: true });
        else if (!guest && local.owner !== u.uid) E.importState({}, { silent: true });
        adopt(u);
        ready = true;
        if (!useRemote) await push(); else if (!u.isAnonymous) Sync.status = 'Прогресс загружен из аккаунта';
      } catch (e) { Sync.status = 'Ошибка синхронизации: ' + e.message; ready = true; }
    }
    window.App && App.refresh();
  });
  function adopt(u) { setUser(u); E.S.owner = u.uid; if (u.isAnonymous) E.S.ownerAnon = 1; else delete E.S.ownerAnon; }
  // гость с анонимным номером входит впервые — номер становится аккаунтом, прогресс остаётся на месте;
  // аккаунт уже существует — просто входим в него (прогресс выбирается как при обычном входе)
  async function link(linkFn, signInFn) {
    const u = cur();
    if (!u || !u.isAnonymous) return signInFn();
    try { const r = await linkFn(u); adopt(r.user); ready = true; await push(); window.App && App.refresh(); return r; }
    catch (e) {
      if (e.code === 'auth/credential-already-in-use' && e.credential) return auth.signInWithCredential(e.credential);
      if (e.code === 'auth/email-already-in-use' || e.code === 'auth/provider-already-linked') return signInFn();
      throw e;
    }
  }

  Sync.emailAuth = (create, email, pass) => create
    ? link(u => u.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, pass)), () => auth.createUserWithEmailAndPassword(email, pass))
    : auth.signInWithEmailAndPassword(email, pass);
  Sync.google = () => { const p = new firebase.auth.GoogleAuthProvider(); return link(u => u.linkWithPopup(p), () => auth.signInWithPopup(p)); };
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
