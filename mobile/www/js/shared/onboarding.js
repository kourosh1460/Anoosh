'use strict';
/**
 * Onboarding — a short, friendly first-launch tour. Shared by desktop and
 * mobile (renders as a dialog on desktop, a bottom sheet on mobile via the
 * shared modal classes). Shows once; sets settings.onboarded.
 */
function showOnboarding(force) {
  if (!force && DB.settings().onboarded) return;

  const isMobile = typeof MViews !== 'undefined';
  const SLIDES = [
    {
      icon: 'sparkle', title: 'Hey, welcome to Anoosh',
      text: 'One quiet place for your tasks, notes, ideas and days. Everything lives on this device — no accounts, no cloud, no waiting.'
    },
    {
      icon: 'link', title: 'It all connects',
      text: isMobile
        ? 'Tap + to capture anything in two seconds. Link notes to tasks, put tasks on the calendar, focus on them with the timer.'
        : 'Press Ctrl+K to find anything. Link notes to tasks, put tasks on the calendar, focus on them with the timer — and pin a note on top of your screen.'
    },
    {
      icon: 'globe', title: 'Three calendars, one grid',
      text: 'Gregorian, lunar and solar — flip between them or convert any date. The month view always shows all three.'
    },
    {
      icon: 'repeat', title: 'Your PC and phone, in step',
      text: (isMobile ? 'Open More → Sync' : 'Open Settings → Sync') + ' to connect your devices over Wi-Fi. New things on either side simply appear on both. That’s it — enjoy.'
    }
  ];

  let idx = 0;
  const body = el(`<div class="onb">
    <div class="onb-icon" id="onb-icon"></div>
    <div class="onb-title" id="onb-title"></div>
    <div class="onb-text" id="onb-text"></div>
    <div class="onb-dots" id="onb-dots">${SLIDES.map((_, i) => `<span data-i="${i}"></span>`).join('')}</div>
  </div>`);
  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const skip = el(`<button class="btn ghost">Skip</button>`);
  const next = el(`<button class="btn primary" style="flex:1">Next</button>`);
  foot.append(skip, next);

  const m = openModal({ title: null, body, foot, onClose: finish });
  function finish() { if (!DB.settings().onboarded) DB.setSettings({ onboarded: true }); }

  function draw() {
    const s = SLIDES[idx];
    body.querySelector('#onb-icon').innerHTML = icon(s.icon);
    body.querySelector('#onb-title').textContent = s.title;
    body.querySelector('#onb-text').textContent = s.text;
    body.querySelectorAll('#onb-dots span').forEach((d, i) => d.classList.toggle('on', i === idx));
    next.textContent = idx === SLIDES.length - 1 ? 'Let’s go' : 'Next';
    skip.style.visibility = idx === SLIDES.length - 1 ? 'hidden' : 'visible';
  }
  next.addEventListener('click', () => {
    if (idx < SLIDES.length - 1) { idx++; draw(); }
    else { finish(); m.close(); }
  });
  skip.addEventListener('click', () => { finish(); m.close(); });
  draw();
}
if (typeof module === 'object' && module.exports) module.exports = { showOnboarding };
