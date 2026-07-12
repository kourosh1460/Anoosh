'use strict';
/* Notes tab — folder grid → note list → full-screen editor. */
window.MViews = window.MViews || {};

function openFolderSheet(folderId, onDone) {
  const isNew = !folderId;
  const folder = isNew ? DB.newFolder() : JSON.parse(JSON.stringify(DB.get('folders', folderId)));
  if (!folder) return;
  const body = el(`<div>
    <div class="field"><label>Folder name</label>
      <input class="input" id="fm-name" placeholder="e.g. Work, Journal…" value="${esc(folder.name)}"></div>
    <div class="field"><label>Color</label><div id="fm-color"></div></div>
    <div class="set-row" style="border:none;padding:4px 0">
      <div class="set-label"><div class="sl-title">Pinned</div><div class="sl-sub">Stays at the front of the grid</div></div>
      <button class="toggle ${folder.pinned ? 'on' : ''}" id="fm-pin"></button>
    </div>
  </div>`);
  body.querySelector('#fm-color').appendChild(swatchRow(folder.color, (c) => { folder.color = c; }));
  body.querySelector('#fm-pin').addEventListener('click', (e) => {
    folder.pinned = !folder.pinned;
    e.currentTarget.classList.toggle('on', folder.pinned);
  });
  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const save = el(`<button class="btn primary" style="flex:1">${isNew ? 'Create folder' : 'Save'}</button>`);
  foot.append(save);
  const m = openModal({ title: isNew ? 'New folder' : 'Edit folder', body, foot });
  save.addEventListener('click', () => {
    folder.name = body.querySelector('#fm-name').value.trim() || 'Untitled folder';
    DB.upsert('folders', folder);
    m.close();
    onDone && onDone(folder);
  });
}

/** Full-screen note editor as a pushed subpage. */
function openNoteEditor(noteId) {
  const note = DB.get('notes', noteId);
  if (!note) return;

  const page = App.pushRaw();
  page.innerHTML = `
    <div class="ne-header" id="ne-header">
      <div class="ne-toprow">
        <button class="iconbtn" id="ne-back">${icon('chevL')}</button>
        <input class="ne-title" id="ne-title" placeholder="Untitled note" value="${esc(note.title || '')}">
        <button class="iconbtn" id="ne-color">${icon('palette')}</button>
        <button class="iconbtn" id="ne-fav">${icon(note.favorite ? 'starFill' : 'star')}</button>
        <button class="iconbtn" id="ne-more">${icon('dots')}</button>
      </div>
      <div class="ne-meta"><span id="ne-updated"></span><span>·</span><span id="ne-words"></span></div>
      <div class="ne-linkchips" id="ne-links"></div>
    </div>
    <div class="ne-toolbar" id="ne-toolbar">
      <button class="tbtn" data-cmd="bold">${icon('bold')}</button>
      <button class="tbtn" data-cmd="italic">${icon('italic')}</button>
      <button class="tbtn" data-cmd="underline">${icon('underline')}</button>
      <button class="tbtn" data-cmd="strikeThrough">${icon('strike')}</button>
      <span class="tsep"></span>
      <button class="tbtn" data-block="h1">${icon('h1')}</button>
      <button class="tbtn" data-block="h2">${icon('h2')}</button>
      <span class="tsep"></span>
      <button class="tbtn" data-cmd="insertUnorderedList">${icon('listUl')}</button>
      <button class="tbtn" data-cmd="insertOrderedList">${icon('listOl')}</button>
      <button class="tbtn" id="tb-check">${icon('checklist')}</button>
      <span class="tsep"></span>
      <button class="tbtn" data-block="blockquote">${icon('quote')}</button>
      <button class="tbtn" id="tb-mark">${icon('highlight')}</button>
      <button class="tbtn" id="tb-img">${icon('image')}</button>
      <input type="file" id="tb-imgfile" accept="image/*" hidden>
    </div>
    <div class="ne-body" id="ne-body" contenteditable="true"
         data-placeholder="Start writing… paste or insert images too."></div>`;

  const headerEl = page.querySelector('#ne-header');
  const titleEl = page.querySelector('#ne-title');
  const bodyEl = page.querySelector('#ne-body');
  const linksEl = page.querySelector('#ne-links');
  bodyEl.innerHTML = sanitizeHtml(note.content || '');
  bodyEl.classList.toggle('is-empty', !bodyEl.textContent.trim() && !bodyEl.querySelector('li,img'));

  function refreshMeta() {
    page.querySelector('#ne-updated').textContent = `Edited ${Fmt.relTime(note.updatedAt)}`;
    const words = DB.textOfHtml(note.content).trim().split(/\s+/).filter(Boolean).length;
    page.querySelector('#ne-words').textContent = `${words} word${words === 1 ? '' : 's'}`;
  }
  function refreshHeader() {
    headerEl.style.setProperty('--nh', note.headerColor || '#7c5cff');
    page.querySelector('#ne-fav').innerHTML = icon(note.favorite ? 'starFill' : 'star');
    renderLinkChips(linksEl, { type: 'note', id: note.id });
    refreshMeta();
  }
  refreshHeader();

  const saveDebounced = debounce(saveNow, 600);
  function saveNow() {
    const t = titleEl.value, c = bodyEl.innerHTML;
    if (note.title === t && note.content === c) return;
    note.title = t; note.content = c;
    DB.upsert('notes', note);
    refreshMeta();
  }
  titleEl.addEventListener('input', saveDebounced);
  bodyEl.addEventListener('input', () => {
    bodyEl.classList.toggle('is-empty', !bodyEl.textContent.trim() && !bodyEl.querySelector('li,img'));
    saveDebounced();
  });

  /* images */
  async function insertImages(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const f of imgs.slice(0, 4)) {
      try {
        const dataUrl = await imageToDataUrl(f, 1200);
        bodyEl.focus();
        document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt=""><p></p>`);
      } catch (e) { toast('Could not read that image', { icon: 'x' }); }
    }
    saveDebounced();
  }
  page.querySelector('#tb-img').addEventListener('click', () => page.querySelector('#tb-imgfile').click());
  page.querySelector('#tb-imgfile').addEventListener('change', (e) => { insertImages(e.target.files); e.target.value = ''; });
  bodyEl.addEventListener('paste', (e) => {
    const items = Array.from(e.clipboardData.items || []);
    const img = items.find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); insertImages([img.getAsFile()]); return; }
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
    else document.execCommand('insertText', false, text);
  });

  /* toolbar */
  function nearest(node, sel) {
    let n = node && node.nodeType === 3 ? node.parentElement : node;
    while (n && n !== bodyEl) { if (n.matches && n.matches(sel)) return n; n = n.parentElement; }
    return null;
  }
  page.querySelector('#ne-toolbar').addEventListener('mousedown', (e) => {
    if (!e.target.closest('#tb-imgfile')) e.preventDefault();
  });
  page.querySelector('#ne-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tbtn'); if (!btn || btn.id === 'tb-img') return;
    bodyEl.focus();
    if (btn.dataset.cmd) document.execCommand(btn.dataset.cmd, false, null);
    else if (btn.dataset.block) {
      const cur = document.queryCommandValue('formatBlock').toLowerCase();
      document.execCommand('formatBlock', false, cur === btn.dataset.block ? 'p' : `<${btn.dataset.block}>`);
    } else if (btn.id === 'tb-check') {
      let ul = nearest(window.getSelection().anchorNode, 'ul, ol');
      if (ul && ul.classList.contains('checklist')) {
        ul.classList.remove('checklist');
        ul.querySelectorAll('li[data-checked]').forEach(li => li.removeAttribute('data-checked'));
      } else {
        if (!ul || ul.tagName === 'OL') document.execCommand('insertUnorderedList', false, null);
        ul = nearest(window.getSelection().anchorNode, 'ul');
        if (ul) ul.classList.add('checklist');
      }
    } else if (btn.id === 'tb-mark') {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const existing = nearest(sel.anchorNode, 'mark');
      if (existing) {
        const parent = existing.parentNode;
        while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
        existing.remove();
      } else {
        const range = sel.getRangeAt(0);
        const mark = document.createElement('mark');
        try { range.surroundContents(mark); }
        catch (err) { mark.appendChild(range.extractContents()); range.insertNode(mark); }
        sel.removeAllRanges();
      }
    }
    saveDebounced();
  });

  /* checklist toggle + image select */
  bodyEl.addEventListener('click', (e) => {
    bodyEl.querySelectorAll('img.img-selected').forEach(i => i.classList.remove('img-selected'));
    if (e.target.tagName === 'IMG') {
      e.target.classList.add('img-selected');
      const range = document.createRange();
      range.selectNode(e.target);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      return;
    }
    const li = e.target.closest('ul.checklist > li');
    if (li && bodyEl.contains(li)) {
      const rect = li.getBoundingClientRect();
      if (e.clientX - rect.left <= 30) {
        if (li.hasAttribute('data-checked')) li.removeAttribute('data-checked');
        else li.setAttribute('data-checked', 'true');
        Platform.haptic();
        saveDebounced();
      }
    }
  });

  /* header actions */
  page.querySelector('#ne-back').addEventListener('click', () => { saveNow(); App.pop(); });
  page.querySelector('#ne-color').addEventListener('click', (e) => {
    const wrap = el(`<div style="padding:8px 10px"></div>`);
    wrap.appendChild(swatchRow(note.headerColor, (c) => {
      note.headerColor = c;
      DB.upsert('notes', note);
      refreshHeader();
    }));
    openPopover(e.currentTarget, wrap);
  });
  page.querySelector('#ne-fav').addEventListener('click', () => {
    note.favorite = !note.favorite;
    DB.upsert('notes', note);
    refreshHeader();
  });
  page.querySelector('#ne-more').addEventListener('click', (e) => {
    const folders = [...DB.all('folders')].sort((a, b) => (b.pinned - a.pinned));
    menu(e.currentTarget, [
      {
        icon: 'folder', label: 'Move to folder…',
        onClick: () => setTimeout(() => {
          const wrap = el(`<div></div>`);
          const opts = [{ id: null, name: 'All notes (no folder)', color: DB.settings().accent }, ...folders];
          for (const f of opts) {
            const cur = (note.folderId || null) === f.id;
            const item = el(`<button class="menu-item">${icon(f.id ? 'folder' : 'inbox')}
              <span style="flex:1">${esc(f.name)}</span>${cur ? icon('check') : ''}</button>`);
            item.querySelector('svg').style.color = f.color || 'var(--accent)';
            item.addEventListener('click', () => {
              pop.close();
              note.folderId = f.id;
              DB.upsert('notes', note);
              toast(`Moved to ${f.name}`, { icon: 'folder' });
            });
            wrap.appendChild(item);
          }
          const pop = openPopover(e.target, wrap);
        }, 10)
      },
      { icon: 'link', label: 'Link to…', onClick: () => openLinkPicker({ type: 'note', id: note.id }) },
      {
        icon: 'tasks', label: 'New linked task',
        onClick: () => {
          const t = DB.newTask({ title: (note.title || 'Untitled').slice(0, 120) });
          DB.upsert('tasks', t);
          DB.link({ type: 'note', id: note.id }, { type: 'task', id: t.id });
          toast('Linked task created', { icon: 'tasks' });
        }
      },
      '-',
      {
        icon: 'trash', label: 'Delete note', danger: true,
        onClick: async () => {
          if (await confirmDialog(`Delete “${note.title || 'Untitled'}”?`)) {
            DB.remove('notes', note.id);
            App.pop();
            toast('Note deleted', { icon: 'trash' });
          }
        }
      }
    ]);
  });

  const unsub = DB.subscribe((ch) => {
    if (ch.collection === 'notes' && ch.kind === 'remove' && ch.id === note.id) App.pop();
    else if (ch.collection !== 'notes') renderLinkChips(linksEl, { type: 'note', id: note.id });
  });
  page.onDestroy = () => { saveDebounced.cancel(); saveNow(); unsub(); };
}

MViews.notes = {
  id: 'notes', title: 'Notes', icon: 'note',
  mount(container) {
    let mode = 'folders';
    let folderId = null;
    let query = '';
    let selectMode = false;
    const selected = new Set();

    container.innerHTML = `
      <div class="page">
        <div class="page-title" id="nt-heading">Notes</div>
        <div class="page-sub" id="nt-sub"></div>
        <div id="nt-listhead" class="hidden" style="display:flex;gap:8px;margin-bottom:11px;align-items:center">
          <button class="btn sm icon" id="nt-back">${icon('chevL')}</button>
          <input class="input sm" id="nt-search" placeholder="Search notes…" style="flex:1">
        </div>
        <div id="nt-selbar" class="select-bar hidden">
          <button class="iconbtn" id="sel-cancel" title="Cancel">${icon('x')}</button>
          <span class="sb-count" id="sel-count"></span>
          <button class="iconbtn" id="sel-fav" title="Favorite">${icon('star')}</button>
          <button class="iconbtn" id="sel-move" title="Move to folder">${icon('folder')}</button>
          <button class="iconbtn danger" id="sel-del" title="Delete">${icon('trash')}</button>
        </div>
        <div class="folder-grid" id="nt-folders"></div>
        <div id="nt-cards" class="hidden"></div>
      </div>`;

    const foldersEl = container.querySelector('#nt-folders');
    const cardsEl = container.querySelector('#nt-cards');
    const notesIn = (fid) => DB.all('notes').filter(n => fid === null ? true : (n.folderId || null) === fid);
    const sortedFolders = () => [...DB.all('folders')].sort((a, b) =>
      (b.pinned - a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    function drawFolders() {
      const folders = sortedFolders();
      const allNotes = DB.all('notes');
      container.querySelector('#nt-heading').textContent = 'Notes';
      container.querySelector('#nt-sub').textContent =
        `${folders.length} folder${folders.length === 1 ? '' : 's'} · ${allNotes.length} note${allNotes.length === 1 ? '' : 's'}`;
      foldersEl.innerHTML = '';

      const recent = [...allNotes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      const allCard = el(`<div class="folder-card" style="--nf:${esc(DB.settings().accent || '#7c5cff')}">
        <div class="fc-top"><div class="fc-icon">${icon('inbox')}</div><div class="fc-name">All notes</div></div>
        <div class="fc-preview">${recent.slice(0, 2).map(n => `<div class="fc-line">${esc(n.title || 'Untitled')}</div>`).join('')}</div>
        <div class="fc-count">${allNotes.length} note${allNotes.length === 1 ? '' : 's'}</div>
      </div>`);
      allCard.addEventListener('click', () => enterFolder(null));
      foldersEl.appendChild(allCard);

      for (const f of folders) {
        const notes = notesIn(f.id).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        const card = el(`<div class="folder-card" data-id="${f.id}" style="--nf:${esc(f.color || '#7c5cff')}">
          <div class="fc-top"><div class="fc-icon">${icon('folder')}</div>
            <div class="fc-name">${esc(f.name || 'Untitled')}</div>
            ${f.pinned ? `<span class="fc-pin">${icon('pin')}</span>` : ''}</div>
          <div class="fc-preview">${notes.slice(0, 2).map(n => `<div class="fc-line">${esc(n.title || 'Untitled')}</div>`).join('') || '<div class="fc-line">Empty</div>'}</div>
          <div class="fc-count">${notes.length} note${notes.length === 1 ? '' : 's'}</div>
        </div>`);
        let pressTimer = null;
        card.addEventListener('touchstart', () => {
          pressTimer = setTimeout(() => { pressTimer = null; folderMenu(f); }, 550);
        }, { passive: true });
        card.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); } });
        card.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
        card.addEventListener('click', () => enterFolder(f.id));
        foldersEl.appendChild(card);
      }
      const newCard = el(`<div class="folder-card fc-new">${icon('folderPlus')}<span class="fc-newlabel">New folder</span></div>`);
      newCard.addEventListener('click', () => openFolderSheet(null, (f) => enterFolder(f.id)));
      foldersEl.appendChild(newCard);
    }

    function folderMenu(f) {
      Platform.haptic('medium');
      const wrap = el(`<div>
        <button class="menu-item" data-a="edit">${icon('edit')}<span>Rename &amp; color</span></button>
        <button class="menu-item" data-a="pin">${icon('pin')}<span>${f.pinned ? 'Unpin' : 'Pin to front'}</span></button>
        <div class="menu-sep"></div>
        <button class="menu-item danger" data-a="del">${icon('trash')}<span>Delete folder</span></button>
      </div>`);
      const foot = el(`<div></div>`);
      const m = openModal({ title: f.name || 'Folder', body: wrap, foot });
      wrap.addEventListener('click', async (e) => {
        const a = e.target.closest('.menu-item'); if (!a) return;
        m.close();
        if (a.dataset.a === 'edit') openFolderSheet(f.id);
        else if (a.dataset.a === 'pin') { f.pinned = !f.pinned; DB.upsert('folders', f); }
        else if (a.dataset.a === 'del') {
          const count = notesIn(f.id).length;
          if (await confirmDialog(count ? `Delete “${f.name}”? Its ${count} notes move to All notes.` : `Delete “${f.name}”?`)) {
            DB.removeFolder(f.id);
            toast('Folder deleted', { icon: 'trash' });
          }
        }
      });
    }

    function enterFolder(fid) {
      mode = 'browser';
      folderId = fid;
      query = '';
      selectMode = false;
      selected.clear();
      container.querySelector('#nt-selbar').classList.add('hidden');
      container.querySelector('#nt-search').value = '';
      foldersEl.classList.add('hidden');
      cardsEl.classList.remove('hidden');
      container.querySelector('#nt-listhead').classList.remove('hidden');
      const f = fid ? DB.get('folders', fid) : null;
      container.querySelector('#nt-heading').textContent = f ? f.name : 'All notes';
      drawList();
    }
    function showFolders() {
      mode = 'folders';
      folderId = null;
      selectMode = false;
      selected.clear();
      container.querySelector('#nt-selbar').classList.add('hidden');
      foldersEl.classList.remove('hidden');
      cardsEl.classList.add('hidden');
      container.querySelector('#nt-listhead').classList.add('hidden');
      drawFolders();
    }

    /* ----- multi-select ----- */
    function updateSelectBar() {
      const bar = container.querySelector('#nt-selbar');
      bar.classList.toggle('hidden', !selectMode);
      container.querySelector('#nt-listhead').classList.toggle('hidden', selectMode || mode !== 'browser');
      if (selectMode) {
        container.querySelector('#sel-count').textContent =
          `${selected.size} selected`;
        const allFav = [...selected].every(id => (DB.get('notes', id) || {}).favorite);
        container.querySelector('#sel-fav').innerHTML = icon(allFav ? 'starFill' : 'star');
      }
    }
    function exitSelect() {
      selectMode = false;
      selected.clear();
      updateSelectBar();
      drawList();
    }
    function enterSelect(id) {
      selectMode = true;
      selected.clear();
      if (id) selected.add(id);
      Platform.haptic('medium');
      updateSelectBar();
      drawList();
    }
    function toggleSelect(id) {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      Platform.haptic();
      if (!selected.size) { exitSelect(); return; }
      updateSelectBar();
      drawList();
    }

    container.querySelector('#sel-cancel').addEventListener('click', exitSelect);
    container.querySelector('#sel-del').addEventListener('click', async () => {
      const n = selected.size;
      if (!n) return;
      if (await confirmDialog(`Delete ${n} note${n === 1 ? '' : 's'}? This can’t be undone.`)) {
        for (const id of [...selected]) DB.remove('notes', id);
        toast(`${n} note${n === 1 ? '' : 's'} deleted`, { icon: 'trash' });
        exitSelect();
      }
    });
    container.querySelector('#sel-fav').addEventListener('click', () => {
      const ids = [...selected];
      if (!ids.length) return;
      const allFav = ids.every(id => (DB.get('notes', id) || {}).favorite);
      for (const id of ids) {
        const note = DB.get('notes', id);
        if (note) { note.favorite = !allFav; DB.upsert('notes', note); }
      }
      toast(allFav ? 'Removed from favorites' : 'Added to favorites', { icon: 'star' });
      updateSelectBar();
    });
    container.querySelector('#sel-move').addEventListener('click', () => {
      const ids = [...selected];
      if (!ids.length) return;
      const body = el(`<div style="display:flex;flex-direction:column;gap:2px"></div>`);
      const opts = [{ id: null, name: 'All notes (no folder)', color: DB.settings().accent }, ...sortedFolders()];
      for (const f of opts) {
        const count = f.id ? notesIn(f.id).length : DB.all('notes').filter(x => !x.folderId).length;
        const item = el(`<button class="menu-item">${icon(f.id ? 'folder' : 'inbox')}
          <span style="flex:1">${esc(f.name)}</span><span class="muted" style="font-size:12px">${count}</span></button>`);
        item.querySelector('svg').style.color = f.color || 'var(--accent)';
        item.addEventListener('click', () => {
          for (const id of ids) {
            const note = DB.get('notes', id);
            if (note) { note.folderId = f.id; DB.upsert('notes', note); }
          }
          m.close();
          toast(`${ids.length} note${ids.length === 1 ? '' : 's'} moved to ${f.name}`, { icon: 'folder' });
          exitSelect();
        });
        body.appendChild(item);
      }
      const newFolderBtn = el(`<button class="menu-item">${icon('folderPlus')}<span style="flex:1">New folder…</span></button>`);
      newFolderBtn.addEventListener('click', () => {
        m.close();
        openFolderSheet(null, (f) => {
          for (const id of ids) {
            const note = DB.get('notes', id);
            if (note) { note.folderId = f.id; DB.upsert('notes', note); }
          }
          toast(`${ids.length} note${ids.length === 1 ? '' : 's'} moved to ${f.name}`, { icon: 'folder' });
          exitSelect();
        });
      });
      body.appendChild(el(`<div class="menu-sep"></div>`));
      body.appendChild(newFolderBtn);
      const m = openModal({ title: `Move ${ids.length} note${ids.length === 1 ? '' : 's'} to…`, body, foot: el(`<div></div>`) });
    });

    function drawList() {
      let notes = notesIn(folderId);
      if (query) {
        const q = query.toLowerCase();
        notes = notes.filter(n => (n.title || '').toLowerCase().includes(q) ||
          DB.textOfHtml(n.content).toLowerCase().includes(q));
      }
      notes.sort((a, b) => (b.favorite - a.favorite) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      container.querySelector('#nt-sub').textContent = selectMode
        ? 'Tap notes to select · long-press started it'
        : `${notes.length} note${notes.length === 1 ? '' : 's'}`;
      // prune selections that no longer exist
      for (const id of [...selected]) if (!DB.get('notes', id)) selected.delete(id);
      cardsEl.classList.toggle('select-mode', selectMode);
      cardsEl.innerHTML = '';
      if (!notes.length) {
        cardsEl.appendChild(el(`<div class="empty">${icon('note')}
          <div class="empty-title">${query ? 'No matches' : 'No notes here'}</div>
          <div class="empty-sub">Tap + to write one.</div></div>`));
        return;
      }
      for (const n of notes) {
        const folder = folderId === null && n.folderId ? DB.get('folders', n.folderId) : null;
        const snippet = DB.textOfHtml(n.content).slice(0, 120) || (n.content && n.content.includes('<img') ? '📷 Image' : 'Empty note');
        const card = el(`<div class="note-card ${selected.has(n.id) ? 'selected' : ''}" data-id="${n.id}" style="--nc-color:${esc(n.headerColor || '#7c5cff')}">
          <div class="nc-bar"></div>
          <div class="nc-check">${icon('check')}</div>
          <div class="nc-body">
            <div class="nc-title">${n.favorite ? icon('starFill') : ''}<span>${esc(n.title || 'Untitled note')}</span></div>
            <div class="nc-snippet">${esc(snippet)}</div>
            <div class="nc-meta"><span>${esc(Fmt.relTime(n.updatedAt))}</span>
              ${folder ? `<span style="color:${esc(folder.color)}">${icon('folder')} ${esc(folder.name)}</span>` : ''}
              ${(n.links || []).length ? `<span>${icon('link')} ${(n.links || []).length}</span>` : ''}</div>
          </div>
        </div>`);
        // Long-press starts multi-select; tap then toggles membership.
        let pressTimer = null, moved = false;
        card.addEventListener('touchstart', () => {
          moved = false;
          if (!selectMode) pressTimer = setTimeout(() => { pressTimer = null; enterSelect(n.id); }, 480);
        }, { passive: true });
        card.addEventListener('touchmove', () => { moved = true; clearTimeout(pressTimer); }, { passive: true });
        card.addEventListener('touchend', () => clearTimeout(pressTimer));
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!selectMode) enterSelect(n.id); });
        card.addEventListener('click', () => {
          if (moved) return;
          if (selectMode) toggleSelect(n.id);
          else openNoteEditor(n.id);
        });
        cardsEl.appendChild(card);
      }
    }

    container.querySelector('#nt-back').addEventListener('click', showFolders);
    container.querySelector('#nt-search').addEventListener('input', (e) => {
      query = e.target.value.trim();
      drawList();
    });

    showFolders();
    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') return;
      if (mode === 'folders') drawFolders(); else {
        if (folderId && !DB.get('folders', folderId)) { showFolders(); return; }
        drawList();
      }
    });

    return {
      destroy: unsub,
      newNoteHere() {
        const n = DB.newNote({ folderId: mode === 'browser' ? folderId : null });
        DB.upsert('notes', n);
        if (mode !== 'browser') enterFolder(n.folderId);
        openNoteEditor(n.id);
      },
      goto(id) {
        const folder = DB.get('folders', id);
        if (folder) { enterFolder(folder.id); return; }
        const note = DB.get('notes', id);
        if (note) { enterFolder(note.folderId || null); openNoteEditor(id); }
      }
    };
  }
};
