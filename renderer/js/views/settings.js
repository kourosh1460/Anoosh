'use strict';
/* Settings — appearance, colors, calendar, timer, data. */

window.Views = window.Views || {};

Views.settings = {
  id: 'settings', title: 'Settings', icon: 'settings',

  mount(container) {
    const s = () => DB.settings();

    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title">Settings</div><div class="view-sub">Make Anoosh yours</div></div>
        </div>
        <div class="view-body"><div class="settings-scroll">

          <div class="card">
            <div class="card-title">${icon('palette')} Appearance</div>
            <div class="set-row" style="flex-direction:column;align-items:stretch;gap:10px">
              <div class="set-label"><div class="sl-title">Theme</div><div class="sl-sub">Toranj comes in two variations — pick the blue or orange dot on its card</div></div>
              <div class="theme-grid" id="st-theme"></div>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Accent color</div><div class="sl-sub">Used across buttons, highlights and the ambient glow</div></div>
              <div id="st-accent"></div>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Reduce visual effects</div><div class="sl-sub">Disables blur for extra performance on older machines</div></div>
              <button class="toggle" id="st-fx"></button>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Reduce motion</div><div class="sl-sub">Stops the ambient background animation</div></div>
              <button class="toggle" id="st-motion"></button>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Your name</div><div class="sl-sub">For the dashboard greeting</div></div>
              <input class="input" id="st-name" style="width:180px" placeholder="Optional">
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('note')} Notes</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Default header color</div><div class="sl-sub">New notes start with this color — each note can override it</div></div>
              <div id="st-notecolor"></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('calendar')} Calendar</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Primary calendar</div><div class="sl-sub">Which system the month grid follows</div></div>
              <div class="seg" id="st-cal">
                <button data-c="gregorian">${icon('globe')} Gregorian</button>
                <button data-c="hijri">${icon('moonStar')} Lunar</button>
                <button data-c="jalali">${icon('sun')} Solar</button>
              </div>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Week starts on</div></div>
              <div class="seg" id="st-dow">
                <button data-d="6">Sat</button><button data-d="0">Sun</button><button data-d="1">Mon</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('timer')} Timer</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Focus length</div><div class="sl-sub">Minutes per pomodoro round</div></div>
              <input type="number" class="input set-num" id="st-work" min="5" max="120">
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Short break</div></div>
              <input type="number" class="input set-num" id="st-short" min="1" max="60">
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Long break</div></div>
              <input type="number" class="input set-num" id="st-long" min="5" max="90">
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Rounds before long break</div></div>
              <input type="number" class="input set-num" id="st-rounds" min="2" max="10">
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Completion sound</div></div>
              <button class="toggle" id="st-sound"></button>
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('repeat')} Sync with your phone</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Wi-Fi sync</div>
                <div class="sl-sub">Phone and PC on the same Wi-Fi: start here, then open Sync on your phone and enter the address + code. New items on either device are merged into both.</div></div>
              <button class="btn primary" id="sy-toggle">${icon('repeat')} Start sync</button>
            </div>
            <div id="sy-panel" class="hidden" style="padding:4px 0 10px">
              <div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap;padding:14px 16px;border-radius:12px;background:color-mix(in srgb, var(--accent) 9%, transparent);border:1px solid color-mix(in srgb, var(--accent) 25%, transparent)">
                <div><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-faint)">Address</div>
                  <div id="sy-addr" style="font-size:19px;font-weight:650;font-variant-numeric:tabular-nums;user-select:text"></div></div>
                <div><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-faint)">Code</div>
                  <div id="sy-code" style="font-size:26px;font-weight:700;letter-spacing:6px;color:var(--accent);font-variant-numeric:tabular-nums"></div></div>
              </div>
              <div id="sy-log" style="margin-top:10px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-dim);max-height:120px;overflow-y:auto"></div>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Merge from file</div>
                <div class="sl-sub">No Wi-Fi? Export below, copy the file to the other device (USB cable, drive, anything), then merge it here — nothing gets overwritten, only combined.</div></div>
              <button class="btn" id="sy-merge">${icon('upload')} Import &amp; merge</button>
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('home')} Dashboard modules</div>
            <div class="set-row" style="border:none;padding-bottom:2px">
              <div class="set-label"><div class="sl-sub">Optional sections for the Today page. All off by default — flip one on and it appears immediately.</div></div>
            </div>
            <div id="st-modules"></div>
          </div>

          <div class="card">
            <div class="card-title">${icon('settings')} Security</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">App lock</div>
                <div class="sl-sub" id="st-lockstate">Ask for a PIN when Anoosh opens. You choose the PIN — there is no default.</div></div>
              <span id="st-lockbtns" style="display:flex;gap:8px"></span>
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('monitor')} System</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Launch at startup</div><div class="sl-sub">Open Anoosh automatically when Windows starts</div></div>
              <button class="toggle" id="st-autolaunch"></button>
            </div>
          </div>

          <div class="card">
            <div class="card-title">${icon('save')} Data</div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Storage</div><div class="sl-sub" id="st-path" style="word-break:break-all">…</div></div>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Backup</div><div class="sl-sub">Everything lives offline in one JSON file</div></div>
              <button class="btn" id="st-export">${icon('download')} Export</button>
              <button class="btn" id="st-import">${icon('upload')} Import</button>
            </div>
            <div class="set-row">
              <div class="set-label"><div class="sl-title">Welcome tour</div><div class="sl-sub">Replay the short first-launch introduction</div></div>
              <button class="btn sm" id="st-tour">${icon('sparkle')} Show tour</button>
            </div>
          </div>

          <div class="muted" style="text-align:center;font-size:11.5px;padding:6px 0 14px" id="st-about"></div>
        </div></div>
      </div>`;

    /* wire appearance */
    function syncSeg(seg, attr, value) {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset[attr] === String(value)));
    }

    // Theme gallery. Picking Toranj/Blossoms also adopts their signature accent.
    const THEME_DEFS = [
      { key: 'dark', name: 'Dark', bg: '#0d0e1a', bar: '#222339', text: '#eceafb', dots: ['#7c5cff', '#3ec6ff'] },
      { key: 'light', name: 'Light', bg: '#eef0fa', bar: '#ffffff', text: '#23233c', dots: ['#7c5cff', '#3ec6ff'] },
      { key: 'onyx', name: 'Onyx', bg: '#060607', bar: '#18181d', text: '#f0f0f4', dots: ['#8a8f9e', '#3a3a42'] },
      {
        key: 'toranj', name: 'Toranj', bg: '#ece2cf', bar: '#faf3e3', text: '#33291d', dots: ['#5c7f4c', '#6f4f2a'],
        variants: [{ theme: 'toranj', color: '#2f6b75' }, { theme: 'toranj-warm', color: '#c1652a' }]
      },
      {
        key: 'blossoms', name: 'Blossoms', bg: '#171021', bar: '#251532', text: '#f6ecf6', dots: ['#ff77b6', '#a78bfa'],
        variants: [{ theme: 'blossoms', color: '#ff77b6' }, { theme: 'blossoms-light', color: '#f7d6e8' }]
      },
      { key: 'system', name: 'System', bg: 'linear-gradient(100deg, #0d0e1a 50%, #eef0fa 50%)', bar: 'rgba(128,128,150,.5)', text: '#9c9ab4', dots: ['#7c5cff'] }
    ];
    const themeGrid = container.querySelector('#st-theme');
    function activeThemeKey() {
      const t = s().theme;
      return t && t.startsWith('toranj') ? 'toranj' : t && t.startsWith('blossoms') ? 'blossoms' : t;
    }
    function drawThemeGrid() {
      themeGrid.innerHTML = '';
      for (const def of THEME_DEFS) {
        const card = el(`<div class="theme-card ${activeThemeKey() === def.key ? 'active' : ''}"
            style="--tc-bg:${def.bg.startsWith('linear') ? 'transparent' : def.bg};--tc-text:${def.text};${def.bg.startsWith('linear') ? `background:${def.bg}` : ''}">
          ${def.variants ? `<div class="tc-variants">${def.variants.map(v =>
            `<span class="tc-variant ${s().theme === v.theme ? 'on' : ''}" data-vt="${v.theme}" data-va="${v.color}" style="background:${v.color}" title="${v.theme}"></span>`).join('')}</div>` : ''}
          <div class="tc-strip">${def.dots.map(d => `<span class="tc-dot" style="background:${d}"></span>`).join('')}<span class="tc-bar" style="background:${def.bar}"></span></div>
          <div class="tc-name">${def.name}</div>
        </div>`);
        card.addEventListener('click', (e) => {
          const variant = e.target.closest('.tc-variant');
          if (variant) {
            DB.setSettings({ theme: variant.dataset.vt, accent: variant.dataset.va });
          } else if (def.variants) {
            const current = s().theme.startsWith(def.key) ? s().theme : def.variants[0].theme;
            const v = def.variants.find(x => x.theme === current) || def.variants[0];
            DB.setSettings({ theme: v.theme, accent: v.color });
          } else {
            const patch = { theme: def.key };
            if (def.accent) patch.accent = def.accent;
            DB.setSettings(patch);
          }
          drawThemeGrid();
        });
        themeGrid.appendChild(card);
      }
    }
    drawThemeGrid();

    container.querySelector('#st-accent').appendChild(
      swatchRow(s().accent, (c) => DB.setSettings({ accent: c })));

    const fxT = container.querySelector('#st-fx');
    fxT.classList.toggle('on', !!s().reduceEffects);
    fxT.addEventListener('click', () => {
      DB.setSettings({ reduceEffects: !s().reduceEffects });
      fxT.classList.toggle('on', !!s().reduceEffects);
    });
    const moT = container.querySelector('#st-motion');
    moT.classList.toggle('on', !!s().reduceMotion);
    moT.addEventListener('click', () => {
      DB.setSettings({ reduceMotion: !s().reduceMotion });
      moT.classList.toggle('on', !!s().reduceMotion);
    });

    const nameIn = container.querySelector('#st-name');
    nameIn.value = s().userName || '';
    nameIn.addEventListener('change', () => DB.setSettings({ userName: nameIn.value.trim() }));

    container.querySelector('#st-notecolor').appendChild(
      swatchRow(s().noteDefaultColor, (c) => DB.setSettings({ noteDefaultColor: c })));

    const calSeg = container.querySelector('#st-cal');
    syncSeg(calSeg, 'c', s().calendarPrimary);
    calSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      DB.setSettings({ calendarPrimary: b.dataset.c });
      syncSeg(calSeg, 'c', b.dataset.c);
    });
    const dowSeg = container.querySelector('#st-dow');
    syncSeg(dowSeg, 'd', s().firstDayOfWeek);
    dowSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      DB.setSettings({ firstDayOfWeek: Number(b.dataset.d) });
      syncSeg(dowSeg, 'd', b.dataset.d);
    });

    /* timer numbers */
    const pomo = () => Object.assign({}, s().pomodoro);
    const bind = (id, key) => {
      const input = container.querySelector(id);
      input.value = pomo()[key];
      input.addEventListener('change', () => {
        const p = pomo();
        p[key] = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) || p[key]));
        input.value = p[key];
        DB.setSettings({ pomodoro: p });
      });
    };
    bind('#st-work', 'work'); bind('#st-short', 'short'); bind('#st-long', 'long'); bind('#st-rounds', 'rounds');

    const soundT = container.querySelector('#st-sound');
    soundT.classList.toggle('on', !!s().timerSound);
    soundT.addEventListener('click', () => {
      DB.setSettings({ timerSound: !s().timerSound });
      soundT.classList.toggle('on', !!s().timerSound);
    });

    /* sync */
    const syToggle = container.querySelector('#sy-toggle');
    const syPanel = container.querySelector('#sy-panel');
    const syLog = container.querySelector('#sy-log');
    let syncRunning = false;

    function paintSync(status) {
      syncRunning = !!(status && status.running);
      syToggle.innerHTML = syncRunning ? `${icon('stop')} Stop sync` : `${icon('repeat')} Start sync`;
      syToggle.classList.toggle('primary', !syncRunning);
      syPanel.classList.toggle('hidden', !syncRunning);
      if (syncRunning) {
        const addr = status.addresses && status.addresses.length
          ? `${status.addresses[0]}:${status.port}` : `port ${status.port}`;
        container.querySelector('#sy-addr').textContent = addr;
        container.querySelector('#sy-code').textContent = status.code || '';
      }
    }
    function logSync(msg) {
      const line = el(`<div>· ${esc(msg)}</div>`);
      syLog.prepend(line);
      while (syLog.children.length > 12) syLog.lastChild.remove();
    }
    syToggle.addEventListener('click', async () => {
      const status = syncRunning ? await window.aurora.syncStop() : await window.aurora.syncStart();
      if (status.error) { toast(status.error, { icon: 'x' }); return; }
      paintSync(status);
      if (status.running) logSync('Waiting for your phone… open Anoosh → Sync on the phone and enter the address and code.');
    });
    window.aurora.syncStatus().then(paintSync);
    const unsubSync = window.aurora.onSyncActivity(({ msg }) => {
      logSync(msg);
      if (/Synced with/.test(msg)) toast(msg, { icon: 'repeat' });
    });

    container.querySelector('#sy-merge').addEventListener('click', async () => {
      const res = await window.aurora.importMerge();
      if (res.ok) {
        const stats = res.stats || {};
        toast(`Merged — ${stats.added || 0} added, ${stats.updated || 0} updated, ${stats.removed || 0} removed`, { icon: 'checkCircle', duration: 4200 });
      } else if (res.error) toast(res.error, { icon: 'x' });
    });

    /* dashboard modules */
    const modsEl = container.querySelector('#st-modules');
    for (const m of DashModules.list()) {
      const row = el(`<div class="set-row">
        <div class="set-label"><div class="sl-title"><span class="sl-ic">${icon(m.icon)}</span> ${esc(m.title)}</div>
          <div class="sl-sub">${esc(m.desc)}</div></div>
        <button class="toggle ${DashModules.isEnabled(m.id) ? 'on' : ''}"></button>
      </div>`);
      row.querySelector('.toggle').addEventListener('click', (e) => {
        const on = !DashModules.isEnabled(m.id);
        DashModules.setEnabled(m.id, on);
        e.currentTarget.classList.toggle('on', on);
        toast(on ? `${m.title} added to Today` : `${m.title} removed`, { icon: m.icon });
      });
      modsEl.appendChild(row);
    }

    /* app lock */
    function pinPrompt(title, cb) {
      const body = el(`<div class="field"><label>${esc(title)}</label>
        <input class="input" type="password" inputmode="numeric" maxlength="10" placeholder="4–10 digits" id="pl-pin"></div>`);
      const foot = el(`<div></div>`);
      const ok = el(`<button class="btn primary">Confirm</button>`);
      foot.appendChild(ok);
      const m = openModal({ title: 'App lock', body, foot });
      const submit = () => { const v = body.querySelector('#pl-pin').value; m.close(); cb(v); };
      ok.addEventListener('click', submit);
      body.querySelector('#pl-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      setTimeout(() => body.querySelector('#pl-pin').focus(), 60);
    }
    function drawLock() {
      const rec = s().appLock;
      const btns = container.querySelector('#st-lockbtns');
      container.querySelector('#st-lockstate').textContent = rec
        ? 'Lock is on — Anoosh asks for your PIN at startup.'
        : 'Ask for a PIN when Anoosh opens. You choose the PIN — there is no default.';
      btns.innerHTML = '';
      if (!rec) {
        const set = el(`<button class="btn primary sm">Set PIN</button>`);
        set.addEventListener('click', () => pinPrompt('Choose a PIN', async (pin) => {
          try {
            DB.setSettings({ appLock: await Lock.create(pin) });
            toast('App lock enabled', { icon: 'checkCircle' });
            drawLock();
          } catch (e) { toast(e.message, { icon: 'x' }); }
        }));
        btns.appendChild(set);
      } else {
        const change = el(`<button class="btn sm">Change</button>`);
        const remove = el(`<button class="btn sm danger">Remove</button>`);
        const requirePin = (then) => pinPrompt('Current PIN', async (pin) => {
          if (await Lock.verify(pin, rec)) then();
          else toast('Wrong PIN', { icon: 'x' });
        });
        change.addEventListener('click', () => requirePin(() =>
          pinPrompt('New PIN', async (pin) => {
            try {
              DB.setSettings({ appLock: await Lock.create(pin) });
              toast('PIN changed', { icon: 'checkCircle' });
            } catch (e) { toast(e.message, { icon: 'x' }); }
          })));
        remove.addEventListener('click', () => requirePin(() => {
          DB.setSettings({ appLock: null });
          toast('App lock removed', { icon: 'checkCircle' });
          drawLock();
        }));
        btns.append(change, remove);
      }
    }
    drawLock();

    /* system */
    const autoT = container.querySelector('#st-autolaunch');
    autoT.classList.toggle('on', s().autoLaunch !== false);
    autoT.addEventListener('click', () => {
      const enabled = !(s().autoLaunch !== false);
      DB.setSettings({ autoLaunch: enabled });
      window.aurora.setAutoLaunch(enabled);
      autoT.classList.toggle('on', enabled);
      toast(enabled ? 'Anoosh will open when Windows starts' : 'Startup launch disabled', { icon: 'monitor' });
    });

    /* data */
    window.aurora.appInfo().then(info => {
      container.querySelector('#st-path').textContent = info.dataFile;
      container.querySelector('#st-about').textContent = `Anoosh ${info.version} — offline productivity for Windows`;
    });
    container.querySelector('#st-tour').addEventListener('click', () => showOnboarding(true));
    container.querySelector('#st-export').addEventListener('click', async () => {
      const res = await window.aurora.exportData();
      if (res.ok) toast('Backup exported', { icon: 'download' });
    });
    container.querySelector('#st-import').addEventListener('click', async () => {
      if (!await confirmDialog('Importing replaces ALL current data with the backup file. Continue?', { okText: 'Import' })) return;
      const res = await window.aurora.importData();
      if (res.ok) toast('Data imported', { icon: 'upload' });
      else if (res.error) toast(res.error, { icon: 'x' });
    });

    return { destroy() { unsubSync(); } };
  }
};
