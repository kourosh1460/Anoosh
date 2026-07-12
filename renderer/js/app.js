'use strict';
/* App bootstrap: navigation, theming, global search, shortcuts, titlebar. */

const App = (() => {
  const NAV_ORDER = ['dashboard', 'tasks', 'notes', 'ideas', 'calendar', 'timer', 'reminders'];
  let currentId = null;
  let currentInstance = null;
  let pendingGoto = null;

  /* ---------- theming ---------- */
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const KNOWN_THEMES = ['dark', 'light', 'onyx', 'toranj', 'toranj-warm', 'blossoms'];

  function applyTheme() {
    const s = DB.settings();
    const theme = s.theme === 'system' ? (systemDark.matches ? 'dark' : 'light')
      : (KNOWN_THEMES.includes(s.theme) ? s.theme : 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--accent', s.accent || '#7c5cff');
    document.documentElement.dataset.fx = s.reduceEffects ? 'off' : 'on';
    document.documentElement.dataset.motion = s.reduceMotion ? 'off' : 'on';
  }
  systemDark.addEventListener('change', () => { if (DB.settings().theme === 'system') applyTheme(); });

  /* ---------- navigation ---------- */
  function buildNav() {
    const navList = document.getElementById('nav-list');
    navList.innerHTML = '';
    for (const id of NAV_ORDER) {
      const v = Views[id];
      const btn = el(`<button class="nav-item" data-view="${id}">${icon(v.icon)}<span>${v.title}</span><span class="nav-count" data-count hidden></span></button>`);
      btn.addEventListener('click', () => show(id));
      navList.appendChild(btn);
    }
    const settingsBtn = document.getElementById('nav-settings');
    settingsBtn.innerHTML = `${icon('settings')}<span>Settings</span>`;
    settingsBtn.addEventListener('click', () => show('settings'));
    updateNavCounts();
  }

  function updateNavCounts() {
    const openTasks = DB.all('tasks').filter(t => !t.done).length;
    const attention = DB.all('reminders').filter(r => !r.done && (r.notified || (r.at && Date.parse(r.at) <= Date.now()))).length;
    const set = (view, n) => {
      const elCount = document.querySelector(`.nav-item[data-view="${view}"] [data-count]`);
      if (!elCount) return;
      elCount.hidden = !n;
      elCount.textContent = n;
    };
    set('tasks', openTasks);
    set('reminders', attention);
  }

  function show(viewId) {
    if (!Views[viewId]) {
      // A view failed to load (e.g. a script error in its file) — say so
      // instead of silently ignoring the click.
      toast(`The ${viewId} screen failed to load — please report this.`, { icon: 'x', duration: 5000 });
      return;
    }
    if (currentId === viewId) { runPendingGoto(); return; }
    if (currentInstance && currentInstance.destroy) {
      try { currentInstance.destroy(); } catch (e) { console.error(e); }
    }
    currentId = viewId;
    const root = document.getElementById('view-root');
    root.innerHTML = '';
    currentInstance = Views[viewId].mount(root);
    document.querySelectorAll('.nav-item').forEach(b =>
      b.classList.toggle('active', b.dataset.view === viewId));
    runPendingGoto();
  }

  function runPendingGoto() {
    if (pendingGoto && currentInstance && currentInstance.goto) {
      const id = pendingGoto; pendingGoto = null;
      // Let the view finish mounting before jumping.
      setTimeout(() => currentInstance.goto(id), 30);
    } else {
      pendingGoto = null;
    }
  }

  const TYPE_TO_VIEW = { task: 'tasks', note: 'notes', folder: 'notes', idea: 'ideas', event: 'calendar', reminder: 'reminders' };

  function goto(type, id) {
    const viewId = TYPE_TO_VIEW[type];
    if (!viewId) return;
    pendingGoto = id;
    if (currentId === viewId) runPendingGoto();
    else show(viewId);
  }

  /* ---------- mini timer chip ---------- */
  function updateMiniTimer() {
    const chip = document.getElementById('mini-timer');
    const st = TimerEngine.state;
    if (!TimerEngine.isActive() || currentId === 'timer') { chip.hidden = true; return; }
    chip.hidden = false;
    chip.classList.toggle('paused', !st.running);
    const ms = st.mode === 'stopwatch' ? TimerEngine.elapsedMs() : TimerEngine.remainingMs();
    const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
    const task = st.taskId ? DB.get('tasks', st.taskId) : null;
    chip.innerHTML = `<span class="mt-dot"></span><span class="mt-time">${m}:${Fmt.pad(sec)}</span>
      <span class="mt-label">${esc(task ? task.title : (st.mode === 'pomodoro' ? (st.phase === 'focus' ? 'Focus' : 'Break') : st.mode))}</span>`;
  }

  /* ---------- global search ---------- */
  function openSearch() {
    const body = el(`<div></div>`);
    const input = el(`<input class="pal-input" placeholder="Search tasks, notes, ideas, events, reminders…">`);
    const results = el(`<div class="pal-results"></div>`);
    body.append(input, results);
    const m = openModal({ title: null, body, className: 'palette' });
    body.parentElement.style.padding = '0';

    let sel = 0, flat = [];
    function draw() {
      const q = input.value.trim();
      flat = q ? DB.search(q, 20) : [];
      results.innerHTML = '';
      if (!q) {
        results.innerHTML = `<div class="empty" style="padding:22px"><div class="empty-sub">Type to search everything in Anoosh.</div></div>`;
        return;
      }
      if (!flat.length) {
        results.innerHTML = `<div class="empty" style="padding:22px"><div class="empty-sub">No matches for “${esc(q)}”.</div></div>`;
        return;
      }
      let lastType = '';
      flat.forEach((r, i) => {
        const meta = TYPE_META[r.type];
        if (r.type !== lastType) {
          lastType = r.type;
          results.appendChild(el(`<div class="pal-group">${meta.label}s</div>`));
        }
        const item = el(`<button class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}">
          ${icon(meta.icon)}<span class="pal-text">${esc(r.item.title || 'Untitled')}</span>
          <span class="pal-sub">${esc(r.sub || '')}</span></button>`);
        item.addEventListener('click', () => pick(i));
        results.appendChild(item);
      });
    }
    function pick(i) {
      const r = flat[i];
      if (!r) return;
      m.close();
      goto(r.type, r.item.id);
    }
    input.addEventListener('input', () => { sel = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, flat.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    });
    setTimeout(() => input.focus());
    draw();
  }

  /* ---------- first run ---------- */
  function firstRunContent() {
    if (DB.all('notes').length || DB.all('tasks').length || DB.all('ideas').length) return;
    const folder = DB.newFolder({ name: 'Getting started', color: '#7c5cff', pinned: true });
    DB.upsert('folders', folder);
    const note = DB.newNote({
      title: 'Welcome to Anoosh 👋',
      headerColor: '#7c5cff',
      folderId: folder.id,
      content:
        `<p>Everything here works <b>offline</b> and connects together:</p>
        <ul class="checklist">
          <li>Notes live in <b>folders</b> — this one is in “Getting started”. Create your own with New folder</li>
          <li>Paste or drop an <b>image</b> straight into any note</li>
          <li>Add a task, then press <b>▶</b> on it to start a focus timer</li>
          <li>Try the <b>screen lock</b> button in the note header — this note will float on top of every app</li>
          <li>The Calendar speaks <b>Gregorian, lunar (Hijri) and solar (Jalali)</b> — convert any date between them</li>
          <li>Set a reminder — Anoosh fires real Windows notifications</li>
        </ul>
        <p>Make it yours in <b>Settings</b>: dark, light or solid <b>Onyx</b> theme, accent color, and a custom header color for every note.</p>
        <blockquote>Press <b>Ctrl+K</b> anywhere to search everything.</blockquote>`
    });
    DB.upsert('notes', note);
  }

  /* ---------- demo seed (screenshot/test mode only) ---------- */
  function seedDemo() {
    if (DB.all('tasks').length) return;
    const today = Fmt.todayStr();
    const t1 = DB.newTask({ title: 'Review quarterly budget draft', dueDate: today, dueTime: '15:00', priority: 3 });
    const t2 = DB.newTask({ title: 'Book dentist appointment', dueDate: today, priority: 1 });
    const t3 = DB.newTask({ title: 'Prepare slides for Monday sync', dueDate: Fmt.addDays(today, 2), priority: 2 });
    const t4 = DB.newTask({ title: 'Water the plants', dueDate: Fmt.addDays(today, -1) });
    const t5 = DB.newTask({ title: 'Read “Deep Work” chapter 4', done: true, doneAt: DB.now() });
    [t1, t2, t3, t4, t5].forEach(t => DB.upsert('tasks', t));

    const f1 = DB.newFolder({ name: 'Work', color: '#3e8bff', pinned: true });
    const f2 = DB.newFolder({ name: 'Personal', color: '#14b880' });
    [f1, f2].forEach(f => DB.upsert('folders', f));

    const n1 = DB.newNote({
      title: 'Meeting notes — product sync', headerColor: '#3e8bff', folderId: f1.id,
      content: '<h2>Decisions</h2><ul><li>Ship the beta on the 15th</li><li>Split billing into its own module</li></ul><h2>Open questions</h2><ul class="checklist"><li>Who owns the migration plan?</li><li data-checked="true">Confirm pricing page copy</li></ul>'
    });
    const n2 = DB.newNote({
      title: 'Groceries', headerColor: '#14b880', favorite: true, pinnedToScreen: true, folderId: f2.id,
      content: '<ul class="checklist"><li>Oat milk</li><li>Dates</li><li data-checked="true">Coffee beans</li><li>Basmati rice</li></ul>'
    });
    const n3 = DB.newNote({ title: 'Reading list', headerColor: '#f5a524', content: '<ol><li>Deep Work</li><li>The Pragmatic Programmer</li><li>Four Thousand Weeks</li></ol>' });
    [n1, n2, n3].forEach(n => DB.upsert('notes', n));

    const i1 = DB.newIdea({ title: 'Weekly review ritual', status: 'ready', content: '<p>Sunday evening: clear inbox, plan top 3 for each day.</p>' });
    const i2 = DB.newIdea({ title: 'Home office lighting upgrade', status: 'growing', content: '<p>Bias lighting behind monitor, warm lamp for calls.</p>' });
    const i3 = DB.newIdea({ title: 'Learn lunar calendar arithmetic', status: 'spark' });
    const i4 = DB.newIdea({ title: 'Automate invoice filing', status: 'spark' });
    [i1, i2, i3, i4].forEach(i => DB.upsert('ideas', i));

    const e1 = DB.newEvent({ title: 'Team standup', date: today, time: '09:30', endTime: '09:45', color: '#3e8bff' });
    const e2 = DB.newEvent({ title: 'Lunch with Sara', date: Fmt.addDays(today, 1), time: '12:30', color: '#f5a524' });
    const e3 = DB.newEvent({ title: 'Release day 🚀', date: Fmt.addDays(today, 4), color: '#14b880' });
    [e1, e2, e3].forEach(e => DB.upsert('events', e));

    const r1 = DB.newReminder({ title: 'Send the budget file', at: new Date(Date.now() + 2 * 3600000).toISOString() });
    const r2 = DB.newReminder({ title: 'Stretch break', at: new Date(Date.now() + 45 * 60000).toISOString(), repeat: 'daily' });
    const r3 = DB.newReminder({ title: 'Call mom', at: new Date(Date.now() - 30 * 60000).toISOString(), notified: true });
    [r1, r2, r3].forEach(r => DB.upsert('reminders', r));

    DB.link({ type: 'task', id: t1.id }, { type: 'note', id: n1.id });
    DB.link({ type: 'task', id: t1.id }, { type: 'reminder', id: r1.id });
    DB.link({ type: 'idea', id: i1.id }, { type: 'note', id: n3.id });
    DB.link({ type: 'event', id: e3.id }, { type: 'task', id: t3.id });

    DB.upsert('sessions', { id: DB.uid(), kind: 'focus', startedAt: new Date(Date.now() - 3600000).toISOString(), durationMs: 25 * 60000, taskId: t1.id });
    DB.upsert('sessions', { id: DB.uid(), kind: 'break', startedAt: new Date(Date.now() - 3300000).toISOString(), durationMs: 5 * 60000, taskId: null });
    DB.upsert('sessions', { id: DB.uid(), kind: 'focus', startedAt: new Date(Date.now() - 7200000).toISOString(), durationMs: 25 * 60000, taskId: t3.id });
  }

  /* ---------- boot ---------- */
  async function boot() {
    await DB.init();

    const params = new URLSearchParams(location.search);
    if (params.get('seed') === '1') seedDemo();
    else firstRunContent();

    applyTheme();
    buildNav();
    show('dashboard');

    /* titlebar */
    document.getElementById('tb-min').innerHTML = icon('minimize');
    document.getElementById('tb-max').innerHTML = icon('maximize');
    document.getElementById('tb-close').innerHTML = icon('x');
    document.querySelector('.tb-search-icon').innerHTML = icon('search');
    document.getElementById('tb-min').addEventListener('click', () => window.aurora.minimize());
    document.getElementById('tb-max').addEventListener('click', () => window.aurora.maximize());
    document.getElementById('tb-close').addEventListener('click', () => window.aurora.close());
    document.getElementById('tb-search').addEventListener('click', openSearch);
    window.aurora.onWinState(({ maximized }) => {
      document.getElementById('tb-max').innerHTML = icon(maximized ? 'restore' : 'maximize');
    });

    /* events from main */
    window.aurora.onNavGoto(({ view, id }) => {
      if (id) {
        const type = Object.keys(TYPE_TO_VIEW).find(t => TYPE_TO_VIEW[t] === view);
        if (type) { goto(type, id); return; }
      }
      show(view);
    });
    window.aurora.onReminderFired(({ id }) => {
      const r = DB.get('reminders', id);
      if (r) toast(`Reminder: ${r.title}`, { icon: 'bell', action: 'View', onAction: () => goto('reminder', id) });
    });
    window.aurora.onPinState(() => { /* views listen through DB change events */ });
    window.aurora.onShotView(({ view }) => show(view));

    /* subscriptions */
    DB.subscribe((ch) => {
      if (ch.kind === 'settings') applyTheme();
      updateNavCounts();
    });
    TimerEngine.subscribe(() => updateMiniTimer());
    setInterval(updateMiniTimer, 1000);
    document.getElementById('mini-timer').addEventListener('click', () => show('timer'));

    /* shortcuts */
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const n = Number(e.key);
        if (n >= 1 && n <= NAV_ORDER.length) {
          e.preventDefault();
          show(NAV_ORDER[n - 1]);
        } else if (e.key === ',') {
          e.preventDefault();
          show('settings');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { show, goto, get currentView() { return currentId; } };
})();
