'use strict';
/* Dashboard ("Today") — the connected overview of every module. */

window.Views = window.Views || {};

Views.dashboard = {
  id: 'dashboard', title: 'Today', icon: 'home',

  mount(container) {
    let captureKind = 'task';

    container.innerHTML = `
      <div class="view">
        <div class="view-body" style="overflow:hidden">
          <div class="dash-grid">
            <div class="dash-hero glass">
              <div>
                <div class="dash-greet" id="dh-greet"></div>
                <div class="dash-dates" id="dh-dates"></div>
              </div>
              <div class="dash-clock">
                <div class="clock-time" id="dh-clock"></div>
                <div class="clock-sub" id="dh-clocksub"></div>
              </div>
            </div>

            <div class="dash-col">
              <div class="card">
                <div class="card-title">${icon('sparkle')} Quick capture</div>
                <div class="quick-capture">
                  <input class="input" id="dh-capture" placeholder="Add a task…">
                  <button class="btn primary icon" id="dh-capture-go" title="Add">${icon('plus')}</button>
                </div>
                <div class="seg" id="dh-kind" style="margin-top:9px">
                  <button data-k="task" class="active">${icon('tasks')} Task</button>
                  <button data-k="idea">${icon('bulb')} Idea</button>
                  <button data-k="note">${icon('note')} Note</button>
                  <button data-k="reminder">${icon('bell')} Reminder</button>
                </div>
              </div>
              <div class="card" style="flex:1;min-height:120px">
                <div class="card-title">${icon('tasks')} Today’s tasks
                  <span class="spacer"></span>
                  <button class="btn sm ghost" id="dh-alltasks">All ${icon('chevR')}</button></div>
                <div class="dash-list" id="dh-tasks"></div>
              </div>
            </div>

            <div class="dash-col">
              <div class="card" style="flex:1;min-height:120px">
                <div class="card-title">${icon('calendar')} Coming up
                  <span class="spacer"></span>
                  <button class="btn sm ghost" id="dh-cal">Calendar ${icon('chevR')}</button></div>
                <div class="dash-list" id="dh-upcoming"></div>
              </div>
            </div>

            <div class="dash-col">
              <div class="card" id="dh-timer-card">
                <div class="card-title">${icon('zap')} Focus</div>
                <div id="dh-timer"></div>
              </div>
              <div class="card">
                <div class="card-title">${icon('note')} Recent notes
                  <span class="spacer"></span>
                  <button class="btn sm ghost" id="dh-notes">All ${icon('chevR')}</button></div>
                <div class="dash-list" id="dh-recent"></div>
              </div>
              <div class="card">
                <div class="card-title">${icon('bulb')} Idea shelf</div>
                <div class="stat-row" id="dh-ideastats"></div>
              </div>
              <div id="dh-modules"></div>
            </div>
          </div>
        </div>
      </div>`;

    /* hero */
    function drawHero() {
      const now = new Date();
      const hour = now.getHours();
      const name = (DB.settings().userName || '').trim();
      const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      container.querySelector('#dh-greet').textContent = name ? `${greet}, ${name}` : greet;
      const h = Fmt.hijriToday();
      const j = Jalali.fromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate());
      container.querySelector('#dh-dates').innerHTML =
        `<span>${esc(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</span>
         <span class="dot"></span><span title="Lunar (Hijri)">${esc(Hijri.format(h))}</span>
         <span class="dot"></span><span title="Solar (Jalali)">${esc(Jalali.format(j))}</span>`;
      container.querySelector('#dh-clock').textContent =
        now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const open = DB.all('tasks').filter(t => !t.done).length;
      container.querySelector('#dh-clocksub').textContent = `${open} open task${open === 1 ? '' : 's'}`;
    }

    /* quick capture */
    const capInput = container.querySelector('#dh-capture');
    container.querySelector('#dh-kind').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      captureKind = b.dataset.k;
      container.querySelectorAll('#dh-kind button').forEach(x => x.classList.toggle('active', x === b));
      capInput.placeholder = captureKind === 'task' ? 'Add a task…'
        : captureKind === 'idea' ? 'Capture an idea…'
        : captureKind === 'note' ? 'Title for a new note…'
        : 'Remind me to… (fires in 1 hour, edit after)';
      capInput.focus();
    });
    function capture() {
      const text = capInput.value.trim();
      if (!text) return;
      if (captureKind === 'task') {
        DB.upsert('tasks', DB.newTask({ title: text, dueDate: Fmt.todayStr() }));
        toast('Task added for today', { icon: 'tasks' });
      } else if (captureKind === 'idea') {
        DB.upsert('ideas', DB.newIdea({ title: text }));
        toast('Idea captured', { icon: 'sparkle' });
      } else if (captureKind === 'note') {
        const n = DB.newNote({ title: text });
        DB.upsert('notes', n);
        toast('Note created', { icon: 'note', action: 'Open', onAction: () => App.goto('note', n.id) });
      } else {
        const rem = DB.newReminder({ title: text, at: new Date(Date.now() + 3600000).toISOString() });
        DB.upsert('reminders', rem);
        toast('Reminder set for 1 hour from now', { icon: 'bell', action: 'Edit', onAction: () => App.goto('reminder', rem.id) });
      }
      capInput.value = '';
      capInput.focus();
    }
    capInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') capture(); });
    container.querySelector('#dh-capture-go').addEventListener('click', capture);

    /* today's tasks */
    function drawTasks() {
      const today = Fmt.todayStr();
      const listEl = container.querySelector('#dh-tasks');
      const tasks = DB.all('tasks')
        .filter(t => !t.done && t.dueDate && t.dueDate <= today)
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || b.priority - a.priority)
        .slice(0, 8);
      listEl.innerHTML = '';
      if (!tasks.length) {
        listEl.appendChild(el(`<div class="empty" style="padding:18px 8px">${icon('checkCircle')}
          <div class="empty-sub">Nothing due today. Capture a task above or plan in the Tasks view.</div></div>`));
        return;
      }
      for (const t of tasks) {
        const overdue = t.dueDate < today;
        const row = el(`<div class="dash-item">
          <button class="tcheck ${t.priority ? 'prio-' + t.priority : ''}" title="Mark done">${icon('check')}</button>
          <div class="di-text"><div class="di-title">${esc(t.title)}</div>
            ${overdue ? `<div class="di-sub" style="color:var(--danger)">overdue · ${esc(Fmt.niceDate(t.dueDate))}</div>` : t.dueTime ? `<div class="di-sub">${esc(Fmt.time12(t.dueTime))}</div>` : ''}</div>
          <button class="iconbtn" title="Focus">${icon('play')}</button>
        </div>`);
        row.querySelector('.tcheck').addEventListener('click', (e) => { e.stopPropagation(); toggleTaskDone(t); });
        row.querySelector('.iconbtn').addEventListener('click', (e) => {
          e.stopPropagation();
          TimerEngine.startFocusOn(t.id);
          toast(`Focusing on “${t.title.slice(0, 30)}”`, { icon: 'zap' });
        });
        row.addEventListener('click', () => openTaskModal(t.id));
        listEl.appendChild(row);
      }
    }

    /* upcoming (7 days: events + reminders + due tasks) */
    function drawUpcoming() {
      const listEl = container.querySelector('#dh-upcoming');
      const today = Fmt.todayStr();
      const horizon = Fmt.addDays(today, 7);
      const items = [];
      for (const ev of DB.all('events')) {
        if (ev.date && ev.date >= today && ev.date <= horizon)
          items.push({ kind: 'event', date: ev.date, time: ev.time || '', title: ev.title, color: ev.color, open: () => App.goto('event', ev.id) });
      }
      for (const r of DB.all('reminders')) {
        if (r.done || !r.at) continue;
        const d = new Date(r.at);
        const ds = Fmt.dateToStr(d);
        if (ds >= today && ds <= horizon)
          items.push({ kind: 'reminder', date: ds, time: `${Fmt.pad(d.getHours())}:${Fmt.pad(d.getMinutes())}`, title: r.title, color: 'var(--warn)', open: () => App.goto('reminder', r.id) });
      }
      for (const t of DB.all('tasks')) {
        if (!t.done && t.dueDate && t.dueDate > today && t.dueDate <= horizon)
          items.push({ kind: 'task', date: t.dueDate, time: t.dueTime || '', title: t.title, color: 'var(--accent)', open: () => openTaskModal(t.id) });
      }
      items.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.appendChild(el(`<div class="empty" style="padding:18px 8px">${icon('calendar')}
          <div class="empty-sub">The next 7 days are clear. Add events in the Calendar, or set reminders.</div></div>`));
        return;
      }
      let lastDate = '';
      for (const it of items.slice(0, 12)) {
        if (it.date !== lastDate) {
          lastDate = it.date;
          listEl.appendChild(el(`<div class="task-group-title" style="padding:8px 4px 4px">${esc(Fmt.niceDate(it.date))}</div>`));
        }
        const iconName = it.kind === 'event' ? 'calendar' : it.kind === 'reminder' ? 'bell' : 'tasks';
        const row = el(`<div class="dash-item">
          <div class="di-icon" style="background:color-mix(in srgb, ${it.color} 16%, transparent);color:${it.color}">${icon(iconName)}</div>
          <div class="di-text"><div class="di-title">${esc(it.title || 'Untitled')}</div></div>
          <div class="di-time">${it.time ? esc(Fmt.time12(it.time)) : ''}</div>
        </div>`);
        row.addEventListener('click', it.open);
        listEl.appendChild(row);
      }
    }

    /* timer card */
    function drawTimerCard() {
      const wrap = container.querySelector('#dh-timer');
      const st = TimerEngine.state;
      if (TimerEngine.isActive()) {
        const task = st.taskId ? DB.get('tasks', st.taskId) : null;
        const rem = st.mode === 'stopwatch' ? TimerEngine.elapsedMs() : TimerEngine.remainingMs();
        const mins = Math.floor(rem / 60000), secs = Math.floor((rem % 60000) / 1000);
        wrap.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:26px;font-weight:300;font-variant-numeric:tabular-nums">${mins}:${Fmt.pad(secs)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:1px">
                ${st.mode === 'pomodoro' ? (st.phase === 'focus' ? 'Focus' : 'Break') : st.mode}</div>
              ${task ? `<div style="font-size:12px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(task.title)}</div>` : ''}
            </div>
            <button class="btn sm ${st.running ? '' : 'primary'}" id="dh-t-toggle">${icon(st.running ? 'pause' : 'play')}</button>
          </div>`;
        wrap.querySelector('#dh-t-toggle').addEventListener('click', () => {
          st.running ? TimerEngine.pause() : TimerEngine.start();
        });
      } else {
        wrap.innerHTML = `
          <div style="display:flex;gap:8px">
            <button class="btn primary" style="flex:1" id="dh-t-start">${icon('play')} Start focus</button>
            <button class="btn" id="dh-t-open">${icon('timer')}</button>
          </div>
          <div class="muted" style="font-size:11.5px;margin-top:8px">${DB.settings().pomodoro.work || 25} min focus round</div>`;
        wrap.querySelector('#dh-t-start').addEventListener('click', () => {
          TimerEngine.setMode('pomodoro');
          TimerEngine.start();
          toast('Focus round started', { icon: 'zap' });
        });
        wrap.querySelector('#dh-t-open').addEventListener('click', () => App.show('timer'));
      }
    }

    /* recent notes */
    function drawRecent() {
      const listEl = container.querySelector('#dh-recent');
      const notes = [...DB.all('notes')]
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 4);
      listEl.innerHTML = '';
      if (!notes.length) {
        listEl.appendChild(el(`<div class="empty" style="padding:14px 8px"><div class="empty-sub">No notes yet — capture one above.</div></div>`));
        return;
      }
      for (const n of notes) {
        const row = el(`<div class="dash-item">
          <div class="di-icon" style="background:color-mix(in srgb, ${esc(n.headerColor || '#7c5cff')} 18%, transparent);color:${esc(n.headerColor || '#7c5cff')}">${icon('note')}</div>
          <div class="di-text"><div class="di-title">${esc(n.title || 'Untitled note')}</div>
            <div class="di-sub">${esc(Fmt.relTime(n.updatedAt))}${n.pinnedToScreen ? ' · on screen' : ''}</div></div>
        </div>`);
        row.addEventListener('click', () => App.goto('note', n.id));
        listEl.appendChild(row);
      }
    }

    /* idea stats */
    function drawIdeas() {
      const ideas = DB.all('ideas');
      const wrap = container.querySelector('#dh-ideastats');
      const count = (s) => ideas.filter(i => (i.status || 'spark') === s).length;
      wrap.innerHTML = `
        <div class="stat"><div class="stat-num">${count('spark')}</div><div class="stat-label">Sparks</div></div>
        <div class="stat"><div class="stat-num">${count('growing')}</div><div class="stat-label">Growing</div></div>
        <div class="stat"><div class="stat-num">${count('ready')}</div><div class="stat-label">Ready</div></div>`;
      wrap.querySelectorAll('.stat').forEach(s => {
        s.style.cursor = 'pointer';
        s.addEventListener('click', () => App.show('ideas'));
      });
    }

    container.querySelector('#dh-alltasks').addEventListener('click', () => App.show('tasks'));
    container.querySelector('#dh-cal').addEventListener('click', () => App.show('calendar'));
    container.querySelector('#dh-notes').addEventListener('click', () => App.show('notes'));

    function drawAll() {
      drawHero(); drawTasks(); drawUpcoming(); drawTimerCard(); drawRecent(); drawIdeas();
      DashModules.renderSections(container.querySelector('#dh-modules'));
    }
    drawAll();

    const clock = setInterval(() => { drawHero(); if (TimerEngine.isActive()) drawTimerCard(); }, 1000 * 20);
    const timerClock = setInterval(() => { if (TimerEngine.isActive()) drawTimerCard(); }, 1000);
    const unsubTimer = TimerEngine.subscribe(() => drawTimerCard());
    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') {
        // module toggles must reshape the dashboard immediately
        drawHero();
        DashModules.renderSections(container.querySelector('#dh-modules'));
        return;
      }
      drawAll();
    });

    return { destroy() { clearInterval(clock); clearInterval(timerClock); unsubTimer(); unsub(); } };
  }
};
