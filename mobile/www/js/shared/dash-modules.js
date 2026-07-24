'use strict';
/**
 * DashModules — optional dashboard modules, shared verbatim by desktop and
 * mobile (both provide the same DB/Fmt/el/esc/icon/toast globals).
 *
 * Adding a module later = append one entry to REGISTRY (id, title, icon,
 * desc, render). Enabled state lives in settings.modules ({id: true}) and
 * every module defaults to OFF. The dashboard re-renders on settings change,
 * so toggling takes effect immediately.
 */
const DashModules = (() => {

  /* The 'habits' collection stays in the store/merge schema even though the
     module is gone — older devices may still sync it, and nobody's data is
     ever dropped by an update. */

  /* ---------- Focus stats (uses existing timer sessions — no new data) ---------- */
  function renderFocus(elRoot) {
    const today = Fmt.todayStr();
    const byDay = {};
    for (let i = 6; i >= 0; i--) byDay[Fmt.addDays(today, -i)] = 0;
    for (const s of DB.all('sessions')) {
      if (s.kind !== 'focus' || !s.startedAt) continue;
      const d = s.startedAt.slice(0, 10);
      if (d in byDay) byDay[d] += (s.durationMs || 0);
    }
    const days = Object.keys(byDay);
    const max = Math.max(60000, ...days.map(d => byDay[d]));
    const total = days.reduce((n, d) => n + byDay[d], 0);
    elRoot.innerHTML = `
      <div class="fs-total">${Fmt.duration(total) || '0m'} <span class="muted" style="font-size:11.5px;font-weight:500">focused this week</span></div>
      <div class="fs-bars">${days.map(d => `
        <div class="fs-col" title="${esc(Fmt.niceDate(d))}: ${Fmt.duration(byDay[d]) || '0m'}">
          <div class="fs-bar ${d === today ? 'today' : ''}" style="height:${Math.max(4, Math.round(byDay[d] / max * 100))}%"></div>
          <span class="fs-lbl">${Fmt.strToDate(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
        </div>`).join('')}
      </div>`;
  }

  /* ---------- Countdowns (uses existing events — no new data) ---------- */
  function renderCountdown(elRoot) {
    const today = Fmt.todayStr();
    const upcoming = DB.all('events')
      .filter(ev => ev.date && ev.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
    elRoot.innerHTML = '';
    if (!upcoming.length) {
      elRoot.innerHTML = `<div class="empty" style="padding:12px 8px"><div class="empty-sub">Add events in the Calendar and the countdown appears here.</div></div>`;
      return;
    }
    for (const ev of upcoming) {
      const days = Math.round((Fmt.strToDate(ev.date) - Fmt.strToDate(today)) / 86400000);
      const row = el(`<div class="dash-item">
        <div class="cd-num" style="--ev-color:${esc(ev.color || '#3ec6ff')}">${days === 0 ? '🎉' : days}</div>
        <div class="di-text"><div class="di-title">${esc(ev.title || 'Untitled')}</div>
          <div class="di-sub">${days === 0 ? 'today!' : days === 1 ? 'tomorrow' : `days to go · ${esc(Fmt.niceDate(ev.date))}`}</div></div>
      </div>`);
      row.addEventListener('click', () => App.goto('event', ev.id));
      elRoot.appendChild(row);
    }
  }

  /* ---------- Cycle (period tracker) ---------- */
  const CYCLE_COLORS = { period: '#e5484d', ovulation: '#14b8a6', pms: '#f59e0b' };
  const CYCLE_LIMITS = { cycleMin: 21, cycleMax: 45, periodMin: 2, periodMax: 10 };

  function getCycle() {
    return DB.get('cycle', 'cycle');
  }

  /** Day of cycle (1-based) for a date string, or null if unconfigured. */
  function cycleDayFor(dateStr, c) {
    c = c || getCycle();
    if (!c || !c.lastStart) return null;
    const diff = Math.round((Fmt.strToDate(dateStr) - Fmt.strToDate(c.lastStart)) / 86400000);
    return ((diff % c.cycleLen) + c.cycleLen) % c.cycleLen + 1;
  }

  /** Phase for a date: 'period' | 'ovulation' | 'pms' | null. */
  function cyclePhaseFor(dateStr, c) {
    c = c || getCycle();
    if (!c || !c.lastStart) return null;
    if (dateStr < c.lastStart) return null; // don't paint the past before tracking began
    const day = cycleDayFor(dateStr, c);
    if (day <= c.periodLen) return 'period';
    const ovu = c.cycleLen - 14; // luteal phase ≈ 14 days
    if (day >= ovu - 2 && day <= ovu + 2) return 'ovulation';
    if (day > c.cycleLen - 4) return 'pms';
    return null;
  }

  /** Keep one reminder in sync with the next predicted period. */
  function syncCycleReminder(c) {
    if (!c || !c.lastStart) return;
    const today = Fmt.todayStr();
    let next = c.lastStart;
    while (next <= today) next = Fmt.addDays(next, c.cycleLen);
    const at = new Date(Fmt.strToDate(Fmt.addDays(next, -1)));
    at.setHours(9, 0, 0, 0);
    const existing = DB.get('reminders', 'cycle-reminder');
    const rem = existing || DB.newReminder({ id: 'cycle-reminder' });
    rem.id = 'cycle-reminder';
    rem.title = 'Period expected tomorrow';
    rem.body = 'Based on your cycle — take care of yourself 💗';
    rem.at = at.toISOString();
    rem.done = false;
    rem.notified = false;
    DB.upsert('reminders', rem);
  }

  function openCycleEditor(onSaved) {
    const c = getCycle() || { id: 'cycle', lastStart: Fmt.todayStr(), cycleLen: 28, periodLen: 5, links: [] };
    const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };
    const body = el(`<div>
      <div class="field"><label>First day of your last period</label>
        <input type="date" class="input" id="cy-start" value="${esc(c.lastStart)}" max="${Fmt.todayStr()}"></div>
      <div class="field-row" style="margin-top:12px">
        <div class="field"><label>Cycle length (days)</label>
          <select class="input" id="cy-len">${range(CYCLE_LIMITS.cycleMin, CYCLE_LIMITS.cycleMax).map(v =>
            `<option value="${v}" ${v === c.cycleLen ? 'selected' : ''}>${v}${v === 28 ? ' · typical' : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Period length (days)</label>
          <select class="input" id="cy-plen">${range(CYCLE_LIMITS.periodMin, CYCLE_LIMITS.periodMax).map(v =>
            `<option value="${v}" ${v === c.periodLen ? 'selected' : ''}>${v}${v === 5 ? ' · typical' : ''}</option>`).join('')}</select></div>
      </div>
      <div class="muted" style="font-size:12px;line-height:1.5;margin-top:10px">
        Predictions use a 14-day luteal phase: ovulation lands mid-cycle with a fertile
        window around it, and PMS covers the last few days. A reminder is set a day
        before your next expected period. Everything stays on your devices.</div>
    </div>`);
    const foot = el(`<div style="width:100%;display:flex;gap:9px"></div>`);
    const save = el(`<button class="btn primary" style="flex:1">Save</button>`);
    foot.appendChild(save);
    const m = openModal({ title: getCycle() ? 'Edit cycle' : 'Set up your cycle', body, foot });
    save.addEventListener('click', () => {
      c.lastStart = body.querySelector('#cy-start').value || Fmt.todayStr();
      if (c.lastStart > Fmt.todayStr()) c.lastStart = Fmt.todayStr();
      c.cycleLen = Number(body.querySelector('#cy-len').value);
      c.periodLen = Number(body.querySelector('#cy-plen').value);
      DB.upsert('cycle', c);
      syncCycleReminder(c);
      m.close();
      toast('Cycle saved — predictions updated', { icon: 'cycle' });
      onSaved && onSaved();
    });
  }

  function renderCycle(elRoot) {
    const c = getCycle();
    if (!c || !c.lastStart) {
      elRoot.innerHTML = `<div class="empty" style="padding:16px 8px">${icon('cycle')}
        <div class="empty-title">Track your cycle, gently</div>
        <div class="empty-sub">Period, ovulation and PMS predictions — private, offline, marked on your calendar.</div></div>`;
      const btn = el(`<button class="btn primary block">${icon('cycle')} Set up</button>`);
      btn.addEventListener('click', () => openCycleEditor());
      elRoot.appendChild(btn);
      return;
    }
    const today = Fmt.todayStr();
    const day = cycleDayFor(today, c);
    const phase = cyclePhaseFor(today, c);

    // days until next period / period progress
    let next = c.lastStart;
    while (next <= today) next = Fmt.addDays(next, c.cycleLen);
    const daysLeft = Math.round((Fmt.strToDate(next) - Fmt.strToDate(today)) / 86400000);
    const status = phase === 'period'
      ? `Period · day ${day} of ${c.periodLen}`
      : phase === 'ovulation' ? 'Fertile window'
      : daysLeft === 1 ? '1 day until your period'
      : `${daysLeft} days until your period`;

    // SVG day ring
    const R = 104, CX = 130, CY = 130;
    let dots = '';
    for (let i = 1; i <= c.cycleLen; i++) {
      const a = (i - 1) / c.cycleLen * 2 * Math.PI - Math.PI / 2;
      const x = CX + R * Math.cos(a), y = CY + R * Math.sin(a);
      const dayPhase = (i <= c.periodLen) ? 'period'
        : (i >= c.cycleLen - 16 && i <= c.cycleLen - 12) ? 'ovulation'
        : (i > c.cycleLen - 4) ? 'pms' : null;
      const col = dayPhase ? CYCLE_COLORS[dayPhase] : 'var(--chip-bg)';
      const isToday = i === day;
      dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isToday ? 9 : dayPhase ? 6 : 3.5}"
        fill="${col}" ${isToday ? `stroke="var(--text)" stroke-width="2.5"` : ''} opacity="${dayPhase || isToday ? 1 : .55}"/>`;
    }
    elRoot.innerHTML = `
      <div class="cycle-wrap">
        <svg viewBox="0 0 260 260" class="cycle-ring">${dots}</svg>
        <div class="cycle-center">
          <div class="cycle-day">Day ${day}</div>
          <div class="cycle-status">${esc(status)}</div>
          <button class="btn sm" id="cy-edit">${icon('edit')} Edit cycle</button>
        </div>
      </div>
      <div class="cycle-legend">
        <span><i style="background:${CYCLE_COLORS.period}"></i> Period</span>
        <span><i style="background:${CYCLE_COLORS.ovulation}"></i> Ovulation</span>
        <span><i style="background:${CYCLE_COLORS.pms}"></i> PMS</span>
      </div>`;
    elRoot.querySelector('#cy-edit').addEventListener('click', () => openCycleEditor());
  }

  const REGISTRY = [
    { id: 'cycle', title: 'Cycle', icon: 'cycle', desc: 'Period, ovulation and PMS predictions — marked on your calendar', render: renderCycle },
    { id: 'focus', title: 'Focus stats', icon: 'zap', desc: 'Your focused time, day by day', render: renderFocus },
    { id: 'countdown', title: 'Countdowns', icon: 'calendar', desc: 'Days left until your next events', render: renderCountdown }
  ];

  function list() { return REGISTRY; }
  function isEnabled(id) { return !!(DB.settings().modules || {})[id]; }
  function enabledList() { return REGISTRY.filter(m => isEnabled(m.id)); }
  function setEnabled(id, on) {
    const modules = Object.assign({}, DB.settings().modules);
    modules[id] = !!on;
    DB.setSettings({ modules });
  }

  /** Render every enabled module as a .card into container (cleared first). */
  function renderSections(container) {
    container.innerHTML = '';
    for (const m of enabledList()) {
      const card = el(`<div class="card dash-module"><div class="card-title">${icon(m.icon)} ${esc(m.title)}</div><div class="dm-body"></div></div>`);
      try { m.render(card.querySelector('.dm-body')); } catch (err) { console.error('module ' + m.id, err); }
      container.appendChild(card);
    }
  }

  return {
    list, isEnabled, enabledList, setEnabled, renderSections,
    cyclePhaseFor, cycleDayFor, getCycle, syncCycleReminder,
    CYCLE_COLORS
  };
})();
if (typeof module === 'object' && module.exports) module.exports = DashModules;
