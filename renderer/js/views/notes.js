'use strict';
/* Notes — level 1: folder grid. level 2: the two-pane note browser/editor. */

window.Views = window.Views || {};

/** Create/edit folder dialog (name, color, pin). */
function openFolderModal(folderId, onDone) {
  const isNew = !folderId;
  const folder = isNew ? DB.newFolder() : JSON.parse(JSON.stringify(DB.get('folders', folderId)));
  if (!folder) return;

  const body = el(`<div></div>`);
  body.innerHTML = `
    <div class="field"><label>Folder name</label>
      <input class="input" id="fm-name" placeholder="e.g. Work, Journal, Recipes…" value="${esc(folder.name)}"></div>
    <div class="field"><label>Color</label><div id="fm-color"></div></div>
    <div class="field-row" style="align-items:center">
      <div class="field" style="flex:1"><label>Pinned</label>
        <div class="muted" style="font-size:12px">Pinned folders stay at the front of the grid</div></div>
      <button class="toggle ${folder.pinned ? 'on' : ''}" id="fm-pin" style="margin-top:14px"></button>
    </div>`;
  body.querySelector('#fm-color').appendChild(swatchRow(folder.color, (c) => { folder.color = c; }));
  body.querySelector('#fm-pin').addEventListener('click', (e) => {
    folder.pinned = !folder.pinned;
    e.currentTarget.classList.toggle('on', folder.pinned);
  });

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const cancel = el(`<button class="btn ghost">Cancel</button>`);
  const save = el(`<button class="btn primary">${isNew ? 'Create folder' : 'Save'}</button>`);
  foot.append(el(`<div style="flex:1"></div>`), cancel, save);
  const m = openModal({ title: isNew ? 'New folder' : 'Edit folder', body, foot });
  cancel.addEventListener('click', () => m.close());
  save.addEventListener('click', () => {
    folder.name = body.querySelector('#fm-name').value.trim() || 'Untitled folder';
    DB.upsert('folders', folder);
    m.close();
    toast(isNew ? 'Folder created' : 'Folder saved', { icon: 'folder' });
    onDone && onDone(folder);
  });
  setTimeout(() => body.querySelector('#fm-name').focus());
}

Views.notes = {
  id: 'notes', title: 'Notes', icon: 'note',

  mount(container) {
    let mode = 'folders';        // 'folders' | 'browser'
    let folderId = null;         // null in browser mode = "All notes"
    let selectedId = null;
    let query = '';
    let saveState = 'idle';

    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title" id="nt-heading">Notes</div><div class="view-sub" id="nt-sub"></div></div>
          <div class="spacer"></div>
          <button class="btn" id="nt-newfolder">${icon('folderPlus')} New folder</button>
          <button class="btn primary" id="nt-new">${icon('plus')} New note</button>
        </div>
        <div class="view-body">
          <div class="folder-grid" id="nt-folders"></div>
          <div class="notes-layout" id="nt-browser" style="display:none">
            <div class="notes-side">
              <div class="notes-back" id="nt-back" title="Back to folders">
                ${icon('chevL')}<span class="nb-dot"></span><span class="nb-name">All notes</span>
              </div>
              <div class="notes-search">${icon('search')}<input class="input" id="nt-search" placeholder="Search notes…"></div>
              <div class="note-cards" id="nt-cards"></div>
            </div>
            <div class="note-editor" id="nt-editor" style="display:none">
              <div class="ne-header" id="ne-header">
                <div class="ne-toprow">
                  <input class="ne-title" id="ne-title" placeholder="Untitled note">
                  <div class="ne-actions">
                    <button class="iconbtn" id="ne-color" title="Header color">${icon('palette')}</button>
                    <button class="iconbtn" id="ne-fav" title="Favorite">${icon('star')}</button>
                    <button class="iconbtn" id="ne-pin" title="Lock on screen — keeps this note on top of every window">${icon('monitor')}</button>
                    <button class="iconbtn" id="ne-link" title="Link to task, idea, event…">${icon('link')}</button>
                    <button class="iconbtn" id="ne-more" title="More">${icon('dots')}</button>
                  </div>
                </div>
                <div class="ne-meta">
                  <span id="ne-updated"></span><span>·</span><span id="ne-words"></span>
                  <span class="save-state" id="ne-save"></span>
                </div>
                <div class="ne-linkchips" id="ne-links"></div>
              </div>
              <div class="ne-toolbar" id="ne-toolbar">
                <button class="tbtn" data-cmd="bold" title="Bold (Ctrl+B)">${icon('bold')}</button>
                <button class="tbtn" data-cmd="italic" title="Italic (Ctrl+I)">${icon('italic')}</button>
                <button class="tbtn" data-cmd="underline" title="Underline (Ctrl+U)">${icon('underline')}</button>
                <button class="tbtn" data-cmd="strikeThrough" title="Strikethrough">${icon('strike')}</button>
                <span class="tsep"></span>
                <button class="tbtn" id="tb-font" title="Text size & font">Aa</button>
                <span class="tsep"></span>
                <button class="tbtn" data-cmd="justifyLeft" title="Align left">${icon('alignL')}</button>
                <button class="tbtn" data-cmd="justifyCenter" title="Align center">${icon('alignC')}</button>
                <button class="tbtn" data-cmd="justifyRight" title="Align right">${icon('alignR')}</button>
                <button class="tbtn tb-dir" id="tb-rtl" title="Right-to-left (فارسی)">RTL</button>
                <button class="tbtn tb-dir" id="tb-ltr" title="Left-to-right">LTR</button>
                <span class="tsep"></span>
                <button class="tbtn" data-cmd="insertUnorderedList" title="Bullet list">${icon('listUl')}</button>
                <button class="tbtn" data-cmd="insertOrderedList" title="Numbered list">${icon('listOl')}</button>
                <button class="tbtn" id="tb-check" title="Checklist">${icon('checklist')}</button>
                <span class="tsep"></span>
                <button class="tbtn" data-block="blockquote" title="Quote">${icon('quote')}</button>
                <button class="tbtn" data-block="pre" title="Code block">${icon('code')}</button>
                <button class="tbtn" id="tb-mark" title="Highlight">${icon('highlight')}</button>
                <button class="tbtn" id="tb-img" title="Insert image (or paste / drop one)">${icon('image')}</button>
                <span class="tsep"></span>
                <button class="tbtn" id="tb-clear" title="Clear formatting">${icon('eraser')}</button>
                <input type="file" id="tb-imgfile" accept="image/*" multiple hidden>
              </div>
              <div class="ne-body" id="ne-body" contenteditable="true" spellcheck="false"
                   data-placeholder="Start writing… select text to format it. Paste or drop images right here."></div>
            </div>
            <div class="notes-empty-pane" id="nt-emptypane">
              <div class="empty">${icon('note')}
                <div class="empty-title">No note selected</div>
                <div class="empty-sub">Create a note or pick one from the list.</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const foldersEl = container.querySelector('#nt-folders');
    const browserEl = container.querySelector('#nt-browser');
    const cardsEl = container.querySelector('#nt-cards');
    const editorEl = container.querySelector('#nt-editor');
    const emptyPane = container.querySelector('#nt-emptypane');
    const headerEl = container.querySelector('#ne-header');
    const titleEl = container.querySelector('#ne-title');
    const bodyEl = container.querySelector('#ne-body');
    const saveEl = container.querySelector('#ne-save');
    const linksEl = container.querySelector('#ne-links');

    const current = () => selectedId ? DB.get('notes', selectedId) : null;
    const notesIn = (fid) => DB.all('notes').filter(n => fid === null ? true : (n.folderId || null) === fid);

    /* ================= level 1: folder grid ================= */

    function sortedFolders() {
      return [...DB.all('folders')].sort((a, b) =>
        (b.pinned - a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    }

    function folderCard(folder) {
      const notes = notesIn(folder.id)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      const card = el(`<div class="folder-card" data-id="${folder.id}" style="--nf:${esc(folder.color || '#7c5cff')}">
        <div class="fc-top">
          <div class="fc-icon">${icon('folder')}</div>
          <div class="fc-name">${esc(folder.name || 'Untitled folder')}</div>
          ${folder.pinned ? `<span class="fc-pin" title="Pinned">${icon('pin')}</span>` : ''}
          <button class="iconbtn fc-menu" title="Folder options">${icon('dots')}</button>
        </div>
        <div class="fc-preview">${notes.slice(0, 3).map(n =>
          `<div class="fc-line">${esc(n.title || 'Untitled note')}</div>`).join('') ||
          '<div class="fc-line" style="padding-left:0">Empty — click to add notes</div>'}</div>
        <div class="fc-count">${notes.length} note${notes.length === 1 ? '' : 's'}</div>
      </div>`);
      card.addEventListener('click', (e) => {
        if (e.target.closest('.fc-menu')) return;
        enterFolder(folder.id);
      });
      card.querySelector('.fc-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        menu(e.currentTarget, [
          { icon: 'edit', label: 'Rename & color', onClick: () => openFolderModal(folder.id) },
          {
            icon: 'pin', label: folder.pinned ? 'Unpin' : 'Pin to front',
            onClick: () => { folder.pinned = !folder.pinned; DB.upsert('folders', folder); }
          },
          { icon: 'plus', label: 'New note inside', onClick: () => { enterFolder(folder.id); newNoteHere(); } },
          '-',
          {
            icon: 'trash', label: 'Delete folder', danger: true,
            onClick: async () => {
              const count = notesIn(folder.id).length;
              if (await confirmDialog(count
                ? `Delete “${folder.name}”? Its ${count} note${count === 1 ? '' : 's'} won’t be deleted — they move to All notes.`
                : `Delete empty folder “${folder.name}”?`)) {
                DB.removeFolder(folder.id);
                toast('Folder deleted — notes kept in All notes', { icon: 'trash' });
              }
            }
          }
        ]);
      });
      return card;
    }

    function drawFolders() {
      const folders = sortedFolders();
      const allNotes = DB.all('notes');
      const unfiled = allNotes.filter(n => !n.folderId).length;
      container.querySelector('#nt-sub').textContent =
        `${folders.length} folder${folders.length === 1 ? '' : 's'} · ${allNotes.length} note${allNotes.length === 1 ? '' : 's'}`;

      foldersEl.innerHTML = '';

      // "All notes" card
      const recent = [...allNotes].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      const allCard = el(`<div class="folder-card" style="--nf:${esc(DB.settings().accent || '#7c5cff')}">
        <div class="fc-top">
          <div class="fc-icon">${icon('inbox')}</div>
          <div class="fc-name">All notes</div>
        </div>
        <div class="fc-preview">${recent.slice(0, 3).map(n =>
          `<div class="fc-line">${esc(n.title || 'Untitled note')}</div>`).join('') ||
          '<div class="fc-line" style="padding-left:0">Everything lives here</div>'}</div>
        <div class="fc-count">${allNotes.length} note${allNotes.length === 1 ? '' : 's'}${unfiled && folders.length ? ` · ${unfiled} unfiled` : ''}</div>
      </div>`);
      allCard.addEventListener('click', () => enterFolder(null));
      foldersEl.appendChild(allCard);

      for (const f of folders) foldersEl.appendChild(folderCard(f));

      const newCard = el(`<div class="folder-card fc-new">${icon('folderPlus')}<span class="fc-newlabel">New folder</span></div>`);
      newCard.addEventListener('click', () => openFolderModal(null, (f) => enterFolder(f.id)));
      foldersEl.appendChild(newCard);
    }

    /* ================= mode switching ================= */

    function setHeading() {
      const headEl = container.querySelector('#nt-heading');
      if (mode === 'folders') {
        headEl.textContent = 'Notes';
      } else {
        const f = folderId ? DB.get('folders', folderId) : null;
        headEl.textContent = f ? f.name : 'All notes';
      }
    }

    function showFolders() {
      saveNow();
      mode = 'folders';
      folderId = null;
      selectedId = null;
      browserEl.style.display = 'none';
      foldersEl.style.display = '';
      setHeading();
      drawFolders();
      const folders = DB.all('folders');
      container.querySelector('#nt-sub').textContent =
        `${folders.length} folder${folders.length === 1 ? '' : 's'} · ${DB.all('notes').length} note${DB.all('notes').length === 1 ? '' : 's'}`;
    }

    function enterFolder(fid, keepSelection = false) {
      mode = 'browser';
      folderId = fid;
      query = '';
      container.querySelector('#nt-search').value = '';
      foldersEl.style.display = 'none';
      browserEl.style.display = '';
      const f = fid ? DB.get('folders', fid) : null;
      const back = container.querySelector('#nt-back');
      back.style.setProperty('--nf-color', f ? f.color : (DB.settings().accent || '#7c5cff'));
      back.querySelector('.nb-name').textContent = f ? f.name : 'All notes';
      setHeading();
      if (!keepSelection) {
        const first = sortedNotes()[0];
        selectNote(first ? first.id : null);
      } else {
        drawList();
      }
    }

    container.querySelector('#nt-back').addEventListener('click', showFolders);
    container.querySelector('#nt-newfolder').addEventListener('click', () => openFolderModal(null, (f) => {
      if (mode === 'folders') drawFolders();
      else enterFolder(f.id);
    }));

    /* ================= level 2: note list ================= */

    function sortedNotes() {
      let notes = notesIn(folderId);
      if (query) {
        const q = query.toLowerCase();
        notes = notes.filter(n => (n.title || '').toLowerCase().includes(q) ||
          DB.textOfHtml(n.content).toLowerCase().includes(q));
      }
      notes.sort((a, b) => (b.favorite - a.favorite) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return notes;
    }

    function drawList() {
      const notes = sortedNotes();
      const total = notesIn(folderId).length;
      container.querySelector('#nt-sub').textContent =
        `${total} note${total === 1 ? '' : 's'}${folderId === null && DB.all('folders').length ? ' · all folders' : ''}`;
      cardsEl.innerHTML = '';
      if (!notes.length) {
        cardsEl.appendChild(el(`<div class="empty">${icon('note')}
          <div class="empty-title">${query ? 'No matches' : 'No notes here'}</div>
          <div class="empty-sub">${query ? 'Try a different search.' : 'Hit “New note” to start writing.'}</div></div>`));
        return;
      }
      for (const n of notes) {
        const folder = folderId === null && n.folderId ? DB.get('folders', n.folderId) : null;
        const snippet = DB.textOfHtml(n.content).slice(0, 140) || (n.content && n.content.includes('<img') ? '📷 Image' : 'Empty note');
        const card = el(`<div class="note-card ${n.id === selectedId ? 'active' : ''}" data-id="${n.id}" style="--nc-color:${esc(n.headerColor || '#7c5cff')}">
          <div class="nc-bar"></div>
          <div class="nc-body">
            <div class="nc-title">
              ${n.pinnedToScreen ? icon('monitor') : ''}${n.favorite ? icon('starFill') : ''}
              <span>${esc(n.title || 'Untitled note')}</span>
            </div>
            <div class="nc-snippet">${esc(snippet)}</div>
            <div class="nc-meta"><span>${esc(Fmt.relTime(n.updatedAt))}</span>
              ${folder ? `<span>·</span><span style="color:${esc(folder.color)}">${icon('folder')} ${esc(folder.name)}</span>` : ''}
              ${(n.links || []).length ? `<span>·</span><span>${icon('link')} ${(n.links || []).length}</span>` : ''}</div>
          </div>
        </div>`);
        card.addEventListener('click', () => selectNote(n.id));
        cardsEl.appendChild(card);
      }
    }

    /* ================= editor ================= */

    function setSaveState(s) {
      saveState = s;
      saveEl.innerHTML = s === 'saving' ? `${icon('clock')} Saving…`
        : s === 'saved' ? `${icon('checkCircle')} Saved` : '';
      if (s === 'saved') setTimeout(() => { if (saveState === 'saved') setSaveState('idle'); }, 1600);
    }

    function refreshMeta(note) {
      container.querySelector('#ne-updated').textContent = `Edited ${Fmt.relTime(note.updatedAt)}`;
      const words = DB.textOfHtml(note.content).trim().split(/\s+/).filter(Boolean).length;
      const imgs = (note.content.match(/<img/g) || []).length;
      container.querySelector('#ne-words').textContent =
        `${words} word${words === 1 ? '' : 's'}${imgs ? ` · ${imgs} image${imgs === 1 ? '' : 's'}` : ''}`;
    }

    function refreshHeaderState(note) {
      headerEl.style.setProperty('--nh', note.headerColor || '#7c5cff');
      const fav = container.querySelector('#ne-fav');
      fav.innerHTML = icon(note.favorite ? 'starFill' : 'star');
      fav.classList.toggle('active', !!note.favorite);
      const pin = container.querySelector('#ne-pin');
      pin.classList.toggle('pin-on', !!note.pinnedToScreen);
      pin.title = note.pinnedToScreen
        ? 'Unlock from screen'
        : 'Lock on screen — keeps this note on top of every window';
      renderLinkChips(linksEl, { type: 'note', id: note.id });
      refreshMeta(note);
    }

    function selectNote(id, focusTitle = false) {
      saveNow();
      selectedId = id;
      const note = current();
      if (!note) {
        editorEl.style.display = 'none';
        emptyPane.style.display = '';
        drawList();
        return;
      }
      emptyPane.style.display = 'none';
      editorEl.style.display = '';
      titleEl.value = note.title || '';
      bodyEl.setAttribute('dir', note.dir || 'auto');
      titleEl.setAttribute('dir', note.dir || 'auto');
      paintDirButtons(note.dir);
      bodyEl.innerHTML = sanitizeHtml(note.content || '');
      bodyEl.classList.toggle('is-empty', !bodyEl.textContent.trim() && !bodyEl.querySelector('li,img'));
      refreshHeaderState(note);
      setSaveState('idle');
      drawList();
      if (focusTitle) setTimeout(() => titleEl.focus());
    }

    const saveDebounced = debounce(() => saveNow(), 500);

    function saveNow() {
      const note = current();
      if (!note) return;
      const newTitle = titleEl.value;
      const newContent = bodyEl.innerHTML;
      if (note.title === newTitle && note.content === newContent) return;
      note.title = newTitle;
      note.content = newContent;
      setSaveState('saving');
      DB.upsert('notes', note);
      setSaveState('saved');
      refreshMeta(note);
      const cardTitle = cardsEl.querySelector(`.note-card[data-id="${note.id}"] .nc-title span`);
      const cardSnip = cardsEl.querySelector(`.note-card[data-id="${note.id}"] .nc-snippet`);
      if (cardTitle) cardTitle.textContent = note.title || 'Untitled note';
      if (cardSnip) cardSnip.textContent = DB.textOfHtml(note.content).slice(0, 140) || 'Empty note';
    }

    /* direction: persist per note; auto-detect from first characters */
    function paintDirButtons(dir) {
      container.querySelector('#tb-rtl')?.classList.toggle('on', dir === 'rtl');
      container.querySelector('#tb-ltr')?.classList.toggle('on', dir === 'ltr');
    }
    function setNoteDir(dir, manual) {
      const note = current(); if (!note) return;
      note.dir = dir;
      if (manual) note.dirManual = true;
      bodyEl.setAttribute('dir', dir || 'auto');
      titleEl.setAttribute('dir', dir || 'auto');
      paintDirButtons(dir);
      DB.upsert('notes', note);
    }
    container.querySelector('#tb-rtl').addEventListener('click', () => {
      setNoteDir(current()?.dir === 'rtl' ? null : 'rtl', true);
    });
    container.querySelector('#tb-ltr').addEventListener('click', () => {
      setNoteDir(current()?.dir === 'ltr' ? null : 'ltr', true);
    });
    container.querySelector('#tb-font').addEventListener('click', (e) => {
      if (!current()) return;
      openFontTools(e.currentTarget, bodyEl, () => saveDebounced());
    });

    titleEl.addEventListener('input', () => saveDebounced());
    bodyEl.addEventListener('input', () => {
      bodyEl.classList.toggle('is-empty', !bodyEl.textContent.trim() && !bodyEl.querySelector('li,img'));
      const note = current();
      if (note && !note.dir && !note.dirManual) {
        const d = detectDir(bodyEl.textContent.slice(0, 80));
        if (d) setNoteDir(d, false);
      }
      saveDebounced();
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); bodyEl.focus(); }
    });

    /* ---------- images ---------- */
    async function insertImageFiles(files) {
      const images = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (!images.length) return false;
      bodyEl.focus();
      for (const file of images.slice(0, 6)) {
        try {
          const dataUrl = await imageToDataUrl(file);
          document.execCommand('insertHTML', false, `<img src="${dataUrl}" alt=""><p></p>`);
        } catch (err) {
          toast('That file couldn’t be read as an image', { icon: 'x' });
        }
      }
      saveDebounced();
      return true;
    }

    container.querySelector('#tb-imgfile').addEventListener('change', (e) => {
      if (current()) insertImageFiles(e.target.files);
      e.target.value = '';
    });

    bodyEl.addEventListener('paste', (e) => {
      const items = Array.from(e.clipboardData.items || []);
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) {
        e.preventDefault();
        insertImageFiles([imgItem.getAsFile()]);
        return;
      }
      e.preventDefault();
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (html) document.execCommand('insertHTML', false, sanitizeHtml(html));
      else document.execCommand('insertText', false, text);
    });

    bodyEl.addEventListener('dragover', (e) => {
      if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
    });
    bodyEl.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        insertImageFiles(e.dataTransfer.files);
      }
    });

    // Click an image to select it (Delete/Backspace then removes it natively).
    bodyEl.addEventListener('click', (e) => {
      bodyEl.querySelectorAll('img.img-selected').forEach(i => i.classList.remove('img-selected'));
      if (e.target.tagName === 'IMG') {
        e.target.classList.add('img-selected');
        const range = document.createRange();
        range.selectNode(e.target);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }
    });

    /* ---------- toolbar ---------- */
    container.querySelector('#ne-toolbar').addEventListener('mousedown', e => {
      if (!e.target.closest('#tb-imgfile')) e.preventDefault();
    });
    container.querySelector('#ne-toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('.tbtn');
      if (!btn || !current()) return;
      if (btn.id === 'tb-img') {
        container.querySelector('#tb-imgfile').click();
        return;
      }
      bodyEl.focus();
      if (btn.dataset.cmd) {
        document.execCommand(btn.dataset.cmd, false, null);
      } else if (btn.dataset.block) {
        const block = btn.dataset.block;
        const cur = document.queryCommandValue('formatBlock').toLowerCase();
        document.execCommand('formatBlock', false, cur === block ? 'p' : `<${block}>`);
      } else if (btn.id === 'tb-check') {
        toggleChecklist();
      } else if (btn.id === 'tb-mark') {
        toggleMark();
      } else if (btn.id === 'tb-clear') {
        document.execCommand('removeFormat', false, null);
        document.execCommand('formatBlock', false, 'p');
      }
      saveDebounced();
      updateToolbarState();
    });

    function nearestInBody(node, selector) {
      let n = node && node.nodeType === 3 ? node.parentElement : node;
      while (n && n !== bodyEl) {
        if (n.matches && n.matches(selector)) return n;
        n = n.parentElement;
      }
      return null;
    }

    function toggleChecklist() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      let ul = nearestInBody(sel.anchorNode, 'ul, ol');
      if (ul && ul.classList.contains('checklist')) {
        ul.classList.remove('checklist');
        ul.querySelectorAll('li[data-checked]').forEach(li => li.removeAttribute('data-checked'));
      } else {
        if (!ul || ul.tagName === 'OL') document.execCommand('insertUnorderedList', false, null);
        ul = nearestInBody(window.getSelection().anchorNode, 'ul');
        if (ul) ul.classList.add('checklist');
      }
    }

    function toggleMark() {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const existing = nearestInBody(sel.anchorNode, 'mark');
      if (existing) {
        const parent = existing.parentNode;
        while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
        existing.remove();
        return;
      }
      const range = sel.getRangeAt(0);
      const mark = document.createElement('mark');
      try {
        range.surroundContents(mark);
      } catch (err) {
        mark.appendChild(range.extractContents());
        range.insertNode(mark);
      }
      sel.removeAllRanges();
    }

    function updateToolbarState() {
      for (const btn of container.querySelectorAll('.tbtn[data-cmd]')) {
        let on = false;
        try { on = document.queryCommandState(btn.dataset.cmd); } catch (e) { /* noop */ }
        btn.classList.toggle('on', on);
      }
      const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      for (const btn of container.querySelectorAll('.tbtn[data-block]')) {
        btn.classList.toggle('on', btn.dataset.block === block);
      }
      const sel = window.getSelection();
      const ul = sel.rangeCount ? nearestInBody(sel.anchorNode, 'ul.checklist') : null;
      container.querySelector('#tb-check').classList.toggle('on', !!ul);
    }
    document.addEventListener('selectionchange', onSelChange);
    function onSelChange() {
      if (document.activeElement === bodyEl) updateToolbarState();
    }

    bodyEl.addEventListener('click', (e) => {
      const li = e.target.closest('ul.checklist > li');
      if (!li || !bodyEl.contains(li)) return;
      const rect = li.getBoundingClientRect();
      if (e.clientX - rect.left <= 24) {
        if (li.hasAttribute('data-checked')) li.removeAttribute('data-checked');
        else li.setAttribute('data-checked', 'true');
        saveDebounced();
      }
    });

    bodyEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) saveDebounced();
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
      }
    });

    /* ---------- header actions ---------- */
    container.querySelector('#ne-color').addEventListener('click', (e) => {
      const note = current(); if (!note) return;
      const wrap = el(`<div style="padding:8px 10px"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-faint);margin-bottom:9px">Header color</div></div>`);
      wrap.appendChild(swatchRow(note.headerColor, (c) => {
        note.headerColor = c;
        DB.upsert('notes', note);
        refreshHeaderState(note);
        const bar = cardsEl.querySelector(`.note-card[data-id="${note.id}"]`);
        if (bar) bar.style.setProperty('--nc-color', c);
      }));
      openPopover(e.currentTarget, wrap);
    });

    container.querySelector('#ne-fav').addEventListener('click', () => {
      const note = current(); if (!note) return;
      note.favorite = !note.favorite;
      DB.upsert('notes', note);
      refreshHeaderState(note);
      drawList();
    });

    container.querySelector('#ne-pin').addEventListener('click', async () => {
      const note = current(); if (!note) return;
      saveNow();
      if (note.pinnedToScreen) {
        note.pinnedToScreen = false;
        DB.upsert('notes', note);
        await window.aurora.unpinNote(note.id);
        toast('Note unlocked from screen', { icon: 'monitor' });
      } else {
        note.pinnedToScreen = true;
        DB.upsert('notes', note);
        await window.aurora.pinNote(note.id);
        toast('Note locked on screen — it stays on top of every window', { icon: 'monitor' });
      }
      refreshHeaderState(note);
      drawList();
    });

    container.querySelector('#ne-link').addEventListener('click', () => {
      const note = current(); if (!note) return;
      openLinkPicker({ type: 'note', id: note.id });
    });

    container.querySelector('#ne-more').addEventListener('click', (e) => {
      const note = current(); if (!note) return;
      const selText = String(window.getSelection() || '').trim();
      const folders = sortedFolders();
      menu(e.currentTarget, [
        {
          icon: 'folder', label: 'Move to folder…',
          onClick: () => {
            setTimeout(() => {
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
                  if (folderId !== null && (note.folderId || null) !== folderId) {
                    const next = sortedNotes()[0];
                    selectNote(next ? next.id : null);
                  } else drawList();
                });
                wrap.appendChild(item);
              }
              const pop = openPopover(e.target.closest('.ne-actions') || e.target, wrap);
            }, 10);
          }
        },
        {
          icon: 'tasks', label: selText ? 'Task from selection' : 'New linked task',
          onClick: () => {
            const t = DB.newTask({ title: (selText || note.title || 'Untitled').slice(0, 120) });
            DB.upsert('tasks', t);
            DB.link({ type: 'note', id: note.id }, { type: 'task', id: t.id });
            toast('Linked task created', { icon: 'tasks', action: 'Open', onAction: () => App.goto('task', t.id) });
          }
        },
        {
          icon: 'bulb', label: 'Convert to idea',
          onClick: async () => {
            if (!await confirmDialog('Convert this note into an idea? The note itself will be removed; its content and links move to the new idea.', { danger: false, okText: 'Convert' })) return;
            const idea = DB.newIdea({ title: note.title, content: note.content, links: [...(note.links || [])] });
            DB.upsert('ideas', idea);
            for (const ref of note.links || []) DB.link({ type: 'idea', id: idea.id }, ref);
            DB.remove('notes', note.id);
            selectedId = null;
            selectNote(null);
            toast('Converted to idea', { icon: 'bulb', action: 'Open', onAction: () => App.goto('idea', idea.id) });
          }
        },
        {
          icon: 'note', label: 'Duplicate note',
          onClick: () => {
            const copy = DB.newNote({
              title: (note.title || 'Untitled') + ' (copy)',
              content: note.content, headerColor: note.headerColor, folderId: note.folderId || null
            });
            DB.upsert('notes', copy);
            selectNote(copy.id, true);
          }
        },
        '-',
        {
          icon: 'trash', label: 'Delete note', danger: true,
          onClick: async () => {
            if (await confirmDialog(`Delete note “${note.title || 'Untitled'}”? This can’t be undone.`)) {
              if (note.pinnedToScreen) window.aurora.unpinNote(note.id);
              DB.remove('notes', note.id);
              selectedId = null;
              selectNote(null);
              toast('Note deleted', { icon: 'trash' });
            }
          }
        }
      ]);
    });

    /* ---------- new note + search ---------- */
    function newNoteHere() {
      const n = DB.newNote({ title: '', folderId: mode === 'browser' ? folderId : null });
      DB.upsert('notes', n);
      if (mode !== 'browser') enterFolder(n.folderId, true);
      query = '';
      container.querySelector('#nt-search').value = '';
      selectNote(n.id, true);
    }
    container.querySelector('#nt-new').addEventListener('click', newNoteHere);
    container.querySelector('#nt-search').addEventListener('input', (e) => {
      query = e.target.value.trim();
      drawList();
    });

    /* ---------- external changes ---------- */
    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') { if (mode === 'folders') drawFolders(); return; }
      if (ch.kind === 'reload') { showFolders(); return; }
      if (ch.collection === 'folders') {
        if (mode === 'folders') drawFolders();
        else {
          if (folderId && !DB.get('folders', folderId)) { showFolders(); return; }
          const f = folderId ? DB.get('folders', folderId) : null;
          if (f) {
            const back = container.querySelector('#nt-back');
            back.style.setProperty('--nf-color', f.color);
            back.querySelector('.nb-name').textContent = f.name;
            setHeading();
          }
          drawList();
        }
        return;
      }
      if (ch.collection === 'notes') {
        if (mode === 'folders') { drawFolders(); return; }
        if (ch.kind === 'remove' && ch.id === selectedId) { selectedId = null; selectNote(null); return; }
        if (ch.kind === 'upsert' && ch.item.id === selectedId && ch.remote) {
          const note = current();
          if (document.activeElement !== bodyEl && document.activeElement !== titleEl) {
            titleEl.value = note.title || '';
            bodyEl.innerHTML = sanitizeHtml(note.content || '');
          }
          refreshHeaderState(note);
        }
        drawList();
      } else if (mode === 'browser') {
        const note = current();
        if (note) renderLinkChips(linksEl, { type: 'note', id: note.id });
        drawList();
      }
    });

    // Start at the folder grid.
    showFolders();

    return {
      destroy() {
        saveDebounced.cancel();
        saveNow();
        document.removeEventListener('selectionchange', onSelChange);
        unsub();
      },
      goto(id) {
        const folder = DB.get('folders', id);
        if (folder) { enterFolder(folder.id); return; }
        const note = DB.get('notes', id);
        if (note) {
          enterFolder(note.folderId || null, true);
          selectNote(id);
        }
      }
    };
  }
};
