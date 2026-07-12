'use strict';
/* More tab — hub for Timer, Ideas, Reminders, Sync and Settings sub-pages. */
window.MViews = window.MViews || {};

const IDEA_COLS = [
  { key: 'spark', label: 'Spark', color: '#f5a524' },
  { key: 'growing', label: 'Growing', color: '#3e8bff' },
  { key: 'ready', label: 'Ready', color: '#14b880' }
];

/* ============================ Timer page ============================ */
function buildTimerPage(body) {
  const R = 140, CIRC = 2 * Math.PI * R;
  body.innerHTML = `
    <div class="seg" id="tm-mode" style="margin-bottom:14px">
      <button data-m="pomodoro">${icon('zap')} Pomodoro</button>
      <button data-m="countdown">${icon('clock')} Countdown</button>
      <button data-m="stopwatch">${icon('timer')} Stopwatch</button>
    </div>
    <div class="timer-wrap">
      <div class="timer-ring-wrap">
        <svg class="ring" viewBox="0 0 300 300">
          <circle class="ring-bg" cx="150" cy="150" r="${R}"/>
          <circle class="ring-fg" id="tm-ring" cx="150" cy="150" r="${R}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>
        </svg>
        <div class="timer-center">
          <div class="timer-phase" id="tm-phase"></div>
          <div class="timer-time" id="tm-time">25:00</div>
          <div class="timer-round" id="tm-round"></div>
        </div>
      </div>
      <div id="tm-cdcfg" class="hidden" style="display:flex;align-items:center;gap:8px">
        <span class="muted" style="font-size:13px">Minutes:</span>
        <input type="number" class="input set-num" id="tm-mins" min="1" max="600" value="10">
      </div>
      <div class="timer-controls">
        <button class="btn icon" id="tm-skip">${icon('skip')}</button>
        <button class="btn primary big" id="tm-start">${icon('play')} Start</button>
        <button class="btn icon" id="tm-stop">${icon('stop')}</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;width:100%">
        <span class="muted" style="font-size:12.5px;flex:none">Focusing on:</span>
        <select class="input sm" id="tm-task" style="flex:1"></select>
      </div>
    </div>
    <div class="card">
      <div class="card-title">${icon('zap')} Focus today <span class="spacer"></span><span id="tm-total" style="font-size:15px;color:var(--text)"></span></div>
      <div id="tm-log"></div>
    </div>`;

  const ringEl = body.querySelector('#tm-ring');
  const startBtn = body.querySelector('#tm-start');
  function fmtClock(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), s = total % 60;
    return h ? `${h}:${Fmt.pad(mm)}:${Fmt.pad(s)}` : `${mm}:${Fmt.pad(s)}`;
  }
  function draw() {
    const st = TimerEngine.state;
    body.querySelectorAll('#tm-mode button').forEach(b => b.classList.toggle('active', b.dataset.m === st.mode));
    body.querySelector('#tm-cdcfg').classList.toggle('hidden', !(st.mode === 'countdown' && !TimerEngine.isActive()));
    if (st.mode === 'stopwatch') {
      body.querySelector('#tm-time').textContent = fmtClock(TimerEngine.elapsedMs());
      ringEl.style.strokeDashoffset = 0;
      body.querySelector('#tm-phase').textContent = 'Stopwatch';
      body.querySelector('#tm-round').textContent = '';
    } else {
      const rem = TimerEngine.remainingMs();
      body.querySelector('#tm-time').textContent = fmtClock(rem);
      const frac = st.durationMs ? rem / st.durationMs : 0;
      ringEl.style.strokeDashoffset = CIRC * (1 - Math.max(0, Math.min(1, frac)));
      body.querySelector('#tm-phase').textContent = st.mode === 'pomodoro'
        ? (st.phase === 'focus' ? 'Focus' : st.phase === 'short' ? 'Short break' : 'Long break') : 'Countdown';
      body.querySelector('#tm-round').textContent = st.mode === 'pomodoro'
        ? `Round ${st.round} of ${DB.settings().pomodoro.rounds || 4}` : '';
    }
    startBtn.innerHTML = st.running ? `${icon('pause')} Pause` : `${icon('play')} ${TimerEngine.isActive() ? 'Resume' : 'Start'}`;
    body.querySelector('#tm-skip').style.visibility = st.mode === 'pomodoro' ? 'visible' : 'hidden';
  }
  function drawTasks() {
    const sel = body.querySelector('#tm-task');
    const st = TimerEngine.state;
    const tasks = DB.all('tasks').filter(t => !t.done)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    sel.innerHTML = `<option value="">— nothing linked —</option>` +
      tasks.map(t => `<option value="${t.id}" ${t.id === st.taskId ? 'selected' : ''}>${esc(t.title.slice(0, 50))}</option>`).join('');
  }
  function drawLog() {
    const today = Fmt.todayStr();
    const sessions = [...DB.all('sessions')].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    const todayFocus = sessions.filter(s => s.kind === 'focus' && (s.startedAt || '').slice(0, 10) === today);
    body.querySelector('#tm-total').textContent = Fmt.duration(todayFocus.reduce((s, x) => s + (x.durationMs || 0), 0)) || '0m';
    const log = body.querySelector('#tm-log');
    log.innerHTML = '';
    if (!sessions.length) { log.innerHTML = `<div class="empty" style="padding:12px"><div class="empty-sub">Finished rounds land here.</div></div>`; return; }
    for (const s of sessions.slice(0, 12)) {
      const task = s.taskId ? DB.get('tasks', s.taskId) : null;
      const isFocus = s.kind === 'focus' || s.kind === 'countdown';
      log.appendChild(el(`<div class="session-row">
        <div class="sr-kind" style="background:color-mix(in srgb, ${isFocus ? 'var(--accent)' : 'var(--ok)'} 16%, transparent);color:${isFocus ? 'var(--accent)' : 'var(--ok)'}">${icon(isFocus ? 'zap' : 'coffee')}</div>
        <div class="sr-main"><div class="sr-title">${esc(task ? task.title : (isFocus ? 'Focus' : 'Break'))}</div>
          <div class="sr-sub">${esc(Fmt.relTime(s.startedAt))}</div></div>
        <div class="sr-dur">${Fmt.duration(s.durationMs || 0)}</div></div>`));
    }
  }

  body.querySelector('#tm-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (!TimerEngine.setMode(b.dataset.m)) toast('Stop the running timer first', { icon: 'timer' });
  });
  startBtn.addEventListener('click', () => {
    const st = TimerEngine.state;
    if (st.running) TimerEngine.pause();
    else {
      if (st.mode === 'countdown' && !TimerEngine.isActive())
        TimerEngine.setCountdown(Number(body.querySelector('#tm-mins').value) || 10);
      TimerEngine.start();
    }
    Platform.haptic();
  });
  body.querySelector('#tm-stop').addEventListener('click', () => TimerEngine.stop());
  body.querySelector('#tm-skip').addEventListener('click', () => TimerEngine.skipPhase());
  body.querySelector('#tm-task').addEventListener('change', (e) => TimerEngine.setTask(e.target.value || null));

  draw(); drawTasks(); drawLog();
  const unsubT = TimerEngine.subscribe((ev) => { draw(); if (ev === 'complete' || ev === 'reset') drawLog(); if (ev === 'task') drawTasks(); });
  const unsubD = DB.subscribe((ch) => { if (ch.collection === 'sessions') drawLog(); if (ch.collection === 'tasks') drawTasks(); });
  return () => { unsubT(); unsubD(); };
}

/* ============================ Ideas page ============================ */
function openIdeaSheet(ideaId) {
  const idea = DB.get('ideas', ideaId);
  if (!idea) return;
  const body = el(`<div>
    <div class="field"><label>Idea</label>
      <input class="input" id="im-title" value="${esc(idea.title)}" placeholder="Name the idea"></div>
    <div class="field"><label>Stage</label>
      <div class="seg" id="im-status">${IDEA_COLS.map(c =>
        `<button data-s="${c.key}" class="${idea.status === c.key ? 'active' : ''}">${c.label}</button>`).join('')}</div></div>
    <div class="field"><label>Details</label>
      <textarea class="textarea" id="im-content" placeholder="Sketch it out…">${esc(DB.textOfHtml(idea.content))}</textarea></div>
  </div>`);
  body.querySelector('#im-status').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    idea.status = b.dataset.s;
    body.querySelectorAll('#im-status button').forEach(x => x.classList.toggle('active', x === b));
  });
  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const toTask = el(`<button class="btn sm">${icon('tasks')} To task</button>`);
  const toNote = el(`<button class="btn sm">${icon('note')} To note</button>`);
  const delBtn = el(`<button class="btn sm danger icon">${icon('trash')}</button>`);
  const save = el(`<button class="btn primary" style="flex:1">Save</button>`);
  foot.append(delBtn, toTask, toNote, save);
  const m = openModal({ title: 'Idea', body, foot });
  const commit = () => {
    idea.title = body.querySelector('#im-title').value.trim() || 'Untitled idea';
    const text = body.querySelector('#im-content').value;
    idea.content = text ? `<p>${esc(text).replace(/\n/g, '</p><p>')}</p>` : '';
    DB.upsert('ideas', idea);
  };
  save.addEventListener('click', () => { commit(); m.close(); });
  toTask.addEventListener('click', () => {
    commit();
    const t = DB.newTask({ title: idea.title, notes: DB.textOfHtml(idea.content).slice(0, 500) });
    DB.upsert('tasks', t);
    DB.link({ type: 'idea', id: idea.id }, { type: 'task', id: t.id });
    m.close();
    toast('Task created from idea', { icon: 'tasks' });
  });
  toNote.addEventListener('click', async () => {
    commit();
    if (!await confirmDialog('Promote to a full note? The idea is removed; content moves over.', { danger: false, okText: 'Promote' })) return;
    const n = DB.newNote({ title: idea.title, content: idea.content });
    DB.upsert('notes', n);
    for (const ref of idea.links || []) DB.link({ type: 'note', id: n.id }, ref);
    DB.remove('ideas', idea.id);
    m.close();
    toast('Promoted to note', { icon: 'note', action: 'Open', onAction: () => App.goto('note', n.id) });
  });
  delBtn.addEventListener('click', async () => {
    m.close();
    if (await confirmDialog(`Delete idea “${idea.title || 'Untitled'}”?`)) DB.remove('ideas', idea.id);
  });
}

function buildIdeasPage(body) {
  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input class="input" id="id-quick" placeholder="Capture an idea…" style="flex:1">
      <button class="btn primary icon" id="id-add">${icon('sparkle')}</button>
    </div>
    <div id="id-cols"></div>`;
  function capture() {
    const input = body.querySelector('#id-quick');
    const title = input.value.trim();
    if (!title) return;
    DB.upsert('ideas', DB.newIdea({ title }));
    input.value = '';
    toast('Idea captured', { icon: 'sparkle' });
  }
  body.querySelector('#id-add').addEventListener('click', capture);
  body.querySelector('#id-quick').addEventListener('keydown', (e) => { if (e.key === 'Enter') capture(); });

  function draw() {
    const wrap = body.querySelector('#id-cols');
    wrap.innerHTML = '';
    const ideas = DB.all('ideas');
    for (const col of IDEA_COLS) {
      const items = ideas.filter(i => (i.status || 'spark') === col.key)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      wrap.appendChild(el(`<div class="task-group-title"><span class="idea-status-dot" style="background:${col.color}"></span>${col.label}<span class="count">${items.length}</span></div>`));
      if (!items.length) { wrap.appendChild(el(`<div class="muted" style="font-size:12px;padding:2px 4px 8px">Nothing here yet.</div>`)); continue; }
      for (const idea of items) {
        const snippet = DB.textOfHtml(idea.content).slice(0, 100);
        const card = el(`<div class="idea-card">
          <div class="ic-title">${esc(idea.title || 'Untitled idea')}</div>
          ${snippet ? `<div class="ic-snippet">${esc(snippet)}</div>` : ''}
          <div class="ic-foot">
            ${(idea.links || []).length ? `<span class="chip">${icon('link')}<span>${idea.links.length}</span></span>` : ''}
            <span class="ic-date">${esc(Fmt.relTime(idea.updatedAt))}</span>
          </div></div>`);
        card.addEventListener('click', () => openIdeaSheet(idea.id));
        wrap.appendChild(card);
      }
    }
  }
  draw();
  return DB.subscribe((ch) => { if (ch.collection === 'ideas' || ch.kind === 'reload') draw(); });
}

/* ============================ Reminders page ============================ */
function buildRemindersPage(body) {
  const REPEAT_LABEL = { none: 'Once', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
  body.innerHTML = `
    <div class="card">
      <div class="field"><label>New reminder</label>
        <input class="input" id="rm-title" placeholder="Remind me to…"></div>
      <div class="field-row" style="margin-top:10px">
        <input type="date" class="input" id="rm-date" value="${Fmt.todayStr()}" style="flex:1">
        <input type="time" class="input" id="rm-time" style="flex:1">
      </div>
      <div class="field-row" style="margin-top:10px">
        <select class="input" id="rm-repeat" style="flex:1">
          ${Object.entries(REPEAT_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <button class="btn primary" id="rm-add" style="flex:1">${icon('bell')} Add</button>
      </div>
    </div>
    <div id="rm-list"></div>`;

  function add() {
    const title = body.querySelector('#rm-title').value.trim();
    if (!title) { toast('Give it a title', { icon: 'bell' }); return; }
    const date = body.querySelector('#rm-date').value || Fmt.todayStr();
    let time = body.querySelector('#rm-time').value;
    if (!time) {
      const soon = new Date(Date.now() + 3600000);
      time = `${Fmt.pad(soon.getHours())}:${Fmt.pad(soon.getMinutes())}`;
    }
    const rem = DB.newReminder({ title, at: new Date(`${date}T${time}`).toISOString(), repeat: body.querySelector('#rm-repeat').value });
    DB.upsert('reminders', rem);
    body.querySelector('#rm-title').value = '';
    Platform.ensureNotifPermission();
    toast(`Reminder set — ${Fmt.untilText(rem.at)}`, { icon: 'bell' });
  }
  body.querySelector('#rm-add').addEventListener('click', add);

  function snooze(r, minutes) {
    r.at = new Date(Date.now() + minutes * 60000).toISOString();
    r.notified = false; r.done = false;
    DB.upsert('reminders', r);
    toast('Snoozed', { icon: 'snooze' });
  }

  function draw() {
    const list = body.querySelector('#rm-list');
    const all = [...DB.all('reminders')];
    const now = Date.now();
    const attention = all.filter(r => !r.done && (r.notified || (r.at && Date.parse(r.at) <= now))).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    const upcoming = all.filter(r => !r.done && !r.notified && r.at && Date.parse(r.at) > now).sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    const done = all.filter(r => r.done).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 6);
    list.innerHTML = '';
    const section = (label, items, cls = '') => {
      if (!items.length) return;
      list.appendChild(el(`<div class="task-group-title ${cls}">${label}<span class="count">${items.length}</span></div>`));
      for (const r of items) {
        const fired = (r.notified || Date.parse(r.at) <= now) && !r.done;
        const row = el(`<div class="rem-row ${fired ? 'fired' : ''} ${r.done ? 'done' : ''}">
          <div class="rem-bell">${icon(r.done ? 'checkCircle' : 'bell')}</div>
          <div class="rem-main">
            <div class="rem-title">${esc(r.title || 'Untitled')}</div>
            <div class="rem-sub"><span>${esc(Fmt.dateTime(r.at))}</span>
              ${!r.done ? `<span class="${Date.parse(r.at) < now ? 'overdue' : ''}">${esc(Fmt.untilText(r.at))}</span>` : ''}
              ${r.repeat !== 'none' ? `<span class="chip">${icon('repeat')}<span>${REPEAT_LABEL[r.repeat]}</span></span>` : ''}</div>
          </div>
          <button class="iconbtn" data-a="more">${icon('dots')}</button>
        </div>`);
        row.querySelector('[data-a=more]').addEventListener('click', (e) => {
          e.stopPropagation();
          menu(e.currentTarget, [
            ...(r.done ? [{ icon: 'reset', label: 'Restore', onClick: () => { r.done = false; r.notified = Date.parse(r.at) < Date.now(); DB.upsert('reminders', r); } }]
              : [
                { icon: 'check', label: 'Mark done', onClick: () => { r.done = true; r.notified = true; DB.upsert('reminders', r); } },
                { icon: 'snooze', label: 'Snooze 10 min', onClick: () => snooze(r, 10) },
                { icon: 'snooze', label: 'Snooze 1 hour', onClick: () => snooze(r, 60) },
                { icon: 'link', label: 'Link to…', onClick: () => openLinkPicker({ type: 'reminder', id: r.id }) }
              ]),
            '-',
            { icon: 'trash', label: 'Delete', danger: true, onClick: async () => {
                if (await confirmDialog(`Delete “${r.title}”?`)) DB.remove('reminders', r.id);
              } }
          ]);
        });
        list.appendChild(row);
      }
    };
    section('Needs attention', attention, 'overdue');
    section('Upcoming', upcoming);
    section('Completed', done);
    if (!all.length) list.appendChild(el(`<div class="empty">${icon('bell')}
      <div class="empty-title">No reminders</div>
      <div class="empty-sub">Anoosh fires real Android notifications at the right moment.</div></div>`));
  }
  draw();
  return DB.subscribe((ch) => { if (ch.collection === 'reminders' || ch.kind === 'reload') draw(); });
}

/* ============================ Sync page ============================ */
function buildSyncPage(body) {
  const s = DB.settings();
  body.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('repeat')} Wi-Fi sync with your PC</div>
      <div class="muted" style="font-size:12.5px;line-height:1.55;margin-bottom:12px">
        On the desktop app open <b>Settings → Sync</b> and press <b>Start sync</b>.
        Enter the address and 6-digit code it shows, then sync. New and changed
        items flow both ways; deletions follow too.</div>
      <div class="field"><label>PC address</label>
        <input class="input" id="sy-addr" placeholder="192.168.1.5:38200" value="${esc(s.syncAddress || '')}"></div>
      <div class="field" style="margin-top:10px"><label>Code</label>
        <input class="input" id="sy-code" inputmode="numeric" maxlength="6" placeholder="6-digit code" value="${esc(s.syncCode || '')}"></div>
      <button class="btn primary block" id="sy-go" style="margin-top:14px">${icon('repeat')} Sync now</button>
      <div class="sync-status" id="sy-status" style="margin-top:12px">
        ${s.lastSyncAt ? `Last synced <b>${esc(Fmt.relTime(s.lastSyncAt))}</b>.` : 'Never synced yet.'}</div>
    </div>
    <div class="card">
      <div class="card-title">${icon('save')} Sync by file (cable, drive, anything)</div>
      <div class="muted" style="font-size:12.5px;line-height:1.55;margin-bottom:12px">
        No shared Wi-Fi? Export a sync file and move it to the PC over a USB
        cable or any app — then use <b>Import &amp; merge</b> on the other side.
        Merging combines data; nothing gets replaced.</div>
      <div style="display:flex;gap:9px">
        <button class="btn" id="sy-export" style="flex:1">${icon('upload')} Export &amp; share</button>
        <button class="btn" id="sy-import" style="flex:1">${icon('download')} Import &amp; merge</button>
      </div>
    </div>`;

  const statusEl = body.querySelector('#sy-status');
  body.querySelector('#sy-go').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${icon('clock')} Syncing…`;
    try {
      const { stats, deviceName } = await Sync.wifiSync(
        body.querySelector('#sy-addr').value, body.querySelector('#sy-code').value);
      statusEl.innerHTML = `Synced with <b>${esc(deviceName)}</b> just now — <b>${stats.added}</b> added, <b>${stats.updated}</b> updated, <b>${stats.removed}</b> removed on this phone.`;
      toast('Sync complete', { icon: 'checkCircle' });
      Platform.haptic('medium');
    } catch (err) {
      statusEl.innerHTML = `<span style="color:var(--danger)">${esc(err.message)}</span>`;
      toast('Sync failed', { icon: 'x' });
    }
    btn.disabled = false;
    btn.innerHTML = `${icon('repeat')} Sync now`;
  });
  body.querySelector('#sy-export').addEventListener('click', async () => {
    try { await Sync.exportFile(); } catch (e) { toast('Could not share the file', { icon: 'x' }); }
  });
  body.querySelector('#sy-import').addEventListener('click', async () => {
    try {
      const res = await Sync.importFile();
      if (!res) return;
      statusEl.innerHTML = `File merged — <b>${res.stats.added}</b> added, <b>${res.stats.updated}</b> updated, <b>${res.stats.removed}</b> removed.`;
      toast('Merged', { icon: 'checkCircle' });
    } catch (err) { toast(err.message, { icon: 'x' }); }
  });
  return () => {};
}

/* ============================ Settings page ============================ */
function buildSettingsPage(body) {
  const s = () => DB.settings();
  body.innerHTML = `
    <div class="card">
      <div class="card-title">${icon('palette')} Appearance</div>
      <div class="set-col"><div class="sl-title">Theme</div>
        <div class="sl-sub" style="margin-top:-6px">Toranj has two variations — tap the blue or orange dot on its card</div>
        <div class="theme-grid" id="st-theme"></div></div>
      <div class="set-col"><div class="sl-title">Accent color</div><div id="st-accent"></div></div>
      <div class="set-row">
        <div class="set-label"><div class="sl-title">Reduce effects</div><div class="sl-sub">Less blur & glow — saves battery</div></div>
        <button class="toggle" id="st-fx"></button>
      </div>
      <div class="set-row">
        <div class="set-label"><div class="sl-title">Your name</div></div>
        <input class="input sm" id="st-name" style="width:150px" placeholder="Optional">
      </div>
    </div>
    <div class="card">
      <div class="card-title">${icon('calendar')} Calendar</div>
      <div class="set-col"><div class="sl-title">Primary calendar</div>
        <div class="seg" id="st-cal">
          <button data-c="gregorian">${icon('globe')} Gregorian</button>
          <button data-c="hijri">${icon('moonStar')} Lunar</button>
          <button data-c="jalali">${icon('sun')} Solar</button>
        </div></div>
      <div class="set-col"><div class="sl-title">Week starts on</div>
        <div class="seg" id="st-dow">
          <button data-d="6">Saturday</button><button data-d="0">Sunday</button><button data-d="1">Monday</button>
        </div></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('timer')} Timer</div>
      <div class="set-row"><div class="set-label"><div class="sl-title">Focus length (min)</div></div>
        <input type="number" class="input sm set-num" id="st-work" min="5" max="120"></div>
      <div class="set-row"><div class="set-label"><div class="sl-title">Short break</div></div>
        <input type="number" class="input sm set-num" id="st-short" min="1" max="60"></div>
      <div class="set-row"><div class="set-label"><div class="sl-title">Long break</div></div>
        <input type="number" class="input sm set-num" id="st-long" min="5" max="90"></div>
      <div class="set-row"><div class="set-label"><div class="sl-title">Sound</div></div>
        <button class="toggle" id="st-sound"></button></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('home')} Dashboard modules</div>
      <div class="muted" style="font-size:12px;line-height:1.5;margin-bottom:4px">Optional sections for Today. Off by default — toggle one on and it appears immediately.</div>
      <div id="st-modules"></div>
    </div>
    <div class="card">
      <div class="card-title">${icon('settings')} Security</div>
      <div class="set-row">
        <div class="set-label"><div class="sl-title">App lock</div>
          <div class="sl-sub" id="st-lockstate"></div></div>
        <span id="st-lockbtns" style="display:flex;gap:8px"></span>
      </div>
    </div>
    <div class="set-row" style="border:none">
      <div class="set-label"><div class="sl-title">Welcome tour</div><div class="sl-sub">Replay the short introduction</div></div>
      <button class="btn sm" id="st-tour">${icon('sparkle')} Show</button>
    </div>
    <div class="muted" style="text-align:center;font-size:11.5px;padding:4px 0 16px">Anoosh for Android — offline, synced, yours.</div>`;

  const syncSeg = (seg, attr, value) =>
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset[attr] === String(value)));

  // Theme gallery. Toranj & Blossoms adopt their signature accent on pick.
  const THEME_DEFS = [
    { key: 'dark', name: 'Dark', bg: '#0d0e1a', bar: '#222339', text: '#eceafb', dots: ['#7c5cff', '#3ec6ff'] },
    { key: 'light', name: 'Light', bg: '#eef0fa', bar: '#ffffff', text: '#23233c', dots: ['#7c5cff', '#3ec6ff'] },
    { key: 'onyx', name: 'Onyx', bg: '#060607', bar: '#18181d', text: '#f0f0f4', dots: ['#8a8f9e', '#3a3a42'] },
    {
      key: 'toranj', name: 'Toranj', bg: '#ece2cf', bar: '#faf3e3', text: '#33291d', dots: ['#5c7f4c', '#6f4f2a'],
      variants: [{ theme: 'toranj', color: '#2f6b75' }, { theme: 'toranj-warm', color: '#c1652a' }]
    },
    { key: 'blossoms', name: 'Blossoms', bg: '#171021', bar: '#251532', text: '#f6ecf6', dots: ['#ff77b6', '#a78bfa'], accent: '#ff77b6' }
  ];
  const themeGrid = body.querySelector('#st-theme');
  function drawThemeGrid() {
    const cur = s().theme;
    themeGrid.innerHTML = '';
    for (const def of THEME_DEFS) {
      const active = def.variants ? cur.startsWith('toranj') : cur === def.key;
      const card = el(`<div class="theme-card ${active ? 'active' : ''}" style="--tc-bg:${def.bg};--tc-text:${def.text}">
        ${def.variants ? `<div class="tc-variants">${def.variants.map(v =>
          `<span class="tc-variant ${cur === v.theme ? 'on' : ''}" data-vt="${v.theme}" data-va="${v.color}" style="background:${v.color}"></span>`).join('')}</div>` : ''}
        <div class="tc-strip">${def.dots.map(d => `<span class="tc-dot" style="background:${d}"></span>`).join('')}<span class="tc-bar" style="background:${def.bar}"></span></div>
        <div class="tc-name">${def.name}</div>
      </div>`);
      card.addEventListener('click', (e) => {
        Platform.haptic();
        const variant = e.target.closest('.tc-variant');
        if (variant) DB.setSettings({ theme: variant.dataset.vt, accent: variant.dataset.va });
        else if (def.variants) {
          const v = def.variants.find(x => x.theme === s().theme) || def.variants[0];
          DB.setSettings({ theme: v.theme, accent: v.color });
        } else {
          const patch = { theme: def.key };
          if (def.accent) patch.accent = def.accent;
          DB.setSettings(patch);
        }
        drawThemeGrid();
      });
      themeGrid.appendChild(card);
    }
  }
  drawThemeGrid();
  body.querySelector('#st-accent').appendChild(swatchRow(s().accent, (c) => DB.setSettings({ accent: c })));
  const fxT = body.querySelector('#st-fx');
  fxT.classList.toggle('on', !!s().reduceEffects);
  fxT.addEventListener('click', () => {
    DB.setSettings({ reduceEffects: !s().reduceEffects });
    fxT.classList.toggle('on', !!s().reduceEffects);
  });
  const nameIn = body.querySelector('#st-name');
  nameIn.value = s().userName || '';
  nameIn.addEventListener('change', () => DB.setSettings({ userName: nameIn.value.trim() }));

  const calSeg = body.querySelector('#st-cal');
  syncSeg(calSeg, 'c', s().calendarPrimary);
  calSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    DB.setSettings({ calendarPrimary: b.dataset.c });
    syncSeg(calSeg, 'c', b.dataset.c);
  });
  const dowSeg = body.querySelector('#st-dow');
  syncSeg(dowSeg, 'd', s().firstDayOfWeek);
  dowSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    DB.setSettings({ firstDayOfWeek: Number(b.dataset.d) });
    syncSeg(dowSeg, 'd', b.dataset.d);
  });
  const bind = (id, key, min, max) => {
    const input = body.querySelector(id);
    input.value = s().pomodoro[key];
    input.addEventListener('change', () => {
      const p = Object.assign({}, s().pomodoro);
      p[key] = Math.max(min, Math.min(max, Number(input.value) || p[key]));
      input.value = p[key];
      DB.setSettings({ pomodoro: p });
    });
  };
  bind('#st-work', 'work', 5, 120); bind('#st-short', 'short', 1, 60); bind('#st-long', 'long', 5, 90);
  const soundT = body.querySelector('#st-sound');
  soundT.classList.toggle('on', !!s().timerSound);
  soundT.addEventListener('click', () => {
    DB.setSettings({ timerSound: !s().timerSound });
    soundT.classList.toggle('on', !!s().timerSound);
  });

  /* dashboard modules */
  const modsEl = body.querySelector('#st-modules');
  for (const m of DashModules.list()) {
    const row = el(`<div class="set-row">
      <div class="set-label"><div class="sl-title">${esc(m.title)}</div><div class="sl-sub">${esc(m.desc)}</div></div>
      <button class="toggle ${DashModules.isEnabled(m.id) ? 'on' : ''}"></button>
    </div>`);
    row.querySelector('.toggle').addEventListener('click', (e) => {
      const on = !DashModules.isEnabled(m.id);
      DashModules.setEnabled(m.id, on);
      e.currentTarget.classList.toggle('on', on);
      Platform.haptic();
      toast(on ? `${m.title} added to Today` : `${m.title} removed`, { icon: m.icon });
    });
    modsEl.appendChild(row);
  }

  /* app lock */
  function pinSheet(title, cb) {
    const b2 = el(`<div class="field"><label>${esc(title)}</label>
      <input class="input" type="password" inputmode="numeric" maxlength="10" placeholder="4–10 digits" id="pl-pin"></div>`);
    const f2 = el(`<div style="width:100%"></div>`);
    const ok = el(`<button class="btn primary block">Confirm</button>`);
    f2.appendChild(ok);
    const m2 = openModal({ title: 'App lock', body: b2, foot: f2 });
    ok.addEventListener('click', () => { const v = b2.querySelector('#pl-pin').value; m2.close(); cb(v); });
    setTimeout(() => b2.querySelector('#pl-pin').focus(), 250);
  }
  function drawLock() {
    const rec = s().appLock;
    body.querySelector('#st-lockstate').textContent = rec
      ? 'Lock is on — a PIN is required to open Anoosh.'
      : 'Ask for a PIN when the app opens. You choose it — there is no default.';
    const btns = body.querySelector('#st-lockbtns');
    btns.innerHTML = '';
    if (!rec) {
      const set = el(`<button class="btn primary sm">Set PIN</button>`);
      set.addEventListener('click', () => pinSheet('Choose a PIN', async (pin) => {
        try { DB.setSettings({ appLock: await Lock.create(pin) }); toast('App lock enabled', { icon: 'checkCircle' }); drawLock(); }
        catch (e) { toast(e.message, { icon: 'x' }); }
      }));
      btns.appendChild(set);
    } else {
      const requirePin = (then) => pinSheet('Current PIN', async (pin) => {
        if (await Lock.verify(pin, rec)) then(); else toast('Wrong PIN', { icon: 'x' });
      });
      const change = el(`<button class="btn sm">Change</button>`);
      change.addEventListener('click', () => requirePin(() => pinSheet('New PIN', async (pin) => {
        try { DB.setSettings({ appLock: await Lock.create(pin) }); toast('PIN changed', { icon: 'checkCircle' }); }
        catch (e) { toast(e.message, { icon: 'x' }); }
      })));
      const remove = el(`<button class="btn sm danger">Remove</button>`);
      remove.addEventListener('click', () => requirePin(() => {
        DB.setSettings({ appLock: null });
        toast('App lock removed', { icon: 'checkCircle' });
        drawLock();
      }));
      btns.append(change, remove);
    }
  }
  drawLock();

  body.querySelector('#st-tour').addEventListener('click', () => showOnboarding(true));
  return () => {};
}

/* ============================ hub ============================ */
const SUBPAGES = {
  timer: { title: 'Timer', build: buildTimerPage },
  ideas: { title: 'Ideas', build: buildIdeasPage },
  reminders: { title: 'Reminders', build: buildRemindersPage },
  sync: { title: 'Sync', build: buildSyncPage },
  settings: { title: 'Settings', build: buildSettingsPage }
};

MViews.more = {
  id: 'more', title: 'More', icon: 'dots',
  mount(container) {
    container.innerHTML = `<div class="page">
      <div class="page-title">More</div>
      <div class="page-sub" id="mo-sub"></div>
      <div class="more-grid" id="mo-grid"></div>
    </div>`;
    const CARDS = [
      { key: 'timer', icon: 'timer', color: 'var(--accent)', sub: () => TimerEngine.isActive() ? 'Running' : 'Pomodoro · stopwatch' },
      { key: 'ideas', icon: 'bulb', color: '#f5a524', sub: () => `${DB.all('ideas').length} brewing` },
      { key: 'reminders', icon: 'bell', color: '#ffc75f', sub: () => {
          const n = DB.all('reminders').filter(r => !r.done && r.at && Date.parse(r.at) <= Date.now()).length;
          return n ? `${n} need attention` : 'All quiet';
        } },
      { key: 'sync', icon: 'repeat', color: '#3ec6ff', sub: () => {
          const at = DB.settings().lastSyncAt;
          return at ? `Last: ${Fmt.relTime(at)}` : 'Connect your PC';
        } },
      { key: 'settings', icon: 'settings', color: '#8a8f9e', sub: () => 'Theme, calendar, timer' }
    ];
    function draw() {
      const grid = container.querySelector('#mo-grid');
      grid.innerHTML = '';
      container.querySelector('#mo-sub').textContent = 'Timer, ideas, reminders, sync & settings';
      for (const c of CARDS) {
        const meta = SUBPAGES[c.key];
        const card = el(`<div class="more-card" style="--mc:${c.color}">
          <div class="mc-icon">${icon(c.icon)}</div>
          <div class="mc-name">${meta.title}</div>
          <div class="mc-sub">${esc(c.sub())}</div>
        </div>`);
        card.addEventListener('click', () => App.push(c.key));
        grid.appendChild(card);
      }
    }
    draw();
    const unsub = DB.subscribe(() => draw());
    return { destroy: unsub };
  }
};

window.MSubpages = SUBPAGES;
