'use strict';
/**
 * TimerEngine — app-wide timer state machine (runs regardless of active view).
 * Modes:
 *   pomodoro  — focus/short/long phases with rounds
 *   countdown — one-shot custom duration
 *   stopwatch — counts up
 * Time is computed from wall-clock timestamps, so it stays accurate even if
 * the interval is throttled or the machine sleeps.
 */
const TimerEngine = (() => {
  const listeners = new Set();
  let tick = null;

  const state = {
    mode: 'pomodoro',            // pomodoro | countdown | stopwatch
    phase: 'focus',              // focus | short | long   (pomodoro only)
    running: false,
    startedAt: null,             // epoch ms of current run segment
    accumulatedMs: 0,            // elapsed before current segment (pauses)
    durationMs: 25 * 60000,      // target for pomodoro/countdown
    round: 1,
    taskId: null,
    sessionStartIso: null
  };

  function cfg() { return DB.settings().pomodoro; }

  function phaseDuration(phase) {
    const c = cfg();
    if (phase === 'focus') return (c.work || 25) * 60000;
    if (phase === 'short') return (c.short || 5) * 60000;
    return (c.long || 15) * 60000;
  }

  function elapsedMs() {
    return state.accumulatedMs + (state.running ? Date.now() - state.startedAt : 0);
  }

  function remainingMs() {
    if (state.mode === 'stopwatch') return elapsedMs();
    return Math.max(0, state.durationMs - elapsedMs());
  }

  function emit(event) {
    for (const fn of listeners) { try { fn(event, state); } catch (e) { console.error(e); } }
  }

  function ensureTick() {
    if (tick) return;
    tick = setInterval(() => {
      if (!state.running) return;
      if (state.mode !== 'stopwatch' && remainingMs() <= 0) onPhaseComplete();
      else emit('tick');
    }, 500);
  }

  function beep(times = 2) {
    if (!DB.settings().timerSound) return;
    try {
      const ctx = new AudioContext();
      for (let i = 0; i < times; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = i % 2 ? 660 : 880;
        const t0 = ctx.currentTime + i * 0.28;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.22, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
        osc.start(t0); osc.stop(t0 + 0.26);
      }
      setTimeout(() => ctx.close(), times * 300 + 400);
    } catch (e) { /* audio unavailable */ }
  }

  function logSession(kind, ms) {
    if (ms < 15000) return; // ignore accidental blips
    DB.upsert('sessions', {
      id: DB.uid(), kind,
      startedAt: state.sessionStartIso || new Date(Date.now() - ms).toISOString(),
      durationMs: ms,
      taskId: state.taskId || null
    });
    if (kind === 'focus' && state.taskId) {
      const task = DB.get('tasks', state.taskId);
      if (task) {
        task.timeSpentMs = (task.timeSpentMs || 0) + ms;
        DB.upsert('tasks', task);
      }
    }
  }

  function onPhaseComplete() {
    const wasFocus = state.mode !== 'pomodoro' || state.phase === 'focus';
    const doneMs = state.durationMs;
    state.running = false;
    state.accumulatedMs = 0;
    state.startedAt = null;
    beep(3);

    if (state.mode === 'pomodoro') {
      if (state.phase === 'focus') {
        logSession('focus', doneMs);
        const c = cfg();
        const nextLong = state.round % (c.rounds || 4) === 0;
        window.aurora.notify('Focus complete 🎉', nextLong ? 'Time for a long break.' : 'Time for a short break.');
        state.phase = nextLong ? 'long' : 'short';
      } else {
        logSession('break', doneMs);
        window.aurora.notify('Break over', 'Ready for the next focus round?');
        if (state.phase !== 'focus') state.round += 1;
        state.phase = 'focus';
      }
      state.durationMs = phaseDuration(state.phase);
    } else if (state.mode === 'countdown') {
      logSession('countdown', doneMs);
      window.aurora.notify('Timer done ⏰', 'Your countdown has finished.');
    }
    state.sessionStartIso = null;
    emit('complete', { wasFocus });
  }

  return {
    get state() { return state; },
    elapsedMs, remainingMs,
    isActive() { return state.running || state.accumulatedMs > 0; },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    setMode(mode) {
      if (state.running || state.accumulatedMs > 0) return false;
      state.mode = mode;
      state.phase = 'focus';
      state.round = 1;
      state.durationMs = mode === 'pomodoro' ? phaseDuration('focus')
        : mode === 'countdown' ? state.durationMs || 10 * 60000 : 0;
      emit('reset');
      return true;
    },

    setCountdown(minutes) {
      state.durationMs = Math.max(1, minutes) * 60000;
      emit('tick');
    },

    setTask(taskId) { state.taskId = taskId; emit('task'); },

    start() {
      if (state.running) return;
      if (state.mode === 'pomodoro' && state.accumulatedMs === 0) {
        state.durationMs = phaseDuration(state.phase);
      }
      if (!state.sessionStartIso) state.sessionStartIso = new Date().toISOString();
      state.running = true;
      state.startedAt = Date.now();
      ensureTick();
      emit('start');
    },

    pause() {
      if (!state.running) return;
      state.accumulatedMs += Date.now() - state.startedAt;
      state.running = false;
      state.startedAt = null;
      emit('pause');
    },

    /** Stop and log whatever elapsed (stopwatch logs as focus time). */
    stop() {
      const ms = elapsedMs();
      if (state.mode === 'stopwatch' && ms > 0) logSession('focus', ms);
      state.running = false;
      state.accumulatedMs = 0;
      state.startedAt = null;
      state.sessionStartIso = null;
      if (state.mode === 'pomodoro') { state.phase = 'focus'; state.round = 1; state.durationMs = phaseDuration('focus'); }
      emit('reset');
    },

    skipPhase() {
      if (state.mode !== 'pomodoro') return;
      state.running = false;
      state.accumulatedMs = 0;
      state.startedAt = null;
      if (state.phase === 'focus') {
        const c = cfg();
        state.phase = state.round % (c.rounds || 4) === 0 ? 'long' : 'short';
      } else {
        if (state.phase !== 'focus') state.round += 1;
        state.phase = 'focus';
      }
      state.durationMs = phaseDuration(state.phase);
      state.sessionStartIso = null;
      emit('reset');
    },

    /** Start a linked focus session from anywhere in the app. */
    startFocusOn(taskId) {
      if (state.running) this.pause();
      state.mode = 'pomodoro';
      state.phase = 'focus';
      state.accumulatedMs = 0;
      state.startedAt = null;
      state.durationMs = phaseDuration('focus');
      state.taskId = taskId;
      state.sessionStartIso = null;
      this.start();
    }
  };
})();
