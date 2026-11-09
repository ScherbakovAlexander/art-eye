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
  // портрет художника (Wikidata); по нажатию — крупно
  function portrait(q, cls = 'ava') {
    const r = (window.PORTRAITS || {})[q]; if (!r) return '';
    const p = { h: r[0], f: r[1] };
    return `<img class="${cls}" src="${url(p, 250)}" alt="" onerror="this.remove()" onclick="App.showPortrait('${q}')">`;
  }
  function showPortrait(q) {
    const r = (window.PORTRAITS || {})[q]; if (!r) return;
    const el = document.createElement('div'); el.className = 'lightbox';
    el.innerHTML = `<figure><img src="${url({ h: r[0], f: r[1] }, 500)}" alt="" onerror="this.src='${url({ h: r[0], f: r[1] }, 0)}'"><div class="cap"><b>${A[q].n}</b></div></figure>`;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
  }
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
  // fit — экран занятия: ровно в высоту телефона, без прокрутки
  function render(html, key = null, fit = false) {
    closeMenu(); document.body.classList.toggle('fit', fit);
    $app.innerHTML = html; onKey = key; window.scrollTo(0, 0);
  }
  const acctLabel = () => window.Sync && Sync.user ? esc(Sync.user.email || 'Аккаунт') : 'Войти / регистрация';
  const gear = () => `<button class="iconbtn" onclick="App.menu()" aria-label="Меню">⚙</button>`;
  // на телефоне остаются название, вход и шестерёнка, остальное — в меню
  const nav = () => `<nav><a class="brand" onclick="App.home()">Насмотренность${E.BETA ? ' <span class="beta">тест</span>' : ''}</a>
    <span class="links"><a onclick="App.progress()">Прогресс</a><a onclick="App.gallery()">Галерея</a><a onclick="App.settings()">Настройки</a></span>
    <span class="sp"></span><a class="acct" onclick="App.account()">${window.Sync && Sync.user ? acctLabel() : 'Войти'}</a>${gear()}</nav>`;
  // верхняя строка экранов занятия: выход, прогресс, меню
  const topRow = (progress = null) => `<div class="top"><button class="iconbtn" onclick="App.home()" aria-label="Выйти">✕</button>
    ${progress == null ? '<span class="sp"></span>' : `<div class="bar"><div style="width:${pct(progress)}"></div></div>`}${gear()}</div>`;
  // меню-шестерёнка: доступно с любого экрана
  function menu() {
    if (closeMenu()) return;
    const el = document.createElement('div'); el.className = 'menu'; el.id = 'menu';
    el.innerHTML = `<div class="sheet">
      <button class="acct" onclick="App.account()">👤 ${acctLabel()}</button>
      <button onclick="App.home()">Главная</button><button onclick="App.progress()">Прогресс</button>
      <button onclick="App.gallery()">Галерея</button><button onclick="App.settings()">Настройки</button></div>`;
    el.onclick = e => { if (e.target === el) closeMenu(); };
    document.body.appendChild(el);
  }
  function closeMenu() { const m = document.getElementById('menu'); if (m) m.remove(); return !!m; }

  // ---------- главная ----------
  function home() {
    if (window.Sync && Sync.flush) Sync.flush();   // вышли из занятия на главную — тоже отправляем
    const s = E.stats(), r = E.introReason(), ex = E.examStatus();
    const k = E.known();
    let plan;
    const pc = E.pace();
    const active = k.filter(q => E.st(q).w > 0.3).length;
    if (!k.length) plan = 'Знакомство с первыми художниками из очень разных эпох, затем практика. Новые будут появляться по ходу занятия.';
    else if (r.ok) plan = `Практика${s.due ? ` и повторение (ждут: ${s.due})` : ''}. Новые художники появятся по ходу занятия${r.warmup ? ` — разгон: ${k.length} из ${E.WARMUP}` : ''}.${pc.mode === 'fast' ? ' <span class="muted">Высокая точность — в работе больше художников.</span>' : ''}`;
    else plan = `Практика${s.due ? ` и повторение (ждут: ${s.due})` : ''}. <span class="muted">${r.why}.</span>`;
    if (k.length) plan += `<br><span class="muted small">В работе: ${active} худ. · нагрузка ${r.load.toFixed(1)} из ${r.cap.toFixed(1)}</span>`;
    const examCard = ex.need ? `<div class="card exam">
        <h3>Экзамен</h3>
        <p>Вы открыли ${E.S.gate.sinceExam} новых художников с прошлого экзамена. Экзамен — только невиденные картины, без подсказок, нужно 80%.
        ${ex.block ? 'Пока он не сдан, новые художники не открываются.' : `Можно сдать сейчас; без экзамена откроется ещё ${ex.left} худ.`}</p>
        ${ex.canTake ? `<button class="${ex.block ? 'primary' : ''}" onclick="App.exam()">Сдать экзамен</button>` : `<p class="muted">Пересдача откроется после одного занятия.</p>`}
      </div>` : '';
    render(`${nav()}
      <p class="muted hero">Учимся узнавать художников и стили — по картинам, которые видим впервые.</p>
      ${masteryBar()}
      <div class="statrow">
        <div><b>${s.known}</b><span>из ${s.all} художников</span></div>
        <div><b>${s.seenCount}</b><span>картин увидено</span></div>
        <div><b>${s.acc7 == null ? '—' : pct(s.acc7)}</b><span>точность за 7 дней</span></div>
      </div>
      ${E.BETA ? sessionCard() : `<div class="card">
        <h3>Занятие</h3><p>${plan}</p>
        <button class="primary" onclick="App.session()">Начать</button>
      </div>`}
      ${examCard}`, e => { if (e.key === 'Enter') App.session(); });
  }

  // стенд: номер и состав занятия. Новый художник в начале — анонс; «сюрприз» в середине не выдаём.
  function sessionCard() {
    // план устарел, если с тех пор изменился прогресс (вход в аккаунт, загрузка файла)
    if (!planned || planned.start.known !== E.known().length || planned.sesNo !== E.S.sessions) { planned = E.newSession(); planned.sesNo = E.S.sessions; }
    const p = planned, num = (E.S.sessions || 0) + 1;
    const start = p.intros.filter(x => x.at === 0).map(x => x.q);
    const later = new Set(p.intros.filter(x => x.at > 0).map(x => x.q));
    const counts = {};
    for (const q of new Set(p.plan)) {
      if (!q || later.has(q)) continue;
      const k = start.includes(q) ? 1 : E.level(q).k;
      counts[k] = (counts[k] || 0) + 1;
    }
    const lv = E.LEVELS.filter(l => counts[l.k]).map(l => `<span class="lvchip lv${l.k}">${l.icon} ${counts[l.k]} ${lvWord(l, counts[l.k])}</span>`).join('');
    const news = start.length
      ? `<p class="announce">✨ ${E.known().length ? `Сегодня знакомство с ${start.length > 1 ? `${start.length} новыми художниками` : 'новым художником'}` : 'Знакомство с первыми художниками'}</p>` : '';
    return `<div class="card">
        <h3>Занятие ${num}</h3>
        <p class="muted">${p.len} вопросов${lv ? ' · художники:' : ''}</p>
        ${lv ? `<div class="lvchips">${lv}</div>` : ''}
        ${news}
        <button class="primary" onclick="App.session()">Начать</button>
      </div>`;
  }
  // «2 новых», «1 освоен», «5 освоено»; глагольные уровни (учу, повторяю, знаю) не склоняются
  const lvWord = (l, n) => ({ 1: plural(n, 'новый', 'новых', 'новых'), 5: plural(n, 'освоен', 'освоено', 'освоено'), 6: plural(n, 'эксперт', 'эксперта', 'экспертов') })[l.k] || l.name;
  // сколько художников на каждом уровне (стенд)
  function levelCounts() {
    const c = {}; for (const q of E.known()) { const k = E.level(q).k; c[k] = (c[k] || 0) + 1; }
    return `<div class="lvchips">${E.LEVELS.slice(1).map(l => `<span class="lvchip lv${l.k} ${c[l.k] ? '' : 'zero'}">${l.icon} ${c[l.k] || 0} ${lvWord(l, c[l.k] || 0)}</span>`).join('')}</div>`;
  }
  function masteryBar() {
    const m = E.mastery(), streak = E.dayStreak();
    return `<div class="mastery"><div class="mh"><span>Пройдено <b>${(m * 100).toFixed(m < 0.1 ? 1 : 0)}%</b></span>${streak > 1 ? `<span class="streak">🔥 ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд</span>` : ''}</div>
      <div class="bar big"><div style="width:${(m * 100).toFixed(1)}%"></div></div>
      <div class="muted small">${E.BETA ? 'Художник освоен, когда вы узнаёте его 10 раз подряд в разные дни.' : 'Художник считается освоенным, когда вы узнаёте его и через месяц.'}</div></div>`;
  }
  const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? b : c;

  // ---------- занятие ----------
  let ses = null, Q = null, nextQ = null;
  let planned = null;   // стенд: занятие планируется уже на главной, чтобы показать его состав
  function session() {
    ses = planned || E.newSession(); planned = null; nextQ = null;
    ses.startLv = Object.fromEntries(E.known().map(q => [q, E.level(q).k]));
    quizStep();
  }
  // новый художник вводится прямо по ходу занятия, когда пул освободился
  function startIntro(q) {
    if (E.wantPrecheck(q)) return precheck(q, 0, []);
    introNow(q);
  }
  // стенд: «Узнаёте автора?» — 2 картины без подсказок. Оба раза верно — художник уже знаком, учить не надо.
  function precheck(q, j, used) {
    const P = E.precheckQuestion(q, used);
    if (!P) return introNow(q);
    P.paintings.forEach(E.markSeen); E.save();
    drawQuestion(P, { progress: ses.i / ses.len, onPick: v => {
      const ok = v === P.correct;
      document.querySelectorAll('[data-v]').forEach(b => b.classList.add(b.dataset.v === q ? 'right' : b.dataset.v === v ? 'wrong' : 'dim'));
      const fb = document.getElementById('fb'); fb.style.minHeight = fb.offsetHeight + 'px';
      const msg = ok ? (j === 0 ? '✓ Верно! Ещё одна картина' : '✓ Верно! Вы его уже знаете') : `Это <b>${A[q].n}</b> — давайте познакомимся`;
      fb.innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}"><div class="fhead"><div class="verdict">${msg}</div>
        <button class="primary next" onclick="App._cont()">Дальше ›</button></div><div class="fbody"></div></div>`;
      App._cont = () => ok ? (j === 0 ? precheck(q, 1, used.concat(P.paintings[0].id)) : recognized(q)) : introNow(q);
      onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); App._cont(); } };
    } });
  }
  function recognized(q) {
    E.introduce(q, ses, { pre: true }); nextQ = null;
    const a = A[q];
    render(`<div class="stage">${topRow()}
        <div class="scroll center">
          <div class="kicker">Новый художник</div>
          <div class="head">${portrait(q)}<div><h2>${a.n}</h2><div class="muted small">${a.y} · ${a.c} · ${M[a.m].n}</div></div></div>
          <p class="announce">🎉 Вы его уже знаете — сразу уровень ✅ «знаю»</p>
          <div class="traits"><h4>Что замечать</h4>${a.s.map(x => `<span>${x}</span>`).join('')}</div>
        </div>
        <div class="navrow"><button onclick="App._look()">Посмотреть картины</button><button class="primary" onclick="App._cont()">Дальше ›</button></div></div>`,
      e => { if (e.key === 'Enter') quizStep(); }, true);
    App._cont = quizStep;
    App._look = () => intro(q);
  }
  function introNow(q) {
    const movFirst = !E.S.movSeen[A[q].m];
    E.introduce(q, ses); nextQ = null;
    if (movFirst) movementCard(A[q].m, () => intro(q)); else intro(q);
  }
  function movementCard(m, next) {
    const mv = M[m];
    App._next = next;
    render(`<div class="stage">${topRow()}
        <div class="scroll">
          <div class="kicker">Новое направление</div>
          <h2>${mv.n}</h2><div class="muted">${mv.y}</div>
          <p>${mv.d}</p>
          <h4>На что смотреть</h4><ul>${mv.s.map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
        <button class="primary wide" onclick="App._next()">Дальше</button></div>`, e => { if (e.key === 'Enter') next(); }, true);
  }
  // свайп влево/вправо по картине, тап по левой/правой части — листание
  function swipe(el, go) {
    let x0 = null, y0 = 0;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { e.preventDefault(); go(dx < 0 ? 1 : -1); }
    });
    el.addEventListener('click', e => { const r = el.getBoundingClientRect(); go(e.clientX - r.left < r.width * 0.35 ? -1 : 1); });
  }
  function intro(q) {
    const a = A[q], gal = E.introGallery(q, E.known().length <= E.WARMUP ? 6 : 8);
    let i = 0;
    const draw = () => {
      const p = gal[i]; E.markSeen(p); E.save();
      const last = i === gal.length - 1;
      render(`<div class="stage intro">${topRow()}
        <div class="head">${portrait(q)}<div><div class="kicker">Новый художник</div>
          <h2>${a.n}</h2><div class="muted small">${a.y} · ${a.c} · ${M[a.m].n}</div></div></div>
        <figure class="frame swipe" id="viewer">${img(p)}
          ${i ? '<span class="edge l">‹</span>' : ''}${last ? '' : '<span class="edge r">›</span>'}</figure>
        ${caption(p, false)}
        <div class="dots">${gal.map((_, j) => `<span class="${j === i ? 'on' : ''}" onclick="App._go(${j - i})"></span>`).join('')}</div>
        <div class="traits"><h4>Что замечать</h4>${a.s.map(x => `<span>${x}</span>`).join('')}</div>
        <div class="navrow"><button onclick="App._go(-1)" ${i ? '' : 'disabled'} aria-label="Назад">‹</button>
          ${last ? `<button class="primary" onclick="App._done()">К практике</button>` : `<button onclick="App._go(1)">Следующая картина ›</button>`}</div>
      </div>`, e => {
        if (e.key === 'ArrowRight') App._go(1);
        else if (e.key === 'ArrowLeft') App._go(-1);
        else if (e.key === 'Enter') last ? App._done() : App._go(1);
      }, true);
      swipe(document.getElementById('viewer'), App._go);
      if (gal[i + 1]) { const n = new Image(); n.src = url(gal[i + 1], 960); }
    };
    App._go = d => { const j = i + d; if (j >= 0 && j < gal.length) { i = j; draw(); } };
    App._done = quizStep;
    draw();
  }

  function quizStep() {
    if (ses.i >= ses.len) return sessionEnd();
    const nq = !nextQ && E.pendingNew(ses);
    if (nq) return startIntro(nq);
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
    const car = Q.grid && Q.paintings.length > 2 && matchMedia('(max-width: 640px) and (orientation: portrait)').matches;
    const pics = Q.grid
      ? `<div class="grid ${Q.paintings.length === 2 ? 'two' : ''} ${car ? 'car swipe' : ''}" id="grid">${Q.paintings.map((p, j) => `<button class="pic ${j ? '' : 'cur'}" data-v="${p.id}" ${car ? '' : `onclick="App._pick('${p.id}')"`}><span class="num">${j + 1}</span>${img(p, car ? 960 : 500)}</button>`).join('')}</div>`
        + (car ? `<div class="pager">${Q.paintings.map((p, j) => `<button class="${j ? '' : 'on'}" data-v="${p.id}" onclick="App._show(${j})">${j + 1}</button>`).join('')}</div>` : '')
      : Q.pairView
        ? `<div class="pair">${Q.paintings.map(p => `<figure class="frame">${img(p, 500)}</figure>`).join('')}</div>`
        : `<figure class="frame">${img(Q.paintings[0])}</figure>`;
    const opts = car ? `<button class="primary wide choose" onclick="App._pick(App._curId())">Выбрать эту картину</button>` : Q.grid ? '' : `<div class="opts ${Q.options.length === 2 ? 'two' : ''} ${Q.longOpts ? 'long' : ''}">${Q.options.map((o, j) => `<button data-v="${o.v}" onclick="App._pick('${o.v}')"><span class="num">${j + 1}</span>${o.label}</button>`).join('')}</div>`;
    App._pick = v => { if (App._locked) return; App._locked = true; onPick(isNaN(v) || Q.type !== 'era' ? v : +v); };
    App._locked = false;
    render(`<div class="stage quiz ${exam ? 'is-exam' : ''}">${topRow(progress)}
          <div class="prompt">${exam ? '<span class="tag">проверка</span>' : ''}${Q.prompt}</div>
          <div class="pics" id="pics">${pics}</div><div class="bottom" id="fb">${opts}</div>
        </div>`, e => {
      const n = +e.key; if (n >= 1 && n <= Q.options.length) App._pick(String(Q.options[n - 1].v));
    }, true);
    if (car) {
      let cur = 0;
      App._show = j => {
        cur = (j + Q.paintings.length) % Q.paintings.length;
        document.querySelectorAll('#grid .pic').forEach((b, k) => b.classList.toggle('cur', k === cur));
        document.querySelectorAll('.pager button').forEach((b, k) => b.classList.toggle('on', k === cur));
      };
      App._curId = () => Q.paintings[cur].id;
      swipe(document.getElementById('grid'), d => App._show(cur + d));
    }
  }

  function feedback(Q, v, ok) {
    const correct = String(Q.correct);
    document.querySelectorAll('[data-v]').forEach(b => {
      if (b.dataset.v === correct) b.classList.add('right');
      else if (b.dataset.v === String(v)) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    // подписи под картинками — каждая показанная картина тоже часть обучения
    if (Q.grid) document.querySelectorAll('.pic').forEach(b => { const o = A[E.paintingById(b.dataset.v).a]; b.insertAdjacentHTML('beforeend', `<div class="who">${o.n}${Q.type === 'older' ? `, <b>${E.paintingById(b.dataset.v).y}</b>` : ''}${Q.type === 'findMov' ? `<br><span class="muted">${M[o.m].n}</span>` : ''}</div>`); });
    if (document.querySelector('.grid.car')) App._show(Q.paintings.findIndex(p => p.id === correct));
    // разбор встаёт на место вариантов ответа — всё остаётся на одном экране
    const t = A[Q.q];
    const opt = Q.options.find(o => String(o.v) === correct);
    const right = opt && opt.label;
    const head = ok ? '✓ Верно' : `✗ Неверно${right ? ` — правильно: <b>${right}</b>` : ''}`;
    let capHtml = Q.grid ? '' : Q.paintings.map(p => caption(p)).join('');
    let hint = '';
    if (Q.type === 'older') {
      const [y1, y2] = Q.paintings.map(p => p.y), d = Math.abs(y1 - y2);
      hint = `<div class="hint">Между картинами <b>${d} ${d % 10 === 1 && d % 100 !== 11 ? 'год' : [2, 3, 4].includes(d % 10) && ![12, 13, 14].includes(d % 100) ? 'года' : 'лет'}</b>.</div>`;
    } else if (!ok) {
      const other = Q.type === 'who' ? A[v] : Q.type === 'find' ? A[E.paintingById(v).a] : null;
      if (other && !Q.grid) {
        // рядом с картиной — работа художника, которого вы выбрали
        const inQ = Q.paintings.map(p => p.id);
        const pool = other.p.filter(p => !E.S.broken[p.id] && !inQ.includes(p.id));
        const sample = pool.find(p => p.fam && E.S.seen[p.id]) || pool.find(p => p.fam) || pool[0];
        const p = Q.paintings[0];
        document.getElementById('pics').innerHTML = `<div class="pair">
          <figure class="frame">${img(p, 500)}<span class="lbl ok">${t.n}</span></figure>
          <figure class="frame">${img(sample, 500)}<span class="lbl bad">${other.n}</span></figure></div>`;
        hint = `<div class="hint"><b>${t.n}</b>: ${t.s.slice(0, 2).join('; ')}<br><b>${other.n}</b>: ${other.s.slice(0, 2).join('; ')}</div>`;
      } else hint = `<div class="hint"><b>${t.n}</b>: ${t.s.slice(0, 2).join('; ')}</div>`;
    }
    // разбор не меньше вариантов ответа, которые он заменяет — картина над ним не прыгает
    const fbEl = document.getElementById('fb');
    fbEl.style.minHeight = fbEl.offsetHeight + 'px';
    fbEl.innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">
      <div class="fhead"><div class="verdict">${head}</div><button class="primary next" onclick="App._cont()">Дальше ›</button></div>
      <div class="fbody">${capHtml}${hint}</div></div>`;
    App._cont = quizStep;
    onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); quizStep(); } };
    // заранее готовим следующий вопрос, если дальше не знакомство с новым художником
    if (ses.i < ses.len && !E.pendingNew(ses)) { nextQ = E.nextQuestion(ses); preload(nextQ); }
  }

  function sessionEnd() {
    E.endSession();
    if (window.Sync && Sync.flush) Sync.flush();   // прогресс уходит на сервер раз за занятие
    const learned = ses.newIds.map(n => A[n.q].n);
    render(`${nav()}<div class="card center">
      <h2>Занятие окончено</h2>
      <div class="big">${ses.done ? pct(ses.ok / ses.done) : '—'}</div><p class="muted">${ses.ok} из ${ses.done} верно</p>
      ${learned.length ? `<p>Новые художники: <b>${learned.join(', ')}</b></p>` : ''}
      ${E.BETA ? levelUps(ses) : ''}
      ${funFacts(ses)}
      <button class="primary" onclick="App.home()">На главную</button>
      <button onclick="App.session()">Ещё занятие</button></div>`, e => { if (e.key === 'Enter') home(); });
    ses = null;
  }
  // стенд: кто за занятие поднялся на уровень
  function levelUps(ses) {
    const ups = Object.keys(ses.res).filter(q => ses.startLv && ses.startLv[q] != null && E.level(q).k > ses.startLv[q]);
    if (!ups.length) return '';
    return `<div class="facts">${ups.map(q => { const a = E.LEVELS[ses.startLv[q]], b = E.level(q);
      return `<div>⬆ <b>${A[q].n}</b>: ${a.icon} ${a.name} → ${b.icon} <b>${b.name}</b></div>`; }).join('')}</div>`;
  }
  // забавные итоги: серия, лучший художник, вехи
  function funFacts(ses) {
    const f = [];
    if (ses.best >= 5) f.push(`🎯 Серия без ошибок: <b>${ses.best}</b> подряд`);
    const top = Object.entries(ses.res).filter(([, r]) => r.n >= 2 && r.ok === r.n).sort((a, b) => b[1].n - a[1].n)[0];
    if (top) f.push(`👁 Ни одной ошибки с художником <b>${A[top[0]].n}</b> (${top[1].n} из ${top[1].n})`);
    const m0 = ses.start.mastery, m1 = E.mastery();
    if (m1 > m0) f.push(`📈 Прохождение: ${(m0 * 100).toFixed(1)}% → <b>${(m1 * 100).toFixed(1)}%</b>`);
    const seen = Object.keys(E.S.seen).length;
    const mile = [50, 100, 250, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000].filter(x => ses.start.seen < x && seen >= x).pop();
    if (mile) f.push(`🖼 Вы увидели уже <b>${mile}</b> картин! Это как ${mile >= 1000 ? 'целый большой музей' : mile >= 250 ? 'несколько залов Эрмитажа' : 'зал музея'}.`);
    const k = E.known().length, km = [5, 10, 20, 30, 40, 50, 60, 75, 90, 100, 114].filter(x => ses.start.known < x && k >= x).pop();
    if (km) f.push(`🏅 Знакомых художников: <b>${km}</b>`);
    const streak = E.dayStreak();
    if (streak >= 2) f.push(`🔥 ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд с занятиями`);
    return f.length ? `<div class="facts">${f.map(x => `<div>${x}</div>`).join('')}</div>` : '';
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
    if (window.Sync && Sync.flush) Sync.flush();
    const wrong = ex.answers.filter(a => !a.ok);
    const answerText = a => {
      const Q = a.Q;
      if (Q.type === 'who') return `Это <b>${A[Q.q].n}</b>, вы ответили: ${A[a.v].n}`;
      if (Q.type === 'findMov') return `Нужно было найти: ${M[A[Q.q].m].n} (${A[Q.q].n})`;
      if (Q.type === 'movement') return `<b>${M[Q.correct].n}</b> (${A[Q.q].n}), вы ответили: ${M[a.v].n}`;
      if (Q.type === 'era') return `<b>${Q.paintings[0].y}</b> — ${A[Q.q].n}`;
      if (Q.type === 'pair') return `${Q.correct === 'yes' ? 'Один художник' : 'Разные художники'}: ${A[Q.q].n}${Q.b !== Q.q ? ' и ' + A[Q.b].n : ''}`;
      if (Q.type === 'odd') return `Лишняя — ${A[Q.b].n}, остальные — ${A[Q.q].n}`;
      return `Нужно было найти: ${A[Q.q].n}`;
    };
    const correctPic = a => a.Q.grid ? E.paintingById(a.Q.correct) : a.Q.paintings[0];
    render(`${nav()}<div class="card center">
      <div class="kicker">Большая проверка</div><div class="big">${pct(r.score)}</div>
      <h2>${r.score >= 0.9 ? 'Отлично!' : r.score >= 0.75 ? 'Хорошо!' : r.score >= 0.5 ? 'Неплохо' : 'Есть над чем поработать'}</h2>
      <p class="muted">Узнано художников без ошибок: ${Object.values(r.per).filter(x => x.ok === x.n).length} из ${Object.keys(r.per).length}. Художники с ошибками будут чаще попадаться в занятиях.</p>
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
          return `<div class="art"><span class="nm">${A[q].n}</span><span class="lv lv${lv.k}">${lv.icon ? lv.icon + ' ' : ''}${lv.name}</span>
            <span class="small muted">${st.n ? pct(st.ok / st.n) : '—'} · ${seen}/${A[q].p.length} картин · интервал ${st.stab < 1 ? Math.round(st.stab * 24) + ' ч' : Math.round(st.stab) + ' дн'}</span></div>`; }).join('')}
        ${locked ? `<div class="muted small">ещё ${locked} закрыто</div>` : ''}</div>`;
    }).join('');
    const exams = E.S.exams.slice(-8).reverse().map(x => `<div class="small">${new Date(x.t).toLocaleDateString('ru')} — ${pct(x.score)} ${x.pass ? '✓' : '✗'} <span class="muted">(${x.n} вопр., ${x.artists} худ.)</span></div>`).join('');
    render(`${nav()}<h2>Прогресс</h2>
      <div class="statrow"><div><b>${s.known}/${s.all}</b><span>художников</span></div><div><b>${s.seenCount}/${s.total}</b><span>картин увидено</span></div><div><b>${s.ans7}</b><span>ответов за 7 дней</span></div></div>
      ${E.BETA ? `<div class="card"><h4>Уровни художников</h4>${levelCounts()}</div>` : ''}
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
      <div class="ghead">${portrait(q)}<h2>${a.n} <span class="muted small">${a.y} · ${M[a.m].n}</span>${E.BETA ? ` <span class="lv lv${E.level(q).k}">${E.level(q).icon} ${E.level(q).name}</span>` : ''}</h2></div>
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
      <label>Новых художников в день <input type="number" min="1" max="15" value="${st.newPerDay}" onchange="App._set('newPerDay',this.value)"></label>
      <label>Вопросов в занятии <input type="number" min="5" max="50" value="${st.sessionLen}" onchange="App._set('sessionLen',this.value)"></label></div>
      <div class="card"><h4>Сохранение прогресса</h4><p class="muted small">Прогресс хранится в этом браузере. Можно перенести файлом.</p>
      <button onclick="App._export()">Скачать прогресс</button>
      <label class="btn">Загрузить из файла<input type="file" accept=".json" hidden onchange="App._import(this.files[0])"></label>
      <button class="danger" onclick="App._reset()">Сбросить всё</button></div>`);
  }
  // ---------- аккаунт ----------
  function account(msg = '') {
    if (!window.Sync || !Sync.enabled) return render(`${nav()}<div class="card auth"><h2>Вход и регистрация</h2>
      <p>Вход по email и через Google скоро заработает — сервер аккаунтов ещё подключается.</p>
      <p class="muted">Сейчас прогресс хранится в этом браузере. Чтобы не потерять его или перенести на другое устройство, сохраните файл и загрузите его там.</p>
      <button onclick="App._export()">Скачать прогресс</button>
      <label class="btn">Загрузить из файла<input type="file" accept=".json" hidden onchange="App._import(this.files[0])"></label></div>`);
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
    home, session, exam, progress, gallery, lightbox, settings, imgErr, account, menu, showPortrait,
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
