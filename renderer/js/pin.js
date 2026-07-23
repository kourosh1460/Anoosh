'use strict';
/**
 * Pinned note window — a small always-on-top note that stays visible over
 * every other application. Content is editable and live-syncs with the main
 * window in both directions.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const noteId = params.get('id');

  const titleEl = document.getElementById('pin-title');
  const contentEl = document.getElementById('pin-content');
  const savedEl = document.getElementById('pin-saved');
  const wrap = document.getElementById('pin-wrap');

  document.getElementById('pin-open').innerHTML = icon('external');
  document.getElementById('pin-unpin').innerHTML = icon('x');

  let note = null;
  let saveTimer = null;

  function applyTheme(settings) {
    const KNOWN = ['dark', 'light', 'onyx', 'toranj', 'toranj-warm', 'blossoms', 'blossoms-light'];
    const theme = settings.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (KNOWN.includes(settings.theme) ? settings.theme : 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--accent', settings.accent || '#7c5cff');
  }

  function render() {
    if (!note) return;
    titleEl.innerHTML = `${icon('pin')}<span>${escapeHtml(note.title || 'Untitled note')}</span>`;
    wrap.style.setProperty('--nh', note.headerColor || '#7c5cff');
    document.getElementById('pin-content').setAttribute('dir', note.dir || 'auto');
    if (document.activeElement !== contentEl) {
      contentEl.innerHTML = note.content || '';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function save() {
    if (!note) return;
    note.content = contentEl.innerHTML;
    note.updatedAt = new Date().toISOString();
    window.aurora.upsert('notes', JSON.parse(JSON.stringify(note)));
    savedEl.textContent = 'Synced';
  }

  contentEl.addEventListener('input', () => {
    savedEl.textContent = 'Editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  });
  contentEl.addEventListener('blur', () => { clearTimeout(saveTimer); save(); });

  // Plain-text paste keeps pinned notes predictable.
  contentEl.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  // Checklist toggling works here too.
  contentEl.addEventListener('click', (e) => {
    const li = e.target.closest('ul.checklist > li');
    if (!li) return;
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left <= 20) {
      if (li.hasAttribute('data-checked')) li.removeAttribute('data-checked');
      else li.setAttribute('data-checked', 'true');
      savedEl.textContent = 'Editing…';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    }
  });

  document.getElementById('pin-open').addEventListener('click', () => {
    window.aurora.focusApp({ noteId });
  });
  document.getElementById('pin-unpin').addEventListener('click', () => {
    window.aurora.unpinNote(noteId);
  });
  document.getElementById('pin-opacity').addEventListener('input', (e) => {
    window.aurora.setPinOpacity(noteId, Number(e.target.value) / 100);
  });

  // Live updates from the main window.
  window.aurora.onDbChanged(({ collection, item }) => {
    if (collection === 'notes' && item.id === noteId) {
      note = item;
      render();
    }
  });
  window.aurora.onDbRemoved(({ collection, id }) => {
    if (collection === 'notes' && id === noteId) window.close();
  });
  window.aurora.onSettingsChanged((s) => applyTheme(s));

  (async function boot() {
    const snapshot = await window.aurora.getAll();
    applyTheme(Object.assign({ theme: 'dark', accent: '#7c5cff' }, snapshot.settings || {}));
    note = (snapshot.notes || []).find(n => n.id === noteId);
    if (!note) { window.close(); return; }
    render();
  })();
})();
