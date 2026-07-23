'use strict';
/* Anoosh mobile — bootstrap: tabs, subpage stack, FAB, search, back button. */

const App = (() => {
  const TAB_ORDER = ['today', 'tasks', 'notes', 'calendar', 'more'];
  let currentTab = null;
  let currentInstance = null;
  const subStack = []; // { el, destroy }

  /* ---------- theming ---------- */
  function applyTheme() {
    const s = DB.settings();
    const theme = ['dark', 'light', 'onyx', 'toranj', 'toranj-warm', 'blossoms', 'blossoms-light'].includes(s.theme) ? s.theme : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--accent', s.accent || '#7c5cff');
    document.documentElement.dataset.fx = s.reduceEffects ? 'off' : 'on';
    document.documentElement.dataset.motion = s.reduceMotion ? 'off' : 'on';
    Platform.applyStatusBar(theme);
  }

  /* ---------- tabs ---------- */
  function buildTabs() {
    const bar = document.getElementById('tabbar');
    bar.innerHTML = '';
    for (const id of TAB_ORDER) {
      const v = MViews[id];
      const btn = el(`<button class="tab" data-tab="${id}">${icon(v.icon)}<span>${v.title}</span></button>`);
      btn.addEventListener('click', () => { show(id); Platform.haptic(); });
      bar.appendChild(btn);
    }
  }

  function show(tabId) {
    if (!MViews[tabId]) return;
    while (subStack.length) pop(true);
    if (currentTab === tabId) return;
    if (currentInstance && currentInstance.destroy) {
      try { currentInstance.destroy(); } catch (e) { console.error(e); }
    }
    currentTab = tabId;
    const root = document.getElementById('page-root');
    root.innerHTML = '';
    currentInstance = MViews[tabId].mount(root);
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    updateFab();
  }

  /* ---------- subpage stack ---------- */
  function pushRaw() {
    const page = el(`<div class="subpage"></div>`);
    document.getElementById('subpage-root').appendChild(page);
    subStack.push(page);
    updateFab();
    return page;
  }

  function push(key) {
    const meta = window.MSubpages && MSubpages[key];
    if (!meta) return;
    const page = pushRaw();
    page.innerHTML = `
      <div class="sub-head">
        <button class="iconbtn" data-back>${icon('chevL')}</button>
        <div class="sub-title">${esc(meta.title)}</div>
      </div>
      <div class="sub-body"></div>`;
    page.querySelector('[data-back]').addEventListener('click', () => pop());
    const cleanup = meta.build(page.querySelector('.sub-body'));
    page.onDestroy = typeof cleanup === 'function' ? cleanup : () => {};
    return page;
  }

  function pop(silent = false) {
    const page = subStack.pop();
    if (!page) return false;
    try { page.onDestroy && page.onDestroy(); } catch (e) { console.error(e); }
    if (silent) page.remove();
    else {
      page.classList.add('closing');
      setTimeout(() => page.remove(), 180);
    }
    updateFab();
    return true;
  }

  /* ---------- FAB (quick capture) ---------- */
  function updateFab() {
    const fab = document.getElementById('fab');
    const hide = subStack.length > 0;
    fab.classList.toggle('hidden-fab', hide);
  }

  function openCapture() {
    Platform.haptic();
    // Context-aware primary action per tab
    if (currentTab === 'notes' && currentInstance.newNoteHere) { currentInstance.newNoteHere(); return; }
    if (currentTab === 'calendar' && currentInstance.addHere) { currentInstance.addHere(); return; }

    let kind = 'task';
    const body = el(`<div>
      <div class="seg" id="qc-kind">
        <button data-k="task" class="active">${icon('tasks')} Task</button>
        <button data-k="idea">${icon('bulb')} Idea</button>
        <button data-k="note">${icon('note')} Note</button>
        <button data-k="reminder">${icon('bell')} Remind</button>
      </div>
      <input class="input" id="qc-text" placeholder="Add a task for today…" style="margin-top:12px">
    </div>`);
    const input = body.querySelector('#qc-text');
    body.querySelector('#qc-kind').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      kind = b.dataset.k;
      body.querySelectorAll('#qc-kind button').forEach(x => x.classList.toggle('active', x === b));
      input.placeholder = kind === 'task' ? 'Add a task for today…'
        : kind === 'idea' ? 'Capture an idea…'
        : kind === 'note' ? 'Title for a new note…'
        : 'Remind me to… (in 1 hour, edit after)';
      input.focus();
    });
    const foot = el(`<div style="width:100%"></div>`);
    const add = el(`<button class="btn primary block">${icon('plus')} Add</button>`);
    foot.appendChild(add);
    const m = openModal({ title: 'Quick capture', body, foot });

    function capture() {
      const text = input.value.trim();
      if (!text) return;
      if (kind === 'task') {
        DB.upsert('tasks', DB.newTask({ title: text, dueDate: Fmt.todayStr() }));
        toast('Task added for today', { icon: 'tasks' });
      } else if (kind === 'idea') {
        DB.upsert('ideas', DB.newIdea({ title: text }));
        toast('Idea captured', { icon: 'sparkle' });
      } else if (kind === 'note') {
        const n = DB.newNote({ title: text });
        DB.upsert('notes', n);
        toast('Note created', { icon: 'note', action: 'Open', onAction: () => goto('note', n.id) });
      } else {
        const rem = DB.newReminder({ title: text, at: new Date(Date.now() + 3600000).toISOString() });
        DB.upsert('reminders', rem);
        Platform.ensureNotifPermission();
        toast('Reminder set for 1 hour', { icon: 'bell' });
      }
      m.close();
    }
    add.addEventListener('click', capture);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') capture(); });
    setTimeout(() => input.focus(), 250);
  }

  /* ---------- goto (cross-module navigation) ---------- */
  const TYPE_TO_TAB = { task: 'tasks', note: 'notes', folder: 'notes', event: 'calendar' };

  function goto(type, id) {
    if (type === 'idea') { show('more'); push('ideas'); setTimeout(() => openIdeaSheet(id), 260); return; }
    if (type === 'reminder') { show('more'); push('reminders'); return; }
    const tab = TYPE_TO_TAB[type];
    if (!tab) return;
    show(tab);
    setTimeout(() => { if (currentInstance && currentInstance.goto) currentInstance.goto(id); }, 60);
  }

  /* ---------- global search ---------- */
  function openSearch() {
    const body = el(`<div></div>`);
    const input = el(`<input class="pal-input" placeholder="Search everything…">`);
    const results = el(`<div class="pal-results"></div>`);
    body.append(input, results);
    const m = openModal({ title: null, body, className: 'palette' });
    body.parentElement.style.padding = '0';

    function draw() {
      const q = input.value.trim();
      const flat = q ? DB.search(q, 20) : [];
      results.innerHTML = '';
      if (!q) { results.innerHTML = `<div class="empty" style="padding:20px"><div class="empty-sub">Type to search notes, tasks, ideas, events, reminders and folders.</div></div>`; return; }
      if (!flat.length) { results.innerHTML = `<div class="empty" style="padding:20px"><div class="empty-sub">No matches.</div></div>`; return; }
      let lastType = '';
      flat.forEach((r) => {
        const meta = TYPE_META[r.type];
        if (!meta) return;
        if (r.type !== lastType) {
          lastType = r.type;
          results.appendChild(el(`<div class="pal-group">${meta.label}s</div>`));
        }
        const item = el(`<button class="pal-item">${icon(meta.icon)}
          <span class="pal-text">${esc(r.item.title || 'Untitled')}</span>
          <span class="pal-sub">${esc(r.sub || '')}</span></button>`);
        item.addEventListener('click', () => { m.close(); goto(r.type, r.item.id); });
        results.appendChild(item);
      });
    }
    input.addEventListener('input', draw);
    setTimeout(() => input.focus(), 200);
    draw();
  }

  /* ---------- mini timer chip ---------- */
  function updateMiniTimer() {
    const chip = document.getElementById('mini-timer');
    if (!TimerEngine.isActive()) { chip.hidden = true; return; }
    const st = TimerEngine.state;
    chip.hidden = false;
    chip.classList.toggle('paused', !st.running);
    const ms = st.mode === 'stopwatch' ? TimerEngine.elapsedMs() : TimerEngine.remainingMs();
    chip.innerHTML = `<span class="mt-dot"></span><span>${Math.floor(ms / 60000)}:${Fmt.pad(Math.floor((ms % 60000) / 1000))}</span>`;
  }

  /* ---------- reminder catch-up (no background process on mobile) ---------- */
  function catchUpReminders() {
    const now = Date.now();
    let changed = false;
    for (const r of DB.all('reminders')) {
      if (r.done || !r.at) continue;
      const at = Date.parse(r.at);
      if (isNaN(at) || at > now) continue;
      if (r.repeat && r.repeat !== 'none') {
        const d = new Date(r.at);
        while (d <= new Date()) {
          if (r.repeat === 'daily') d.setDate(d.getDate() + 1);
          else if (r.repeat === 'weekly') d.setDate(d.getDate() + 7);
          else if (r.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
          else if (r.repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
          else break;
        }
        r.at = d.toISOString();
        DB.upsert('reminders', r);
        changed = true;
      } else if (!r.notified) {
        r.notified = true; // native notification already fired at its scheduled time
        DB.upsert('reminders', r);
        changed = true;
      }
    }
    if (changed) Platform.scheduleReminders(DB.all('reminders'));
  }

  /* ---------- app lock ---------- */
  let lockOverlay = null;
  function maybeLock() {
    const rec = DB.settings().appLock;
    if (!rec || lockOverlay) return Promise.resolve();
    return new Promise((resolve) => {
      lockOverlay = el(`<div class="lock-screen">
        <div class="lock-card">
          <div class="tb-logo" style="width:48px;height:48px;border-radius:16px"></div>
          <div class="lock-title">Anoosh is locked</div>
          <input class="input lock-pin" type="password" inputmode="numeric" maxlength="10" placeholder="PIN" autocomplete="off">
          <div class="lock-err" hidden>Wrong PIN — try again</div>
          <button class="btn primary block" id="lk-go">Unlock</button>
        </div>
      </div>`);
      document.body.appendChild(lockOverlay);
      const input = lockOverlay.querySelector('.lock-pin');
      const err = lockOverlay.querySelector('.lock-err');
      let busy = false;
      const attempt = async () => {
        if (busy) return;
        busy = true;
        if (await Lock.verify(input.value, rec)) {
          lockOverlay.remove();
          lockOverlay = null;
          resolve();
        } else {
          err.hidden = false;
          input.value = '';
          Platform.haptic('medium');
          const card = lockOverlay.querySelector('.lock-card');
          card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        }
        busy = false;
      };
      lockOverlay.querySelector('#lk-go').addEventListener('click', attempt);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
      setTimeout(() => input.focus(), 120);
    });
  }

  /* ---------- first run ---------- */
  function firstRunContent() {
    if (DB.all('notes').length || DB.all('tasks').length || DB.all('ideas').length) return;
    const folder = DB.newFolder({ name: 'Getting started', color: '#7c5cff', pinned: true });
    DB.upsert('folders', folder);
    DB.upsert('notes', DB.newNote({
      title: 'Welcome to Anoosh 👋',
      folderId: folder.id,
      content: `<p>Everything works <b>offline</b> and connects together:</p>
        <ul class="checklist">
          <li>Tap <b>+</b> to capture a task, idea, note or reminder</li>
          <li>Notes live in colorful <b>folders</b> — paste <b>images</b> right into them</li>
          <li>The Calendar speaks <b>Gregorian, lunar and solar</b> — convert any date</li>
          <li>Open <b>More → Sync</b> to connect this phone with the Anoosh desktop app</li>
          <li>Add the <b>Anoosh widget</b> to your home screen for today’s plan</li>
        </ul>
        <p>Make it yours in <b>More → Settings</b>: dark, light or solid Onyx theme and your accent color.</p>`
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await DB.init();
    firstRunContent();
    applyTheme();
    buildTabs();
    document.getElementById('tb-search').innerHTML = icon('search');
    document.getElementById('tb-search').addEventListener('click', openSearch);
    document.getElementById('fab').innerHTML = icon('plus');
    document.getElementById('fab').addEventListener('click', openCapture);
    show('today');
    await maybeLock();
    showOnboarding();

    DB.subscribe((ch) => { if (ch.kind === 'settings') applyTheme(); });
    TimerEngine.subscribe(updateMiniTimer);
    setInterval(updateMiniTimer, 1000);
    document.getElementById('mini-timer').addEventListener('click', () => push('timer'));

    catchUpReminders();
    Platform.scheduleReminders(DB.all('reminders'));
    Platform.refreshWidget();

    // Android hardware back: close sheet → pop subpage → go to Today → home.
    Platform.onBackButton(() => {
      const scrim = document.querySelector('.modal-scrim');
      if (scrim) { scrim.remove(); return; }
      const popover = document.querySelector('#popover-root .popover');
      if (popover) { popover.remove(); return; }
      if (pop()) return;
      if (currentTab !== 'today') { show('today'); return; }
      Platform.exitApp();
    });

    // Re-check reminders and refresh widget when app returns to foreground.
    if (Platform.isNative && window.Capacitor.Plugins.App) {
      let bgAt = 0;
      window.Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          catchUpReminders();
          // Re-lock after 2+ minutes in the background.
          if (bgAt && Date.now() - bgAt > 120000) maybeLock();
        } else {
          bgAt = Date.now();
          DB.flush();
          Platform.refreshWidget();
        }
      });
    }
    window.addEventListener('visibilitychange', () => { if (document.hidden) DB.flush(); });
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { show, push, pushRaw, pop, goto, get currentTab() { return currentTab; } };
})();
