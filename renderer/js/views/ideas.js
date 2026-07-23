'use strict';
/* Ideas — kanban-style board (Spark → Growing → Ready), separate from notes. */

window.Views = window.Views || {};

const IDEA_COLS = [
  { key: 'spark', label: 'Spark', color: '#f5a524' },
  { key: 'growing', label: 'Growing', color: '#3e8bff' },
  { key: 'ready', label: 'Ready', color: '#14b880' }
];

function openIdeaModal(ideaId) {
  const idea = DB.get('ideas', ideaId);
  if (!idea) return;

  const body = el(`<div></div>`);
  body.innerHTML = `
    <div class="field"><label>Idea</label>
      <input class="input" id="im-title" value="${esc(idea.title)}" placeholder="Name the idea"></div>
    <div class="field"><label>Stage</label>
      <div class="seg" id="im-status">${IDEA_COLS.map(c =>
        `<button data-s="${c.key}" class="${idea.status === c.key ? 'active' : ''}">
          <span class="idot" style="width:7px;height:7px;border-radius:50%;background:${c.color}"></span>${c.label}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Details</label>
      <div class="ne-body" id="im-content" contenteditable="true" spellcheck="false"
        style="min-height:150px;max-height:300px;border:1px solid var(--glass-border);border-radius:10px;padding:12px 14px;overflow-y:auto;position:relative"
        data-placeholder="Sketch it out…"></div></div>
    <div class="field"><label>Linked items</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span id="im-links" style="display:flex;gap:6px;flex-wrap:wrap"></span>
        <button class="btn sm ghost" id="im-addlink">${icon('link')} Link…</button>
      </div>
    </div>`;
  body.querySelector('#im-content').innerHTML = sanitizeHtml(idea.content || '');
  attachTextTools(body.querySelector('#im-content'));

  body.querySelector('#im-status').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    idea.status = b.dataset.s;
    body.querySelectorAll('#im-status button').forEach(x => x.classList.toggle('active', x === b));
  });

  const foot = el(`<div style="display:flex;gap:9px;width:100%"></div>`);
  const toTask = el(`<button class="btn sm">${icon('tasks')} Make it a task</button>`);
  const toNote = el(`<button class="btn sm">${icon('convert')} Promote to note</button>`);
  const delBtn = el(`<button class="btn sm danger">${icon('trash')}</button>`);
  const cancel = el(`<button class="btn ghost">Cancel</button>`);
  const save = el(`<button class="btn primary">Save</button>`);
  const left = el(`<div class="left"></div>`);
  left.append(toTask, toNote, delBtn);
  foot.append(left, el(`<div style="flex:1"></div>`), cancel, save);

  const m = openModal({ title: 'Idea', body, foot, wide: true });
  cancel.addEventListener('click', () => m.close());

  const commit = () => {
    idea.title = body.querySelector('#im-title').value.trim() || 'Untitled idea';
    idea.content = body.querySelector('#im-content').innerHTML;
    DB.upsert('ideas', idea);
  };

  save.addEventListener('click', () => { commit(); m.close(); toast('Idea saved', { icon: 'bulb' }); });

  toTask.addEventListener('click', () => {
    commit();
    const t = DB.newTask({ title: idea.title, notes: DB.textOfHtml(idea.content).slice(0, 500) });
    DB.upsert('tasks', t);
    DB.link({ type: 'idea', id: idea.id }, { type: 'task', id: t.id });
    m.close();
    toast('Task created from idea', { icon: 'tasks', action: 'Open', onAction: () => App.goto('task', t.id) });
  });

  toNote.addEventListener('click', async () => {
    commit();
    if (!await confirmDialog('Promote this idea to a full note? The idea is removed; content and links carry over.', { danger: false, okText: 'Promote' })) return;
    const n = DB.newNote({ title: idea.title, content: idea.content });
    DB.upsert('notes', n);
    for (const ref of idea.links || []) DB.link({ type: 'note', id: n.id }, ref);
    DB.remove('ideas', idea.id);
    m.close();
    toast('Idea promoted to note', { icon: 'note', action: 'Open', onAction: () => App.goto('note', n.id) });
  });

  delBtn.addEventListener('click', async () => {
    m.close();
    if (await confirmDialog(`Delete idea “${idea.title || 'Untitled'}”?`)) {
      DB.remove('ideas', idea.id);
      toast('Idea deleted', { icon: 'trash' });
    }
  });

  const linksEl = body.querySelector('#im-links');
  const drawLinks = () => renderLinkChips(linksEl, { type: 'idea', id: idea.id });
  drawLinks();
  const unsub = DB.subscribe(drawLinks);
  const origClose = m.close;
  m.close = () => { unsub(); origClose(); };
  body.querySelector('#im-addlink').addEventListener('click', () => openLinkPicker({ type: 'idea', id: idea.id }));
}

Views.ideas = {
  id: 'ideas', title: 'Ideas', icon: 'bulb',

  mount(container) {
    container.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div><div class="view-title">Ideas</div><div class="view-sub" id="id-sub"></div></div>
          <div class="spacer"></div>
        </div>
        <div class="ideas-capture">
          <input class="input" id="id-quick" placeholder="Capture an idea before it escapes… (Enter)">
          <button class="btn primary" id="id-add">${icon('sparkle')} Capture</button>
        </div>
        <div class="view-body"><div class="ideas-board" id="id-board"></div></div>
      </div>`;

    const board = container.querySelector('#id-board');
    const quick = container.querySelector('#id-quick');

    function capture() {
      const title = quick.value.trim();
      if (!title) return;
      DB.upsert('ideas', DB.newIdea({ title }));
      quick.value = '';
      quick.focus();
      toast('Idea captured', { icon: 'sparkle' });
    }
    quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') capture(); });
    container.querySelector('#id-add').addEventListener('click', capture);

    function draw() {
      const ideas = DB.all('ideas');
      container.querySelector('#id-sub').textContent = `${ideas.length} idea${ideas.length === 1 ? '' : 's'} brewing`;
      board.innerHTML = '';
      for (const col of IDEA_COLS) {
        const items = ideas.filter(i => (i.status || 'spark') === col.key)
          .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        const colEl = el(`<div class="idea-col" data-col="${col.key}">
          <div class="idea-col-head"><span class="idot" style="background:${col.color}"></span>${col.label}
            <span class="count">${items.length}</span></div>
          <div class="idea-col-body"></div>
        </div>`);
        const colBody = colEl.querySelector('.idea-col-body');
        for (const idea of items) {
          const snippet = DB.textOfHtml(idea.content).slice(0, 120);
          const card = el(`<div class="idea-card" draggable="true" data-id="${idea.id}">
            <div class="ic-title">${esc(idea.title || 'Untitled idea')}</div>
            ${snippet ? `<div class="ic-snippet">${esc(snippet)}</div>` : ''}
            <div class="ic-foot">
              ${(idea.links || []).length ? `<span class="chip">${icon('link')}<span>${(idea.links || []).length}</span></span>` : ''}
              <span class="ic-date">${esc(Fmt.relTime(idea.updatedAt))}</span>
            </div>
          </div>`);
          card.addEventListener('click', () => openIdeaModal(idea.id));
          card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/aurora-idea', idea.id);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
          });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
          colBody.appendChild(card);
        }
        if (!items.length) {
          colBody.appendChild(el(`<div class="empty" style="padding:20px 8px">
            <div class="empty-sub">${col.key === 'spark' ? 'New captures land here.' :
              col.key === 'growing' ? 'Drag ideas here while they take shape.' :
              'Ready to become a note or task.'}</div></div>`));
        }
        colEl.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('text/aurora-idea')) {
            e.preventDefault();
            colEl.classList.add('dragover');
          }
        });
        colEl.addEventListener('dragleave', (e) => {
          if (!colEl.contains(e.relatedTarget)) colEl.classList.remove('dragover');
        });
        colEl.addEventListener('drop', (e) => {
          e.preventDefault();
          colEl.classList.remove('dragover');
          const id = e.dataTransfer.getData('text/aurora-idea');
          const idea = DB.get('ideas', id);
          if (idea && idea.status !== col.key) {
            idea.status = col.key;
            DB.upsert('ideas', idea);
          }
        });
        board.appendChild(colEl);
      }
    }

    draw();
    const unsub = DB.subscribe((ch) => {
      if (ch.kind === 'settings') return;
      if (ch.collection === 'ideas' || ch.kind === 'reload' ||
          ['tasks', 'notes', 'events', 'reminders'].includes(ch.collection)) draw();
    });

    return {
      destroy: unsub,
      goto(id) { if (DB.get('ideas', id)) openIdeaModal(id); }
    };
  }
};
