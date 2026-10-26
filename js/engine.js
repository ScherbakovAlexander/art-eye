// Движок обучения: состояние, интервальные повторения по художникам, выбор картин и вопросов.
// Единица запоминания — художник (стиль), а не картина. Картины берутся каждый раз новые,
// поэтому выучить конкретное полотно бесполезно — приходится схватывать почерк.

(function () {
  const KEY = 'arteye.v1';
  const DAY = 864e5;
  const now = () => Date.now();
  const today = () => new Date().toISOString().slice(0, 10);

  // ---------- данные ----------
  const A = {};          // qid -> artist (+ paintings)
  const ORDER = [];      // порядок из curriculum
  for (const a of window.ARTISTS) {
    const raw = window.PAINTINGS[a.q];
    if (!raw) { console.warn('нет картин для', a.n); continue; }
    // год вне жизни художника — ошибка в Wikidata, лучше не показывать
    const [born, died] = (a.y.match(/\d{4}/g) || []).map(Number);
    const year = y => y && born && (y < born + 12 || y > died + 1) ? null : y;
    a.p = raw.map((r, i) => ({ id: a.q + '#' + i, a: a.q, h: r[0], f: r[1], y: year(r[2]), t: r[3], fam: !!r[4] }));
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
      settings: { newPerDay: 3, sessionLen: 15 },
      skill: {},          // по типу вопроса: { n, ok, recent[], d } — d ∈ [0,1] сложность этого типа
      updatedAt: 0, owner: null
    };
  }
  let S = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(fresh(), s); } catch (e) { }
    return fresh();
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
  function introduce(q) {
    S.artists[q] = { intro: now(), stab: 0.5, due: now() + 0.5 * DAY, last: now(), ok: 0, n: 0, lapses: 0, recent: [] };
    S.movSeen[A[q].m] = S.movSeen[A[q].m] || now();
    S.day.intro++; S.gate.sinceExam++;
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
  function level(q) {
    const s = st(q); if (!s) return { k: 0, name: 'закрыт' };
    if (s.stab < 1) return { k: 1, name: 'знакомство' };
    if (s.stab < 7) return { k: 2, name: 'учу' };
    if (s.stab < 30) return { k: 3, name: 'знаю' };
    return { k: 4, name: 'уверенно' };
  }
  const dueList = () => known().filter(q => st(q).due <= now()).sort((a, b) => overdue(b) - overdue(a));
  const overdue = q => (now() - st(q).due) / (st(q).stab * DAY);
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

  // ---------- ввод новых художников ----------
  // Сначала «якоря» (ярус 1) из разных направлений — максимальный контраст.
  // Внутри яруса предпочитаем направление, где знакомых художников меньше всего.
  // Близкие соседи (ярус 3: Сислей рядом с Моне) идут, когда якоря уже усвоены.
  function nextNew(exclude = []) {
    const k = known();
    const cand = ORDER.filter(q => !S.artists[q] && !exclude.includes(q));
    if (!cand.length) return null;
    const minTier = Math.min(...cand.map(q => A[q].t));
    const movCount = m => k.filter(q => A[q].m === m).length + exclude.filter(q => A[q].m === m).length;
    return cand.filter(q => A[q].t === minTier)
      .map((q, i) => ({ q, score: movCount(A[q].m) * 10 + i * 0.01 }))
      .sort((a, b) => a.score - b.score)[0].q;
  }
  const WARMUP = 10;
  function examStatus() {
    const k = known().length;
    const need = k >= WARMUP && S.gate.sinceExam >= 6;
    const canTake = need && (!S.gate.failedAt || S.gate.sessionsSinceFail >= 1);
    return { need, canTake };
  }
  function introReason() {
    rollDay();
    const k = known(), p = pace();
    if (!k.length) return { ok: true, count: 4 };
    if (!ORDER.some(q => !S.artists[q])) return { ok: false, why: 'Все художники открыты' };
    // разгон: быстро набираем первые 10 художников, без дневного лимита
    if (k.length < WARMUP) {
      if (p.mode === 'easy') return { ok: false, why: 'Точность ниже 65% — сначала закрепим знакомых' };
      return { ok: true, count: Math.min(p.mode === 'fast' ? 4 : 3, WARMUP - k.length), warmup: true };
    }
    if (examStatus().need) return { ok: false, why: 'Сдайте экзамен, чтобы открыть новых художников' };
    if (p.mode === 'easy') return { ok: false, why: `Точность ${Math.round(p.acc * 100)}% — упрощаем: только повторение` };
    const limit = S.settings.newPerDay + (p.mode === 'fast' ? 3 : 0);
    if (S.day.intro >= limit) return { ok: false, why: 'Лимит новых художников на сегодня' };
    const shaky = k.filter(q => st(q).stab < 1).length;
    if (shaky >= (p.mode === 'fast' ? 6 : 4)) return { ok: false, why: 'Сначала закрепите недавних художников' };
    if (dueList().length > 15) return { ok: false, why: 'Много художников ждут повторения' };
    return { ok: true, count: p.mode === 'fast' ? 2 : 1 };
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
  function distractors(q, n, type = 'who', pool = known()) {
    const t = A[q], s = st(q);
    const d = skill(type).d;
    const mult = 0.15 + 1.6 * d * (0.5 + 0.5 * Math.min(1, (s ? s.stab : 0) / 5));
    const cand = pool.filter(c => c !== q);
    const w = cand.map(c => {
      const o = A[c];
      const same = o.m === t.m ? 1 : 0;
      const era = Math.abs(o.mid - t.mid) < 60 ? 1 : 0;
      const conf = (S.conf[q + '|' + c] || 0) + (S.conf[c + '|' + q] || 0);
      return 1 + mult * (5 * same + 2 * era) + 3 * Math.min(conf, 4);
    });
    return weightedSample(cand, w, n);
  }

  // ---------- вопросы ----------
  // label — для статистики; w — вес в обычном занятии (чаще всего «кто автор»), we — в экзамене
  const TYPES = {
    who: { label: 'Кто автор', min: 2, w: 6, we: 6 },
    find: { label: 'Найти картину художника', min: 4, w: 2, we: 2 },
    trait: { label: 'Стиль художника (описание)', min: 4, w: 1.2, we: 1 },
    movement: { label: 'Стиль картины (направление)', min: 4, movs: 2, w: 1.5, we: 1.5 },
    findMov: { label: 'Найти картину направления', min: 5, movs: 4, w: 0.8, we: 0.8 },
    odd: { label: 'Лишняя картина', min: 5, w: 1.5, we: 2 },
    pair: { label: 'Один ли художник', min: 7, w: 1, we: 1 },
    era: { label: 'Когда написана', min: 6, w: 0.8, we: 0 },
    title: { label: 'Название картины', min: 3, w: 0.4, we: 0 }
  };
  function availableTypes() {
    const k = known(), movs = new Set(k.map(q => A[q].m)).size;
    return Object.keys(TYPES).filter(t => k.length >= TYPES[t].min && (!TYPES[t].movs || movs >= TYPES[t].movs));
  }
  function chooseType(q, exam) {
    const av = availableTypes();
    const s = st(q);
    // свежему художнику — только «кто автор», чтобы закрепить связь картина→имя
    if (!exam && s && s.n < 3) return 'who';
    // при низкой общей точности сложные форматы реже
    const easy = !exam && pace().mode === 'easy';
    return weighted(av, av.map(t => {
      const w = exam ? TYPES[t].we : TYPES[t].w;
      return (easy && t !== 'who' && t !== 'movement' ? w * 0.4 : w) || 0.0001;
    }));
  }
  const nOpts = type => skill(type).d < 0.2 ? 3 : 4;
  function traitLabel(q) { return shuffle(A[q].s).slice(0, 2).join('; '); }
  function build(q, type, opt = {}) {
    const a = A[q], uo = !!opt.exam;
    const k = known();
    if (type === 'who') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const ds = distractors(q, Math.min(nOpts(type) - 1, k.length - 1), type);
      return { type, q, prompt: 'Кто автор?', paintings: [p], options: shuffle([q, ...ds]).map(x => ({ v: x, label: A[x].n })), correct: q };
    }
    if (type === 'trait') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const ds = distractors(q, nOpts(type) - 1, type);
      return { type, q, prompt: 'Какое описание стиля подходит автору?', paintings: [p], options: shuffle([q, ...ds]).map(x => ({ v: x, label: traitLabel(x) })), correct: q, longOpts: true };
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
    if (type === 'title') {
      const titled = a.p.filter(p => p.t && !S.broken[p.id]);
      const fam = titled.filter(p => p.fam);
      const p = fam.length ? fam[rnd(fam.length)] : null;
      const others = [...new Set(shuffle(titled.filter(x => x !== p).map(x => x.t)))].filter(t => p && t !== p.t).slice(0, 3);
      if (!p || others.length < 3) return build(q, 'who', opt);
      return { type, q, prompt: `Как называется эта картина (${a.n})?`, paintings: [p], options: shuffle([p.t, ...others]).map(t => ({ v: t, label: t })), correct: p.t, longOpts: true };
    }
    if (type === 'era') {
      const p = pickPainting(q, { unseenOnly: uo, needYear: true }); if (!p) return build(q, 'who', opt);
      const span = p.y < 1800 ? 50 : 25;
      const bin = Math.floor(p.y / span) * span;
      const shift = rnd(4);
      const opts = [0, 1, 2, 3].map(i => bin + (i - shift) * span);
      return { type, q, prompt: 'Когда написана?', paintings: [p], options: opts.map(b => ({ v: b, label: `${b}–${b + span - 1}` })), correct: bin };
    }
    if (type === 'find') {
      const p = pickPainting(q, { unseenOnly: uo }); if (!p) return null;
      const ds = distractors(q, 3, type);
      const ps = shuffle([p, ...ds.map(d => pickPainting(d, { unseenOnly: uo }))].filter(Boolean));
      return { type, q, prompt: `Где работа: ${a.n}?`, paintings: ps, options: ps.map(x => ({ v: x.id })), correct: p.id, grid: true };
    }
    if (type === 'odd') {
      const [b] = distractors(q, 1, type);
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
      const b = sameArtist ? q : distractors(q, 1, type)[0];
      const p2 = p1 && pickPainting(b, { exclude: [p1.id], unseenOnly: uo });
      if (!p2) return build(q, 'who', opt);
      return { type, q, b, prompt: 'Это один и тот же художник?', paintings: [p1, p2], options: [{ v: 'yes', label: 'Да, один' }, { v: 'no', label: 'Нет, разные' }], correct: sameArtist ? 'yes' : 'no', pairView: true };
    }
  }
  // применить ответ: SR, путаница, лог
  function answer(Q, v, { exam = false } = {}) {
    rollDay();
    const ok = v === Q.correct;
    const w = exam ? 1 : ({ who: 1, find: 0.8, odd: 0.8, trait: 0.6, pair: 0.6, movement: 0.4, findMov: 0.3, title: 0.3, era: 0 })[Q.type];
    if (w > 0) grade(Q.q, ok, w);
    if (!exam) trainSkill(Q.type, ok);
    if (!ok) {
      let other = null;
      if (Q.type === 'who' || Q.type === 'trait') other = v;
      else if (Q.type === 'find') other = paintingById(v).a;
      else if (Q.type === 'odd' || Q.type === 'pair') other = Q.b !== Q.q ? Q.b : null;
      if (other && other !== Q.q) S.conf[Q.q + '|' + other] = (S.conf[Q.q + '|' + other] || 0) + 1;
    }
    S.log.push({ t: now(), q: Q.q, ty: Q.type, ok, ex: exam ? 1 : 0 }); if (S.log.length > 500) S.log.shift();
    S.day.answers++; if (ok) S.day.correct++;
    save();
    return ok;
  }
  function paintingById(id) { const [q, i] = id.split('#'); return A[q].p[+i]; }

  // ---------- занятие ----------
  // Очередь цели: (1) повтор ошибок через 3 вопроса, (2) новые художники на расширяющихся
  // интервалах внутри занятия (1, 3, 6, 10, 15-й вопрос), (3) просроченные по SR,
  // (4) остальные — чаще слабые. Один художник не идёт два раза подряд.
  function newSession(newIds) {
    return { newIds, i: 0, len: S.settings.sessionLen + newIds.length * 3, retry: [], recentT: [], ok: 0, done: 0, dueSeen: {} };
  }
  function nextTarget(ses) {
    const k = known();
    const notRecent = q => !ses.recentT.slice(-2).includes(q) || k.length < 3;
    const r = ses.retry.findIndex(x => x.at <= ses.i && notRecent(x.q));
    if (r >= 0) return ses.retry.splice(r, 1)[0].q;
    const sched = [0, 2, 5, 9, 14];
    for (let j = 0; j < ses.newIds.length; j++) {
      if (sched.map(x => x + j).includes(ses.i) && notRecent(ses.newIds[j])) return ses.newIds[j];
    }
    const due = dueList().filter(q => !ses.dueSeen[q] && notRecent(q));
    if (due.length) { ses.dueSeen[due[0]] = 1; return due[0]; }
    const cand = k.filter(notRecent);
    return weighted(cand, cand.map(q => { const s = st(q); const err = s.recent.length ? 1 - avg(s.recent) : 0.5; return (1 + 3 * err) / (0.5 + Math.sqrt(s.stab)); }));
  }
  function nextQuestion(ses) {
    for (let tries = 0; tries < 5; tries++) {
      const q = nextTarget(ses);
      const Q = build(q, chooseType(q, false));
      if (Q) { ses.recentT.push(q); return Q; }
    }
    return null;
  }
  function afterAnswer(ses, Q, ok) {
    ses.i++; ses.done++; if (ok) ses.ok++;
    if (!ok) ses.retry.push({ q: Q.q, at: ses.i + 3 });
  }
  function endSession() {
    if (S.gate.failedAt) S.gate.sessionsSinceFail++;
    save();
  }

  // ---------- экзамен ----------
  // Только невиденные картины, без подсказок по ходу. Покрывает всех знакомых художников,
  // недавно введённых — чаще. Порог 80%; провал откатывает стабильность ошибочных художников.
  function buildExam() {
    const k = known();
    const n = Math.min(25, Math.max(15, k.length * 2));
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
    if (pass) S.gate = { sinceExam: 0, failedAt: 0, sessionsSinceFail: 0 };
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
    examStatus, newSession, nextQuestion, answer, afterAnswer, endSession, buildExam, finishExam, markSeen, paintingById,
    stats, shuffle, TYPES, skill, pace, WARMUP,
    set onSave(fn) { onSave = fn; },
    reset() { S = fresh(); save(); },
    importState(o, { silent = false } = {}) {
      S = Object.assign(fresh(), o);
      if (silent) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } } else save();
    },
    markBroken(id) { S.broken[id] = 1; save(); }, DAY
  };
})();
