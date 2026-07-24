'use strict';
/* Calendar tab — tri-calendar month grid + day agenda + converter. */
window.MViews = window.MViews || {};

const GREG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CAL_SYSTEMS = {
  gregorian: { label: 'Gregorian', icon: 'globe' },
  hijri: { label: 'Lunar', icon: 'moonStar' },
  jalali: { label: 'Solar', icon: 'sun' }
};

function triDate(y, m, d) {
  return { g: { y, m, d }, h: Hijri.fromGregorian(y, m, d), j: Jalali.fromGregorian(y, m, d) };
}
function triFromStr(s) { const [y, m, d] = s.split('-').map(Number); return triDate(y, m, d); }
function fmtG(g) { return `${g.d} ${GREG_MONTHS[g.m - 1]} ${g.y}`; }

function openEventSheet(eventId, presets = {}) {
  const isNew = !eventId;
  const ev = isNew ? DB.newEvent(Object.assign({ date: Fmt.todayStr() }, presets))
    : JSON.parse(JSON.stringify(DB.get('events', eventId)));
  if (!ev) return;

  const body = el(`<div>
    <div class="field"><label>Title</label>
      <input class="input" id="em-title" placeholder="Event title" value="${esc(ev.title)}"></div>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" class="input" id="em-date" value="${esc(ev.date || '')}"></div>
      <div class="field"><label>Start</label><input type="time" class="input" id="em-time" value="${esc(ev.time || '')}"></div>
    </div>
    <div class="field"><label>Other calendars</label><div class="muted" id="em-alt" style="font-size:12.5px;line-height:1.6"></div></div>
    <div class="field"><label>Color</label><div id="em-color"></div></div>
    <div class="field"><label>Notes</label>
      <textarea class="textarea" id="em-notes" placeholder="Location, agenda…">${esc(ev.notes || '')}</textarea></div>
    <div class="field"><label>Reminder</label>
      <select class="input" id="em-remind"></select></div>
  </div>`);

  const updateAlt = () => {
    const v = body.querySelector('#em-date').value;
    if (!v) { body.querySelector('#em-alt').textContent = '—'; return; }
    const t = triFromStr(v);
    body.querySelector('#em-alt').innerHTML =
      `${icon('moonStar')} ${esc(Hijri.format(t.h))}<br>${icon('sun')} ${esc(Jalali.format(t.j))}`;
  };
  body.querySelector('#em-date').addEventListener('input', updateAlt);
  updateAlt();
  attachTextTools(body.querySelector('#em-notes'));
  body.querySelector('#em-color').appendChild(swatchRow(ev.color, (c) => { ev.color = c; }));

  /* Reminder lead time — preselect whatever the linked reminder is set to. */
  const initialRemindMin = isNew ? null : eventReminderCurrentMin(ev);
  const remindSel = body.querySelector('#em-remind');
  remindSel.innerHTML = eventReminderOptionsHtml(initialRemindMin);

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  if (!isNew) {
    const delBtn = el(`<button class="btn danger icon">${icon('trash')}</button>`);
    delBtn.addEventListener('click', async () => {
      m.close();
      if (await confirmDialog(`Delete “${ev.title || 'Untitled'}”?`)) DB.remove('events', ev.id);
    });
    foot.appendChild(delBtn);
  }
  const save = el(`<button class="btn primary" style="flex:1">${isNew ? 'Add event' : 'Save'}</button>`);
  foot.appendChild(save);
  const m = openModal({ title: isNew ? 'New event' : 'Edit event', body, foot });

  save.addEventListener('click', () => {
    ev.title = body.querySelector('#em-title').value.trim() || 'Untitled event';
    ev.date = body.querySelector('#em-date').value || Fmt.todayStr();
    ev.time = body.querySelector('#em-time').value || null;
    ev.notes = body.querySelector('#em-notes').value;
    DB.upsert('events', ev);
    if (remindSel.value !== '') applyEventReminder(ev, remindSel.value);
    else if (initialRemindMin !== null) applyEventReminder(ev, ''); // user switched it off
    toast(isNew ? 'Event added' : 'Saved', { icon: 'calendar' });
    m.close();
  });
}

function openConverterSheet(onPick) {
  const t = new Date();
  let from = DB.settings().calendarPrimary || 'gregorian';
  if (!CAL_SYSTEMS[from]) from = 'gregorian';
  const state = triDate(t.getFullYear(), t.getMonth() + 1, t.getDate());

  const body = el(`<div>
    <div class="seg" id="cv-from">
      ${Object.entries(CAL_SYSTEMS).map(([k, s]) =>
        `<button data-f="${k}" class="${k === from ? 'active' : ''}">${icon(s.icon)} ${s.label}</button>`).join('')}
    </div>
    <div class="conv-fields" id="cv-fields"></div>
    <div class="conv-result" id="cv-result"></div>
  </div>`);
  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const openBtn = el(`<button class="btn" style="flex:1">${icon('calendar')} Open in calendar</button>`);
  const doneBtn = el(`<button class="btn primary" style="flex:1">Done</button>`);
  foot.append(openBtn, doneBtn);
  const m = openModal({ title: 'Calendar converter', body, foot });
  doneBtn.addEventListener('click', () => m.close());

  function sel(id, options, value) {
    return `<select class="input" id="${id}">${options.map(o =>
      `<option value="${o.v}" ${o.v === value ? 'selected' : ''}>${o.l}</option>`).join('')}</select>`;
  }
  function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }
  function recompute(y, mm, d) {
    let g;
    if (from === 'gregorian') g = { y, m: mm, d };
    else if (from === 'hijri') g = Hijri.toGregorian(y, mm, d);
    else g = Jalali.toGregorian(y, mm, d);
    Object.assign(state, triDate(g.y, g.m, g.d));
  }
  function draw() {
    const fieldsEl = body.querySelector('#cv-fields');
    let cur, dmax, months, years;
    if (from === 'gregorian') { cur = state.g; dmax = new Date(cur.y, cur.m, 0).getDate(); months = GREG_MONTHS; years = range(1940, 2075); }
    else if (from === 'hijri') { cur = state.h; dmax = Hijri.monthLength(cur.y, cur.m); months = Hijri.MONTHS_EN; years = range(1360, 1500); }
    else { cur = state.j; dmax = Jalali.monthLength(cur.y, cur.m); months = Jalali.MONTHS_EN; years = range(1320, 1450); }
    fieldsEl.innerHTML =
      sel('cv-d', range(1, dmax).map(v => ({ v, l: v })), Math.min(cur.d, dmax)) +
      sel('cv-m', months.map((l, i) => ({ v: i + 1, l })), cur.m) +
      sel('cv-y', years.map(v => ({ v, l: v })), cur.y);

    const dow = new Date(state.g.y, state.g.m - 1, state.g.d).toLocaleDateString(undefined, { weekday: 'long' });
    const lines = [];
    if (from !== 'gregorian') lines.push(`${icon('globe')} ${esc(fmtG(state.g))}`);
    if (from !== 'hijri') lines.push(`${icon('moonStar')} ${esc(Hijri.format(state.h))}`);
    if (from !== 'jalali') lines.push(`${icon('sun')} ${esc(Jalali.format(state.j))}`);
    body.querySelector('#cv-result').innerHTML = `<div class="cr-main">${dow}</div>
      <div class="cr-sub">${lines.map(l => `<span style="display:inline-flex;align-items:center;gap:6px;justify-content:center">${l}</span>`).join('')}</div>`;

    const onChange = () => {
      recompute(Number(body.querySelector('#cv-y').value),
        Number(body.querySelector('#cv-m').value),
        Number(body.querySelector('#cv-d').value));
      draw();
    };
    for (const id of ['cv-d', 'cv-m', 'cv-y']) body.querySelector('#' + id).addEventListener('change', onChange);
  }
  body.querySelector('#cv-from').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    from = b.dataset.f;
    body.querySelectorAll('#cv-from button').forEach(x => x.classList.toggle('active', x === b));
    draw();
  });
  openBtn.addEventListener('click', () => {
    const g = state.g;
    m.close();
    onPick && onPick(`${g.y}-${Fmt.pad(g.m)}-${Fmt.pad(g.d)}`);
  });
  draw();
}

MViews.calendar = {
  id: 'calendar', title: 'Calendar', icon: 'calendar',
  mount(container) {
    let primary = DB.settings().calendarPrimary || 'gregorian';
    if (!CAL_SYSTEMS[primary]) primary = 'gregorian';
    const now = new Date();
    const t0 = triDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    let gcur = { y: t0.g.y, m: t0.g.m }, hcur = { y: t0.h.y, m: t0.h.m }, jcur = { y: t0.j.y, m: t0.j.m };
    let selectedDate = Fmt.todayStr();

    container.innerHTML = `
      <div class="page">
        <div class="page-title">Calendar</div>
        <div class="seg" id="cl-primary" style="margin:4px 0 12px">
          ${Object.entries(CAL_SYSTEMS).map(([k, s]) =>
            `<button data-p="${k}" class="${primary === k ? 'active' : ''}">${icon(s.icon)} ${s.label}</button>`).join('')}
        </div>
        <div class="cal-monthbar">
          <button class="btn sm icon" id="cl-prev">${icon('chevL')}</button>
          <div style="flex:1;text-align:center">
            <div class="cal-month-title" id="cl-title"></div>
            <div class="cal-month-sub" id="cl-sub"></div>
          </div>
          <button class="btn sm icon" id="cl-next">${icon('chevR')}</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn sm" id="cl-today" style="flex:1">Today</button>
          <button class="btn sm" id="cl-convert" style="flex:1">${icon('arrowLR')} Convert</button>
        </div>
        <div class="cal-filters" id="cl-filters"></div>
        <div class="cal-grid-head" id="cl-dow"></div>
        <div class="cal-grid" id="cl-grid"></div>
        <div class="cal-agenda">
          <div class="task-group-title" id="cl-agendatitle"></div>
          <div id="cl-agenda"></div>
        </div>
      </div>`;

    const filters = () => Object.assign({ tasks: true, events: true, reminders: true, cycle: true }, DB.settings().calFilters);
    function drawFilters() {
      const wrap = container.querySelector('#cl-filters');
      const f = filters();
      const defs = [['events', 'Events', 'calendar'], ['tasks', 'Tasks', 'tasks'], ['reminders', 'Alerts', 'bell']];
      if (DashModules.isEnabled('cycle') && DashModules.getCycle()) defs.push(['cycle', 'Cycle', 'cycle']);
      wrap.innerHTML = '';
      for (const [key, label, ic] of defs) {
        const chip = el(`<button class="chip link cal-filter ${f[key] ? 'on' : ''}">${icon(ic)}<span>${label}</span></button>`);
        chip.addEventListener('click', () => {
          const nf = filters(); nf[key] = !nf[key];
          DB.setSettings({ calFilters: nf });
          Platform.haptic();
        });
        wrap.appendChild(chip);
      }
    }

    function itemsOn(dateStr) {
      const out = [];
      const f = filters();
      if (f.events) for (const ev of DB.all('events')) if (ev.date === dateStr)
        out.push({ kind: 'event', time: ev.time || '', title: ev.title, color: ev.color, item: ev });
      if (f.tasks) for (const task of DB.all('tasks')) if (task.dueDate === dateStr)
        out.push({ kind: 'task', time: task.dueTime || '', title: task.title, color: task.color || 'var(--accent)', done: task.done, item: task });
      if (f.reminders) for (const r of DB.all('reminders')) {
        if (!r.at) continue;
        const d = new Date(r.at);
        if (!isNaN(d) && Fmt.dateToStr(d) === dateStr)
          out.push({ kind: 'reminder', time: `${Fmt.pad(d.getHours())}:${Fmt.pad(d.getMinutes())}`, title: r.title, color: 'var(--warn)', done: r.done, item: r });
      }
      out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      return out;
    }

    const firstDow = () => DB.settings().firstDayOfWeek ?? 6;

    function monthAnchor() {
      if (primary === 'gregorian') return {
        base: new Date(gcur.y, gcur.m - 1, 1),
        len: new Date(gcur.y, gcur.m, 0).getDate(),
        inMonth: (t) => t.g.y === gcur.y && t.g.m === gcur.m
      };
      if (primary === 'hijri') {
        const g1 = Hijri.toGregorian(hcur.y, hcur.m, 1);
        return { base: new Date(g1.y, g1.m - 1, g1.d), len: Hijri.monthLength(hcur.y, hcur.m),
          inMonth: (t) => t.h.y === hcur.y && t.h.m === hcur.m };
      }
      const g1 = Jalali.toGregorian(jcur.y, jcur.m, 1);
      return { base: new Date(g1.y, g1.m - 1, g1.d), len: Jalali.monthLength(jcur.y, jcur.m),
        inMonth: (t) => t.j.y === jcur.y && t.j.m === jcur.m };
    }

    function drawGrid() {
      const a = monthAnchor();
      const first = triDate(a.base.getFullYear(), a.base.getMonth() + 1, a.base.getDate());
      const lastD = new Date(a.base); lastD.setDate(a.base.getDate() + a.len - 1);
      const last = triDate(lastD.getFullYear(), lastD.getMonth() + 1, lastD.getDate());
      const span = (f, l, months, era) => f.m === l.m ? `${months[f.m - 1]} ${l.y}${era}` : `${months[f.m - 1]}–${months[l.m - 1]} ${l.y}${era}`;

      if (primary === 'gregorian') {
        container.querySelector('#cl-title').textContent = `${GREG_MONTHS[gcur.m - 1]} ${gcur.y}`;
        container.querySelector('#cl-sub').textContent =
          `${span(first.h, last.h, Hijri.MONTHS_EN, ' AH')} · ${span(first.j, last.j, Jalali.MONTHS_EN, ' SH')}`;
      } else if (primary === 'hijri') {
        container.querySelector('#cl-title').textContent = `${Hijri.MONTHS_EN[hcur.m - 1]} ${hcur.y} AH`;
        container.querySelector('#cl-sub').textContent =
          `${span(first.g, last.g, GREG_MONTHS, '')} · ${span(first.j, last.j, Jalali.MONTHS_EN, ' SH')}`;
      } else {
        container.querySelector('#cl-title').textContent = `${Jalali.MONTHS_EN[jcur.m - 1]} ${jcur.y} SH`;
        container.querySelector('#cl-sub').textContent =
          `${span(first.g, last.g, GREG_MONTHS, '')} · ${span(first.h, last.h, Hijri.MONTHS_EN, ' AH')}`;
      }

      const start = firstDow();
      const head = container.querySelector('#cl-dow');
      head.innerHTML = '';
      for (let i = 0; i < 7; i++) head.appendChild(el(`<div class="cal-dow">${DOW_NAMES[(start + i) % 7]}</div>`));

      drawFilters();
      const cycleOn = filters().cycle && DashModules.isEnabled('cycle') && DashModules.getCycle();
      const grid = container.querySelector('#cl-grid');
      grid.innerHTML = '';
      const today = Fmt.todayStr();
      const lead = (a.base.getDay() - start + 7) % 7;
      const total = Math.ceil((lead + a.len) / 7) * 7;
      for (let i = 0; i < total; i++) {
        const d = new Date(a.base);
        d.setDate(a.base.getDate() - lead + i);
        const ds = Fmt.dateToStr(d);
        const t = triDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const primDay = primary === 'gregorian' ? t.g.d : primary === 'hijri' ? t.h.d : t.j.d;
        const alts = primary === 'gregorian' ? ['h', 'j'] : primary === 'hijri' ? ['g', 'j'] : ['g', 'h'];
        const altHtml = alts.map(k => {
          const dd = t[k];
          if (dd.d !== 1) return String(dd.d);
          const name = k === 'g' ? GREG_MONTHS[dd.m - 1].slice(0, 3)
            : k === 'h' ? Hijri.MONTHS_EN[dd.m - 1].split(' ')[0].slice(0, 3)
            : Jalali.MONTHS_EN[dd.m - 1].slice(0, 3);
          return `<span class="cc-altmonth">${esc(name)}</span>`;
        }).join('·');
        const items = itemsOn(ds);
        const cell = el(`<div class="cal-cell ${a.inMonth(t) ? '' : 'other'} ${ds === today ? 'today' : ''} ${ds === selectedDate ? 'selected' : ''}" data-date="${ds}">
          <span class="cc-day">${primDay}</span>
          <span class="cc-alt">${altHtml}</span>
          <div class="cc-dots">${items.slice(0, 3).map(it => `<span class="cc-dot" style="--ev-color:${it.color}"></span>`).join('')}</div>
        </div>`);
        if (cycleOn) {
          const phase = DashModules.cyclePhaseFor(ds);
          if (phase) cell.appendChild(el(`<span class="cc-cycle" style="background:${DashModules.CYCLE_COLORS[phase]}"></span>`));
        }
        cell.addEventListener('click', () => { selectedDate = ds; drawGrid(); drawAgenda(); });
        grid.appendChild(cell);
      }
    }

    function drawAgenda() {
      const t = triFromStr(selectedDate);
      container.querySelector('#cl-agendatitle').innerHTML =
        `${esc(Fmt.fullDate(selectedDate))}<span class="count" style="text-transform:none">${esc(Hijri.format(t.h, { short: true }))} · ${esc(Jalali.format(t.j, { short: true }))}</span>`;
      const list = container.querySelector('#cl-agenda');
      list.innerHTML = '';
      const items = itemsOn(selectedDate);
      if (!items.length) {
        list.appendChild(el(`<div class="empty" style="padding:14px"><div class="empty-sub">Nothing on this day. Tap + to add an event.</div></div>`));
      }
      for (const it of items) {
        const sub = it.kind === 'event' ? (it.time ? Fmt.time12(it.time) : 'All day')
          : it.kind === 'task' ? 'Task due' : `Reminder · ${Fmt.time12(it.time)}`;
        const row = el(`<div class="cal-side-item ${it.done ? 'done' : ''}">
          <div class="csi-bar" style="--ev-color:${it.color}"></div>
          <div style="flex:1;min-width:0">
            <div class="csi-title">${esc(it.title || 'Untitled')}</div>
            <div class="csi-sub">${esc(sub)}</div>
          </div></div>`);
        row.addEventListener('click', () => {
          if (it.kind === 'event') openEventSheet(it.item.id);
          else if (it.kind === 'task') openTaskSheet(it.item.id);
          else App.goto('reminder', it.item.id);
        });
        list.appendChild(row);
      }
    }

    function shiftMonth(cur, delta) {
      cur.m += delta;
      if (cur.m > 12) { cur.m = 1; cur.y++; }
      if (cur.m < 1) { cur.m = 12; cur.y--; }
    }
    function alignCursors(dateStr) {
      const t = triFromStr(dateStr);
      gcur = { y: t.g.y, m: t.g.m }; hcur = { y: t.h.y, m: t.h.m }; jcur = { y: t.j.y, m: t.j.m };
    }

    container.querySelector('#cl-prev').addEventListener('click', () => {
      shiftMonth(primary === 'gregorian' ? gcur : primary === 'hijri' ? hcur : jcur, -1);
      drawGrid();
    });
    container.querySelector('#cl-next').addEventListener('click', () => {
      shiftMonth(primary === 'gregorian' ? gcur : primary === 'hijri' ? hcur : jcur, 1);
      drawGrid();
    });
    container.querySelector('#cl-today').addEventListener('click', () => {
      selectedDate = Fmt.todayStr();
      alignCursors(selectedDate);
      drawGrid(); drawAgenda();
    });
    container.querySelector('#cl-primary').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      primary = b.dataset.p;
      DB.setSettings({ calendarPrimary: primary });
      container.querySelectorAll('#cl-primary button').forEach(x => x.classList.toggle('active', x === b));
      alignCursors(selectedDate);
      drawGrid();
    });
    container.querySelector('#cl-convert').addEventListener('click', () => {
      openConverterSheet((dateStr) => {
        selectedDate = dateStr;
        alignCursors(dateStr);
        drawGrid(); drawAgenda();
      });
    });

    drawGrid(); drawAgenda();
    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') { drawGrid(); return; }
      if (['events', 'tasks', 'reminders'].includes(ch.collection) || ch.kind === 'reload') { drawGrid(); drawAgenda(); }
    });

    return {
      destroy: unsub,
      addHere() { openEventSheet(null, { date: selectedDate }); },
      goto(id) {
        const ev = DB.get('events', id);
        if (!ev) return;
        if (ev.date) { selectedDate = ev.date; alignCursors(ev.date); drawGrid(); drawAgenda(); }
        openEventSheet(id);
      }
    };
  }
};
