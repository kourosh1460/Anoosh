'use strict';
/**
 * In-app end-to-end self test. Defines window.__selfTest(); the main process
 * invokes it when AURORA_SELFTEST=1 and reports results. Never runs in
 * normal use.
 */
window.__selfTest = async function () {
  const R = [];
  const ok = (name, cond, extra) => R.push({ name, pass: !!cond, extra: String(extra || '') });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    // Wait for boot to finish.
    for (let i = 0; i < 100 && !document.querySelector('.nav-item'); i++) await sleep(60);
    ok('app booted', !!document.querySelector('.nav-item'));

    /* ---- 1. every view mounts ---- */
    for (const v of ['dashboard', 'tasks', 'notes', 'ideas', 'calendar', 'timer', 'reminders', 'settings']) {
      App.show(v);
      await sleep(80);
      ok(`view mounts: ${v}`, document.getElementById('view-root').children.length > 0);
    }

    /* ---- 2. task CRUD through the real UI ---- */
    App.show('tasks');
    await sleep(80);
    const quick = document.getElementById('tk-quick');
    quick.value = 'SelfTest alpha task';
    quick.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(120);
    let task = DB.all('tasks').find(t => t.title === 'SelfTest alpha task');
    ok('quick-add creates task', !!task);

    const row = Array.from(document.querySelectorAll('.task-row')).find(r => r.dataset.id === (task && task.id));
    ok('task row rendered', !!row);
    if (row) {
      row.querySelector('.tcheck').click();
      await sleep(120);
      task = DB.get('tasks', task.id);
      ok('checkbox click completes task', task.done === true);
      task.done = false; DB.upsert('tasks', task);
    }

    /* ---- 3. bidirectional linking + scrub on delete ---- */
    const note = DB.newNote({ title: 'SelfTest linked note', content: '<p>hello</p>' });
    DB.upsert('notes', note);
    DB.link({ type: 'task', id: task.id }, { type: 'note', id: note.id });
    await sleep(60);
    ok('link forward', DB.get('tasks', task.id).links.some(l => l.id === note.id));
    ok('link backward', DB.get('notes', note.id).links.some(l => l.id === task.id));
    DB.remove('tasks', task.id);
    await sleep(60);
    ok('delete scrubs backlinks', !DB.get('notes', note.id).links.some(l => l.id === task.id));

    /* ---- 4. notes editor autosave via real typing events ---- */
    App.show('notes');
    await sleep(100);
    if (App.goto) App.goto('note', note.id);
    await sleep(150);
    const bodyEl = document.getElementById('ne-body');
    const titleEl = document.getElementById('ne-title');
    ok('note opened in editor', titleEl && titleEl.value === 'SelfTest linked note');
    if (bodyEl) {
      bodyEl.focus();
      bodyEl.innerHTML = '<p>edited by selftest</p>';
      bodyEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
      await sleep(800); // autosave debounce is 500ms
      ok('editor autosaves', (DB.get('notes', note.id).content || '').includes('edited by selftest'));
    }

    /* ---- 5. per-note header color persists ---- */
    const n2 = DB.get('notes', note.id);
    n2.headerColor = '#ff7847';
    DB.upsert('notes', n2);
    ok('note header color persists', DB.get('notes', note.id).headerColor === '#ff7847');

    /* ---- 6. pin / unpin note (real always-on-top window over IPC) ---- */
    await window.aurora.pinNote(note.id);
    await sleep(900);
    let pins = await window.aurora.listPins();
    ok('pin opens on-top window', pins.includes(note.id));
    await window.aurora.unpinNote(note.id);
    await sleep(500);
    pins = await window.aurora.listPins();
    ok('unpin closes window', !pins.includes(note.id));
    ok('unpin syncs data flag', DB.get('notes', note.id).pinnedToScreen !== true);

    /* ---- 7. reminders: fire + repeat advance ---- */
    const remOnce = DB.newReminder({ title: 'SelfTest once', at: new Date(Date.now() - 60000).toISOString() });
    const remDaily = DB.newReminder({ title: 'SelfTest daily', at: new Date(Date.now() - 60000).toISOString(), repeat: 'daily' });
    DB.upsert('reminders', remOnce);
    DB.upsert('reminders', remDaily);
    await sleep(150);
    await window.aurora.testCheckReminders();
    await sleep(250);
    ok('one-shot reminder fires', DB.get('reminders', remOnce.id).notified === true);
    const daily = DB.get('reminders', remDaily.id);
    ok('repeating reminder advances', daily.notified === false && Date.parse(daily.at) > Date.now());

    /* ---- 8. event shows in calendar grid + day panel ---- */
    const ev = DB.newEvent({ title: 'SelfTest event', date: Fmt.todayStr(), time: '12:00' });
    DB.upsert('events', ev);
    App.show('calendar');
    await sleep(150);
    const gridHasIt = Array.from(document.querySelectorAll('.cc-ev')).some(e => e.textContent.includes('SelfTest event'));
    ok('event renders in month grid', gridHasIt);

    /* ---- 9. calendar conversions round-trip (runtime) ---- */
    const now = new Date();
    const h = Hijri.fromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const g = Hijri.toGregorian(h.y, h.m, h.d);
    ok('hijri round-trip today', g.y === now.getFullYear() && g.m === now.getMonth() + 1 && g.d === now.getDate(),
      `${h.y}-${h.m}-${h.d} AH`);
    const jj = Jalali.fromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const gj = Jalali.toGregorian(jj.y, jj.m, jj.d);
    ok('jalali round-trip today', gj.y === now.getFullYear() && gj.m === now.getMonth() + 1 && gj.d === now.getDate(),
      `${jj.y}-${jj.m}-${jj.d} SH`);
    const hj = Hijri.fromGregorian(gj.y, gj.m, gj.d);
    ok('three-way conversion agrees', hj.y === h.y && hj.m === h.m && hj.d === h.d);

    /* ---- 9b. folders: create, file a note, navigate, move, delete ---- */
    const testFolder = DB.newFolder({ name: 'SelfTest folder', color: '#3e8bff', pinned: true });
    DB.upsert('folders', testFolder);
    const filedNote = DB.newNote({ title: 'SelfTest filed note', content: '<p>in folder</p>', folderId: testFolder.id });
    DB.upsert('notes', filedNote);
    App.show('dashboard'); await sleep(60);
    App.show('notes'); await sleep(120);
    ok('folder grid shows folder card', !!document.querySelector(`.folder-card[data-id="${testFolder.id}"]`));
    App.goto('note', filedNote.id); await sleep(180);
    ok('goto note opens its folder + editor',
      document.getElementById('ne-title').value === 'SelfTest filed note');
    filedNote.folderId = null;
    DB.upsert('notes', filedNote);
    ok('note can move out of folder', (DB.get('notes', filedNote.id).folderId || null) === null);
    DB.removeFolder(testFolder.id);
    await sleep(80);
    ok('folder delete keeps notes', !!DB.get('notes', filedNote.id) && !DB.get('folders', testFolder.id));
    DB.remove('notes', filedNote.id);

    /* ---- 9c. image sanitizing: data-url images kept, unsafe sources dropped ---- */
    const cleaned = sanitizeHtml(
      '<p>x</p><img src="data:image/png;base64,iVBORw0KGgo="><img src="file:///c:/evil.png"><img src="http://x/y.png">');
    const kept = (cleaned.match(/<img/g) || []).length;
    ok('image sanitize keeps data-url, drops unsafe', kept === 1, cleaned.slice(0, 120));

    /* ---- 9c2. sync server: start, ping over HTTP, stop ---- */
    const syncStatus = await window.aurora.syncStart();
    ok('sync server starts', syncStatus.running && !!syncStatus.port && /^\d{6}$/.test(syncStatus.code || ''));
    if (syncStatus.running) {
      try {
        const ping = await fetch(`http://127.0.0.1:${syncStatus.port}/ping`).then(r => r.json());
        ok('sync server answers ping', ping.app === 'anoosh');
      } catch (e) { ok('sync server answers ping', false, String(e)); }
      const stopped = await window.aurora.syncStop();
      ok('sync server stops', !stopped.running);
    }

    /* ---- 9d. every theme applies ---- */
    const themeBefore = DB.settings().theme;
    for (const th of ['onyx', 'toranj', 'toranj-warm', 'blossoms']) {
      DB.setSettings({ theme: th });
      await sleep(50);
      ok(`theme applies: ${th}`, document.documentElement.dataset.theme === th);
    }
    DB.setSettings({ theme: themeBefore });

    /* ---- 10. global search across modules ---- */
    const hits = DB.search('SelfTest');
    ok('search finds across modules', hits.length >= 2, `${hits.length} hits`);

    /* ---- 11. timer engine ---- */
    TimerEngine.setMode('countdown');
    TimerEngine.setCountdown(5);
    TimerEngine.start();
    await sleep(300);
    ok('timer runs', TimerEngine.state.running && TimerEngine.remainingMs() < 5 * 60000);
    TimerEngine.pause();
    ok('timer pauses', !TimerEngine.state.running && TimerEngine.isActive());
    TimerEngine.stop();
    ok('timer resets', !TimerEngine.isActive());
    TimerEngine.setMode('pomodoro');

    /* ---- 12. theming applies instantly ---- */
    const prevAccent = DB.settings().accent;
    DB.setSettings({ accent: '#123456' });
    await sleep(60);
    ok('accent applies to CSS', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#123456');
    const prevTheme = DB.settings().theme;
    DB.setSettings({ theme: prevTheme === 'dark' ? 'light' : 'dark' });
    await sleep(60);
    ok('theme switches', document.documentElement.dataset.theme !== prevTheme);
    DB.setSettings({ accent: prevAccent, theme: prevTheme });

    /* ---- 13. idea conversion to task keeps a link ---- */
    const idea = DB.newIdea({ title: 'SelfTest idea', status: 'ready' });
    DB.upsert('ideas', idea);
    const convTask = DB.newTask({ title: idea.title });
    DB.upsert('tasks', convTask);
    DB.link({ type: 'idea', id: idea.id }, { type: 'task', id: convTask.id });
    ok('idea->task linked', DB.get('ideas', idea.id).links.some(l => l.id === convTask.id));

    /* ---- cleanup ---- */
    DB.remove('notes', note.id);
    DB.remove('reminders', remOnce.id);
    DB.remove('reminders', remDaily.id);
    DB.remove('events', ev.id);
    DB.remove('ideas', idea.id);
    DB.remove('tasks', convTask.id);
    ok('cleanup complete', !DB.all('tasks').some(t => t.title.startsWith('SelfTest')));
  } catch (err) {
    R.push({ name: 'UNCAUGHT', pass: false, extra: String(err && err.stack || err) });
  }
  return R;
};
