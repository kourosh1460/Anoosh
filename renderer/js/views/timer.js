'use strict';
/* Timer view — UI over the app-wide TimerEngine. */

window.Views = window.Views || {};

Views.timer = {
  id: 'timer', title: 'Timer', icon: 'timer',

  mount(container) {
    const R = 140, CIRC = 2 * Math.PI * R;

    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title">Timer</div><div class="view-sub" id="tm-sub"></div></div>
          <div class="spacer"></div>
          <div class="seg" id="tm-mode">
            <button data-m="pomodoro">${icon('zap')} Pomodoro</button>
            <button data-m="countdown">${icon('clock')} Countdown</button>
            <button data-m="stopwatch">${icon('timer')} Stopwatch</button>
          </div>
        </div>
        <div class="view-body">
          <div class="timer-layout">
            <div class="timer-main card">
              <div class="timer-ring-wrap">
                <svg class="ring" viewBox="0 0 300 300">
                  <defs><linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="var(--accent)"/>
                    <stop offset="100%" stop-color="color-mix(in srgb, var(--accent) 45%, #3ec6ff)"/>
                  </linearGradient></defs>
                  <circle class="ring-bg" cx="150" cy="150" r="${R}"/>
                  <circle class="ring-fg" id="tm-ring" cx="150" cy="150" r="${R}"
                    stroke-dasharray="${CIRC}" stroke-dashoffset="0"/>
                </svg>
                <div class="timer-center">
                  <div class="timer-phase" id="tm-phase"></div>
                  <div class="timer-time" id="tm-time">25:00</div>
                  <div class="timer-round" id="tm-round"></div>
                </div>
              </div>
              <div id="tm-countdown-cfg" style="display:none;align-items:center;gap:8px">
                <span class="muted" style="font-size:12.5px">Minutes:</span>
                <input type="number" class="input set-num" id="tm-mins" min="1" max="600" value="10">
              </div>
              <div class="timer-controls">
                <button class="btn icon" id="tm-skip" title="Skip phase">${icon('skip')}</button>
                <button class="btn primary big" id="tm-startpause">${icon('play')} Start</button>
                <button class="btn icon" id="tm-stop" title="Stop & reset">${icon('stop')}</button>
              </div>
              <div class="timer-task-link">
                <span class="muted" style="font-size:12px;flex:none">Focusing on:</span>
                <select class="input sm" id="tm-task" style="flex:1"></select>
              </div>
            </div>
            <div class="timer-side">
              <div class="card">
                <div class="card-title">${icon('zap')} Focus today</div>
                <div class="focus-total"><span class="ft-num" id="tm-total">0m</span>
                  <span class="ft-label" id="tm-sessions"></span></div>
              </div>
              <div class="card" style="flex:1;min-height:0">
                <div class="card-title">${icon('clock')} Recent sessions</div>
                <div class="session-list" id="tm-log"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const ringEl = container.querySelector('#tm-ring');
    const timeEl = container.querySelector('#tm-time');
    const phaseEl = container.querySelector('#tm-phase');
    const roundEl = container.querySelector('#tm-round');
    const startBtn = container.querySelector('#tm-startpause');

    function fmtClock(ms) {
      const total = Math.max(0, Math.round(ms / 1000));
      const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
      return h ? `${h}:${Fmt.pad(m)}:${Fmt.pad(s)}` : `${m}:${Fmt.pad(s)}`;
    }

    function drawTimer() {
      const st = TimerEngine.state;
      container.querySelectorAll('#tm-mode button').forEach(b =>
        b.classList.toggle('active', b.dataset.m === st.mode));
      container.querySelector('#tm-countdown-cfg').style.display =
        st.mode === 'countdown' && !TimerEngine.isActive() ? 'flex' : 'none';

      if (st.mode === 'stopwatch') {
        timeEl.textContent = fmtClock(TimerEngine.elapsedMs());
        ringEl.style.strokeDashoffset = 0;
        phaseEl.textContent = 'Stopwatch';
        roundEl.textContent = st.running ? 'counting up…' : '';
      } else {
        const rem = TimerEngine.remainingMs();
        timeEl.textContent = fmtClock(rem);
        const frac = st.durationMs ? rem / st.durationMs : 0;
        ringEl.style.strokeDashoffset = CIRC * (1 - Math.max(0, Math.min(1, frac)));
        if (st.mode === 'pomodoro') {
          phaseEl.textContent = st.phase === 'focus' ? 'Focus' : st.phase === 'short' ? 'Short break' : 'Long break';
          roundEl.textContent = `Round ${st.round} of ${DB.settings().pomodoro.rounds || 4}`;
        } else {
          phaseEl.textContent = 'Countdown';
          roundEl.textContent = '';
        }
      }
      startBtn.innerHTML = st.running ? `${icon('pause')} Pause` : `${icon('play')} ${TimerEngine.isActive() ? 'Resume' : 'Start'}`;
      container.querySelector('#tm-skip').style.visibility = st.mode === 'pomodoro' ? 'visible' : 'hidden';
      container.querySelector('#tm-sub').textContent =
        st.mode === 'pomodoro' ? 'Focus in rounds — breaks are part of the work.' :
        st.mode === 'countdown' ? 'One-shot timer with a notification at zero.' :
        'Open-ended timing; logs as focus time when stopped.';
    }

    function drawTaskSelect() {
      const sel = container.querySelector('#tm-task');
      const st = TimerEngine.state;
      const tasks = DB.all('tasks').filter(t => !t.done)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      sel.innerHTML = `<option value="">— nothing linked —</option>` +
        tasks.map(t => `<option value="${t.id}" ${t.id === st.taskId ? 'selected' : ''}>${esc(t.title.slice(0, 60))}</option>`).join('');
      if (st.taskId && !tasks.some(t => t.id === st.taskId)) {
        const done = DB.get('tasks', st.taskId);
        if (done) sel.insertAdjacentHTML('beforeend', `<option value="${done.id}" selected>${esc(done.title.slice(0, 60))} (done)</option>`);
      }
    }

    function drawLog() {
      const today = Fmt.todayStr();
      const sessions = [...DB.all('sessions')].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
      const todayFocus = sessions.filter(s => s.kind === 'focus' && s.startedAt && s.startedAt.slice(0, 10) === today);
      const totalMs = todayFocus.reduce((sum, s) => sum + (s.durationMs || 0), 0);
      container.querySelector('#tm-total').textContent = Fmt.duration(totalMs) || '0m';
      container.querySelector('#tm-sessions').textContent =
        `${todayFocus.length} focus session${todayFocus.length === 1 ? '' : 's'} today`;

      const log = container.querySelector('#tm-log');
      log.innerHTML = '';
      if (!sessions.length) {
        log.appendChild(el(`<div class="empty">${icon('timer')}<div class="empty-sub">Finished focus rounds and stopwatch runs land here.</div></div>`));
        return;
      }
      for (const s of sessions.slice(0, 30)) {
        const task = s.taskId ? DB.get('tasks', s.taskId) : null;
        const isFocus = s.kind === 'focus' || s.kind === 'countdown';
        const row = el(`<div class="session-row">
          <div class="sr-kind" style="background:color-mix(in srgb, ${isFocus ? 'var(--accent)' : 'var(--ok)'} 16%, transparent);color:${isFocus ? 'var(--accent)' : 'var(--ok)'}">
            ${icon(isFocus ? 'zap' : 'coffee')}</div>
          <div class="sr-main">
            <div class="sr-title">${esc(task ? task.title : (isFocus ? 'Focus' : 'Break'))}</div>
            <div class="sr-sub">${esc(Fmt.relTime(s.startedAt))}</div>
          </div>
          <div class="sr-dur">${Fmt.duration(s.durationMs || 0)}</div>
        </div>`);
        log.appendChild(row);
      }
    }

    /* controls */
    container.querySelector('#tm-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (!TimerEngine.setMode(b.dataset.m)) {
        toast('Stop the running timer before switching modes', { icon: 'timer' });
      }
    });
    startBtn.addEventListener('click', () => {
      const st = TimerEngine.state;
      if (st.running) TimerEngine.pause();
      else {
        if (st.mode === 'countdown' && !TimerEngine.isActive()) {
          TimerEngine.setCountdown(Number(container.querySelector('#tm-mins').value) || 10);
        }
        TimerEngine.start();
      }
    });
    container.querySelector('#tm-stop').addEventListener('click', () => TimerEngine.stop());
    container.querySelector('#tm-skip').addEventListener('click', () => TimerEngine.skipPhase());
    container.querySelector('#tm-task').addEventListener('change', (e) => {
      TimerEngine.setTask(e.target.value || null);
    });
    container.querySelector('#tm-mins').addEventListener('input', (e) => {
      TimerEngine.setCountdown(Number(e.target.value) || 10);
    });

    drawTimer(); drawTaskSelect(); drawLog();

    const unsubTimer = TimerEngine.subscribe((event) => {
      drawTimer();
      if (event === 'complete' || event === 'reset') drawLog();
      if (event === 'task') drawTaskSelect();
    });
    const unsubDb = DB.subscribe((ch) => {
      if (ch.collection === 'sessions') drawLog();
      if (ch.collection === 'tasks') { drawTaskSelect(); drawLog(); }
      if (ch.kind === 'reload') { drawTimer(); drawTaskSelect(); drawLog(); }
    });

    return { destroy() { unsubTimer(); unsubDb(); } };
  }
};
