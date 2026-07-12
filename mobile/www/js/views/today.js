'use strict';
/* Today tab — greeting in three calendars, today's plan, coming up, recents. */
window.MViews = window.MViews || {};

MViews.today = {
  id: 'today', title: 'Today', icon: 'home',
  mount(container) {
    container.innerHTML = `
      <div class="page">
        <div class="hero-dates">
          <div class="hero-greet" id="td-greet"></div>
          <div class="hero-line" id="td-date"></div>
          <div class="hero-line alt" id="td-alt"></div>
        </div>
        <div class="stat-row" id="td-stats" style="margin-bottom:14px"></div>
        <div class="card">
          <div class="card-title">${icon('tasks')} Today’s plan
            <span class="spacer"></span>
            <button class="btn sm ghost" id="td-alltasks">All ${icon('chevR')}</button></div>
          <div id="td-tasks"></div>
        </div>
        <div class="card">
          <div class="card-title">${icon('calendar')} Coming up
            <span class="spacer"></span>
            <button class="btn sm ghost" id="td-cal">Calendar ${icon('chevR')}</button></div>
          <div id="td-upcoming"></div>
        </div>
        <div class="card">
          <div class="card-title">${icon('note')} Recent notes</div>
          <div id="td-recent"></div>
        </div>
        <div id="td-modules"></div>
      </div>`;

    function drawHero() {
      const now = new Date();
      const hour = now.getHours();
      const name = (DB.settings().userName || '').trim();
      const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      container.querySelector('#td-greet').textContent = name ? `${greet}, ${name}` : greet;
      container.querySelector('#td-date').textContent =
        now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const h = Hijri.fromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const j = Jalali.fromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate());
      container.querySelector('#td-alt').textContent = `${Hijri.format(h)}  ·  ${Jalali.format(j)}`;
    }

    function drawStats() {
      const today = Fmt.todayStr();
      const open = DB.all('tasks').filter(t => !t.done);
      const dueToday = open.filter(t => t.dueDate && t.dueDate <= today).length;
      const focusMs = DB.all('sessions')
        .filter(s => s.kind === 'focus' && (s.startedAt || '').slice(0, 10) === today)
        .reduce((sum, s) => sum + (s.durationMs || 0), 0);
      const rems = DB.all('reminders').filter(r => !r.done && r.at && Date.parse(r.at) <= Date.now()).length;
      container.querySelector('#td-stats').innerHTML = `
        <div class="stat"><div class="stat-num">${dueToday}</div><div class="stat-label">Due today</div></div>
        <div class="stat"><div class="stat-num">${open.length}</div><div class="stat-label">Open tasks</div></div>
        <div class="stat"><div class="stat-num">${Fmt.duration(focusMs) || '0m'}</div><div class="stat-label">Focus today</div></div>
        <div class="stat"><div class="stat-num" style="${rems ? 'color:var(--warn)' : ''}">${rems}</div><div class="stat-label">Reminders</div></div>`;
    }

    function drawTasks() {
      const today = Fmt.todayStr();
      const listEl = container.querySelector('#td-tasks');
      const tasks = DB.all('tasks')
        .filter(t => !t.done && t.dueDate && t.dueDate <= today)
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || b.priority - a.priority)
        .slice(0, 6);
      listEl.innerHTML = '';
      if (!tasks.length) {
        listEl.appendChild(el(`<div class="empty" style="padding:16px 8px"><div class="empty-sub">Nothing due today. Enjoy it — or plan something with +.</div></div>`));
        return;
      }
      for (const t of tasks) listEl.appendChild(taskRow(t, { compact: true }));
    }

    function drawUpcoming() {
      const listEl = container.querySelector('#td-upcoming');
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
          items.push({ kind: 'task', date: t.dueDate, time: t.dueTime || '', title: t.title, color: 'var(--accent)', open: () => openTaskSheet(t.id) });
      }
      items.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.appendChild(el(`<div class="empty" style="padding:16px 8px"><div class="empty-sub">The next 7 days are clear.</div></div>`));
        return;
      }
      let lastDate = '';
      for (const it of items.slice(0, 8)) {
        if (it.date !== lastDate) {
          lastDate = it.date;
          listEl.appendChild(el(`<div class="task-group-title" style="padding:6px 2px 3px">${esc(Fmt.niceDate(it.date))}</div>`));
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

    function drawRecent() {
      const listEl = container.querySelector('#td-recent');
      const notes = [...DB.all('notes')]
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3);
      listEl.innerHTML = '';
      if (!notes.length) {
        listEl.appendChild(el(`<div class="empty" style="padding:14px 8px"><div class="empty-sub">No notes yet — capture one with +.</div></div>`));
        return;
      }
      for (const n of notes) {
        const row = el(`<div class="dash-item">
          <div class="di-icon" style="background:color-mix(in srgb, ${esc(n.headerColor || '#7c5cff')} 18%, transparent);color:${esc(n.headerColor || '#7c5cff')}">${icon('note')}</div>
          <div class="di-text"><div class="di-title">${esc(n.title || 'Untitled note')}</div>
            <div class="di-sub">${esc(Fmt.relTime(n.updatedAt))}</div></div>
        </div>`);
        row.addEventListener('click', () => App.goto('note', n.id));
        listEl.appendChild(row);
      }
    }

    container.querySelector('#td-alltasks').addEventListener('click', () => App.show('tasks'));
    container.querySelector('#td-cal').addEventListener('click', () => App.show('calendar'));

    function drawAll() {
      drawHero(); drawStats(); drawTasks(); drawUpcoming(); drawRecent();
      DashModules.renderSections(container.querySelector('#td-modules'));
    }
    drawAll();
    const clock = setInterval(drawHero, 30000);
    const unsub = DB.subscribe(() => drawAll());
    return { destroy() { clearInterval(clock); unsub(); } };
  }
};
