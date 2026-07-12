'use strict';
/* Tasks view + shared task detail modal (used across the app). */

window.Views = window.Views || {};

const PRIO_LABEL = ['None', 'Low', 'Medium', 'High'];

function taskDueChip(task) {
  if (!task.dueDate) return '';
  const today = Fmt.todayStr();
  const cls = task.done ? '' : task.dueDate < today ? 'overdue' : task.dueDate === today ? 'today' : '';
  const time = task.dueTime ? ' · ' + Fmt.time12(task.dueTime) : '';
  return `<span class="due-chip ${cls}">${icon('calendar')}${esc(Fmt.niceDate(task.dueDate))}${time}</span>`;
}

function toggleTaskDone(task) {
  task.done = !task.done;
  task.doneAt = task.done ? DB.now() : null;
  DB.upsert('tasks', task);
  if (task.done) toast('Task completed', {
    icon: 'checkCircle', action: 'Undo',
    onAction: () => { task.done = false; task.doneAt = null; DB.upsert('tasks', task); }
  });
}

/** Full task editor modal — reachable from every module. */
function openTaskModal(taskId, presets = {}) {
  const isNew = !taskId;
  const task = isNew ? DB.newTask(presets) : JSON.parse(JSON.stringify(DB.get('tasks', taskId)));
  if (!task) return;

  const body = el(`<div></div>`);
  body.innerHTML = `
    <div class="field"><label>Title</label>
      <input class="input" id="tm-title" placeholder="What needs to be done?" value="${esc(task.title)}"></div>
    <div class="field"><label>Notes</label>
      <textarea class="textarea" id="tm-notes" placeholder="Details…">${esc(task.notes || '')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Due date</label><input type="date" class="input" id="tm-date" value="${esc(task.dueDate || '')}"></div>
      <div class="field"><label>Time</label><input type="time" class="input" id="tm-time" value="${esc(task.dueTime || '')}"></div>
      <div class="field"><label>Priority</label>
        <div class="seg" id="tm-prio">${PRIO_LABEL.map((p, i) =>
          `<button data-p="${i}" class="${task.priority === i ? 'active' : ''}">${p}</button>`).join('')}</div>
      </div>
    </div>
    <div class="field" id="tm-remind-row"><label>Reminder</label>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn sm" id="tm-remind">${icon('bell')} Remind me at due time</button>
        <span class="muted" style="font-size:12px" id="tm-remind-state"></span>
      </div>
    </div>
    <div class="field"><label>Linked items</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span id="tm-links" style="display:flex;gap:6px;flex-wrap:wrap"></span>
        <button class="btn sm ghost" id="tm-addlink">${icon('link')} Link…</button>
      </div>
    </div>`;

  body.querySelector('#tm-prio').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    task.priority = Number(b.dataset.p);
    body.querySelectorAll('#tm-prio button').forEach(x => x.classList.toggle('active', x === b));
  });

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const left = el(`<div class="left"></div>`);
  if (!isNew) {
    const focusBtn = el(`<button class="btn sm">${icon('zap')} Focus on this</button>`);
    focusBtn.addEventListener('click', () => { TimerEngine.startFocusOn(task.id); m.close(); App.show('timer'); });
    const delBtn = el(`<button class="btn sm danger">${icon('trash')} Delete</button>`);
    delBtn.addEventListener('click', async () => {
      m.close();
      if (await confirmDialog(`Delete task “${task.title || 'Untitled'}”? Linked items stay, only the connection is removed.`)) {
        DB.remove('tasks', task.id);
        toast('Task deleted', { icon: 'trash' });
      }
    });
    left.append(focusBtn, delBtn);
  }
  const cancel = el(`<button class="btn ghost">Cancel</button>`);
  const save = el(`<button class="btn primary">${isNew ? 'Add task' : 'Save'}</button>`);
  foot.append(left, el(`<div style="flex:1"></div>`), cancel, save);

  const m = openModal({ title: isNew ? 'New task' : 'Edit task', body, foot, wide: true });
  cancel.addEventListener('click', () => m.close());

  let wantReminder = false;
  const remindBtn = body.querySelector('#tm-remind');
  const remindState = body.querySelector('#tm-remind-state');
  const existingReminder = (task.links || []).map(l => DB.getByRef(l)).find(x => x && !x.done && (DB.get('reminders', x.id)));
  if (existingReminder) {
    remindBtn.classList.add('hidden');
    remindState.textContent = `Linked reminder: ${Fmt.dateTime(existingReminder.at)}`;
  }
  remindBtn.addEventListener('click', () => {
    wantReminder = !wantReminder;
    remindBtn.classList.toggle('primary', wantReminder);
    remindState.textContent = wantReminder ? 'Will be created on save' : '';
  });

  const linksEl = body.querySelector('#tm-links');
  const drawLinks = () => { if (!isNew) renderLinkChips(linksEl, { type: 'task', id: task.id }); };
  drawLinks();
  const unsub = DB.subscribe(() => drawLinks());
  const origClose = m.close;
  m.close = () => { unsub(); origClose(); };
  body.querySelector('#tm-addlink').addEventListener('click', () => {
    if (isNew) { toast('Save the task first, then link items to it.', { icon: 'link' }); return; }
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
      toast('Task saved with reminder', { icon: 'bell' });
    } else {
      toast(isNew ? 'Task added' : 'Task saved');
    }
    m.close();
  });

  setTimeout(() => body.querySelector('#tm-title').focus());
}

Views.tasks = {
  id: 'tasks', title: 'Tasks', icon: 'tasks',

  mount(container) {
    let filter = 'active';
    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title">Tasks</div><div class="view-sub" id="tk-sub"></div></div>
          <div class="spacer"></div>
          <div class="seg" id="tk-filter">
            <button data-f="active" class="active">Active</button>
            <button data-f="today">Today</button>
            <button data-f="all">All</button>
            <button data-f="done">Done</button>
          </div>
        </div>
        <div class="task-add-row">
          <input class="input" id="tk-quick" placeholder="Add a task…  (Enter to add, e.g. “Call the bank”)">
          <button class="btn primary" id="tk-add">${icon('plus')} Add</button>
          <button class="btn" id="tk-detailed" title="New task with details">${icon('edit')}</button>
        </div>
        <div class="view-body"><div class="task-scroll" id="tk-list"></div></div>
      </div>`;

    const listEl = container.querySelector('#tk-list');
    const quick = container.querySelector('#tk-quick');

    function quickAdd() {
      const title = quick.value.trim();
      if (!title) return;
      DB.upsert('tasks', DB.newTask({ title }));
      quick.value = '';
      quick.focus();
    }
    quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAdd(); });
    container.querySelector('#tk-add').addEventListener('click', quickAdd);
    container.querySelector('#tk-detailed').addEventListener('click', () => openTaskModal(null));

    container.querySelector('#tk-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      filter = b.dataset.f;
      container.querySelectorAll('#tk-filter button').forEach(x => x.classList.toggle('active', x === b));
      draw();
    });

    function groupOf(t, today) {
      if (t.done) return 'done';
      if (!t.dueDate) return 'nodate';
      if (t.dueDate < today) return 'overdue';
      if (t.dueDate === today) return 'today';
      if (t.dueDate <= Fmt.addDays(today, 7)) return 'week';
      return 'later';
    }

    const GROUPS = [
      ['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'],
      ['later', 'Later'], ['nodate', 'No date'], ['done', 'Completed']
    ];

    function taskRow(t) {
      const row = el(`<div class="task-row ${t.done ? 'done' : ''}" data-id="${t.id}">
        <button class="tcheck ${t.done ? 'on' : ''} ${t.priority ? 'prio-' + t.priority : ''}" title="${t.done ? 'Mark not done' : 'Mark done'}">${icon('check')}</button>
        <div class="task-main">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            ${taskDueChip(t)}
            ${t.priority ? `<span class="prio-flag p${t.priority}">${icon('flag')}${PRIO_LABEL[t.priority]}</span>` : ''}
            ${t.timeSpentMs ? `<span class="due-chip">${icon('clock')}${Fmt.duration(t.timeSpentMs)}</span>` : ''}
            <span class="task-links" style="display:inline-flex;gap:5px"></span>
          </div>
        </div>
        <div class="task-actions">
          <button class="iconbtn" data-act="focus" title="Start focus timer">${icon('play')}</button>
          <button class="iconbtn" data-act="edit" title="Edit">${icon('edit')}</button>
          <button class="iconbtn danger" data-act="del" title="Delete">${icon('trash')}</button>
        </div>
      </div>`);
      renderLinkChips(row.querySelector('.task-links'), { type: 'task', id: t.id }, { removable: false, compact: true });
      row.querySelector('.tcheck').addEventListener('click', () => toggleTaskDone(t));
      row.querySelector('.task-main').addEventListener('click', () => openTaskModal(t.id));
      row.querySelector('[data-act=focus]').addEventListener('click', () => {
        TimerEngine.startFocusOn(t.id);
        toast(`Focusing on “${t.title.slice(0, 32)}”`, { icon: 'zap', action: 'Open timer', onAction: () => App.show('timer') });
      });
      row.querySelector('[data-act=edit]').addEventListener('click', () => openTaskModal(t.id));
      row.querySelector('[data-act=del]').addEventListener('click', async () => {
        if (await confirmDialog(`Delete task “${t.title || 'Untitled'}”?`)) {
          row.classList.add('removing');
          setTimeout(() => DB.remove('tasks', t.id), 140);
        }
      });
      return row;
    }

    function draw() {
      const today = Fmt.todayStr();
      let tasks = [...DB.all('tasks')];
      const active = tasks.filter(t => !t.done);
      container.querySelector('#tk-sub').textContent =
        `${active.length} open · ${active.filter(t => t.dueDate === today).length} due today`;

      if (filter === 'active') tasks = tasks.filter(t => !t.done);
      else if (filter === 'today') tasks = tasks.filter(t => !t.done && t.dueDate && t.dueDate <= today);
      else if (filter === 'done') tasks = tasks.filter(t => t.done);

      const prioSort = (a, b) =>
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
        (b.priority - a.priority) ||
        (a.createdAt || '').localeCompare(b.createdAt || '');
      tasks.sort(prioSort);

      const byGroup = new Map(GROUPS.map(([k]) => [k, []]));
      for (const t of tasks) byGroup.get(groupOf(t, today)).push(t);
      if (filter === 'done') { byGroup.get('done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')); }

      listEl.innerHTML = '';
      let any = false;
      for (const [key, label] of GROUPS) {
        const items = byGroup.get(key);
        if (!items.length) continue;
        if (key === 'done' && filter !== 'done' && filter !== 'all') continue;
        any = true;
        listEl.appendChild(el(`<div class="task-group-title ${key === 'overdue' ? 'overdue' : ''}">${label}<span class="count">${items.length}</span></div>`));
        const slice = (key === 'done' && filter === 'all') ? items.slice(0, 12) : items;
        for (const t of slice) listEl.appendChild(taskRow(t));
      }
      if (!any) {
        listEl.appendChild(el(`<div class="empty">${icon('checkCircle')}
          <div class="empty-title">${filter === 'done' ? 'Nothing completed yet' : 'All clear'}</div>
          <div class="empty-sub">${filter === 'done' ? 'Completed tasks will appear here.' : 'Add a task above — press Enter to capture it fast.'}</div></div>`));
      }
    }

    draw();
    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') return;
      if (['tasks', 'reminders', 'notes', 'ideas', 'events'].includes(ch.collection) || ch.kind === 'reload') draw();
    });

    return {
      destroy: unsub,
      goto(id) { if (DB.get('tasks', id)) openTaskModal(id); }
    };
  }
};
