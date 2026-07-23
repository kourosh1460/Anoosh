'use strict';
/* Tasks tab + shared task sheet. */
window.MViews = window.MViews || {};

const PRIO_LABEL = ['None', 'Low', 'Medium', 'High'];

function taskDueChip(t) {
  if (!t.dueDate) return '';
  const today = Fmt.todayStr();
  const cls = t.done ? '' : t.dueDate < today ? 'overdue' : t.dueDate === today ? 'today' : '';
  const time = t.dueTime ? ' · ' + Fmt.time12(t.dueTime) : '';
  return `<span class="due-chip ${cls}">${icon('calendar')}${esc(Fmt.niceDate(t.dueDate))}${time}</span>`;
}

function toggleTaskDone(t) {
  t.done = !t.done;
  t.doneAt = t.done ? DB.now() : null;
  DB.upsert('tasks', t);
  Platform.haptic();
  if (t.done) toast('Completed', {
    icon: 'checkCircle', action: 'Undo',
    onAction: () => { t.done = false; t.doneAt = null; DB.upsert('tasks', t); }
  });
}

/** Task editor bottom sheet — used across the whole app. */
function openTaskSheet(taskId, presets = {}) {
  const isNew = !taskId;
  const task = isNew ? DB.newTask(presets) : JSON.parse(JSON.stringify(DB.get('tasks', taskId)));
  if (!task) return;

  const body = el(`<div>
    <div class="field"><label>Task</label>
      <input class="input" id="tm-title" placeholder="What needs to be done?" value="${esc(task.title)}"></div>
    <div class="field"><label>Notes</label>
      <textarea class="textarea" id="tm-notes" placeholder="Details…">${esc(task.notes || '')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Due date</label><input type="date" class="input" id="tm-date" value="${esc(task.dueDate || '')}"></div>
      <div class="field"><label>Time</label><input type="time" class="input" id="tm-time" value="${esc(task.dueTime || '')}"></div>
    </div>
    <div class="field"><label>Priority</label>
      <div class="seg" id="tm-prio">${PRIO_LABEL.map((p, i) =>
        `<button data-p="${i}" class="${task.priority === i ? 'active' : ''}">${p}</button>`).join('')}</div></div>
    <div class="field"><label>Color</label>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span id="tm-color"></span>
        <button class="btn sm ghost" id="tm-color-clear">Default</button>
      </div></div>
    <div class="field"><label>Reminder</label>
      <button class="btn sm" id="tm-remind" style="align-self:flex-start">${icon('bell')} Remind me at due time</button></div>
    <div class="field"><label>Linked items</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span id="tm-links" style="display:flex;gap:6px;flex-wrap:wrap"></span>
        <button class="btn sm ghost" id="tm-addlink">${icon('link')} Link…</button>
      </div></div>
  </div>`);

  body.querySelector('#tm-prio').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    task.priority = Number(b.dataset.p);
    body.querySelectorAll('#tm-prio button').forEach(x => x.classList.toggle('active', x === b));
  });

  attachTextTools(body.querySelector('#tm-notes'));
  body.querySelector('#tm-color').appendChild(swatchRow(task.color || null, (c) => { task.color = c; }));
  body.querySelector('#tm-color-clear').addEventListener('click', () => {
    task.color = null;
    body.querySelectorAll('#tm-color .swatch').forEach(sw => sw.classList.remove('active'));
  });

  let wantReminder = false;
  body.querySelector('#tm-remind').addEventListener('click', (e) => {
    wantReminder = !wantReminder;
    e.currentTarget.classList.toggle('primary', wantReminder);
  });

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const left = el(`<div class="left"></div>`);
  if (!isNew) {
    const focusBtn = el(`<button class="btn sm">${icon('zap')} Focus</button>`);
    focusBtn.addEventListener('click', () => { TimerEngine.startFocusOn(task.id); m.close(); App.push('timer'); });
    const delBtn = el(`<button class="btn sm danger icon">${icon('trash')}</button>`);
    delBtn.addEventListener('click', async () => {
      m.close();
      if (await confirmDialog(`Delete “${task.title || 'Untitled'}”?`)) {
        DB.remove('tasks', task.id);
        toast('Task deleted', { icon: 'trash' });
      }
    });
    left.append(focusBtn, delBtn);
  }
  const save = el(`<button class="btn primary" style="flex:1">${isNew ? 'Add task' : 'Save'}</button>`);
  foot.append(left, save);

  const m = openModal({ title: isNew ? 'New task' : 'Edit task', body, foot });

  const linksEl = body.querySelector('#tm-links');
  const drawLinks = () => { if (!isNew) renderLinkChips(linksEl, { type: 'task', id: task.id }); };
  drawLinks();
  const unsub = DB.subscribe(drawLinks);
  const origClose = m.close;
  m.close = () => { unsub(); origClose(); };
  body.querySelector('#tm-addlink').addEventListener('click', () => {
    if (isNew) { toast('Save the task first, then link items.', { icon: 'link' }); return; }
    openLinkPicker({ type: 'task', id: task.id });
  });

  save.addEventListener('click', () => {
    task.title = body.querySelector('#tm-title').value.trim() || 'Untitled task';
    task.notes = body.querySelector('#tm-notes').value;
    task.dueDate = body.querySelector('#tm-date').value || null;
    task.dueTime = body.querySelector('#tm-time').value || null;
    DB.upsert('tasks', task);
    if (wantReminder && task.dueDate) {
      const at = new Date(`${task.dueDate}T${task.dueTime || '09:00'}`);
      const rem = DB.newReminder({ title: task.title, body: 'Task due', at: at.toISOString() });
      DB.upsert('reminders', rem);
      DB.link({ type: 'task', id: task.id }, { type: 'reminder', id: rem.id });
    }
    toast(isNew ? 'Task added' : 'Saved', { icon: 'checkCircle' });
    m.close();
  });
}

function taskRow(t, { compact = false } = {}) {
  const row = el(`<div class="task-row ${t.done ? 'done' : ''}" data-id="${t.id}" ${t.color ? `style="--task-color:${esc(t.color)}"` : ''}>
    <button class="tcheck ${t.done ? 'on' : ''} ${t.priority ? 'prio-' + t.priority : ''} ${t.color ? 'colored' : ''}">${icon('check')}</button>
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        ${taskDueChip(t)}
        ${t.priority ? `<span class="prio-flag p${t.priority}">${icon('flag')}${PRIO_LABEL[t.priority]}</span>` : ''}
        ${t.timeSpentMs ? `<span class="due-chip">${icon('clock')}${Fmt.duration(t.timeSpentMs)}</span>` : ''}
        ${(t.links || []).length && !compact ? `<span class="due-chip">${icon('link')}${t.links.length}</span>` : ''}
      </div>
    </div>
    <button class="iconbtn" data-act="focus">${icon('play')}</button>
  </div>`);
  row.querySelector('.tcheck').addEventListener('click', (e) => { e.stopPropagation(); toggleTaskDone(t); });
  row.querySelector('[data-act=focus]').addEventListener('click', (e) => {
    e.stopPropagation();
    TimerEngine.startFocusOn(t.id);
    toast(`Focusing on “${t.title.slice(0, 26)}”`, { icon: 'zap', action: 'Timer', onAction: () => App.push('timer') });
  });
  row.addEventListener('click', () => openTaskSheet(t.id));
  return row;
}

MViews.tasks = {
  id: 'tasks', title: 'Tasks', icon: 'tasks',
  mount(container) {
    let filter = 'active';
    container.innerHTML = `
      <div class="page">
        <div class="page-title">Tasks</div>
        <div class="page-sub" id="tk-sub"></div>
        <div class="seg" id="tk-filter" style="margin-bottom:12px">
          <button data-f="active" class="active">Active</button>
          <button data-f="today">Today</button>
          <button data-f="all">All</button>
          <button data-f="done">Done</button>
        </div>
        <div id="tk-list"></div>
      </div>`;

    container.querySelector('#tk-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      filter = b.dataset.f;
      container.querySelectorAll('#tk-filter button').forEach(x => x.classList.toggle('active', x === b));
      draw();
    });

    const GROUPS = [
      ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'],
      ['later', 'Later'], ['nodate', 'No date'], ['done', 'Completed']
    ];
    function groupOf(t, today) {
      if (t.done) return 'done';
      if (!t.dueDate) return 'nodate';
      if (t.dueDate < today) return 'overdue';
      if (t.dueDate === today) return 'today';
      if (t.dueDate <= Fmt.addDays(today, 7)) return 'week';
      return 'later';
    }

    function draw() {
      const today = Fmt.todayStr();
      const listEl = container.querySelector('#tk-list');
      let tasks = [...DB.all('tasks')];
      const active = tasks.filter(t => !t.done);
      container.querySelector('#tk-sub').textContent =
        `${active.length} open · ${active.filter(t => t.dueDate === today).length} due today`;

      if (filter === 'active') tasks = tasks.filter(t => !t.done);
      else if (filter === 'today') tasks = tasks.filter(t => !t.done && t.dueDate && t.dueDate <= today);
      else if (filter === 'done') tasks = tasks.filter(t => t.done);

      tasks.sort((a, b) =>
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        (b.priority - a.priority) ||
        (a.createdAt || '').localeCompare(b.createdAt || ''));

      const byGroup = new Map(GROUPS.map(([k]) => [k, []]));
      for (const t of tasks) byGroup.get(groupOf(t, today)).push(t);
      if (filter === 'done') byGroup.get('done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));

      listEl.innerHTML = '';
      let any = false;
      for (const [key, label] of GROUPS) {
        const items = byGroup.get(key);
        if (!items.length) continue;
        if (key === 'done' && filter !== 'done' && filter !== 'all') continue;
        any = true;
        listEl.appendChild(el(`<div class="task-group-title ${key === 'overdue' ? 'overdue' : ''}">${label}<span class="count">${items.length}</span></div>`));
        for (const t of (key === 'done' && filter === 'all' ? items.slice(0, 10) : items)) listEl.appendChild(taskRow(t));
      }
      if (!any) {
        listEl.appendChild(el(`<div class="empty">${icon('checkCircle')}
          <div class="empty-title">${filter === 'done' ? 'Nothing completed yet' : 'All clear'}</div>
          <div class="empty-sub">Tap the + button to add a task.</div></div>`));
      }
    }

    draw();
    const unsub = DB.subscribe((ch) => { if (ch.kind !== 'settings') draw(); });
    return {
      destroy: unsub,
      goto(id) { if (DB.get('tasks', id)) openTaskSheet(id); }
    };
  }
};
