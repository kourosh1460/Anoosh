'use strict';
/* Calendar — Gregorian / Hijri (lunar) / Jalali (solar) month grid,
   day panel, events, and a three-way converter. */

window.Views = window.Views || {};

const GREG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CAL_SYSTEMS = {
  gregorian: { label: 'Gregorian', icon: 'globe' },
  hijri: { label: 'Lunar · Hijri', icon: 'moonStar' },
  jalali: { label: 'Solar · Jalali', icon: 'sun' }
};

/** All three representations of a local date. */
function triDate(y, m, d) {
  return {
    g: { y, m, d },
    h: Hijri.fromGregorian(y, m, d),
    j: Jalali.fromGregorian(y, m, d)
  };
}
function triFromStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return triDate(y, m, d);
}
function fmtG(g) { return `${g.d} ${GREG_MONTHS[g.m - 1]} ${g.y}`; }

function openEventModal(eventId, presets = {}) {
  const isNew = !eventId;
  const ev = isNew ? DB.newEvent(Object.assign({ date: Fmt.todayStr() }, presets))
    : JSON.parse(JSON.stringify(DB.get('events', eventId)));
  if (!ev) return;

  const body = el(`<div></div>`);
  body.innerHTML = `
    <div class="field"><label>Title</label>
      <input class="input" id="em-title" placeholder="Event title" value="${esc(ev.title)}"></div>
    <div class="field-row">
      <div class="field"><label>Date</label><input type="date" class="input" id="em-date" value="${esc(ev.date || '')}"></div>
      <div class="field"><label>Start</label><input type="time" class="input" id="em-time" value="${esc(ev.time || '')}"></div>
      <div class="field"><label>End</label><input type="time" class="input" id="em-end" value="${esc(ev.endTime || '')}"></div>
    </div>
    <div class="field"><label>Other calendars</label><div class="muted" id="em-alt" style="font-size:12.5px;line-height:1.6"></div></div>
    <div class="field"><label>Color</label><div id="em-color"></div></div>
    <div class="field"><label>Notes</label>
      <textarea class="textarea" id="em-notes" placeholder="Location, agenda, anything…">${esc(ev.notes || '')}</textarea></div>
    <div class="field"><label>Reminder</label>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="input" id="em-remind" style="width:auto;min-width:190px"></select>
        <span class="muted" style="font-size:12px" id="em-remind-state"></span>
      </div></div>
    <div class="field"><label>Linked items</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span id="em-links" style="display:flex;gap:6px;flex-wrap:wrap"></span>
        <button class="btn sm ghost" id="em-addlink">${icon('link')} Link…</button>
      </div></div>`;

  const updateAlt = () => {
    const v = body.querySelector('#em-date').value;
    if (!v) { body.querySelector('#em-alt').textContent = '—'; return; }
    const t = triFromStr(v);
    body.querySelector('#em-alt').innerHTML =
      `${icon('moonStar')} ${esc(Hijri.format(t.h))} &nbsp;·&nbsp; ${icon('sun')} ${esc(Jalali.format(t.j))}`;
  };
  body.querySelector('#em-date').addEventListener('input', updateAlt);
  updateAlt();

  attachTextTools(body.querySelector('#em-notes'));
  body.querySelector('#em-color').appendChild(swatchRow(ev.color, (c) => { ev.color = c; }));

  /* Reminder lead time — preselect whatever the linked reminder is set to. */
  const initialRemindMin = isNew ? null : eventReminderCurrentMin(ev);
  const remindSel = body.querySelector('#em-remind');
  remindSel.innerHTML = eventReminderOptionsHtml(initialRemindMin);
  const remindState = body.querySelector('#em-remind-state');
  remindSel.addEventListener('change', () => {
    remindState.textContent = remindSel.value === '' ? '' : 'You’ll get a notification';
  });

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const left = el(`<div class="left"></div>`);
  if (!isNew) {
    const delBtn = el(`<button class="btn sm danger">${icon('trash')} Delete</button>`);
    delBtn.addEventListener('click', async () => {
      m.close();
      if (await confirmDialog(`Delete event “${ev.title || 'Untitled'}”?`)) {
        DB.remove('events', ev.id);
        toast('Event deleted', { icon: 'trash' });
      }
    });
    left.append(delBtn);
  }
  const cancel = el(`<button class="btn ghost">Cancel</button>`);
  const save = el(`<button class="btn primary">${isNew ? 'Add event' : 'Save'}</button>`);
  foot.append(left, el(`<div style="flex:1"></div>`), cancel, save);
  const m = openModal({ title: isNew ? 'New event' : 'Edit event', body, foot, wide: true });
  cancel.addEventListener('click', () => m.close());

  const linksEl = body.querySelector('#em-links');
  const drawLinks = () => { if (!isNew) renderLinkChips(linksEl, { type: 'event', id: ev.id }); };
  drawLinks();
  const unsub = DB.subscribe(drawLinks);
  const origClose = m.close;
  m.close = () => { unsub(); origClose(); };
  body.querySelector('#em-addlink').addEventListener('click', () => {
    if (isNew) { toast('Save the event first, then link items.', { icon: 'link' }); return; }
    openLinkPicker({ type: 'event', id: ev.id });
  });

  save.addEventListener('click', () => {
    ev.title = body.querySelector('#em-title').value.trim() || 'Untitled event';
    ev.date = body.querySelector('#em-date').value || Fmt.todayStr();
    ev.time = body.querySelector('#em-time').value || null;
    ev.endTime = body.querySelector('#em-end').value || null;
    ev.notes = body.querySelector('#em-notes').value;
    DB.upsert('events', ev);
    if (remindSel.value !== '') applyEventReminder(ev, remindSel.value);
    else if (initialRemindMin !== null) applyEventReminder(ev, ''); // user switched it off
    toast(isNew ? 'Event added' : 'Event saved', { icon: 'calendar' });
    m.close();
  });
  setTimeout(() => body.querySelector('#em-title').focus());
}

/** Three-way converter: pick a source system + date, see the other two. */
function openConverterModal(onPickDate) {
  const t = new Date();
  let from = 'gregorian';
  const state = triDate(t.getFullYear(), t.getMonth() + 1, t.getDate());

  const body = el(`<div></div>`);
  body.innerHTML = `
    <div style="display:flex;justify-content:center"><div class="seg" id="cv-from">
      ${Object.entries(CAL_SYSTEMS).map(([k, s]) =>
        `<button data-f="${k}" class="${k === from ? 'active' : ''}">${icon(s.icon)} ${s.label}</button>`).join('')}
    </div></div>
    <div class="conv-panel" id="cv-input"></div>
    <div class="conv-result" id="cv-result"></div>`;

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const openBtn = el(`<button class="btn sm">${icon('calendar')} Open this date in calendar</button>`);
  const closeBtn = el(`<button class="btn primary">Done</button>`);
  const left = el(`<div class="left"></div>`);
  left.appendChild(openBtn);
  foot.append(left, el(`<div style="flex:1"></div>`), closeBtn);

  const m = openModal({ title: 'Calendar converter', body, foot, wide: true });
  closeBtn.addEventListener('click', () => m.close());

  function sel(id, options, value) {
    return `<select class="input" id="${id}">${options.map(o =>
      `<option value="${o.v}" ${o.v === value ? 'selected' : ''}>${o.l}</option>`).join('')}</select>`;
  }
  function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; }

  function recompute(y, m2, d) {
    let g;
    if (from === 'gregorian') g = { y, m: m2, d };
    else if (from === 'hijri') g = Hijri.toGregorian(y, m2, d);
    else g = Jalali.toGregorian(y, m2, d);
    Object.assign(state, triDate(g.y, g.m, g.d));
  }

  function draw() {
    const input = body.querySelector('#cv-input');
    let fields;
    if (from === 'gregorian') {
      const cur = state.g;
      const dmax = new Date(cur.y, cur.m, 0).getDate();
      fields = `${sel('cv-d', range(1, dmax).map(v => ({ v, l: v })), Math.min(cur.d, dmax))}
        ${sel('cv-m', GREG_MONTHS.map((l, i) => ({ v: i + 1, l })), cur.m)}
        ${sel('cv-y', range(1940, 2075).map(v => ({ v, l: v })), cur.y)}`;
    } else if (from === 'hijri') {
      const cur = state.h;
      const dmax = Hijri.monthLength(cur.y, cur.m);
      fields = `${sel('cv-d', range(1, dmax).map(v => ({ v, l: v })), Math.min(cur.d, dmax))}
        ${sel('cv-m', Hijri.MONTHS_EN.map((l, i) => ({ v: i + 1, l })), cur.m)}
        ${sel('cv-y', range(1360, 1500).map(v => ({ v, l: v })), cur.y)}`;
    } else {
      const cur = state.j;
      const dmax = Jalali.monthLength(cur.y, cur.m);
      fields = `${sel('cv-d', range(1, dmax).map(v => ({ v, l: v })), Math.min(cur.d, dmax))}
        ${sel('cv-m', Jalali.MONTHS_EN.map((l, i) => ({ v: i + 1, l })), cur.m)}
        ${sel('cv-y', range(1320, 1450).map(v => ({ v, l: v })), cur.y)}`;
    }
    input.innerHTML = `<div class="conv-cal-name">${icon(CAL_SYSTEMS[from].icon)} ${CAL_SYSTEMS[from].label} date</div>
      <div class="conv-fields">${fields}</div>`;

    const dow = new Date(state.g.y, state.g.m - 1, state.g.d)
      .toLocaleDateString(undefined, { weekday: 'long' });
    const lines = [];
    if (from !== 'gregorian') lines.push(`${icon('globe')} ${esc(fmtG(state.g))}`);
    if (from !== 'hijri') lines.push(`${icon('moonStar')} ${esc(Hijri.format(state.h))}`);
    if (from !== 'jalali') lines.push(`${icon('sun')} ${esc(Jalali.format(state.j))}`);
    body.querySelector('#cv-result').innerHTML = `
      <div class="cr-main">${dow}</div>
      <div class="cr-sub" style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin-top:6px">
        ${lines.map(l => `<span style="display:inline-flex;align-items:center;gap:6px">${l}</span>`).join('')}
      </div>`;

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
    onPickDate && onPickDate(`${g.y}-${Fmt.pad(g.m)}-${Fmt.pad(g.d)}`);
  });

  draw();
}

Views.calendar = {
  id: 'calendar', title: 'Calendar', icon: 'calendar',

  mount(container) {
    let primary = DB.settings().calendarPrimary || 'gregorian';
    if (!CAL_SYSTEMS[primary]) primary = 'gregorian';
    const now = new Date();
    const tToday = triDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    let gcur = { y: tToday.g.y, m: tToday.g.m };
    let hcur = { y: tToday.h.y, m: tToday.h.m };
    let jcur = { y: tToday.j.y, m: tToday.j.m };
    let selectedDate = Fmt.todayStr();

    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title">Calendar</div><div class="view-sub" id="cl-sub"></div></div>
          <div class="spacer"></div>
          <div class="seg" id="cl-primary">
            ${Object.entries(CAL_SYSTEMS).map(([k, s]) =>
              `<button data-p="${k}" class="${primary === k ? 'active' : ''}">${icon(s.icon)} ${s.label.split(' ·')[0]}</button>`).join('')}
          </div>
          <button class="btn" id="cl-convert">${icon('arrowLR')} Convert</button>
          <button class="btn primary" id="cl-newevent">${icon('plus')} Event</button>
        </div>
        <div class="view-body">
          <div class="cal-layout">
            <div class="cal-main">
              <div class="cal-nav">
                <button class="btn icon sm" id="cl-prev">${icon('chevL')}</button>
                <button class="btn icon sm" id="cl-next">${icon('chevR')}</button>
                <button class="btn sm" id="cl-today">Today</button>
                <div style="margin-left:6px;min-width:0">
                  <div class="cal-month-title" id="cl-title"></div>
                  <div class="cal-month-sub" id="cl-titlesub"></div>
                </div>
              </div>
              <div class="cal-filters" id="cl-filters"></div>
              <div class="cal-grid-head" id="cl-dow"></div>
              <div class="cal-grid" id="cl-grid"></div>
            </div>
            <div class="cal-side">
              <div class="card">
                <div class="cal-side-date" id="cl-sidedate"></div>
                <div class="cal-side-alt" id="cl-sidealt"></div>
                <div class="cal-side-list" id="cl-sidelist"></div>
                <div style="display:flex;gap:7px;margin-top:10px">
                  <input class="input sm" id="cl-quickev" placeholder="Add event on this day…" style="flex:1;min-width:0">
                  <button class="btn sm primary" id="cl-quickadd">${icon('plus')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    /* ---------- filters ---------- */
    const filters = () => Object.assign({ tasks: true, events: true, reminders: true, cycle: true }, DB.settings().calFilters);
    function drawFilters() {
      const wrap = container.querySelector('#cl-filters');
      const f = filters();
      const defs = [['events', 'Events', 'calendar'], ['tasks', 'Tasks', 'tasks'], ['reminders', 'Reminders', 'bell']];
      if (DashModules.isEnabled('cycle') && DashModules.getCycle()) defs.push(['cycle', 'Cycle', 'cycle']);
      wrap.innerHTML = '';
      for (const [key, label, ic] of defs) {
        const chip = el(`<button class="chip link cal-filter ${f[key] ? 'on' : ''}">${icon(ic)}<span>${label}</span></button>`);
        chip.addEventListener('click', () => {
          const nf = filters(); nf[key] = !nf[key];
          DB.setSettings({ calFilters: nf });
        });
        wrap.appendChild(chip);
      }
    }

    /* ---------- data per day ---------- */
    function itemsOn(dateStr) {
      const out = [];
      const f = filters();
      if (f.events) for (const ev of DB.all('events')) {
        if (ev.date === dateStr) out.push({ kind: 'event', time: ev.time || '', title: ev.title, color: ev.color, item: ev });
      }
      if (f.tasks) for (const task of DB.all('tasks')) {
        if (task.dueDate === dateStr) out.push({ kind: 'task', time: task.dueTime || '', title: task.title, color: task.color || 'var(--accent)', done: task.done, item: task });
      }
      if (f.reminders) for (const r of DB.all('reminders')) {
        if (!r.at) continue;
        const d = new Date(r.at);
        if (!isNaN(d) && Fmt.dateToStr(d) === dateStr) {
          out.push({ kind: 'reminder', time: `${Fmt.pad(d.getHours())}:${Fmt.pad(d.getMinutes())}`, title: r.title, color: 'var(--warn)', done: r.done, item: r });
        }
      }
      out.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      return out;
    }

    /* ---------- month grid ---------- */
    function firstDow() { return DB.settings().firstDayOfWeek ?? 1; }

    function drawDowHeader() {
      const start = firstDow();
      const head = container.querySelector('#cl-dow');
      head.innerHTML = '';
      for (let i = 0; i < 7; i++) head.appendChild(el(`<div class="cal-dow">${DOW_NAMES[(start + i) % 7]}</div>`));
    }

    // First Gregorian day + day count of the current primary month.
    function monthAnchor() {
      if (primary === 'gregorian') {
        return {
          base: new Date(gcur.y, gcur.m - 1, 1),
          len: new Date(gcur.y, gcur.m, 0).getDate(),
          inMonth: (t) => t.g.y === gcur.y && t.g.m === gcur.m
        };
      }
      if (primary === 'hijri') {
        const g1 = Hijri.toGregorian(hcur.y, hcur.m, 1);
        return {
          base: new Date(g1.y, g1.m - 1, g1.d),
          len: Hijri.monthLength(hcur.y, hcur.m),
          inMonth: (t) => t.h.y === hcur.y && t.h.m === hcur.m
        };
      }
      const g1 = Jalali.toGregorian(jcur.y, jcur.m, 1);
      return {
        base: new Date(g1.y, g1.m - 1, g1.d),
        len: Jalali.monthLength(jcur.y, jcur.m),
        inMonth: (t) => t.j.y === jcur.y && t.j.m === jcur.m
      };
    }

    function primDay(t) {
      return primary === 'gregorian' ? t.g.d : primary === 'hijri' ? t.h.d : t.j.d;
    }

    function altSpans(t) {
      // The two systems that aren't primary, small; month name on their day 1.
      const parts = [];
      const alts = primary === 'gregorian' ? ['h', 'j'] : primary === 'hijri' ? ['g', 'j'] : ['g', 'h'];
      for (const k of alts) {
        const dd = t[k];
        const monthName = k === 'g' ? GREG_MONTHS[dd.m - 1].slice(0, 3)
          : k === 'h' ? Hijri.MONTHS_EN[dd.m - 1].split(' ')[0].slice(0, 4)
          : Jalali.MONTHS_EN[dd.m - 1].slice(0, 3);
        const sys = k === 'g' ? 'Gregorian' : k === 'h' ? 'Lunar' : 'Solar';
        parts.push(dd.d === 1
          ? `<span class="cc-altmonth" title="${sys}">${esc(monthName)}</span>`
          : `<span title="${sys}">${dd.d}</span>`);
      }
      return parts.join('<span style="opacity:.5">·</span>');
    }

    function drawTitle() {
      const titleEl = container.querySelector('#cl-title');
      const subEl = container.querySelector('#cl-titlesub');
      const a = monthAnchor();
      const first = triDate(a.base.getFullYear(), a.base.getMonth() + 1, a.base.getDate());
      const lastD = new Date(a.base); lastD.setDate(a.base.getDate() + a.len - 1);
      const last = triDate(lastD.getFullYear(), lastD.getMonth() + 1, lastD.getDate());

      const span = (f, l, months, yr, era) => f.m === l.m
        ? `${months[f.m - 1]} ${l.y}${era}`
        : `${months[f.m - 1]} – ${months[l.m - 1]} ${l.y}${era}`;

      if (primary === 'gregorian') {
        titleEl.textContent = `${GREG_MONTHS[gcur.m - 1]} ${gcur.y}`;
        subEl.textContent = `${span(first.h, last.h, Hijri.MONTHS_EN, 0, ' AH')} · ${span(first.j, last.j, Jalali.MONTHS_EN, 0, ' SH')}`;
      } else if (primary === 'hijri') {
        titleEl.textContent = `${Hijri.MONTHS_EN[hcur.m - 1]} ${hcur.y} AH`;
        subEl.textContent = `${span(first.g, last.g, GREG_MONTHS, 0, '')} · ${span(first.j, last.j, Jalali.MONTHS_EN, 0, ' SH')}`;
      } else {
        titleEl.textContent = `${Jalali.MONTHS_EN[jcur.m - 1]} ${jcur.y} SH`;
        subEl.textContent = `${span(first.g, last.g, GREG_MONTHS, 0, '')} · ${span(first.h, last.h, Hijri.MONTHS_EN, 0, ' AH')}`;
      }
    }

    function drawGrid() {
      drawTitle();
      drawFilters();
      drawDowHeader();
      const cycleOn = filters().cycle && DashModules.isEnabled('cycle') && DashModules.getCycle();
      const grid = container.querySelector('#cl-grid');
      grid.innerHTML = '';
      const today = Fmt.todayStr();
      const start = firstDow();
      const a = monthAnchor();
      const lead = (a.base.getDay() - start + 7) % 7;
      const total = Math.ceil((lead + a.len) / 7) * 7;

      for (let i = 0; i < total; i++) {
        const d = new Date(a.base);
        d.setDate(a.base.getDate() - lead + i);
        const ds = Fmt.dateToStr(d);
        const t = triDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const items = itemsOn(ds);
        const tip = `${fmtG(t.g)} · ${Hijri.format(t.h)} · ${Jalali.format(t.j)}`;
        const cellEl = el(`<div class="cal-cell ${a.inMonth(t) ? '' : 'other'} ${ds === today ? 'today' : ''} ${ds === selectedDate ? 'selected' : ''}" data-date="${ds}" title="${esc(tip)}">
          <div class="cc-nums"><span class="cc-day">${primDay(t)}</span>
            <span class="cc-alt">${altSpans(t)}</span></div>
          <div class="cc-items"></div>
        </div>`);
        if (cycleOn) {
          const phase = DashModules.cyclePhaseFor(ds);
          if (phase) cellEl.appendChild(el(`<span class="cc-cycle" style="background:${DashModules.CYCLE_COLORS[phase]}" title="${phase}"></span>`));
        }
        const itemsEl = cellEl.querySelector('.cc-items');
        for (const it of items.slice(0, 3)) {
          itemsEl.appendChild(el(`<div class="cc-ev ${it.done ? 'done' : ''} ${it.kind === 'task' ? 'is-task' : ''}" style="--ev-color:${it.color}">${it.kind === 'reminder' ? '🔔 ' : ''}${esc(it.title || 'Untitled')}</div>`));
        }
        if (items.length > 3) itemsEl.appendChild(el(`<div class="cc-more">+${items.length - 3} more</div>`));
        cellEl.addEventListener('click', () => { selectedDate = ds; drawGrid(); drawSide(); });
        cellEl.addEventListener('dblclick', () => openEventModal(null, { date: ds }));
        grid.appendChild(cellEl);
      }
      const totalEvents = DB.all('events').length;
      container.querySelector('#cl-sub').textContent =
        `${totalEvents} event${totalEvents === 1 ? '' : 's'} · double-click a day to add one`;
    }

    /* ---------- side panel ---------- */
    function drawSide() {
      const t = triFromStr(selectedDate);
      container.querySelector('#cl-sidedate').textContent = Fmt.fullDate(selectedDate);
      container.querySelector('#cl-sidealt').innerHTML =
        `${esc(Hijri.format(t.h))}<br>${esc(Jalali.format(t.j))}`;
      const list = container.querySelector('#cl-sidelist');
      list.innerHTML = '';
      const items = itemsOn(selectedDate);
      if (!items.length) {
        list.appendChild(el(`<div class="empty" style="padding:22px 8px">${icon('calendar')}
          <div class="empty-sub">Nothing scheduled. Add an event below, or set a task’s due date to this day.</div></div>`));
      }
      for (const it of items) {
        const sub = [
          it.kind === 'event' ? (it.time ? `${Fmt.time12(it.time)}${it.item.endTime ? '–' + Fmt.time12(it.item.endTime) : ''}` : 'All day')
            : it.kind === 'task' ? (it.time ? `Due ${Fmt.time12(it.time)}` : 'Task due')
            : `Reminder · ${Fmt.time12(it.time)}`
        ];
        const row = el(`<div class="cal-side-item ${it.done ? 'done' : ''}">
          <div class="csi-bar" style="--ev-color:${it.color}"></div>
          <div style="flex:1;min-width:0">
            <div class="csi-title">${esc(it.title || 'Untitled')}</div>
            <div class="csi-sub">${esc(sub.join(''))}</div>
          </div>
        </div>`);
        row.addEventListener('click', () => {
          if (it.kind === 'event') openEventModal(it.item.id);
          else if (it.kind === 'task') openTaskModal(it.item.id);
          else App.goto('reminder', it.item.id);
        });
        list.appendChild(row);
      }
    }

    function quickAddEvent() {
      const input = container.querySelector('#cl-quickev');
      const title = input.value.trim();
      if (!title) { openEventModal(null, { date: selectedDate }); return; }
      DB.upsert('events', DB.newEvent({ title, date: selectedDate }));
      input.value = '';
      toast('Event added', { icon: 'calendar' });
    }

    /* ---------- navigation ---------- */
    function shiftMonth(cur, delta) {
      cur.m += delta;
      if (cur.m > 12) { cur.m = 1; cur.y++; }
      if (cur.m < 1) { cur.m = 12; cur.y--; }
    }
    function shift(delta) {
      if (primary === 'gregorian') shiftMonth(gcur, delta);
      else if (primary === 'hijri') shiftMonth(hcur, delta);
      else shiftMonth(jcur, delta);
      drawGrid();
    }

    function alignCursorsTo(dateStr) {
      const t = triFromStr(dateStr);
      gcur = { y: t.g.y, m: t.g.m };
      hcur = { y: t.h.y, m: t.h.m };
      jcur = { y: t.j.y, m: t.j.m };
    }

    container.querySelector('#cl-prev').addEventListener('click', () => shift(-1));
    container.querySelector('#cl-next').addEventListener('click', () => shift(1));
    container.querySelector('#cl-today').addEventListener('click', () => {
      selectedDate = Fmt.todayStr();
      alignCursorsTo(selectedDate);
      drawGrid(); drawSide();
    });
    container.querySelector('#cl-primary').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      primary = b.dataset.p;
      DB.setSettings({ calendarPrimary: primary });
      container.querySelectorAll('#cl-primary button').forEach(x => x.classList.toggle('active', x === b));
      alignCursorsTo(selectedDate);
      drawGrid();
    });
    container.querySelector('#cl-convert').addEventListener('click', () => {
      openConverterModal((dateStr) => {
        selectedDate = dateStr;
        alignCursorsTo(dateStr);
        drawGrid(); drawSide();
      });
    });
    container.querySelector('#cl-newevent').addEventListener('click', () => openEventModal(null, { date: selectedDate }));
    container.querySelector('#cl-quickadd').addEventListener('click', quickAddEvent);
    container.querySelector('#cl-quickev').addEventListener('keydown', (e) => { if (e.key === 'Enter') quickAddEvent(); });

    drawGrid();
    drawSide();

    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') { drawGrid(); return; }
      if (['events', 'tasks', 'reminders'].includes(ch.collection) || ch.kind === 'reload') { drawGrid(); drawSide(); }
    });

    return {
      destroy: unsub,
      goto(id) {
        const ev = DB.get('events', id);
        if (!ev) return;
        if (ev.date) {
          selectedDate = ev.date;
          alignCursorsTo(ev.date);
          drawGrid(); drawSide();
        }
        openEventModal(id);
      }
    };
  }
};
