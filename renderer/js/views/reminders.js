'use strict';
/* Reminders — add, upcoming list, fired/overdue actions, snooze, repeat. */

window.Views = window.Views || {};

const REPEAT_LABEL = { none: '', daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly', yearly: 'Repeats yearly' };

function snoozeReminder(rem, minutes) {
  const at = new Date(Date.now() + minutes * 60000);
  rem.at = at.toISOString();
  rem.notified = false;
  rem.done = false;
  DB.upsert('reminders', rem);
  toast(`Snoozed until ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, { icon: 'snooze' });
}

Views.reminders = {
  id: 'reminders', title: 'Reminders', icon: 'bell',

  mount(container) {
    let highlightId = null;

    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title">Reminders</div><div class="view-sub" id="rm-sub"></div></div>
          <div class="spacer"></div>
        </div>
        <div class="rem-add glass">
          <input class="input rem-title-input" id="rm-title" placeholder="Remind me to…">
          <input type="date" class="input" id="rm-date" value="${Fmt.todayStr()}">
          <input type="time" class="input" id="rm-time">
          <select class="input" id="rm-repeat" style="width:auto">
            <option value="none">Once</option><option value="daily">Daily</option>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <button class="btn primary" id="rm-add">${icon('bell')} Add</button>
        </div>
        <div class="view-body"><div class="rem-scroll" id="rm-list"></div></div>
      </div>`;

    function addReminder() {
      const title = container.querySelector('#rm-title').value.trim();
      if (!title) { toast('Give the reminder a title', { icon: 'bell' }); return; }
      const date = container.querySelector('#rm-date').value || Fmt.todayStr();
      let time = container.querySelector('#rm-time').value;
      if (!time) {
        const soon = new Date(Date.now() + 3600000);
        time = `${Fmt.pad(soon.getHours())}:${Fmt.pad(soon.getMinutes())}`;
      }
      const at = new Date(`${date}T${time}`);
      const rem = DB.newReminder({
        title, at: at.toISOString(),
        repeat: container.querySelector('#rm-repeat').value
      });
      DB.upsert('reminders', rem);
      container.querySelector('#rm-title').value = '';
      container.querySelector('#rm-time').value = '';
      toast(`Reminder set — ${Fmt.untilText(rem.at)}`, { icon: 'bell' });
      container.querySelector('#rm-title').focus();
    }
    container.querySelector('#rm-add').addEventListener('click', addReminder);
    container.querySelector('#rm-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') addReminder(); });

    function remRow(r) {
      const fired = r.notified && !r.done;
      const overdue = !r.done && !r.notified && r.at && Date.parse(r.at) < Date.now();
      const row = el(`<div class="rem-row ${fired || overdue ? 'fired' : ''} ${r.done ? 'done' : ''}" data-id="${r.id}">
        <div class="rem-bell">${icon(r.done ? 'checkCircle' : 'bell')}</div>
        <div class="rem-main">
          <div class="rem-title">${esc(r.title || 'Untitled reminder')}</div>
          <div class="rem-sub">
            <span>${esc(Fmt.dateTime(r.at))}</span>
            ${!r.done ? `<span class="${Date.parse(r.at) < Date.now() ? 'overdue' : ''}">${esc(Fmt.untilText(r.at))}</span>` : ''}
            ${r.repeat && r.repeat !== 'none' ? `<span class="chip">${icon('repeat')}<span>${esc(REPEAT_LABEL[r.repeat] || r.repeat)}</span></span>` : ''}
            <span class="rem-links" style="display:inline-flex;gap:5px"></span>
          </div>
        </div>
        <div class="rem-actions"></div>
      </div>`);
      renderLinkChips(row.querySelector('.rem-links'), { type: 'reminder', id: r.id }, { removable: false, compact: true });

      const actions = row.querySelector('.rem-actions');
      if (!r.done) {
        if (fired || overdue) {
          const snooze = el(`<button class="btn sm" title="Snooze">${icon('snooze')} Snooze</button>`);
          snooze.addEventListener('click', (e) => menu(e.currentTarget, [
            { icon: 'clock', label: '10 minutes', onClick: () => snoozeReminder(r, 10) },
            { icon: 'clock', label: '1 hour', onClick: () => snoozeReminder(r, 60) },
            { icon: 'calendar', label: 'Tomorrow 9 AM', onClick: () => {
                const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
                r.at = d.toISOString(); r.notified = false; DB.upsert('reminders', r);
                toast('Snoozed until tomorrow 9 AM', { icon: 'snooze' });
              } }
          ]));
          actions.appendChild(snooze);
        }
        const doneBtn = el(`<button class="btn sm primary">${icon('check')} Done</button>`);
        doneBtn.addEventListener('click', () => {
          r.done = true; r.notified = true;
          DB.upsert('reminders', r);
          toast('Reminder completed', { icon: 'checkCircle' });
        });
        actions.appendChild(doneBtn);
        const editBtn = el(`<button class="iconbtn" title="Edit time">${icon('edit')}</button>`);
        editBtn.addEventListener('click', (e) => {
          const d = r.at ? new Date(r.at) : new Date();
          const wrap = el(`<div style="padding:10px;display:flex;flex-direction:column;gap:8px">
            <input type="date" class="input sm" id="re-date" value="${Fmt.dateToStr(d)}">
            <input type="time" class="input sm" id="re-time" value="${Fmt.pad(d.getHours())}:${Fmt.pad(d.getMinutes())}">
            <button class="btn sm primary" id="re-save">Update</button></div>`);
          const pop = openPopover(e.currentTarget, wrap);
          wrap.querySelector('#re-save').addEventListener('click', () => {
            const nd = wrap.querySelector('#re-date').value, nt = wrap.querySelector('#re-time').value;
            if (nd && nt) {
              r.at = new Date(`${nd}T${nt}`).toISOString();
              r.notified = false; r.done = false;
              DB.upsert('reminders', r);
            }
            pop.close();
          });
        });
        actions.appendChild(editBtn);
      } else {
        const undoBtn = el(`<button class="btn sm ghost">Restore</button>`);
        undoBtn.addEventListener('click', () => {
          r.done = false; r.notified = Date.parse(r.at) < Date.now();
          DB.upsert('reminders', r);
        });
        actions.appendChild(undoBtn);
      }
      const linkBtn = el(`<button class="iconbtn" title="Link">${icon('link')}</button>`);
      linkBtn.addEventListener('click', () => openLinkPicker({ type: 'reminder', id: r.id }));
      const delBtn = el(`<button class="iconbtn danger" title="Delete">${icon('trash')}</button>`);
      delBtn.addEventListener('click', async () => {
        if (await confirmDialog(`Delete reminder “${r.title || 'Untitled'}”?`)) DB.remove('reminders', r.id);
      });
      actions.append(linkBtn, delBtn);

      if (r.id === highlightId) {
        row.style.outline = '2px solid color-mix(in srgb, var(--accent) 60%, transparent)';
        setTimeout(() => { row.style.outline = 'none'; highlightId = null; }, 2400);
      }
      return row;
    }

    function draw() {
      const list = container.querySelector('#rm-list');
      const all = [...DB.all('reminders')];
      const now = Date.now();
      const needsAttention = all.filter(r => !r.done && (r.notified || (r.at && Date.parse(r.at) <= now)))
        .sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      const upcoming = all.filter(r => !r.done && !r.notified && r.at && Date.parse(r.at) > now)
        .sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      const done = all.filter(r => r.done)
        .sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 10);

      container.querySelector('#rm-sub').textContent =
        `${upcoming.length} upcoming${needsAttention.length ? ` · ${needsAttention.length} need attention` : ''}`;

      list.innerHTML = '';
      const section = (label, items, cls = '') => {
        if (!items.length) return;
        list.appendChild(el(`<div class="task-group-title ${cls}">${label}<span class="count">${items.length}</span></div>`));
        for (const r of items) list.appendChild(remRow(r));
      };
      section('Needs attention', needsAttention, 'overdue');
      section('Upcoming', upcoming);
      section('Completed', done);
      if (!all.length) {
        list.appendChild(el(`<div class="empty">${icon('bell')}
          <div class="empty-title">No reminders</div>
          <div class="empty-sub">Add one above — Anoosh fires a Windows notification even when you’re in another app.</div></div>`));
      }
    }

    draw();
    const timer = setInterval(draw, 30000); // refresh countdown labels
    const unsub = DB.subscribe((ch) => {
      if (ch.collection === 'reminders' || ch.kind === 'reload' ||
          ['tasks', 'notes', 'ideas', 'events'].includes(ch.collection)) draw();
    });

    return {
      destroy() { clearInterval(timer); unsub(); },
      goto(id) { highlightId = id; draw(); }
    };
  }
};
