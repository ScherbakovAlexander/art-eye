// Интерфейс: экраны и навигация. Вся логика обучения — в engine.js.
(function () {
  const E = window.Engine, A = E.A, M = window.MOVEMENTS;
  const $app = document.getElementById('app');
  let onKey = null;
  document.addEventListener('keydown', e => { if (onKey && !e.ctrlKey && !e.metaKey && !e.altKey) onKey(e); });

  // ---------- картинки с Wikimedia Commons ----------
  const SIZES = [960, 500, 330];
  function url(p, w) {
    const enc = encodeURIComponent(p.f);
    if (!w) return `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}`;
    const thumb = /\.tiff?$/i.test(p.f) ? `lossy-page1-${w}px-${enc}.jpg` : `${w}px-${enc}`;
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${p.h[0]}/${p.h}/${enc}/${thumb}`;
  }
  function img(p, w = 960, cls = '') {
    return `<img class="${cls}" src="${url(p, w)}" data-id="${p.id}" data-w="${w}" alt="" decoding="async" onerror="App.imgErr(this)">`;
  }
  // если миниатюры такого размера нет (оригинал меньше) — пробуем меньше, затем оригинал
  function imgErr(el) {
    const p = E.paintingById(el.dataset.id), w = +el.dataset.w;
    const next = SIZES.find(s => s < w);
    if (w && next) { el.dataset.w = next; el.src = url(p, next); }
    else if (w) { el.dataset.w = 0; el.src = url(p, 0); }
    else { E.markBroken(p.id); el.classList.add('broken'); }
  }
  function preload(Q) { if (Q) Q.paintings.forEach(p => { const i = new Image(); i.src = url(p, Q.grid ? 500 : 960); }); }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const title = p => p.t ? `«${esc(p.t)}»` : '<i>Без названия</i>';
  const caption = (p, full = true) => `<div class="cap">${title(p)}${p.y ? ', ' + p.y : ''}${full ? `<br><b>${A[p.a].n}</b> · ${M[A[p.a].m].n}` : ''}</div>`;
  const pct = x => Math.round(x * 100) + '%';
  function render(html, key = null) { $app.innerHTML = html; onKey = key; window.scrollTo(0, 0); }
  const nav = () => `<nav><a onclick="App.home()">Главная</a><a onclick="App.progress()">Прогресс</a><a onclick="App.gallery()">Галерея</a><a onclick="App.settings()">Настройки</a>${window.Sync && Sync.enabled ? `<a class="acct" onclick="App.account()">${Sync.user ? esc(Sync.user.email || 'Аккаунт') : 'Войти'}</a>` : ''}</nav>`;

  // ---------- главная ----------
  function home() {
    const s = E.stats(), r = E.introReason(), ex = E.examStatus();
    const k = E.known();
    let plan;
    const pc = E.pace();
    if (!k.length) plan = 'Знакомство с первыми художниками из очень разных эпох, затем практика. Первые 10 художников откроются быстро.';
    else if (r.ok && r.warmup) plan = `Разгон: ${k.length} из ${E.WARMUP}. Сейчас ${r.count} новых художника + практика.`;
    else if (r.ok) plan = `${r.count > 1 ? r.count + ' новых художника' : 'Новый художник'} + повторение${s.due ? ` (ждут: ${s.due})` : ''}.${pc.mode === 'fast' ? ' <span class="muted">Высокая точность — ускоряемся.</span>' : ''}`;
    else plan = `Повторение${s.due ? ` — ждут: ${s.due}` : ' и практика'}. <span class="muted">${r.why}.</span>`;
    const examCard = ex.need ? `<div class="card exam">
        <h3>Экзамен</h3>
        <p>Вы открыли ${E.S.gate.sinceExam} новых художников с прошлого экзамена. Экзамен — только невиденные картины, без подсказок. Нужно 80%, чтобы открыть следующих.</p>
        ${ex.canTake ? `<button class="primary" onclick="App.exam()">Сдать экзамен</button>` : `<p class="muted">Пересдача откроется после одного занятия.</p>`}
      </div>` : '';
    render(`${nav()}
      <header class="hero"><h1>Насмотренность</h1><p class="muted">Учимся узнавать художников и стили — по картинам, которые видим впервые.</p></header>
      <div class="statrow">
        <div><b>${s.known}</b><span>из ${s.all} художников</span></div>
        <div><b>${s.seenCount}</b><span>картин увидено</span></div>
        <div><b>${s.acc7 == null ? '—' : pct(s.acc7)}</b><span>точность за 7 дней</span></div>
      </div>
      ${examCard}
      <div class="card">
        <h3>Занятие</h3><p>${plan}</p>
        <button class="primary" onclick="App.session()">Начать</button>
      </div>`, e => { if (e.key === 'Enter') App.session(); });
  }

  // ---------- занятие ----------
  let ses = null, Q = null, nextQ = null;
  function session() {
    const r = E.introReason();
    const newIds = [];
    if (r.ok) for (let i = 0; i < r.count; i++) { const q = E.nextNew(newIds); if (q) newIds.push(q); }
    ses = E.newSession(newIds);
    ses.introQueue = [...newIds];
    nextIntro();
  }
  function nextIntro() {
    const q = ses.introQueue.shift();
    if (!q) return quizStep();
    const movFirst = !E.S.movSeen[A[q].m];
    E.introduce(q);
    if (movFirst) movementCard(A[q].m, () => intro(q)); else intro(q);
  }
  function movementCard(m, next) {
    const mv = M[m];
    App._next = next;
    render(`<div class="card intro">
        <div class="kicker">Новое направление</div>
        <h2>${mv.n}</h2><div class="muted">${mv.y}</div>
        <p>${mv.d}</p>
        <h4>На что смотреть</h4><ul>${mv.s.map(x => `<li>${x}</li>`).join('')}</ul>
        <button class="primary" onclick="App._next()">Дальше</button></div>`, e => { if (e.key === 'Enter') next(); });
  }
  function intro(q) {
    const a = A[q], gal = E.introGallery(q, E.known().length <= E.WARMUP ? 6 : 8);
    let i = 0;
    const draw = () => {
      const p = gal[i]; E.markSeen(p); E.save();
      render(`<div class="intro-wrap">
        <div class="intro-head">
          <div class="kicker">Новый художник · ${M[a.m].n}</div>
          <h2>${a.n}</h2><div class="muted">${a.y} · ${a.c}</div>
        </div>
        <div class="viewer">
          <button class="arrow" onclick="App._go(-1)" ${i ? '' : 'disabled'}>‹</button>
          <figure>${img(p)}${caption(p, false)}</figure>
          <button class="arrow" onclick="App._go(1)" ${i < gal.length - 1 ? '' : 'disabled'}>›</button>
        </div>
        <div class="dots">${gal.map((_, j) => `<span class="${j === i ? 'on' : ''}" onclick="App._go(${j - i})"></span>`).join('')}</div>
        <div class="card"><h4>Что замечать</h4><ul>${a.s.map(x => `<li>${x}</li>`).join('')}</ul>
        ${i === gal.length - 1 ? `<button class="primary" onclick="App._done()">${ses.introQueue.length ? 'Следующий художник' : 'К практике'}</button>` : `<button onclick="App._go(1)">Следующая картина</button>`}</div>
      </div>`, e => {
        if (e.key === 'ArrowRight') App._go(1);
        else if (e.key === 'ArrowLeft') App._go(-1);
        else if (e.key === 'Enter') i === gal.length - 1 ? App._done() : App._go(1);
      });
      if (gal[i + 1]) { const n = new Image(); n.src = url(gal[i + 1], 960); }
    };
    App._go = d => { const j = i + d; if (j >= 0 && j < gal.length) { i = j; draw(); } };
    App._done = nextIntro;
    draw();
  }

  function quizStep() {
    if (ses.i >= ses.len) return sessionEnd();
    Q = nextQ || E.nextQuestion(ses); nextQ = null;
    if (!Q) return sessionEnd();
    Q.paintings.forEach(E.markSeen); E.save();
    drawQuestion(Q, { progress: ses.i / ses.len, onPick: v => {
      const ok = E.answer(Q, v);
      E.afterAnswer(ses, Q, ok);
      feedback(Q, v, ok);
    } });
  }

  function drawQuestion(Q, { progress, onPick, exam }) {
    const pics = Q.grid
      ? `<div class="grid">${Q.paintings.map((p, j) => `<button class="pic" data-v="${p.id}" onclick="App._pick('${p.id}')"><span class="num">${j + 1}</span>${img(p, 500)}</button>`).join('')}</div>`
      : Q.pairView
        ? `<div class="pair">${Q.paintings.map(p => `<figure>${img(p, 500)}</figure>`).join('')}</div>`
        : `<figure class="main">${img(Q.paintings[0])}</figure>`;
    const opts = Q.grid ? '' : `<div class="opts ${Q.options.length === 2 ? 'two' : ''} ${Q.longOpts ? 'long' : ''}">${Q.options.map((o, j) => `<button data-v="${o.v}" onclick="App._pick('${o.v}')"><span class="num">${j + 1}</span>${o.label}</button>`).join('')}</div>`;
    App._pick = v => { if (App._locked) return; App._locked = true; onPick(isNaN(v) || Q.type !== 'era' ? v : +v); };
    App._locked = false;
    render(`<div class="quiz ${exam ? 'is-exam' : ''}">
        <div class="bar"><div style="width:${pct(progress)}"></div></div>
        <div class="prompt">${exam ? '<span class="tag">экзамен</span>' : ''}${Q.prompt}</div>
        ${pics}${opts}<div id="fb"></div></div>`, e => {
      const n = +e.key; if (n >= 1 && n <= Q.options.length) App._pick(String(Q.options[n - 1].v));
    });
  }

  function feedback(Q, v, ok) {
    const correct = String(Q.correct);
    document.querySelectorAll('[data-v]').forEach(b => {
      if (b.dataset.v === correct) b.classList.add('right');
      else if (b.dataset.v === String(v)) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    // подписи под картинками — каждая показанная картина тоже часть обучения
    if (Q.grid) document.querySelectorAll('.pic').forEach(b => { const o = A[E.paintingById(b.dataset.v).a]; b.insertAdjacentHTML('beforeend', `<div class="who">${o.n}${Q.type === 'findMov' ? `<br><span class="muted">${M[o.m].n}</span>` : ''}</div>`); });
    const capHtml = Q.grid ? '' : Q.paintings.map(p => caption(p)).join('');
    let extra = '';
    const t = A[Q.q];
    if (!ok) {
      const other = Q.type === 'who' || Q.type === 'trait' ? A[v] : Q.type === 'find' ? A[E.paintingById(v).a] : null;
      if (other) {
        const inQ = Q.paintings.map(p => p.id);
        const pool = other.p.filter(p => !E.S.broken[p.id] && !inQ.includes(p.id));
        const sample = pool.find(p => p.fam && E.S.seen[p.id]) || pool.find(p => p.fam) || pool[0];
        extra = `<div class="compare">
          <div><div class="kicker">Вы выбрали: ${other.n}</div><figure>${img(sample, 500)}${caption(sample, false)}</figure>
            <ul class="small">${other.s.slice(0, 3).map(x => `<li>${x}</li>`).join('')}</ul></div>
          <div><div class="kicker">Правильно: ${t.n}</div><ul class="small">${t.s.map(x => `<li>${x}</li>`).join('')}</ul></div></div>`;
      } else extra = `<div class="hint"><b>${t.n}</b>: ${t.s.slice(0, 3).join('; ')}</div>`;
    }
    document.getElementById('fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">
      <div class="verdict">${ok ? 'Верно' : 'Неверно'}</div>${capHtml}${extra}
      <button class="primary" onclick="App._cont()">Дальше</button></div>`;
    App._cont = quizStep;
    onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quizStep(); } };
    if (ses.i < ses.len) { nextQ = E.nextQuestion(ses); preload(nextQ); }
    document.getElementById('fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function sessionEnd() {
    E.endSession();
    const learned = ses.newIds.map(q => A[q].n);
    render(`${nav()}<div class="card center">
      <h2>Занятие окончено</h2>
      <div class="big">${ses.done ? pct(ses.ok / ses.done) : '—'}</div><p class="muted">${ses.ok} из ${ses.done} верно</p>
      ${learned.length ? `<p>Новые художники: <b>${learned.join(', ')}</b></p>` : ''}
      <button class="primary" onclick="App.home()">На главную</button>
      <button onclick="App.session()">Ещё занятие</button></div>`, e => { if (e.key === 'Enter') home(); });
    ses = null;
  }

  // ---------- экзамен ----------
  function exam() {
    const ex = E.buildExam();
    const step = () => {
      if (ex.i >= ex.qs.length) return examResult(ex);
      const Q = ex.qs[ex.i];
      Q.paintings.forEach(E.markSeen);
      preload(ex.qs[ex.i + 1]);
      drawQuestion(Q, { exam: true, progress: ex.i / ex.qs.length, onPick: v => {
        const ok = E.answer(Q, v, { exam: true });
        ex.answers.push({ Q, v, ok }); ex.i++;
        document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('chosen', b.dataset.v === String(v)));
        setTimeout(step, 250);
      } });
    };
    step();
  }
  function examResult(ex) {
    const r = E.finishExam(ex);
    const wrong = ex.answers.filter(a => !a.ok);
    const answerText = a => {
      const Q = a.Q;
      if (Q.type === 'who') return `Это <b>${A[Q.q].n}</b>, вы ответили: ${A[a.v].n}`;
      if (Q.type === 'trait') return `Это <b>${A[Q.q].n}</b>, вы выбрали описание стиля: ${A[a.v].n}`;
      if (Q.type === 'findMov') return `Нужно было найти: ${M[A[Q.q].m].n} (${A[Q.q].n})`;
      if (Q.type === 'movement') return `<b>${M[Q.correct].n}</b> (${A[Q.q].n}), вы ответили: ${M[a.v].n}`;
      if (Q.type === 'era') return `<b>${Q.paintings[0].y}</b> — ${A[Q.q].n}`;
      if (Q.type === 'pair') return `${Q.correct === 'yes' ? 'Один художник' : 'Разные художники'}: ${A[Q.q].n}${Q.b !== Q.q ? ' и ' + A[Q.b].n : ''}`;
      if (Q.type === 'odd') return `Лишняя — ${A[Q.b].n}, остальные — ${A[Q.q].n}`;
      return `Нужно было найти: ${A[Q.q].n}`;
    };
    const correctPic = a => a.Q.grid ? E.paintingById(a.Q.correct) : a.Q.paintings[0];
    render(`${nav()}<div class="card center ${r.pass ? 'pass' : 'fail'}">
      <div class="kicker">Экзамен</div><div class="big">${pct(r.score)}</div>
      <h2>${r.pass ? 'Сдан! Открыты новые художники' : 'Не сдан — нужно 80%'}</h2>
      <p class="muted">${r.pass ? 'Художники, где вы не ошиблись ни разу, получили бонус к интервалу.' : 'Ошибочные художники вернутся в повторение. Пересдача — после одного занятия.'}</p>
      <button class="primary" onclick="App.home()">На главную</button></div>
      ${wrong.length ? `<h3>Разбор ошибок</h3><div class="mistakes">${wrong.map(a => { const p = correctPic(a); return `<div class="mistake"><figure>${img(p, 500)}</figure><div>${answerText(a)}${caption(p)}</div></div>`; }).join('')}</div>` : ''}`);
  }

  // ---------- прогресс ----------
  function progress() {
    const s = E.stats();
    const movs = Object.keys(M).sort((a, b) => parseInt(M[a].y) - parseInt(M[b].y));
    const rows = movs.map(m => {
      const all = E.ORDER.filter(q => A[q].m === m);
      const k = all.filter(q => E.st(q));
      const locked = all.length - k.length;
      if (!k.length) return `<div class="mov locked"><div class="mov-h">${M[m].n} <span class="muted">${M[m].y}</span></div><div class="muted small">${locked} художн. закрыто</div></div>`;
      return `<div class="mov"><div class="mov-h">${M[m].n} <span class="muted">${M[m].y}</span></div>
        ${k.map(q => { const st = E.st(q), lv = E.level(q), seen = A[q].p.filter(p => E.S.seen[p.id]).length;
          return `<div class="art"><span class="nm">${A[q].n}</span><span class="lv lv${lv.k}">${lv.name}</span>
            <span class="small muted">${st.n ? pct(st.ok / st.n) : '—'} · ${seen}/${A[q].p.length} картин · интервал ${st.stab < 1 ? Math.round(st.stab * 24) + ' ч' : Math.round(st.stab) + ' дн'}</span></div>`; }).join('')}
        ${locked ? `<div class="muted small">ещё ${locked} закрыто</div>` : ''}</div>`;
    }).join('');
    const exams = E.S.exams.slice(-8).reverse().map(x => `<div class="small">${new Date(x.t).toLocaleDateString('ru')} — ${pct(x.score)} ${x.pass ? '✓' : '✗'} <span class="muted">(${x.n} вопр., ${x.artists} худ.)</span></div>`).join('');
    render(`${nav()}<h2>Прогресс</h2>
      <div class="statrow"><div><b>${s.known}/${s.all}</b><span>художников</span></div><div><b>${s.seenCount}/${s.total}</b><span>картин увидено</span></div><div><b>${s.ans7}</b><span>ответов за 7 дней</span></div></div>
      ${s.confs.length ? `<div class="card"><h4>Чаще всего путаете</h4>${s.confs.map(c => `<div class="small">${A[c.x].n} → ${A[c.y].n} <span class="muted">×${c.n}</span></div>`).join('')}</div>` : ''}
      ${typeStats()}
      ${exams ? `<div class="card"><h4>Экзамены</h4>${exams}</div>` : ''}
      ${rows}`);
  }

  function typeStats() {
    const rows = Object.keys(E.TYPES).filter(t => E.S.skill[t] && E.S.skill[t].n).map(t => {
      const k = E.skill(t), last = k.recent.length ? k.recent.reduce((a, b) => a + b, 0) / k.recent.length : 0;
      return `<tr><td>${E.TYPES[t].label}</td><td class="nr">${k.n}</td><td class="nr">${pct(k.ok / k.n)}</td><td class="nr">${pct(last)}</td><td><span class="meter"><span style="width:${pct(k.d)}"></span></span></td></tr>`;
    }).join('');
    if (!rows) return '';
    const pc = E.pace();
    const mode = { fast: 'ускоряемся: больше новых художников, похожие варианты', normal: 'обычный темп', easy: 'упрощаем: без новых художников, контрастные варианты' }[pc.mode];
    return `<div class="card"><h4>По типам вопросов</h4>
      <p class="small muted">Точность за последние 30 ответов: ${pc.acc == null ? '—' : pct(pc.acc)} — ${mode}. Сложность каждого типа подстраивается отдельно: растёт при верных ответах, падает при ошибках.</p>
      <div class="tablewrap"><table><tr><th>Тип</th><th>Ответов</th><th>Точность</th><th>Посл. 20</th><th>Сложность</th></tr>${rows}</table></div></div>`;
  }

  // ---------- галерея ----------
  // Свободный просмотр всех работ открытых художников — «насмотренность» без вопросов.
  function gallery(q) {
    const k = E.known();
    if (!k.length) return render(`${nav()}<div class="card">Галерея откроется после первого занятия.</div>`);
    q = q || k[k.length - 1];
    const a = A[q];
    render(`${nav()}<div class="chips">${k.map(x => `<button class="${x === q ? 'on' : ''}" onclick="App.gallery('${x}')">${A[x].n}</button>`).join('')}</div>
      <h2>${a.n} <span class="muted small">${a.y} · ${M[a.m].n}</span></h2>
      <div class="wall">${[...a.p].sort((x, y) => (x.y || 9999) - (y.y || 9999)).map(p => `<button onclick="App.lightbox('${p.id}')">${img(p, 330)}</button>`).join('')}</div>`);
  }
  function lightbox(id) {
    const p = E.paintingById(id); E.markSeen(p); E.save();
    const el = document.createElement('div'); el.className = 'lightbox';
    el.innerHTML = `<figure>${img(p)}${caption(p)}</figure>`;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
  }

  // ---------- настройки ----------
  function settings() {
    const st = E.S.settings;
    render(`${nav()}<h2>Настройки</h2><div class="card">
      <label>Новых художников в день <input type="number" min="1" max="10" value="${st.newPerDay}" onchange="App._set('newPerDay',this.value)"></label>
      <label>Вопросов в занятии <input type="number" min="5" max="50" value="${st.sessionLen}" onchange="App._set('sessionLen',this.value)"></label></div>
      <div class="card"><h4>Сохранение прогресса</h4><p class="muted small">Прогресс хранится в этом браузере. Можно перенести файлом.</p>
      <button onclick="App._export()">Скачать прогресс</button>
      <label class="btn">Загрузить из файла<input type="file" accept=".json" hidden onchange="App._import(this.files[0])"></label>
      <button class="danger" onclick="App._reset()">Сбросить всё</button></div>`);
  }
  // ---------- аккаунт ----------
  function account(msg = '') {
    if (!window.Sync || !Sync.enabled) return home();
    if (Sync.user) return render(`${nav()}<div class="card"><h2>Аккаунт</h2>
      <p>Вы вошли как <b>${esc(Sync.user.email || Sync.user.displayName || '')}</b>. Прогресс сохраняется в аккаунте и доступен на любом устройстве.</p>
      <p class="muted small">${Sync.status}</p>
      <button onclick="Sync.signOut().then(()=>App.home())">Выйти</button></div>`);
    render(`${nav()}<div class="card auth"><h2>Вход</h2>
      <p class="muted">Войдите, чтобы прогресс сохранялся в аккаунте и был доступен с телефона и компьютера.</p>
      ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
      <form onsubmit="event.preventDefault();App._auth(this, event.submitter && event.submitter.value)">
        <label>Email<input id="auth-email" name="email" type="email" autocomplete="email" required></label>
        <label>Пароль<input id="auth-pass" name="pass" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="primary" value="in">Войти</button><button value="up">Создать аккаунт</button>
      </form>
      <button onclick="App._google()">Войти через Google</button>
      <p class="small muted">Без входа прогресс хранится только в этом браузере.</p></div>`);
  }

  window.App = {
    home, session, exam, progress, gallery, lightbox, settings, imgErr, account,
    _auth(f, mode) {
      Sync.emailAuth(mode === 'up', f.email.value, f.pass.value).then(() => home()).catch(e => account(Sync.errText(e)));
    },
    _google() { Sync.google().then(() => home()).catch(e => account(Sync.errText(e))); },
    refresh() { if (!ses) home(); },
    _set(k, v) { E.S.settings[k] = Math.max(1, +v || 1); E.save(); },
    _export() {
      const b = new Blob([JSON.stringify(E.S)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `arteye-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    },
    _import(f) { if (!f) return; f.text().then(t => { E.importState(JSON.parse(t)); home(); }).catch(() => alert('Не удалось прочитать файл')); },
    _reset() { if (confirm('Удалить весь прогресс?')) { E.reset(); home(); } }
  };
  home();
})();
