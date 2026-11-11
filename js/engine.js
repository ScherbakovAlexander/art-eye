// Движок обучения: состояние, интервальные повторения по художникам, выбор картин и вопросов.
// Единица запоминания — художник (стиль), а не картина. Картины берутся каждый раз новые,
// поэтому выучить конкретное полотно бесполезно — приходится схватывать почерк.

(function () {
  const BETA = !!window.BETA;   // тестовый стенд (beta/): свой прогресс и занятие, спланированное заранее
  const KEY = BETA ? 'arteye.beta' : 'arteye.v1';
  const DAY = 864e5;
  const now = () => Date.now();
  const today = () => { const d = new Date(now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ---------- данные ----------
  const HIDDEN = new Set(window.HIDDEN || []);
  const A = {};          // qid -> artist (+ paintings)
  const ORDER = [];      // порядок из curriculum
  for (const a of window.ARTISTS) {
    const raw = window.PAINTINGS[a.q];
    if (!raw) { console.warn('нет картин для', a.n); continue; }
    // год вне жизни художника — ошибка в Wikidata, лучше не показывать
    const [born, died] = (a.y.match(/\d{4}/g) || []).map(Number);
    const year = y => y && born && (y < born + 12 || y > died + 1) ? null : y;
    // all — все картины (индекс = номер в id), p — те, что показываем (без скрытых)
    a.all = raw.map((r, i) => ({ id: a.q + '#' + i, a: a.q, h: r[0], f: r[1], y: year(r[2]), t: r[3], fam: !!r[4] }));
    a.p = a.all.filter(x => !HIDDEN.has(x.id));
    a.mid = midYear(a.y);
    A[a.q] = a; ORDER.push(a.q);
  }
  function midYear(y) { const m = y.match(/\d{4}/g); return m ? (+m[0] + +m[m.length - 1]) / 2 : 1800; }

  // ---------- состояние ----------
  function fresh() {
    return {
      v: 1, artists: {}, seen: {}, conf: {}, log: [], exams: [], movSeen: {}, broken: {},
      day: { d: today(), intro: 0, answers: 0, correct: 0 },
      gate: { sinceExam: 0, failedAt: 0, sessionsSinceFail: 0 },
      settings: { newPerDay: 20, sessionLen: 10 },
      skill: {},          // по типу вопроса: { n, ok, recent[], d } — d ∈ [0,1] сложность этого типа
      days: {},           // дата → число ответов (для серии дней)
      updatedAt: 0, owner: null
    };
  }
  let S = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return migrate(Object.assign(fresh(), s)); } catch (e) { }
    return fresh();
  }
  // старый дневной лимит 3 тормозил после разгона — поднимаем один раз
  function migrate(s) {
    if (!s.bal2) { s.settings.newPerDay = Math.max(6, s.settings.newPerDay); s.day.intro = 0; s.bal2 = 1; }
    if (!s.bal3) { s.settings.newPerDay = Math.max(12, s.settings.newPerDay); s.bal3 = 1; }
    // занятия короче
    if (!s.bal5) { if (s.settings.newPerDay <= 12) s.settings.newPerDay = 20; s.bal5 = 1; }
    // серия дней: восстанавливаем по журналу ответов из старых версий
    if (!s.bal6) { s.days = s.days || {}; s.bal6 = 1; for (const l of s.log || []) { const d = new Date(l.t), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; s.days[k] = (s.days[k] || 0) + 1; } }
    // номер занятия: раньше не считали — прикидываем по числу ответов (≈10 на занятие)
    if (s.sessions == null) s.sessions = Math.round(Object.values(s.days || {}).reduce((a, b) => a + b, 0) / 10);
    if (!s.bal4) { if (s.settings.sessionLen >= 15) s.settings.sessionLen = 10; s.bal4 = 1; }
    // вес «в работе» для художников из старых версий — по накопленной стабильности
    // доказательства знания для прогресса из старых версий — по журналу последних ответов
    if (!s.bal7) {
      s.bal7 = 1;
      const day = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      for (const q in s.artists) Object.assign(s.artists[q], { streak: 0, sDays: [], sGap: 0, lastAns: 0 });
      for (const l of s.log || []) {
        const a = s.artists[l.q]; if (!a || !['who', 'find', 'odd', 'pair'].includes(l.ty)) continue;
        if (!l.ok) { Object.assign(a, { streak: 0, sDays: [], sGap: 0, lastAns: l.t }); continue; }
        if (a.streak && a.lastAns) a.sGap = Math.max(a.sGap, (l.t - a.lastAns) / DAY);
        a.streak++; const d = day(l.t); if (!a.sDays.includes(d)) { a.sDays.push(d); if (a.sDays.length > 5) a.sDays.shift(); }
        a.lastAns = l.t;
      }
    }
    for (const q in s.artists) { const a = s.artists[q]; if (a.w == null) a.w = a.stab < 1 ? 0.6 : a.stab < 7 ? 0.3 : 0.1; }
    return s;
  }
  let onSave = null;
  function save() {
    S.updatedAt = now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { }
    if (onSave) onSave(S);
  }
  function rollDay() { if (S.day.d !== today()) S.day = { d: today(), intro: 0, answers: 0, correct: 0 }; }

  const known = () => ORDER.filter(q => S.artists[q]);
  const st = q => S.artists[q];

  // ---------- интервальные повторения (на уровне художника) ----------
  // stab — «стабильность» в днях: через сколько пора повторить. Верный ответ растит её тем сильнее,
  // чем дольше прошло с прошлого раза (повтор раньше срока почти ничего не даёт), ошибка — резко режет.
  // стенд: художники, с которыми познакомились в этом занятии, — чаще среди неверных вариантов,
  // чтобы «свежее имя» не было подсказкой
  let sesNew = new Set();
  function introduce(q, ses = null) {
    rollDay();
    if (ses) sesNew.add(q);
    // художники разгона не тратят дневной лимит
    if (known().length >= WARMUP) S.day.intro++;
    S.artists[q] = { intro: now(), stab: 0.5, due: now() + 0.5 * DAY, last: now(), ok: 0, n: 0, lapses: 0, recent: [], w: 1, streak: 0, sDays: [], sGap: 0 };
    if (ses) { ses.newIds.push({ q, at: ses.i }); ses.lastIntro = ses.i; if (!ses.plan) ses.len = Math.min(ses.len + 2, S.settings.sessionLen + 6); }
    S.movSeen[A[q].m] = S.movSeen[A[q].m] || now();
    S.gate.sinceExam++;
    save();
  }
  function grade(q, ok, weight = 1) {
    const s = st(q); if (!s) return;
    const elapsed = (now() - s.last) / DAY;
    if (ok) {
      const r = Math.min(1, elapsed / s.stab);
      s.stab = s.stab * (1 + 1.5 * r * weight) + 0.02;
    } else {
      s.stab = Math.max(0.2, s.stab * (1 - 0.6 * weight));
      s.lapses++;
    }
    s.due = now() + s.stab * DAY;
    s.last = now(); s.n++; if (ok) s.ok++;
    s.recent.push(ok ? 1 : 0); if (s.recent.length > 10) s.recent.shift();
  }
  // доказательства знания (для уровней): серия верных ответов подряд, в скольких разных днях она набрана,
  // самый длинный перерыв внутри серии; верные ответы на трудных вопросах. Ошибка обнуляет серию.
  // Учитываются только вопросы, где надо узнать именно художника (кто автор, найти, лишняя, один ли).
  function evidence(q, ok, hard) {
    const s = st(q); if (!s) return;
    if (!ok) { s.streak = 0; s.sDays = []; s.sGap = 0; s.lastAns = now(); return; }
    const d = today();
    if (s.streak && s.lastAns) s.sGap = Math.max(s.sGap || 0, (now() - s.lastAns) / DAY);
    s.streak = (s.streak || 0) + 1;
    s.sDays = s.sDays || []; if (!s.sDays.includes(d)) { s.sDays.push(d); if (s.sDays.length > 5) s.sDays.shift(); }
    if (hard) s.hardOk = (s.hardOk || 0) + 1;
    s.lastAns = now();
  }
  // уровни на тестовом стенде — по доказательствам, а не по календарю:
  // знаю — 5 верных подряд в 2 разных днях (или узнал сам, без ошибок с тех пор);
  // освоен — 10 верных подряд в 3 разных днях, с перерывом хотя бы 2 дня; эксперт — ещё и 10 верных на трудных вопросах
  const LEVELS = [
    { k: 0, name: 'закрыт', icon: '🔒' }, { k: 1, name: 'новый', icon: '🌱' }, { k: 2, name: 'учу', icon: '✏️' },
    { k: 3, name: 'повторяю', icon: '🔁' }, { k: 4, name: 'знаю', icon: '✅' }, { k: 5, name: 'освоен', icon: '🏅' }, { k: 6, name: 'эксперт', icon: '👑' }];
  function levelBeta(q) {
    const s = st(q); if (!s) return LEVELS[0];
    const r = s.recent || [], acc = n => r.slice(-n).reduce((a, b) => a + b, 0) / Math.max(1, r.slice(-n).length);
    const streak = s.streak || 0, days = (s.sDays || []).length;
    const master = streak >= 10 && days >= 3 && (s.sGap || 0) >= 2;
    if (master) return (s.hardOk || 0) >= 10 ? LEVELS[6] : LEVELS[5];
    if (streak >= 5 && days >= 2) return LEVELS[4];
    if (s.n < 3) return LEVELS[1];
    if (r.length >= 5 && acc(5) < 0.6) return LEVELS[2];
    return LEVELS[3];
  }
  function level(q) {
    if (BETA) return levelBeta(q);
    const s = st(q); if (!s) return { k: 0, name: 'закрыт' };
    if (s.stab < 1) return { k: 1, name: 'знакомство' };
    if (s.stab < 7) return { k: 2, name: 'учу' };
    if (s.stab < 30) return { k: 3, name: 'знаю' };
    return { k: 4, name: 'уверенно' };
  }
  const dueList = () => known().filter(q => st(q).due <= now()).sort((a, b) => overdue(b) - overdue(a));
  const overdue = q => (now() - st(q).due) / (st(q).stab * DAY);
  // доля пройденного: каждый художник от 0 до 1 по стабильности (30 дней — освоен), среднее по всем
  // на стенде — от уровня: новый 5%, учу 15%, повторяю 35%, знаю 70%, освоен и эксперт — 100%
  const LEVEL_SHARE = [0, 0.05, 0.15, 0.35, 0.7, 1, 1];
  function mastery() {
    const one = BETA ? q => LEVEL_SHARE[levelBeta(q).k]
      : q => { const s = st(q); return s ? Math.min(1, Math.log(1 + s.stab) / Math.log(31)) : 0; };
    return ORDER.reduce((a, q) => a + one(q), 0) / ORDER.length;
  }
  // серия дней подряд с занятиями (сегодняшний день может быть ещё не начат)
  function dayStreak() {
    const d = new Date(now()); let n = 0;
    const key = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    if (!S.days[key(d)]) d.setDate(d.getDate() - 1);
    while (S.days[key(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function recentAccuracy(n = 30) {
    const l = S.log.filter(x => !x.ex).slice(-n); if (l.length < 8) return null;
    return l.filter(x => x.ok).length / l.length;
  }

  // ---------- адаптивная сложность по типу вопроса ----------
  // У каждого типа своя сложность d: +0.03 за верный, −0.09 за ошибку. Равновесие — около 75% верных:
  // если отвечаете лучше, варианты становятся похожее (то же направление/эпоха), хуже — контрастнее.
  function skill(type) { return S.skill[type] = S.skill[type] || { n: 0, ok: 0, recent: [], d: 0.3 }; }
  function trainSkill(type, ok) {
    const k = skill(type);
    k.n++; if (ok) k.ok++;
    k.recent.push(ok ? 1 : 0); if (k.recent.length > 20) k.recent.shift();
    k.d = Math.max(0, Math.min(1, k.d + (ok ? 0.03 : -0.09)));
  }
  // общий темп: «разгон» до 10 художников, дальше ускоряемся при высокой точности и тормозим при низкой
  function pace() {
    const acc = recentAccuracy();
    if (acc == null) return { mode: 'normal', acc };
    if (acc >= 0.85) return { mode: 'fast', acc };
    if (acc < 0.65) return { mode: 'easy', acc };
    return { mode: 'normal', acc };
  }

  // ---------- вес «в работе» и ёмкость пула ----------
  // У каждого художника вес w: новый — 1. Верный ответ умножает его на (1 − 0.4·k), ошибка добавляет 0.25·k
  // (k — насколько тип вопроса говорит о художнике). Пять верных ответов — и художник
  // почти «уходит» (w ≈ 0.1), дальше его держит только интервальное повторение.
  // Равновесие веса при точности p по художнику: w ≈ 0.6·(1−p)/p — легко узнаваемые уходят, трудные остаются в работе.
  // Нагрузка пула = сумма весов (художник, которому пора на повторение, весит минимум 0.1).
  // Когда нагрузка меньше ёмкости — вводится новый художник, прямо по ходу занятия.
  const TYPE_K = { who: 1, find: 0.8, odd: 0.8, pair: 0.6, movement: 0.4, findMov: 0.3, era: 0, older: 0 };
  function trainWeight(q, ok, k) {
    const s = st(q); if (!s || !k) return;
    s.w = ok ? s.w * (1 - 0.4 * k) : Math.min(1.2, s.w + 0.25 * k);
  }
  const isDue = q => st(q).due <= now();
  // Стенд: знакомый художник никогда не уходит совсем и всегда занимает немного места (0.03):
  // чем больше знакомых, тем меньше места новым. При 10 занятиях в день — ~18 новых в первый день,
  // 6–10 в первые дни, к концу 1–2 в день.
  const KNOWN_LOAD = BETA ? 0.03 : 0;
  const poolLoad = () => known().reduce((sum, q) => sum + Math.max(st(q).w, isDue(q) ? 0.1 : 0, KNOWN_LOAD), 0);
  // ёмкость зависит от точности: отвечаете хорошо — в работе больше художников, плохо — меньше
  function capacity() {
    const acc = recentAccuracy();
    let c = known().length < WARMUP ? 3.2 : 2.6;
    if (acc != null) c += acc >= 0.85 ? 0.8 : acc >= 0.75 ? 0.3 : acc < 0.5 ? -1.4 : acc < 0.65 ? -0.9 : 0;
    return Math.max(1.2, c);
  }

  // ---------- выбор нового художника ----------
  // Близость кандидата к уже знакомым: то же направление — 1, иначе убывает с расстоянием между
  // направлениями во времени (соседние ≈ 0.5, через два века ≈ 0). Целевая близость случайна:
  // в начале чаще далёкие, со временем диапазон сдвигается к близким, но далёкие тоже остаются.
  // Иногда (10% в начале → 35% к концу) берём художника того же направления, что уже есть в пуле.
  const movMid = m => midYear(MOVEMENTS[m].y);
  function closeness(c, pool) {
    let best = 0;
    for (const q of pool) {
      const v = A[c].m === A[q].m ? 1 : 0.7 * Math.exp(-Math.abs(movMid(A[c].m) - movMid(A[q].m)) / 60);
      if (v > best) best = v;
    }
    return best;
  }
  function nextNew(exclude = []) {
    const k = known().concat(exclude);
    const cand = ORDER.filter(q => !S.artists[q] && !exclude.includes(q));
    if (!cand.length) return null;
    const minTier = Math.min(...cand.map(q => A[q].t));
    const p = Math.min(1, k.length / 45);
    const same = k.length >= 4 && Math.random() < 0.1 + 0.25 * p + (pace().mode === 'fast' ? 0.15 : 0);
    const T = same ? 1 : Math.random() * (0.2 + 0.6 * p);
    const movCount = m => k.filter(q => A[q].m === m).length;
    return cand.filter(q => A[q].t <= minTier + 1)
      .map(q => ({ q, score: Math.abs(closeness(q, k) - T) + 0.3 * (A[q].t - minTier) + 0.04 * movCount(A[q].m) + 0.08 * Math.random() }))
      .sort((a, b) => a.score - b.score)[0].q;
  }
  const WARMUP = 10;
  // Экзамен предлагается после 8 новых художников, но обязательным становится только после 14
  // (или после провала) — до этого новые художники продолжают открываться.
  // экзамен пока отключён: не предлагается и не блокирует новых художников (код оставлен на будущее)
  const EXAMS_ON = false;
  function examStatus() {
    if (!EXAMS_ON) return { need: false, block: false, canTake: false, left: 0 };
    const k = known().length, n = S.gate.sinceExam;
    const need = k >= WARMUP && (n >= 8 || !!S.gate.failedAt);
    const block = need && (n >= 14 || !!S.gate.failedAt);
    const canTake = need && (!S.gate.failedAt || S.gate.sessionsSinceFail >= 1);
    return { need, block, canTake, left: Math.max(0, 14 - n) };
  }
  // можно ли сейчас ввести нового художника (без учёта места в занятии)
  function introReason() {
    rollDay();
    const k = known(), info = { load: poolLoad(), cap: capacity() };
    if (!ORDER.some(q => !S.artists[q])) return { ok: false, why: 'Все художники открыты', ...info };
    if (k.length >= WARMUP && examStatus().block) return { ok: false, why: 'Сдайте экзамен, чтобы открыть новых художников', ...info };
    if (k.length >= WARMUP && S.day.intro >= S.settings.newPerDay) return { ok: false, why: 'Лимит новых художников на сегодня', ...info };
    if (info.load >= info.cap) return { ok: false, why: 'Новый художник появится, когда текущие закрепятся', full: true, ...info };
    return { ok: true, warmup: k.length < WARMUP, ...info };
  }
  // новый художник для этого места занятия: пул не заполнен, в занятии хватает вопросов,
  // чтобы его закрепить, и с прошлого знакомства прошло хотя бы 3 вопроса
  function pendingNew(ses) {
    if (BETA && ses.plan) return plannedNew(ses);
    if (!introReason().ok) return null;
    if (ses.i > 0 && (ses.len - ses.i < 5 || ses.i - ses.lastIntro < 3)) return null;
    if (ses.newIds.length >= (known().length < WARMUP ? 6 : 4)) return null;
    return nextNew();
  }

  // ---------- выбор картин ----------
  // Невиденные картины в приоритете: цель — увидеть как можно больше разных работ художника.
  function pickPainting(q, { exclude = [], unseenOnly = false, needYear = false } = {}) {
    let ps = A[q].p.filter(p => !S.broken[p.id] && !exclude.includes(p.id) && (!needYear || p.y));
    if (unseenOnly) { const u = ps.filter(p => !S.seen[p.id]); if (u.length) ps = u; }
    if (!ps.length) return null;
    const w = ps.map(p => S.seen[p.id] ? 1 / (1 + S.seen[p.id]) : 6);
    return weighted(ps, w);
  }
  function markSeen(p) { S.seen[p.id] = (S.seen[p.id] || 0) + 1; }
  function introGallery(q, n = 8) {
    const a = A[q];
    const fam = shuffle(a.p.filter(p => p.fam && !S.broken[p.id])).slice(0, 3);
    const rest = shuffle(a.p.filter(p => !p.fam && !S.broken[p.id])).slice(0, n - fam.length);
    return shuffle(fam.concat(rest)).sort((x, y) => (x.y || 0) - (y.y || 0));
  }

  // ---------- дистракторы ----------
  // Сложность растёт вместе со стабильностью: для нового художника варианты контрастные,
  // для уверенного — из того же направления и эпохи, плюс те, кого вы с ним путали.
  // трудность пары художников 0–1 из data/pairs.js (смесь похожести CLIP и путаницы классификатора), null — нет данных
  const pairDiff = (() => {
    const P = window.PAIRS; if (!P) return () => null;
    const K = P.q.length, ix = {}; P.q.forEach((q, i) => { ix[q] = i; });
    return (a, b) => {
      let i = ix[a], j = ix[b];
      if (i == null || j == null || i === j) return null;
      if (i > j) [i, j] = [j, i];
      const k = i * K - i * (i + 1) / 2 + (j - i - 1);
      return +P.v.substr(2 * k, 2) / 99;
    };
  })();

  function distractors(q, n, type = 'who', pool = known()) {
    const t = A[q], s = st(q);
    // уровень 0–1: навык типа вопроса и то, насколько уверенно знаком этот художник
    const level = skill(type).d * (0.6 + 0.4 * Math.min(1, (s ? s.stab : 0) / 3));
    // целевая трудность вопроса: растёт с уровнем, но со случайным разбросом —
    // новичку иногда выпадает трудный вопрос, опытному иногда лёгкий
    const gauss = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    const T = 0.15 + 0.7 * level + 0.18 * gauss;
    const cand = pool.filter(c => c !== q);
    const w = cand.map(c => {
      const o = A[c];
      const pd = pairDiff(q, c);
      const sim = pd != null ? pd : o.m === t.m ? 1 : 0.75 * Math.exp(-Math.abs(o.mid - t.mid) / 50);
      const conf = (S.conf[q + '|' + c] || 0) + (S.conf[c + '|' + q] || 0);
      // варианты — из пар, близких к целевой трудности; художники, которых уже путали, — чаще
      return Math.exp(-(((sim - T) / 0.15) ** 2)) + 0.03 + 3 * Math.min(conf, 4) + (BETA && sesNew.has(c) ? 1 : 0);
    });
    return weightedSample(cand, w, n);
  }

  // ---------- вопросы ----------
  // label — для статистики; w — вес в обычном занятии (чаще всего «кто автор»), we — в экзамене.
  // Стенд: «кто автор» — около половины вопросов, и его доля не падает, даже когда он даётся легко.
  const TYPES = {
    who: { label: 'Кто автор', min: 2, w: BETA ? 11 : 5, we: 6 },
    find: { label: 'Найти картину художника', min: 4, w: 2, we: 2 },
    movement: { label: 'Стиль картины (направление)', min: 4, movs: 2, w: 1.8, we: 1.5 },
    findMov: { label: 'Найти картину направления', min: 5, movs: 4, w: 1, we: 0.8 },
    odd: { label: 'Лишняя картина', min: 5, w: 1.5, we: 2 },
    pair: { label: 'Один ли художник', min: 7, w: 1.2, we: 1 },
    era: { label: 'Когда написана', min: 6, w: 1, we: 0 },
    older: { label: 'Какая картина старше', min: 3, w: 1.3, we: 0 }
  };
  function availableTypes() {
    const k = known(), movs = new Set(k.map(q => A[q].m)).size;
    return Object.keys(TYPES).filter(t => k.length >= TYPES[t].min && (!TYPES[t].movs || movs >= TYPES[t].movs));
  }
  function chooseType(q, exam, recentTypes = []) {
    const av = availableTypes();
    const s = st(q);
    // первый вопрос о свежем художнике — «кто автор», чтобы закрепить связь картина→имя
    // стенд: первые три — «кто автор», потом «найдите его картину» (узнать манеру, а не угадать новое имя), потом любой из двух
    if (!exam && s && s.n < (BETA ? 3 : 1)) {
      if (!BETA || s.n === 0 || !av.includes('find')) return 'who';
      return s.n === 1 || Math.random() < 0.5 ? 'find' : 'who';
    }
    // при низкой общей точности сложные форматы реже
    const easy = !exam && pace().mode === 'easy';
    // против однообразия: тип, который только что был, — реже (два «кто автор» подряд допустимы)
    const last = recentTypes.slice(-2);
    return weighted(av, av.map(t => {
      let w = exam ? TYPES[t].we : TYPES[t].w;
      if (easy && t !== 'who' && t !== 'movement') w *= 0.4;
      // трудные для вас типы — чаще, лёгкие — реже (на стенде «кто автор» не реже)
      if (!exam && !(BETA && t === 'who')) w *= 1.4 - 0.8 * skill(t).d;
      if (last[1] === t && !(BETA && t === 'who')) w *= t === 'who' && last[0] !== t ? 0.5 : 0.2;
      return w || 0.0001;
    }));
  }
  const nOpts = type => skill(type).d < 0.2 ? 3 : 4;
  function build(q, type, opt = {}) {
    const a = A[q], uo = !!opt.exam;
    const k = known();
    // тематические подсказки: vs — художник, с которым надо различать; among — варианты только из этих художников
    const pool = opt.among && opt.among.length >= 4 ? opt.among : k;
    const dis = (n, t) => { const d = distractors(q, n, t, pool); return opt.vs ? [opt.vs, ...d.filter(x => x !== opt.vs)].slice(0, n) : d; };
    if (type === 'who') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const ds = dis(Math.min(nOpts(type) - 1, pool.length - 1), type);
      const hard = ds.some(d => (pairDiff(q, d) || 0) >= 0.75);   // среди вариантов — очень похожий художник
      return { type, q, prompt: 'Кто автор?', paintings: [p], options: shuffle([q, ...ds]).map(x => ({ v: x, label: A[x].n })), correct: q, hard };
    }
    if (type === 'movement') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const movs = [...new Set(k.map(x => A[x].m))].filter(m => m !== a.m);
      const yr = m => midYear(MOVEMENTS[m].y);
      const d = skill(type).d;
      const ds = weightedSample(movs, movs.map(m => 1 + 6 * d / (1 + Math.abs(yr(m) - yr(a.m)) / 40)), nOpts(type) - 1);
      return { type, q, prompt: 'Какой стиль (направление)?', paintings: [p], options: shuffle([a.m, ...ds]).map(m => ({ v: m, label: MOVEMENTS[m].n })), correct: a.m };
    }
    if (type === 'findMov') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const byMov = {};
      for (const x of shuffle(k)) if (A[x].m !== a.m && !byMov[A[x].m]) byMov[A[x].m] = x;
      const others = shuffle(Object.values(byMov)).slice(0, 3).map(x => pickPainting(x, { unseenOnly: uo })).filter(Boolean);
      if (others.length < 3) return build(q, 'movement', opt);
      const ps = shuffle([p, ...others]);
      return { type, q, prompt: `Где картина в стиле «${MOVEMENTS[a.m].n}»?`, paintings: ps, options: ps.map(x => ({ v: x.id })), correct: p.id, grid: true };
    }
    if (type === 'older') {
      const p = pickPainting(q, { unseenOnly: uo, needYear: true }); if (!p) return build(q, 'who', opt);
      // разница в годах сужается с ростом навыка: от ~150 лет до ~40
      const gap = Math.round(150 - 110 * skill(type).d);
      const cand = shuffle(k.filter(x => x !== q)).slice(0, 25).map(x => pickPainting(x, { unseenOnly: uo, needYear: true })).filter(Boolean);
      const dy = x => Math.abs(x.y - p.y);
      const o = cand.find(x => dy(x) >= gap && dy(x) <= gap * 3 + 60) || cand.filter(x => dy(x) >= 30).sort((a, b) => Math.abs(dy(a) - gap) - Math.abs(dy(b) - gap))[0];
      if (!o) return build(q, 'who', opt);
      const ps = shuffle([p, o]);
      return { type, q, b: o.a, prompt: 'Какая картина старше?', paintings: ps, options: ps.map(x => ({ v: x.id })), correct: (p.y < o.y ? p : o).id, grid: true };
    }
    if (type === 'era') {
      const p = pickPainting(q, { unseenOnly: uo, needYear: true }); if (!p) return build(q, 'who', opt);
      // ширина варианта: 100 лет у новичка, сужается до 40 с ростом навыка этого типа вопросов.
      // Год картины — в середине правильного варианта, варианты идут встык
      const w = Math.round((100 - 60 * skill(type).d) / 20) * 20, c = Math.round(p.y / 10) * 10;
      const lo = Math.max(0, Math.ceil(3 - (2000 - c) / w)), hi = Math.min(3, Math.floor((c - 1220) / w));
      const shift = lo <= hi ? lo + rnd(hi - lo + 1) : rnd(4);
      const opts = [0, 1, 2, 3].map(i => c + (i - shift) * w);
      return { type, q, prompt: 'Когда написана?', paintings: [p], options: opts.map(m => ({ v: m, label: `${m - w / 2}–${m + w / 2}` })), correct: c };
    }
    if (type === 'find') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const ds = dis(3, type);
      const ps = shuffle([p, ...ds.map(d => pickPainting(d, { unseenOnly: uo }))].filter(Boolean));
      return { type, q, prompt: `Где работа: ${a.n}?`, paintings: ps, options: ps.map(x => ({ v: x.id })), correct: p.id, grid: true };
    }
    if (type === 'odd') {
      const [b] = dis(1, type);
      const ex = [];
      const same = [0, 1, 2].map(() => { const p = pickPainting(q, { exclude: ex, unseenOnly: uo }); if (p) ex.push(p.id); return p; }).filter(Boolean);
      const odd = pickPainting(b, { unseenOnly: uo });
      if (same.length < 3 || !odd) return build(q, 'who', opt);
      const ps = shuffle([...same, odd]);
      return { type, q, b, prompt: 'Одна картина — другого художника. Какая?', paintings: ps, options: ps.map(x => ({ v: x.id })), correct: odd.id, grid: true };
    }
    if (type === 'pair') {
      const sameArtist = Math.random() < 0.5;
      const p1 = pickPainting(q, { unseenOnly: uo });
      const b = sameArtist ? q : dis(1, type)[0];
      const p2 = p1 && pickPainting(b, { exclude: [p1.id], unseenOnly: uo });
      if (!p2) return build(q, 'who', opt);
      return { type, q, b, prompt: 'Это один и тот же художник?', paintings: [p1, p2], options: [{ v: 'yes', label: 'Да, один' }, { v: 'no', label: 'Нет, разные' }], correct: sameArtist ? 'yes' : 'no', pairView: true };
    }
  }
  // применить ответ: SR, путаница, лог
  function answer(Q, v, { exam = false } = {}) {
    rollDay();
    const ok = v === Q.correct;
    const w = exam ? 1 : TYPE_K[Q.type];
    if (w > 0) grade(Q.q, ok, w);
    if (w >= 0.6) evidence(Q.q, ok, Q.hard);
    trainWeight(Q.q, ok, exam ? 0.7 : w);
    if (!exam) trainSkill(Q.type, ok);
    if (!ok) {
      let other = null;
      if (Q.type === 'who') other = v;
      else if (Q.type === 'find') other = paintingById(v).a;
      else if (Q.type === 'odd' || Q.type === 'pair') other = Q.b !== Q.q ? Q.b : null;
      if (other && other !== Q.q) S.conf[Q.q + '|' + other] = (S.conf[Q.q + '|' + other] || 0) + 1;
    }
    S.log.push({ t: now(), q: Q.q, ty: Q.type, ok, ex: exam ? 1 : 0 }); if (S.log.length > 500) S.log.shift();
    S.day.answers++; if (ok) S.day.correct++;
    S.days[today()] = (S.days[today()] || 0) + 1;
    save();
    return ok;
  }
  function paintingById(id) { const [q, i] = id.split('#'); return A[q].all[+i]; }

  // ---------- занятие ----------
  // Очередь цели: (1) повтор ошибок через 3 вопроса, (2) новые художники на расширяющихся
  // интервалах внутри занятия (1, 3, 6, 10, 15-й вопрос), (3) просроченные по SR,
  // (4) остальные — чаще слабые. Один художник не идёт два раза подряд.
  function newSession() {
    sesNew = new Set();
    const ses = { newIds: [], res: {}, start: { mastery: mastery(), seen: Object.keys(S.seen).length, known: known().length }, i: 0, len: S.settings.sessionLen, lastIntro: -99, retry: [], recentT: [], recentTy: [], ok: 0, done: 0 };
    if (BETA) planSession(ses);
    return ses;
  }

  // ---------- тестовый стенд: занятие планируется заранее ----------
  // Всегда 12 вопросов. До первого вопроса решаем, сколько будет новых художников (по ёмкости пула)
  // и где их показать: первого — в начале, следующего — сюрпризом в середине (если место есть).
  // У каждого нового — 3 места после знакомства, случайно и не подряд. Остальные места — жребий
  // с весами среди всех знакомых: у выученного художника вес маленький (0.04), но он не уходит совсем
  // и время от времени попадается. Чем больше знакомых, тем больше вопросов уходит на них —
  // поэтому, вместе с KNOWN_LOAD, новые к концу появляются реже.
  // Ошибки план не меняют: они сдвигают выученность (вес, стабильность) и скажутся на следующих занятиях.
  const PLAN_LEN = 12, NEW_SLOTS = 2;   // вопросов о новом художнике в занятии знакомства
  const priority = q => st(q).w + 0.04 + (isDue(q) ? 0.35 : 0);
  function planSession(ses) {
    const k = known(), r = introReason();
    ses.len = PLAN_LEN;
    const theme = ses.theme = pickTheme(k);
    // сколько новых: пока нагрузка ниже ёмкости (+1 — за занятие верные ответы её снижают,
    // это место и достаётся «сюрпризу» в середине); на разгоне больше
    const intros = [];
    // новый — только когда все недавние «новые» (меньше 3 ответов) хотя бы раз угаданы
    const shaky = k.filter(q => st(q).n < 3 && !st(q).ok).length;
    if (r.ok && (!shaky || k.length < 3)) {
      const left = k.length >= WARMUP ? S.settings.newPerDay - S.day.intro : Infinity;
      // в первом занятии — сразу трое (с двумя художниками занятие однообразное), потом — до двух
      const max = Math.min(Math.max(theme ? 1 : 2, 3 - k.length), left);
      let load = r.load;
      while (intros.length < max && (load < r.cap + 1 || k.length + intros.length < 3)) {
        const q = nextNew(intros.map(x => x.q)); if (!q) break;
        intros.push({ q }); load += 1;
      }
    }
    // в начале — столько, чтобы знакомых было хотя бы 3 (из кого собирать варианты), минимум один;
    // остальные — в середине (с 4-го по 8-й вопрос), с промежутком не меньше 3
    const atStart = Math.min(intros.length, Math.max(1, 3 - k.length));
    let pos = 3 + rnd(2);
    intros.forEach((x, j) => { x.at = j < atStart ? 0 : pos; if (j >= atStart) pos += 3 + rnd(2); });
    // кто не помещается (нужно место на его вопросы не подряд) — в следующее занятие
    for (let j = intros.length - 1; j >= 0; j--) if (intros[j].at > PLAN_LEN - NEW_SLOTS * 2 + 1) intros.splice(j, 1);
    let plan;
    const near = (i, q) => plan[i - 1] === q || plan[i + 1] === q;
    // места нового художника: после знакомства, случайно, не подряд
    // (сначала тем, кого знакомим позже: у них меньше свободных мест). Если кому-то не хватило — ещё попытка.
    for (let attempt = 0; attempt < 30; attempt++) {
      plan = Array(PLAN_LEN).fill(null);
      let full = true;
      for (const x of intros.slice().reverse()) {
        const free = shuffle([...Array(PLAN_LEN - x.at).keys()].map(i => i + x.at));
        let n = 0;
        for (const i of free) if (n < NEW_SLOTS && !plan[i] && !near(i, x.q)) { plan[i] = x.q; n++; }
        if (n < NEW_SLOTS) full = false;
      }
      if (full) break;
    }
    // тематическое занятие: до 8 свободных мест — художники темы (давно не виденные, похожие, одной страны…)
    ses.themeSlots = {};
    if (theme) {
      const free = shuffle([...Array(PLAN_LEN).keys()].filter(i => !plan[i])).slice(0, Math.min(THEME_SLOTS, 2 * theme.pool.length)).sort((a, b) => a - b);
      for (const i of free) {
        let cand = theme.pool.filter(([q]) => !near(i, q));
        if (!cand.length) cand = theme.pool;
        plan[i] = weighted(cand.map(c => c[0]), cand.map(c => c[1] * (0.5 + priority(c[0]))));
        ses.themeSlots[i] = true;
      }
    }
    // остальные места: жребий среди всех знакомых. Новым хватает их собственных мест (NEW_SLOTS);
    // только пока знакомых меньше трёх — и новые (те, что к этому месту уже показаны)
    for (let i = 0; i < PLAN_LEN; i++) {
      if (plan[i]) continue;
      const pool = k.map(q => [q, priority(q)]).concat(k.length < 3 ? intros.filter(x => x.at <= i).map(x => [x.q, 1]) : []);
      let cand = pool.filter(([q]) => !near(i, q));
      if (!cand.length) cand = pool;
      plan[i] = cand.length ? weighted(cand.map(c => c[0]), cand.map(c => c[1])) : null;
    }
    ses.plan = plan; ses.intros = intros;
  }
  // ---------- тестовый стенд: тематические занятия ----------
  // Примерно раз в 4–5 занятий планировщик делает занятие тематическим — если для темы есть материал
  // и повод. Тема занимает до 8 из 12 мест (те, что не нужны новым художникам), остальное — как обычно.
  // Новых художников в таком занятии не больше одного. Вопросы обычных типов, но подобраны под тему.
  const country = q => { const c = A[q].c.split(' /')[0].replace(/ \(.*\)/, ''); return c === 'Фландрия' ? 'Нидерланды' : c; };
  const SCHOOL = { 'Россия': 'Русские художники', 'Франция': 'Французские художники', 'Италия': 'Итальянские мастера',
    'Нидерланды': 'Голландцы и фламандцы', 'Испания': 'Испанские художники', 'Германия': 'Немецкие художники', 'Англия': 'Английские художники' };
  const daysSince = q => st(q).lastAns ? (now() - st(q).lastAns) / DAY : 99;
  const knowsWell = q => levelBeta(q).k >= 4;
  const partners = (q, k) => k.filter(c => c !== q && ((pairDiff(q, c) || 0) >= 0.7 || (S.conf[q + '|' + c] || 0) + (S.conf[c + '|' + q] || 0) > 0));
  const typeAcc = ts => { const r = ts.flatMap(t => skill(t).recent); return r.length < 8 ? null : r.reduce((a, b) => a + b, 0) / r.length; };
  // ready() → null (нет материала или повода) или { pool: [[художник, вес]], types: { тип: вес }, … }
  const THEMES = {
    review: {
      n: 'Повторим знакомых', d: 'Художники, которых вы давно не встречали',
      ready(k) {
        const well = k.filter(knowsWell);
        if (k.length < 8 || well.length < 5) return null;
        const old = well.filter(q => daysSince(q) >= 2);
        if (old.length < 5) return null;
        return { pool: old.map(q => [q, 1 + daysSince(q)]), types: { who: 5, find: 1.5, odd: 1.5 } };
      }
    },
    similar: {
      n: 'Различаем похожих', d: 'Художники, которых легко спутать',
      ready(k) {
        if (k.length < 12) return null;
        const pairs = new Set();
        for (const q of k) for (const c of partners(q, k)) pairs.add([q, c].sort().join('|'));
        if (pairs.size < 3) return null;
        const pool = k.filter(q => partners(q, k).length);
        return { pool: pool.map(q => [q, 1]), types: { who: 4, odd: 2, pair: 2, find: 1.5 }, vs: q => { const p = partners(q, k); return p[rnd(p.length)]; } };
      }
    },
    styles: {
      n: 'Пройдёмся по стилям', d: 'Узнаём направление по картине',
      ready(k) {
        const by = {}; k.forEach(q => { by[A[q].m] = (by[A[q].m] || 0) + 1; });
        if (Object.keys(by).length < 5 || Object.values(by).filter(n => n >= 2).length < 3) return null;
        const acc = typeAcc(['movement', 'findMov']);
        if (acc != null && acc >= 0.85) return null;
        return { pool: k.map(q => [q, by[A[q].m] >= 2 ? 1.5 : 1]), types: { movement: 3, findMov: 2 } };
      }
    },
    dates: {
      n: 'Выучим даты', d: 'Когда написаны картины',
      ready(k) {
        const dated = k.filter(q => A[q].p.some(p => p.y));
        const ys = dated.map(q => A[q].mid);
        if (dated.length < 10 || Math.max(...ys) - Math.min(...ys) < 200) return null;
        const acc = typeAcc(['era', 'older']);
        if (acc != null && acc >= 0.75) return null;
        return { pool: dated.map(q => [q, 1]), types: { era: 1, older: 1 } };
      }
    },
    school: {
      ready(k) {
        const by = {}; k.forEach(q => { const c = country(q); if (SCHOOL[c]) (by[c] = by[c] || []).push(q); });
        const ok = Object.keys(by).filter(c => by[c].length >= 5);
        if (!ok.length || Math.random() > 0.4) return null;    // редкая тема
        const c = ok[rnd(ok.length)];
        return { n: SCHOOL[c], d: 'Художники одной страны', pool: by[c].map(q => [q, 1]), types: { who: 4, find: 1.5, odd: 1.5 }, among: by[c] };
      }
    }
  };
  const THEME_EVERY = 4, THEME_SLOTS = 8, THEME_MIN = 15;   // темы — со второго дня занятий и от 15 знакомых
  function pickTheme(k) {
    if (k.length < THEME_MIN || Object.keys(S.days).length < 2) return null;
    const n = S.sessions || 0, since = n - (S.themeAt == null ? -99 : S.themeAt);
    // раз в 4–5 занятий: после 4 обычных — с вероятностью 1/2, после 5 — наверняка
    if (since < THEME_EVERY || (since === THEME_EVERY && Math.random() < 0.5)) return null;
    // из готовых тем — та, что была давно (или ещё не была)
    const used = S.themesUsed || {};
    const ready = [];
    for (const key of shuffle(Object.keys(THEMES))) { const r = THEMES[key].ready(k); if (r) ready.push({ key, r }); }
    ready.sort((a, b) => (used[a.key] ?? -99) - (used[b.key] ?? -99));
    if (!ready.length) return null;
    const t = ready[0], base = THEMES[t.key];
    return { key: t.key, n: t.r.n || base.n, d: t.r.d || base.d, pool: t.r.pool, types: t.r.types, vs: t.r.vs, among: t.r.among };
  }
  // тип вопроса на тематическом месте: из типов темы, доступных сейчас; только что бывший — реже
  function themeType(th, recentTypes) {
    const av = availableTypes(), ts = Object.keys(th.types).filter(t => av.includes(t));
    if (!ts.length) return 'who';
    const last = recentTypes[recentTypes.length - 1];
    return weighted(ts, ts.map(t => th.types[t] * (t === last ? 0.5 : 1)));
  }
  // запланированный новый художник для этого места
  function plannedNew(ses) {
    const x = (ses.intros || []).find(x => x.at <= ses.i && !S.artists[x.q]);
    return x ? x.q : null;
  }
  function nextTarget(ses, offPlan = false) {
    if (BETA && ses.plan && !offPlan) {
      const q = ses.plan[ses.i];
      if (q && S.artists[q]) return q;
    }
    const k = known();
    const notRecent = q => !ses.recentT.slice(-2).includes(q) || k.length < 3;
    const r = ses.retry.findIndex(x => x.at <= ses.i && notRecent(x.q));
    if (r >= 0) return ses.retry.splice(r, 1)[0].q;
    // новый художник — на 1, 3, 6, 10-м вопросе после знакомства
    for (const n of ses.newIds) if ([0, 2, 5, 9].includes(ses.i - n.at) && notRecent(n.q)) return n.q;
    // остальные — пропорционально весу «в работе»; кому пора на повторение — с надбавкой,
    // «ушедшие» художники всё равно изредка попадаются
    const cand = k.filter(notRecent);
    return weighted(cand, cand.map(q => st(q).w + 0.04 + (isDue(q) ? 0.35 : 0)));
  }
  function nextQuestion(ses) {
    for (let tries = 0; tries < 5; tries++) {
      const q = nextTarget(ses, tries >= 2);   // если по плану вопрос не собрался — берём другого художника
      const th = BETA && ses.theme && ses.themeSlots[ses.i] && tries < 2 ? ses.theme : null;
      const Q = th ? build(q, themeType(th, ses.recentTy), { vs: th.vs && th.vs(q), among: th.among })
        : (ty => build(q, ty) || (ty !== 'who' ? build(q, 'who') : null))(chooseType(q, false, ses.recentTy));
      if (Q && th) Q.theme = th.key;
      if (Q) { ses.recentT.push(q); ses.recentTy.push(Q.type); return Q; }
    }
    return null;
  }
  function afterAnswer(ses, Q, ok) {
    ses.i++; ses.done++; if (ok) ses.ok++;
    ses.streak = ok ? (ses.streak || 0) + 1 : 0; ses.best = Math.max(ses.best || 0, ses.streak);
    const r = ses.res[Q.q] = ses.res[Q.q] || { n: 0, ok: 0 }; r.n++; if (ok) r.ok++;
    if (!ok) ses.retry.push({ q: Q.q, at: ses.i + 3 });
  }
  function endSession(ses = null) {
    if (S.gate.failedAt) S.gate.sessionsSinceFail++;
    if (ses && ses.theme) { S.themeAt = S.sessions || 0; (S.themesUsed = S.themesUsed || {})[ses.theme.key] = S.themeAt; }
    S.sessions = (S.sessions || 0) + 1;
    save();
  }

  // ---------- экзамен ----------
  // Только невиденные картины, без подсказок по ходу. Покрывает всех знакомых художников,
  // недавно введённых — чаще. Порог 80%; провал откатывает стабильность ошибочных художников.
  function buildExam() {
    sesNew = new Set();
    const k = known();
    // «большая проверка»: каждый знакомый художник хотя бы раз (до 30 вопросов)
    const n = EXAMS_ON ? Math.min(25, Math.max(15, k.length * 2)) : Math.min(30, Math.max(15, k.length));
    const recent = [...k].sort((a, b) => st(b).intro - st(a).intro).slice(0, 6);
    let targets = shuffle([...k]);
    while (targets.length < n) targets.push(weighted(k, k.map(q => recent.includes(q) ? 3 : 1)));
    targets = shuffle(targets.slice(0, n));
    const qs = [];
    for (const q of targets) { const Q = build(q, chooseType(q, true), { exam: true }); if (Q) qs.push(Q); }
    return { qs, i: 0, answers: [] };
  }
  function finishExam(ex) {
    const okN = ex.answers.filter(a => a.ok).length;
    const score = okN / ex.answers.length;
    const pass = score >= 0.8;
    const per = {};
    ex.answers.forEach(a => { per[a.Q.q] = per[a.Q.q] || { ok: 0, n: 0 }; per[a.Q.q].n++; if (a.ok) per[a.Q.q].ok++; });
    // бонус за уверенную сдачу
    for (const q in per) if (per[q].ok === per[q].n) { const s = st(q); s.stab *= 1.3; s.due = now() + s.stab * DAY; }
    S.exams.push({ t: now(), score, n: ex.answers.length, pass, artists: known().length });
    if (pass || !EXAMS_ON) S.gate = { sinceExam: 0, failedAt: 0, sessionsSinceFail: 0 };
    else { S.gate.failedAt = now(); S.gate.sessionsSinceFail = 0; }
    save();
    return { score, pass, per };
  }

  // ---------- статистика ----------
  function stats() {
    const k = known();
    const seenCount = Object.keys(S.seen).length;
    const total = ORDER.reduce((s, q) => s + A[q].p.length, 0);
    const confs = Object.entries(S.conf).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, n]) => { const [x, y] = key.split('|'); return { x, y, n }; }).filter(c => A[c.x] && A[c.y]);
    const wk = S.log.filter(l => l.t > now() - 7 * DAY);
    return { known: k.length, all: ORDER.length, seenCount, total, due: dueList().length, confs, acc7: wk.length ? wk.filter(l => l.ok).length / wk.length : null, ans7: wk.length };
  }

  // ---------- утилиты ----------
  function rnd(n) { return Math.floor(Math.random() * n); }
  function avg(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
  function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function weighted(items, w) {
    const tot = w.reduce((s, x) => s + x, 0); let r = Math.random() * tot;
    for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function weightedSample(items, w, n) {
    items = [...items]; w = [...w]; const out = [];
    while (out.length < n && items.length) { const x = weighted(items, w); const i = items.indexOf(x); out.push(x); items.splice(i, 1); w.splice(i, 1); }
    return out;
  }

  window.Engine = {
    A, ORDER, get S() { return S; }, save, known, st, level, dueList, introReason, nextNew, introduce, introGallery,
    examStatus, pendingNew, poolLoad, BETA, LEVELS, capacity, newSession, nextQuestion, answer, afterAnswer, endSession, buildExam, finishExam, markSeen, paintingById,
    stats, shuffle, TYPES, skill, pace, WARMUP, build, mastery, dayStreak, pairDiff,
    set onSave(fn) { onSave = fn; },
    reset() { S = fresh(); save(); },
    importState(o, { silent = false } = {}) {
      S = migrate(Object.assign(fresh(), o));
      if (silent) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } } else save();
    },
    markBroken(id) { S.broken[id] = 1; save(); }, DAY
  };
})();
