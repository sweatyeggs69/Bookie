/* =========================================================
   Booker – Frontend Application
   ========================================================= */

'use strict';

// ── State ────────────────────────────────────────────────
const state = {
  view: 'library',
  books: [],
  shelves: [],
  stats: null,
  page: 1,
  pages: 1,
  total: 0,
  viewMode: 'grid',
  filters: { q: '', format: '', sort: 'title', order: 'asc' },
  activeShelf: null,   // { id, name } when browsing a shelf
  selectedBook: null,
  selectedMeta: null,
  sendBookId: null,
  shelfEditId: null,
  addToShelfBookId: null,
  coverBookId: null,
  coverFile: null,
  uploadScheme: 'original',
  uploadCustomTemplate: '',
};

// ── API helpers ──────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
  return res;
}

async function apiJSON(path, opts = {}) {
  const res = await api(path, opts);
  return res.json();
}

// ── Snackbar ─────────────────────────────────────────────
let snackTimer;
function snack(msg, duration = 3500) {
  const el = document.getElementById('snackbar');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Navigation ───────────────────────────────────────────
function navigate(view, opts = {}) {
  state.view = view;
  state.activeShelf = opts.shelf || null;

  // Sync both nav rail and bottom nav
  document.querySelectorAll('.nav-rail-item, .bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  ['library', 'shelves', 'upload', 'settings'].forEach(v => {
    document.getElementById(`view${cap(v)}`).style.display = v === view ? '' : 'none';
  });

  document.getElementById('uploadFab').style.display = view === 'upload' ? 'none' : '';

  if (view === 'library') {
    document.getElementById('libraryTitle').textContent = opts.shelf ? opts.shelf.name : 'All Books';
    state.page = 1;
    loadBooks();
  } else if (view === 'shelves') {
    loadShelves();
  } else if (view === 'settings') {
    loadSettings();
  }

  closeMenu();
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

// ── Books ────────────────────────────────────────────────
async function loadBooks() {
  const container = document.getElementById('bookContainer');
  container.innerHTML = '<div class="loading-indicator"><div class="spinner"></div>Loading…</div>';

  const params = new URLSearchParams({
    page: state.page,
    per_page: 40,
    sort: state.filters.sort,
    order: state.filters.order,
  });
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.format) params.set('format', state.filters.format);
  if (state.activeShelf) params.set('shelf_id', state.activeShelf.id);

  const data = await apiJSON(`/api/books?${params}`);
  state.books = data.books || [];
  state.total = data.total || 0;
  state.pages = data.pages || 1;

  document.getElementById('bookCount').textContent =
    state.total === 1 ? '1 book' : `${state.total.toLocaleString()} books`;

  if (state.books.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
        <h2>No books found</h2>
        <p>Upload some ebooks or change your filters</p>
        <button class="btn btn-filled" onclick="navigate('upload')">Upload Books</button>
      </div>`;
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  renderBooks(container);
  renderPagination();

  // Load stats on first page load
  if (state.page === 1 && !state.activeShelf) loadStats();
}

function renderBooks(container) {
  if (state.viewMode === 'grid') {
    container.innerHTML = `<div class="book-grid">${state.books.map(bookCard).join('')}</div>`;
  } else {
    container.innerHTML = `<div class="book-list">${state.books.map(bookListItem).join('')}</div>`;
  }
}

function bookCard(b) {
  const cover = b.cover_filename
    ? `<img class="book-cover" src="/api/books/${b.id}/cover?thumb=true" alt="${esc(b.title)}" loading="lazy" onerror="this.parentElement.innerHTML='${coverPlaceholderSvg()}'">`
    : `<div class="book-cover-placeholder">${svgBook()}</div>`;
  return `
  <div class="book-card" onclick="openBook(${b.id})">
    ${cover}
    <span class="book-format-badge">${esc(b.file_format || '?')}</span>
    <div class="book-info">
      <div class="book-title">${esc(b.title || 'Untitled')}</div>
      <div class="book-author">${esc(b.author || 'Unknown author')}</div>
    </div>
    <div class="book-actions" onclick="event.stopPropagation()">
      <button class="icon-btn-sm" onclick="openSendDialog(${b.id})" title="Send to Kindle">
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
      </button>
      <button class="icon-btn-sm" onclick="openAddToShelf(${b.id})" title="Add to shelf">
        <svg viewBox="0 0 24 24"><path d="M2 4v16h20V4H2zm2 2h16v4H4V6zm0 6h4v6H4v-6zm6 6v-6h4v6h-4zm6 0v-6h4v6h-4z"/></svg>
      </button>
      <a class="icon-btn-sm" href="/api/books/${b.id}/download" title="Download">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      </a>
    </div>
  </div>`;
}

function bookListItem(b) {
  const thumb = b.cover_filename
    ? `<img class="book-list-thumb" src="/api/books/${b.id}/cover?thumb=true" alt="" loading="lazy" onerror="this.src=''">`
    : `<div class="book-list-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--md-sys-color-surface-container-highest)">${svgBook(24)}</div>`;
  const shelves = b.shelves && b.shelves.length ? ` · ${b.shelves.join(', ')}` : '';
  return `
  <div class="book-list-item" onclick="openBook(${b.id})">
    ${thumb}
    <div class="book-list-info">
      <div class="book-list-title">${esc(b.title || 'Untitled')}</div>
      <div class="book-list-meta">${esc(b.author || 'Unknown')} · ${(b.file_format||'').toUpperCase()}${shelves}</div>
    </div>
    <div class="book-list-actions" onclick="event.stopPropagation()">
      <button class="icon-btn" onclick="openSendDialog(${b.id})" title="Send">
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
      </button>
      <a class="icon-btn" href="/api/books/${b.id}/download" title="Download">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      </a>
    </div>
  </div>`;
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (state.pages <= 1) { el.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="goPage(${state.page - 1})" ${state.page === 1 ? 'disabled' : ''}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>`;
  const range = pages => pages.map(p =>
    p === '…' ? `<span style="padding:0 8px;color:var(--md-sys-color-on-surface-variant)">…</span>`
    : `<button class="page-btn ${p === state.page ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`
  ).join('');
  const ps = paginationPages(state.page, state.pages);
  html += range(ps);
  html += `<button class="page-btn" onclick="goPage(${state.page + 1})" ${state.page === state.pages ? 'disabled' : ''}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button>`;
  el.innerHTML = html;
}

function paginationPages(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (cur >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
  return [1, '…', cur-1, cur, cur+1, '…', total];
}

function goPage(p) {
  if (p < 1 || p > state.pages) return;
  state.page = p;
  loadBooks();
  document.querySelector('.main-content').scrollTop = 0;
}

// ── Stats ────────────────────────────────────────────────
async function loadStats() {
  const data = await apiJSON('/api/stats');
  state.stats = data;
  const el = document.getElementById('statsArea');
  if (!el) return;
  const fmts = Object.entries(data.formats || {}).map(([f, n]) => `<div class="stat-card"><div class="stat-value">${n}</div><div class="stat-label">${f.toUpperCase()}</div></div>`).join('');
  const mb = (data.total_size_bytes / 1024 / 1024).toFixed(0);
  el.innerHTML = `<div class="stats-grid">
    <div class="stat-card"><div class="stat-value">${data.total_books}</div><div class="stat-label">Total Books</div></div>
    <div class="stat-card"><div class="stat-value">${data.total_shelves}</div><div class="stat-label">Shelves</div></div>
    <div class="stat-card"><div class="stat-value">${mb} MB</div><div class="stat-label">Library Size</div></div>
    ${fmts}
  </div>`;
}

// ── Book Detail Dialog ───────────────────────────────────
async function openBook(id) {
  const book = await apiJSON(`/api/books/${id}`);
  state.selectedBook = book;
  const shelves = await apiJSON('/api/shelves');
  state.shelves = shelves;

  document.getElementById('bookDialogTitle').textContent = book.title || 'Book Details';

  const cover = book.cover_filename
    ? `<img src="/api/books/${id}/cover" alt="cover" style="width:120px;height:180px;object-fit:cover;border-radius:8px;flex-shrink:0">`
    : `<div style="width:120px;height:180px;background:var(--md-sys-color-surface-container-highest);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${svgBook(40)}</div>`;

  const shelfPills = (book.shelves || []).map(s => `<span class="shelf-pill">${esc(s)}</span>`).join('');

  document.getElementById('bookDialogBody').innerHTML = `
  <div style="display:flex;gap:20px;padding-bottom:20px;flex-wrap:wrap">
    <div style="display:flex;flex-direction:column;gap:8px;align-items:center;flex-shrink:0">
      ${cover}
      <button class="btn btn-text" style="font-size:12px;padding:4px 8px" onclick="openCoverDialog(${id})">Change Cover</button>
    </div>
    <div style="flex:1;min-width:200px">
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${shelfPills || '<span style="color:var(--md-sys-color-on-surface-variant);font-size:13px">No shelves</span>'}</div>
      <div class="form-row">
        <div class="form-field"><label>Title</label><input class="field" id="bTitle" value="${esc(book.title||'')}"></div>
        <div class="form-field"><label>Author</label><input class="field" id="bAuthor" value="${esc(book.author||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>ISBN-10</label><input class="field" id="bIsbn" value="${esc(book.isbn||'')}"></div>
        <div class="form-field"><label>ISBN-13</label><input class="field" id="bIsbn13" value="${esc(book.isbn13||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Publisher</label><input class="field" id="bPublisher" value="${esc(book.publisher||'')}"></div>
        <div class="form-field"><label>Published</label><input class="field" id="bPubDate" value="${esc(book.published_date||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Language</label><input class="field" id="bLanguage" value="${esc(book.language||'')}"></div>
        <div class="form-field"><label>Pages</label><input class="field" id="bPages" type="number" value="${book.page_count||''}"></div>
      </div>
      <div class="form-field"><label>Categories</label><input class="field" id="bCategories" value="${esc(book.categories||'')}"></div>
      <div class="form-field"><label>Description</label><textarea class="field" id="bDescription" rows="4">${esc(book.description||'')}</textarea></div>
    </div>
  </div>
  <div style="padding:4px 0 16px;font-size:12px;color:var(--md-sys-color-on-surface-variant)">
    File: ${esc(book.filename)} · ${formatBytes(book.file_size)} · Added ${fmtDate(book.date_added)}
  </div>`;

  document.getElementById('bookDialogFooter').innerHTML = `
    <button class="btn btn-text" style="color:var(--md-sys-color-error)" onclick="deleteBook(${id})">Delete</button>
    <div style="flex:1"></div>
    <button class="btn btn-outlined" onclick="openMetaSearch(${id})">Find Metadata</button>
    <button class="btn btn-tonal" onclick="openAddToShelf(${id})">Add to Shelf</button>
    <button class="btn btn-tonal" onclick="openSendDialog(${id})">Send to Kindle</button>
    <a class="btn btn-outlined" href="/api/books/${id}/download">Download</a>
    <button class="btn btn-filled" onclick="saveBook(${id})">Save</button>`;

  openDialog('bookDialog');
}

async function saveBook(id) {
  const data = {
    title: v('bTitle'), author: v('bAuthor'), isbn: v('bIsbn'), isbn13: v('bIsbn13'),
    publisher: v('bPublisher'), published_date: v('bPubDate'),
    language: v('bLanguage'), page_count: parseInt(v('bPages')) || null,
    categories: v('bCategories'), description: v('bDescription'),
  };
  await api(`/api/books/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  snack('Saved!');
  closeDialog('bookDialog');
  loadBooks();
}

async function deleteBook(id) {
  if (!confirm('Delete this book and its file permanently?')) return;
  await api(`/api/books/${id}`, { method: 'DELETE' });
  snack('Book deleted');
  closeDialog('bookDialog');
  loadBooks();
}

// ── Metadata Search ──────────────────────────────────────
function openMetaSearch(bookId) {
  state.selectedBook = state.books.find(b => b.id === bookId) || state.selectedBook;
  state.selectedMeta = null;
  document.getElementById('metaQuery').value = state.selectedBook?.title || '';
  document.getElementById('metaResults').innerHTML = '';
  document.getElementById('applyMetaBtn').disabled = true;
  openDialog('metaDialog');
}

async function searchMeta() {
  const q = document.getElementById('metaQuery').value.trim();
  const source = document.getElementById('metaSource').value;
  if (!q) return;
  document.getElementById('metaResults').innerHTML = '<div class="loading-indicator"><div class="spinner"></div></div>';
  const results = await apiJSON(`/api/metadata/search?q=${encodeURIComponent(q)}&source=${source}`);
  const list = Array.isArray(results) ? results : Object.values(results).flat();
  if (!list.length) {
    document.getElementById('metaResults').innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);padding:16px 0">No results found.</p>';
    return;
  }
  document.getElementById('metaResults').innerHTML = list.map((r, i) => `
    <div class="meta-result" data-index="${i}" onclick="selectMeta(${i})">
      <img src="${r.cover_url || ''}" alt="" onerror="this.style.display='none'" loading="lazy">
      <div class="meta-result-info">
        <div class="meta-result-title">${esc(r.title || 'Unknown')}</div>
        <div class="meta-result-author">${esc(r.author || '')} ${r.published_date ? '· ' + r.published_date.slice(0,4) : ''}</div>
        <div class="meta-result-source">${esc(r.source || source)}</div>
        ${r.publisher ? `<div style="font-size:11px;color:var(--md-sys-color-on-surface-variant)">${esc(r.publisher)}</div>` : ''}
      </div>
    </div>`).join('');
  window._metaResultsList = list;
}

function selectMeta(i) {
  state.selectedMeta = window._metaResultsList[i];
  document.querySelectorAll('.meta-result').forEach((el, idx) => el.classList.toggle('selected', idx === i));
  document.getElementById('applyMetaBtn').disabled = false;
}

async function applyMeta() {
  if (!state.selectedMeta || !state.selectedBook) return;
  await api(`/api/books/${state.selectedBook.id}/apply-metadata`, {
    method: 'POST', body: JSON.stringify(state.selectedMeta),
  });
  snack('Metadata applied!');
  closeDialog('metaDialog');
  openBook(state.selectedBook.id);
  loadBooks();
}

// ── Shelves ──────────────────────────────────────────────
async function loadShelves() {
  const data = await apiJSON('/api/shelves');
  state.shelves = data;
  const grid = document.getElementById('shelvesGrid');
  if (!data.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <svg viewBox="0 0 24 24"><path d="M2 4v16h20V4H2zm2 2h16v4H4V6zm0 6h4v6H4v-6zm6 6v-6h4v6h-4zm6 0v-6h4v6h-4z"/></svg>
      <h2>No shelves yet</h2>
      <p>Create a shelf to organize your books</p></div>`;
    return;
  }
  grid.innerHTML = data.map(s => `
    <div class="shelf-card" style="border-color:${s.color}" onclick="browseShelf(${s.id},'${esc(s.name)}')">
      <div class="shelf-card-name">${esc(s.name)}</div>
      <div class="shelf-card-count">${s.book_count} book${s.book_count !== 1 ? 's' : ''}</div>
      ${s.description ? `<div style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-top:4px">${esc(s.description)}</div>` : ''}
      <div class="shelf-card-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" onclick="editShelf(${s.id})" title="Edit">
          <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="icon-btn" style="color:var(--md-sys-color-error)" onclick="deleteShelf(${s.id})" title="Delete">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function browseShelf(id, name) {
  navigate('library', { shelf: { id, name } });
}

function openNewShelf() {
  state.shelfEditId = null;
  document.getElementById('shelfDialogTitle').textContent = 'New Shelf';
  document.getElementById('shelfName').value = '';
  document.getElementById('shelfDesc').value = '';
  document.getElementById('shelfColor').value = '#D0BCFF';
  openDialog('shelfDialog');
}

async function editShelf(id) {
  const shelf = state.shelves.find(s => s.id === id);
  if (!shelf) return;
  state.shelfEditId = id;
  document.getElementById('shelfDialogTitle').textContent = 'Edit Shelf';
  document.getElementById('shelfName').value = shelf.name;
  document.getElementById('shelfDesc').value = shelf.description || '';
  document.getElementById('shelfColor').value = shelf.color || '#D0BCFF';
  openDialog('shelfDialog');
}

async function saveShelf() {
  const body = {
    name: v('shelfName'), description: v('shelfDesc'), color: v('shelfColor'),
  };
  if (!body.name) { snack('Name is required'); return; }
  if (state.shelfEditId) {
    await api(`/api/shelves/${state.shelfEditId}`, { method: 'PUT', body: JSON.stringify(body) });
    snack('Shelf updated');
  } else {
    const res = await api('/api/shelves', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); snack(d.error || 'Error'); return; }
    snack('Shelf created');
  }
  closeDialog('shelfDialog');
  loadShelves();
}

async function deleteShelf(id) {
  if (!confirm('Delete this shelf? Books will not be deleted.')) return;
  await api(`/api/shelves/${id}`, { method: 'DELETE' });
  snack('Shelf deleted');
  loadShelves();
}

function openAddToShelf(bookId) {
  state.addToShelfBookId = bookId;
  const body = document.getElementById('addToShelfBody');
  if (!state.shelves.length) {
    body.innerHTML = '<p style="padding:16px 0;color:var(--md-sys-color-on-surface-variant)">No shelves yet. Create one in the Shelves tab first.</p>';
  } else {
    body.innerHTML = state.shelves.map(s => `
      <label style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-radius:8px" onmouseover="this.style.background='rgba(208,188,255,.08)'" onmouseout="this.style.background=''">
        <input type="checkbox" value="${s.id}" style="width:18px;height:18px;accent-color:var(--md-sys-color-primary)">
        <span style="color:var(--md-sys-color-on-surface)">${esc(s.name)}</span>
        <span style="color:var(--md-sys-color-on-surface-variant);font-size:12px">${s.book_count} books</span>
      </label>`).join('');
  }
  openDialog('addToShelfDialog');
}

async function confirmAddToShelf() {
  const checked = [...document.querySelectorAll('#addToShelfBody input[type=checkbox]:checked')].map(el => +el.value);
  if (!checked.length) { snack('Select at least one shelf'); return; }
  await Promise.all(checked.map(sid =>
    api(`/api/shelves/${sid}/books`, { method: 'POST', body: JSON.stringify({ book_id: state.addToShelfBookId }) })
  ));
  snack('Added to shelf!');
  closeDialog('addToShelfDialog');
}

// ── Send Dialog ──────────────────────────────────────────
async function openSendDialog(bookId) {
  state.sendBookId = bookId;
  const settings = await apiJSON('/api/settings');
  document.getElementById('sendRecipient').value = settings.kindle_email || '';
  document.getElementById('sendResult').textContent = '';
  openDialog('sendDialog');
}

async function confirmSend() {
  const recipient = v('sendRecipient');
  if (!recipient) { snack('Enter a recipient email'); return; }
  const btn = document.getElementById('confirmSendBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  document.getElementById('sendResult').textContent = '';
  const res = await api(`/api/books/${state.sendBookId}/send`, {
    method: 'POST', body: JSON.stringify({ recipient }),
  });
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Send';
  if (res.ok) {
    snack(data.message || 'Sent!');
    closeDialog('sendDialog');
  } else {
    document.getElementById('sendResult').style.color = 'var(--md-sys-color-error)';
    document.getElementById('sendResult').textContent = data.error || 'Send failed';
  }
}

// ── Cover Dialog ─────────────────────────────────────────
function openCoverDialog(bookId) {
  state.coverBookId = bookId;
  state.coverFile = null;
  document.getElementById('coverUrl').value = '';
  document.getElementById('coverPreviewArea').innerHTML = '';
  document.getElementById('coverInput').value = '';
  const book = state.selectedBook;
  document.getElementById('embedCoverBtn').style.display = (book && book.file_format === 'epub') ? '' : 'none';
  openDialog('coverDialog');
}

async function saveCover() {
  if (!state.coverBookId) return;
  let res;
  if (state.coverFile) {
    const fd = new FormData();
    fd.append('file', state.coverFile);
    res = await fetch(`/api/books/${state.coverBookId}/cover`, { method: 'POST', body: fd });
  } else {
    const url = v('coverUrl');
    if (!url) { snack('Select a file or enter a URL'); return; }
    res = await api(`/api/books/${state.coverBookId}/cover`, { method: 'POST', body: JSON.stringify({ url }) });
  }
  if (res.ok) {
    snack('Cover saved!');
    closeDialog('coverDialog');
    if (state.selectedBook) openBook(state.coverBookId);
    loadBooks();
  } else {
    const d = await res.json(); snack(d.error || 'Failed to save cover');
  }
}

async function embedCover() {
  const res = await api(`/api/books/${state.coverBookId}/cover/embed`, { method: 'POST' });
  const d = await res.json();
  if (res.ok) snack('Cover embedded in EPUB!');
  else snack(d.error || 'Embed failed');
}

// ── Upload ───────────────────────────────────────────────
function handleFiles(files) {
  const arr = [...files];
  arr.forEach(file => uploadFile(file));
}

async function uploadFile(file) {
  const queue = document.getElementById('uploadQueue');
  const itemId = `upload-${Date.now()}-${Math.random()}`;
  queue.insertAdjacentHTML('beforeend', `
    <div class="upload-item" id="${itemId}">
      <div class="upload-item-name">${esc(file.name)}</div>
      <div class="upload-item-bar"><div class="upload-item-fill" style="width:0%"></div></div>
    </div>`);
  const item = document.getElementById(itemId);
  const bar = item.querySelector('.upload-item-fill');

  const fd = new FormData();
  fd.append('file', file);

  // Simulate progress via XHR for real progress events
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/books/upload');
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 90) + '%';
    });
    xhr.addEventListener('load', () => {
      bar.style.width = '100%';
      bar.style.background = xhr.status < 300 ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
      if (xhr.status < 300) {
        const d = JSON.parse(xhr.responseText);
        item.insertAdjacentHTML('beforeend', `<div style="font-size:12px;color:var(--md-sys-color-primary);margin-top:4px">✓ ${esc(d.title || d.filename)}</div>`);
        resolve(d);
      } else {
        try { const d = JSON.parse(xhr.responseText); item.insertAdjacentHTML('beforeend', `<div style="font-size:12px;color:var(--md-sys-color-error);margin-top:4px">✗ ${esc(d.error)}</div>`); }
        catch { item.insertAdjacentHTML('beforeend', `<div style="font-size:12px;color:var(--md-sys-color-error);margin-top:4px">✗ Upload failed</div>`); }
        resolve(null);
      }
    });
    xhr.addEventListener('error', () => { bar.style.background = 'var(--md-sys-color-error)'; resolve(null); });
    xhr.send(fd);
  });

  // Apply naming scheme if not "original"
  const scheme = document.getElementById('uploadScheme').value;
  if (scheme !== 'original') {
    // The server applies the rename scheme during upload via settings
    // If user selected a per-upload scheme different from saved setting, update temporarily
  }
}

// ── Settings ─────────────────────────────────────────────
async function loadSettings() {
  const data = await apiJSON('/api/settings');
  setVal('smtpHost', data.smtp_host || '');
  setVal('smtpPort', data.smtp_port || '587');
  setVal('smtpUser', data.smtp_user || '');
  setVal('smtpPassword', data.smtp_password || '');
  setVal('smtpSender', data.smtp_sender || '');
  setVal('kindleEmail', data.kindle_email || '');
  document.getElementById('smtpTls').checked = (data.smtp_tls || 'true') === 'true';
  document.getElementById('autoMetadata').checked = (data.auto_metadata || 'false') === 'true';
  setVal('defaultMetaSource', data.default_metadata_source || 'google_books');
  setVal('renameScheme', data.rename_scheme || 'original');
  setVal('renameCustomTemplate', data.rename_custom_template || '');
  toggleCustomScheme();
}

async function saveSmtp() {
  const body = {
    smtp_host: v('smtpHost'), smtp_port: v('smtpPort'), smtp_user: v('smtpUser'),
    smtp_password: v('smtpPassword'), smtp_sender: v('smtpSender'),
    kindle_email: v('kindleEmail'), smtp_tls: document.getElementById('smtpTls').checked ? 'true' : 'false',
  };
  await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
  snack('SMTP settings saved!');
}

async function testSmtp() {
  const result = document.getElementById('smtpTestResult');
  result.textContent = 'Testing…';
  result.style.color = 'var(--md-sys-color-on-surface-variant)';
  const body = {
    smtp_host: v('smtpHost'), smtp_port: v('smtpPort'), smtp_user: v('smtpUser'),
    smtp_password: v('smtpPassword'), use_tls: document.getElementById('smtpTls').checked,
  };
  const res = await api('/api/settings/test-smtp', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) {
    result.style.color = 'var(--md-sys-color-primary)';
    result.textContent = '✓ Connection successful';
  } else {
    result.style.color = 'var(--md-sys-color-error)';
    result.textContent = '✗ ' + (data.error || 'Connection failed');
  }
}

async function saveMeta() {
  await api('/api/settings', { method: 'PUT', body: JSON.stringify({
    auto_metadata: document.getElementById('autoMetadata').checked ? 'true' : 'false',
    default_metadata_source: v('defaultMetaSource'),
  })});
  snack('Metadata settings saved!');
}

async function saveRename() {
  await api('/api/settings', { method: 'PUT', body: JSON.stringify({
    rename_scheme: v('renameScheme'),
    rename_custom_template: v('renameCustomTemplate'),
  })});
  snack('Naming scheme saved!');
}

function toggleCustomScheme() {
  const s = v('renameScheme');
  document.getElementById('customSchemeField').style.display = s === 'custom' ? '' : 'none';
}

async function changePassword() {
  const newPwd = v('newPwd');
  const confirmPwd = v('confirmPwd');
  const result = document.getElementById('pwdResult');
  result.textContent = '';
  if (newPwd !== confirmPwd) { result.style.color = 'var(--md-sys-color-error)'; result.textContent = 'Passwords do not match'; return; }
  const res = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({
    current_password: v('currentPwd'), new_password: newPwd,
  })});
  const data = await res.json();
  if (res.ok) { result.style.color = 'var(--md-sys-color-primary)'; result.textContent = '✓ Password changed'; }
  else { result.style.color = 'var(--md-sys-color-error)'; result.textContent = data.error || 'Failed'; }
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ── Dialog helpers ───────────────────────────────────────
function openDialog(id) { document.getElementById(id).classList.add('open'); }
function closeDialog(id) { document.getElementById(id).classList.remove('open'); }

// ── DOM helpers ──────────────────────────────────────────
function v(id) { return (document.getElementById(id) || {}).value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function svgBook(size=32) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" style="color:var(--md-sys-color-outline)"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`; }
function coverPlaceholderSvg() { return `<div class=\\"book-cover-placeholder\\">${svgBook()}</div>`; }
function formatBytes(n) { if (!n) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n/1024).toFixed(1) + ' KB'; return (n/1048576).toFixed(1) + ' MB'; }
function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString(); }

function closeMenu() { document.getElementById('userMenu').style.display = 'none'; }

// ── Event Listeners ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Nav rail + bottom nav (same data-view attribute)
  document.querySelectorAll('.nav-rail-item, .bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // Handle PWA shortcut hashes (e.g. /#upload, /#shelves)
  const hash = location.hash.replace('#', '');
  const validViews = ['library', 'shelves', 'upload', 'settings'];
  if (validViews.includes(hash)) {
    history.replaceState(null, '', '/');
    navigate(hash);
    return; // navigate calls loadBooks/etc, skip the default navigate below
  }

  // Upload FAB
  document.getElementById('uploadFab').addEventListener('click', () => navigate('upload'));

  // View toggle
  document.getElementById('viewGrid').addEventListener('click', () => {
    state.viewMode = 'grid';
    document.getElementById('viewGrid').classList.add('active');
    document.getElementById('viewList').classList.remove('active');
    renderBooks(document.getElementById('bookContainer'));
  });
  document.getElementById('viewList').addEventListener('click', () => {
    state.viewMode = 'list';
    document.getElementById('viewList').classList.add('active');
    document.getElementById('viewGrid').classList.remove('active');
    renderBooks(document.getElementById('bookContainer'));
  });

  // Search
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.q = e.target.value.trim();
      state.page = 1;
      loadBooks();
    }, 350);
  });

  // Format filters
  document.querySelectorAll('.filter-chip[data-format]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-format]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filters.format = chip.dataset.format;
      state.page = 1;
      loadBooks();
    });
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', e => { state.filters.sort = e.target.value; loadBooks(); });
  document.getElementById('orderSelect').addEventListener('change', e => { state.filters.order = e.target.value; loadBooks(); });

  // Dialog close buttons
  document.getElementById('closeBookDialog').addEventListener('click', () => closeDialog('bookDialog'));
  document.getElementById('closeMetaDialog').addEventListener('click', () => closeDialog('metaDialog'));
  document.getElementById('closeMetaDialogBtn').addEventListener('click', () => closeDialog('metaDialog'));
  document.getElementById('closeSendDialog').addEventListener('click', () => closeDialog('sendDialog'));
  document.getElementById('closeSendDialogBtn').addEventListener('click', () => closeDialog('sendDialog'));
  document.getElementById('closeShelfDialog').addEventListener('click', () => closeDialog('shelfDialog'));
  document.getElementById('closeShelfDialogBtn').addEventListener('click', () => closeDialog('shelfDialog'));
  document.getElementById('closeAddToShelf').addEventListener('click', () => closeDialog('addToShelfDialog'));
  document.getElementById('closeAddToShelfBtn').addEventListener('click', () => closeDialog('addToShelfDialog'));
  document.getElementById('closeCoverDialog').addEventListener('click', () => closeDialog('coverDialog'));
  document.getElementById('closeCoverDialogBtn').addEventListener('click', () => closeDialog('coverDialog'));

  // Close dialog on scrim click
  document.querySelectorAll('.dialog-scrim').forEach(scrim => {
    scrim.addEventListener('click', e => { if (e.target === scrim) scrim.classList.remove('open'); });
  });

  // Metadata dialog
  document.getElementById('metaSearchBtn').addEventListener('click', searchMeta);
  document.getElementById('metaQuery').addEventListener('keydown', e => { if (e.key === 'Enter') searchMeta(); });
  document.getElementById('applyMetaBtn').addEventListener('click', applyMeta);

  // Send dialog
  document.getElementById('confirmSendBtn').addEventListener('click', confirmSend);

  // Shelf dialog
  document.getElementById('newShelfBtn').addEventListener('click', openNewShelf);
  document.getElementById('saveShelfBtn').addEventListener('click', saveShelf);

  // Add to shelf
  document.getElementById('confirmAddToShelf').addEventListener('click', confirmAddToShelf);

  // Cover dialog
  const coverDropZone = document.getElementById('coverDropZone');
  coverDropZone.addEventListener('click', () => document.getElementById('coverInput').click());
  coverDropZone.addEventListener('dragover', e => { e.preventDefault(); coverDropZone.classList.add('dragover'); });
  coverDropZone.addEventListener('dragleave', () => coverDropZone.classList.remove('dragover'));
  coverDropZone.addEventListener('drop', e => {
    e.preventDefault(); coverDropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) { state.coverFile = file; previewCoverFile(file); }
  });
  document.getElementById('coverInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { state.coverFile = file; previewCoverFile(file); }
  });
  document.getElementById('saveCoverBtn').addEventListener('click', saveCover);
  document.getElementById('embedCoverBtn').addEventListener('click', embedCover);

  // Upload drop zone
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    document.getElementById('fileInput').addEventListener('change', e => handleFiles(e.target.files));
  }

  // Upload scheme toggle
  const schemeEl = document.getElementById('uploadScheme');
  if (schemeEl) {
    schemeEl.addEventListener('change', e => {
      state.uploadScheme = e.target.value;
      document.getElementById('customTemplateField').style.display = e.target.value === 'custom' ? '' : 'none';
    });
  }

  // Settings
  document.getElementById('saveSmtpBtn')?.addEventListener('click', saveSmtp);
  document.getElementById('testSmtpBtn')?.addEventListener('click', testSmtp);
  document.getElementById('saveMetaBtn')?.addEventListener('click', saveMeta);
  document.getElementById('saveRenameBtn')?.addEventListener('click', saveRename);
  document.getElementById('renameScheme')?.addEventListener('change', toggleCustomScheme);
  document.getElementById('changePwdBtn')?.addEventListener('click', changePassword);
  document.getElementById('logoutBtn')?.addEventListener('click', doLogout);

  // Settings tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab${cap(target)}`)?.classList.add('active');
    });
  });

  // User menu
  document.getElementById('userMenuBtn').addEventListener('click', e => {
    const menu = document.getElementById('userMenu');
    menu.style.display = menu.style.display === 'none' ? '' : 'none';
    e.stopPropagation();
  });
  document.addEventListener('click', closeMenu);

  // Set username in menu
  fetch('/api/auth/status').then(r => r.json()).then(d => {
    if (d.username) document.getElementById('userMenuLabel').textContent = 'Signed in as ' + d.username;
  });

  // Initial load
  navigate('library');
});

function previewCoverFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('coverPreviewArea').innerHTML =
      `<img src="${e.target.result}" style="max-height:200px;border-radius:8px;object-fit:contain">`;
  };
  reader.readAsDataURL(file);
}
