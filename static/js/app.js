/* =========================================================
   Bookie – Frontend Application
   ========================================================= */

'use strict';

// ── State ────────────────────────────────────────────────
const state = {
  view: 'library',
  books: [],
  stats: null,
  page: 1,
  pages: 1,
  total: 0,
  viewMode: localStorage.getItem('viewMode') || 'grid',
  filters: {
    q: '',
    format: '',
    sort: localStorage.getItem('sortBy') || 'author',
    order: localStorage.getItem('sortOrder') || 'asc',
  },
  activeTag: null,
  selectedBook: null,
  selectedMeta: null,
  sendBookId: null,
  coverBookId: null,
  coverFile: null,
  selectedCoverUrl: null,
};

// ── Color Themes ─────────────────────────────────────────
const THEMES = [
  {
    id: 'violet',
    label: 'Violet',
    primary: '#D0BCFF',
    onPrimary: '#381E72',
    primaryContainer: '#4F378B',
    onPrimaryContainer: '#EADDFF',
    secondary: '#CCC2DC',
    onSecondary: '#332D41',
    secondaryContainer: '#4A4458',
    onSecondaryContainer: '#E8DEF8',
  },
  {
    id: 'teal',
    label: 'Teal',
    primary: '#80DEEA',
    onPrimary: '#003F47',
    primaryContainer: '#005662',
    onPrimaryContainer: '#A8EEFF',
    secondary: '#80CBC4',
    onSecondary: '#003731',
    secondaryContainer: '#1F4E49',
    onSecondaryContainer: '#9EF2EB',
  },
  {
    id: 'green',
    label: 'Green',
    primary: '#A8D5A2',
    onPrimary: '#1A3D1A',
    primaryContainer: '#2D5A2D',
    onPrimaryContainer: '#C4EEC0',
    secondary: '#9CC496',
    onSecondary: '#163216',
    secondaryContainer: '#2A4B27',
    onSecondaryContainer: '#B8E0B2',
  },
  {
    id: 'rose',
    label: 'Rose',
    primary: '#FFB4AB',
    onPrimary: '#690005',
    primaryContainer: '#93000A',
    onPrimaryContainer: '#FFDAD6',
    secondary: '#E7BDB8',
    onSecondary: '#442927',
    secondaryContainer: '#5D3733',
    onSecondaryContainer: '#FFDAD6',
  },
  {
    id: 'amber',
    label: 'Amber',
    primary: '#FFD873',
    onPrimary: '#3A2F00',
    primaryContainer: '#554500',
    onPrimaryContainer: '#FFEEAB',
    secondary: '#D4C68A',
    onSecondary: '#373000',
    secondaryContainer: '#4E4600',
    onSecondaryContainer: '#F0E2A6',
  },
];

function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const root = document.documentElement;
  root.style.setProperty('--md-sys-color-primary', theme.primary);
  root.style.setProperty('--md-sys-color-on-primary', theme.onPrimary);
  root.style.setProperty('--md-sys-color-primary-container', theme.primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', theme.onPrimaryContainer);
  root.style.setProperty('--md-sys-color-secondary', theme.secondary);
  root.style.setProperty('--md-sys-color-on-secondary', theme.onSecondary);
  root.style.setProperty('--md-sys-color-secondary-container', theme.secondaryContainer);
  root.style.setProperty('--md-sys-color-on-secondary-container', theme.onSecondaryContainer);
  localStorage.setItem('colorTheme', themeId);
  // Update swatch selection state
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.theme === themeId);
  });
}

function renderThemeSwatches() {
  const container = document.getElementById('themeSwatches');
  if (!container) return;
  const active = localStorage.getItem('colorTheme') || 'violet';
  container.innerHTML = THEMES.map(t => `
    <button class="theme-swatch${t.id === active ? ' selected' : ''}" data-theme="${t.id}"
      onclick="applyTheme('${t.id}')" title="${t.label}"
      style="background:${t.primary}">
      <span class="theme-swatch-check">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </span>
    </button>`).join('');
}

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
function navigate(view) {
  state.view = view;
  if (view !== 'settings') {
    history.replaceState(null, '', view === 'library' ? '/' : '#' + view);
  }

  ['library', 'upload', 'settings'].forEach(v => {
    document.getElementById(`view${cap(v)}`).style.display = v === view ? '' : 'none';
  });

  if (view === 'library') {
    state.page = 1;
    loadBooks();
    loadTagFilter();
  } else if (view === 'settings') {
    loadSettings();
    loadEmailAddresses();
    const subTab = location.hash.replace('#settings/', '').replace('#settings', '');
    activateSettingsTab(SETTINGS_TABS.includes(subTab) ? subTab : 'smtp');
  }

  closeMenu();
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

const SETTINGS_TABS = ['smtp', 'metadata', 'rename', 'account', 'libstats', 'logs'];
function activateSettingsTab(target) {
  if (!SETTINGS_TABS.includes(target)) target = 'smtp';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === target));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab${cap(target)}`)?.classList.add('active');
  const sel = document.getElementById('settingsTabSelect');
  if (sel) sel.value = target;
  // Persist in URL hash so refresh restores the same sub-tab
  history.replaceState(null, '', `#settings/${target}`);
  if (target === 'libstats') loadStats();
  if (target === 'logs') loadLogs();
  if (target === 'account') renderThemeSwatches();
  if (target === 'rename') loadTagManagement();
}

function clearFilters() {
  state.filters = { q: '', format: '', sort: 'author', order: 'asc' };
  state.activeTag = null;
  state.page = 1;
  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.value = '';
  const formatEl = document.getElementById('formatSelect');
  if (formatEl) formatEl.value = '';
  const sortEl = document.getElementById('sortSelect');
  if (sortEl) sortEl.value = 'author';
  const orderBtn = document.getElementById('orderToggle');
  if (orderBtn) orderBtn.textContent = '↑ Asc';
  loadTagFilter();
  loadBooks();
  navigate('library');
}

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
  if (state.activeTag) params.set('tag', state.activeTag);

  // Show/hide clear filters button
  const _cfBtn = document.getElementById('clearFiltersBtn');
  if (_cfBtn) {
    const hasFilter = state.filters.q || state.filters.format || state.activeTag;
    _cfBtn.style.display = hasFilter ? '' : 'none';
  }

  const data = await apiJSON(`/api/books?${params}`);
  state.books = data.books || [];
  state.total = data.total || 0;
  state.pages = data.pages || 1;


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
    ? `<img class="book-cover" src="/api/books/${b.id}/cover?thumb=true" alt="${esc(b.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="book-cover-placeholder" style="display:none">${svgBook()}</div>`
    : `<div class="book-cover-placeholder">${svgBook()}</div>`;
  const seriesBadge = b.series_order != null ? `<span class="book-series-badge">#${b.series_order}</span>` : '';
  return `
  <div class="book-card" onclick="openBook(${b.id})">
    ${cover}
    ${seriesBadge}
    <div class="book-info">
      <div class="book-info-text">
        <div class="book-title">${esc(b.title || 'Untitled')}</div>
        <div class="book-author">${esc(b.author || 'Unknown author')}</div>
      </div>
      <div class="book-actions" onclick="event.stopPropagation()">
        <button class="icon-btn-sm" onclick="openCardMenu(event,${b.id})" title="More options">
          <svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

function bookListItem(b) {
  const thumb = b.cover_filename
    ? `<img class="book-list-thumb" src="/api/books/${b.id}/cover?thumb=true" alt="" loading="lazy" onerror="this.src=''">`
    : `<div class="book-list-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--md-sys-color-surface-container-highest)">${svgBook(24)}</div>`;
  const seriesMeta = b.series ? ` · ${esc(b.series)}${b.series_order != null ? ' #' + b.series_order : ''}` : '';
  return `
  <div class="book-list-item" onclick="openBook(${b.id})">
    ${thumb}
    <div class="book-list-info">
      <div class="book-list-title">${esc(b.title || 'Untitled')}</div>
      <div class="book-list-meta">${esc(b.author || 'Unknown')}${seriesMeta}</div>
    </div>
    <div class="book-list-actions" onclick="event.stopPropagation()">
      <button class="icon-btn" onclick="openCardMenu(event,${b.id})" title="More options">
        <svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
      </button>
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
  const el = document.getElementById('statsArea');
  if (!el) return;
  el.innerHTML = '<div class="loading-indicator" style="padding:24px"><div class="spinner"></div></div>';
  const data = await apiJSON('/api/stats');
  state.stats = data;
  const fmts = Object.entries(data.formats || {}).map(([f, n]) => `<div class="stat-card"><div class="stat-value">${n}</div><div class="stat-label">${f.toUpperCase()}</div></div>`).join('');
  const mb = (data.total_size_bytes / 1024 / 1024).toFixed(1);
  el.innerHTML = `<div class="stats-grid">
    <div class="stat-card"><div class="stat-value">${data.total_books}</div><div class="stat-label">Total Books</div></div>
    <div class="stat-card"><div class="stat-value">${mb} MB</div><div class="stat-label">Library Size</div></div>
    ${fmts}
  </div>`;
}

// ── Log Viewer ───────────────────────────────────────────
async function loadLogs() {
  const el = document.getElementById('logContent');
  if (!el) return;
  const level = document.getElementById('logLevelSelect')?.value || 'INFO';
  el.textContent = 'Loading…';
  const data = await apiJSON(`/api/logs?level=${level}`);
  el.textContent = (data.logs || []).join('\n') || '(no log entries)';
  el.scrollTop = el.scrollHeight;
}

async function saveLogLevel() {
  const level = document.getElementById('logLevelSelect')?.value || 'INFO';
  await api('/api/logs/level', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level }) });
  loadLogs();
}

function exportLogs() {
  const content = document.getElementById('logContent')?.textContent || '';
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookie-logs-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
}

// ── Book Detail Dialog ───────────────────────────────────
async function openBook(id) {
  const [book, allTags] = await Promise.all([
    apiJSON(`/api/books/${id}`),
    apiJSON('/api/tags'),
  ]);
  state.selectedBook = book;

  document.getElementById('bookDialogTitle').textContent = 'Book Details';

  const cover = book.cover_filename
    ? `<img src="/api/books/${id}/cover?t=${Date.now()}" alt="cover" class="book-dialog-cover">`
    : `<div class="book-dialog-cover book-dialog-cover-placeholder">${svgBook(56)}</div>`;

  const bookTagNames = new Set(book.tags || []);

  // Build compact tag multi-select options
  const tagOptsHtml = allTags.length
    ? allTags.map(t => {
        const checked = bookTagNames.has(t.name);
        return `<label class="tag-ms-opt${checked ? ' checked' : ''}">
          <input type="checkbox" data-tag-id="${t.id}" data-tag-name="${esc(t.name)}"${checked ? ' checked' : ''}>
          <span>${esc(t.name)}</span>
        </label>`;
      }).join('')
    : `<span class="tag-empty-hint" style="padding:8px 12px;display:block">No tags yet — add in Settings → File Organization</span>`;

  const selCount = bookTagNames.size;
  const tagLabel = selCount === 0 ? 'None'
    : selCount === 1 ? [...bookTagNames][0]
    : `${selCount} selected`;

  document.getElementById('bookDialogBody').innerHTML = `
  <div class="book-dialog-layout">
    <div class="book-dialog-cover-col">
      ${cover}
      <button class="btn btn-text btn-sm" onclick="openCoverDialog(${id})">Change Cover</button>
    </div>
    <div class="book-dialog-fields">
      <div class="form-field">
        <label>Title</label>
        <input class="field" id="bTitle" value="${esc(book.title||'')}">
      </div>
      <div class="form-row">
        <div class="form-field"><label>Author</label><input class="field" id="bAuthor" value="${esc(book.author||'')}"></div>
        <div class="form-field"><label>Published</label><input class="field" id="bPubDate" value="${esc(book.published_date||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Series</label><input class="field" id="bSeries" value="${esc(book.series||'')}"></div>
        <div class="form-field"><label>Series #</label><input class="field" id="bSeriesOrder" type="number" step="0.1" value="${book.series_order??''}"></div>
      </div>
      <div class="form-field">
        <label>Tags</label>
        <div class="tag-multi-select" id="tagMultiSelect">
          <button type="button" class="tag-ms-trigger" id="tagMsTrigger">
            <span id="tagMsLabel">${esc(tagLabel)}</span>
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;flex-shrink:0"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
          <div class="tag-ms-panel" id="tagMsPanel">${tagOptsHtml}</div>
        </div>
      </div>
    </div>
  </div>
  <div class="book-dialog-file-info">
    ${esc(book.filename)} · ${formatBytes(book.file_size)} · Added ${fmtDate(book.date_added)}
  </div>`;

  document.getElementById('bookDialogFooter').innerHTML = `
    <button class="btn btn-text dialog-footer-delete" onclick="deleteBook(${id})">Delete</button>
    <div class="dialog-footer-actions">
      <button class="btn btn-outlined" onclick="openMetaSearch(${id})">Find Metadata</button>
      <button class="btn btn-filled" onclick="saveBook(${id})">Save</button>
    </div>`;

  // Tag multi-select: toggle panel
  document.getElementById('tagMsTrigger')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('tagMsPanel')?.classList.toggle('open');
  });

  // Tag multi-select: close on outside click
  function closeTagPanel(e) {
    if (!document.getElementById('tagMultiSelect')?.contains(e.target)) {
      document.getElementById('tagMsPanel')?.classList.remove('open');
      document.removeEventListener('click', closeTagPanel);
    }
  }
  document.addEventListener('click', closeTagPanel);

  // Tag multi-select: checkbox changes → API calls
  document.querySelectorAll('#tagMsPanel input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const tagId = parseInt(cb.dataset.tagId);
      const tagName = cb.dataset.tagName;
      if (cb.checked) {
        const res = await api(`/api/books/${id}/tags`, { method: 'POST', body: JSON.stringify({ name: tagName }) });
        if (!res.ok) { cb.checked = false; return; }
        cb.closest('.tag-ms-opt')?.classList.add('checked');
      } else {
        const res = await api(`/api/books/${id}/tags/${tagId}`, { method: 'DELETE' });
        if (!res.ok) { cb.checked = true; return; }
        cb.closest('.tag-ms-opt')?.classList.remove('checked');
      }
      // Update trigger label
      const checked = [...document.querySelectorAll('#tagMsPanel input:checked')];
      const count = checked.length;
      const labelEl = document.getElementById('tagMsLabel');
      if (labelEl) {
        labelEl.textContent = count === 0 ? 'None'
          : count === 1 ? checked[0].dataset.tagName
          : `${count} selected`;
      }
      // Keep state in sync
      const refreshed = await apiJSON(`/api/books/${id}`);
      state.selectedBook = refreshed;
      loadTagFilter();
    });
  });

  openDialog('bookDialog');
  document.getElementById('bookDialogBody').scrollTop = 0;
}

async function saveBook(id) {
  const data = {
    title: v('bTitle') || null,
    author: v('bAuthor'),
    published_date: v('bPubDate'),
    series: v('bSeries') || null,
    series_order: parseFloat(v('bSeriesOrder')) || null,
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
async function openMetaSearch(bookId) {
  state.selectedBook = state.books.find(b => b.id === bookId) || state.selectedBook;
  state.selectedMeta = null;
  const query = [state.selectedBook?.title, state.selectedBook?.author].filter(Boolean).join(' ');
  document.getElementById('metaQuery').value = query;
  document.getElementById('metaResults').innerHTML = '';
  document.getElementById('applyMetaBtn').disabled = true;
  // Populate source chips from enabled sources (use cached or fetch fresh)
  if (!window._srcData) window._srcData = await apiJSON('/api/metadata/sources');
  renderSourceChips(window._srcData);
  openDialog('metaDialog');
}

function _activeSources() {
  return [...document.querySelectorAll('#metaSourceChips .filter-chip.active')]
    .map(c => c.dataset.src);
}

async function searchMeta() {
  const q = document.getElementById('metaQuery').value.trim();
  if (!q) return;
  const sources = _activeSources();
  if (!sources.length) {
    document.getElementById('metaResults').innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);padding:16px 0">Select at least one source.</p>';
    return;
  }
  document.getElementById('metaResults').innerHTML = '<div class="loading-indicator"><div class="spinner"></div></div>';
  const results = await apiJSON(`/api/metadata/search?q=${encodeURIComponent(q)}&sources=${sources.join(',')}`);
  if (!Array.isArray(results)) {
    document.getElementById('metaResults').innerHTML = `<p style="color:var(--md-sys-color-error);padding:16px 0">${esc(results?.error || 'Search failed')}</p>`;
    return;
  }
  const list = results;
  window._metaResultsList = list;
  renderMetaResults(list);
}

const SOURCE_LABELS = { google_books: 'Google Books', open_library: 'Open Library', itunes: 'Apple Books', goodreads: 'GoodReads' };

function renderMetaResults(list) {
  if (!list.length) {
    document.getElementById('metaResults').innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);padding:16px 0">No results found.</p>';
    return;
  }
  document.getElementById('metaResults').innerHTML = list.map((r, i) => {
    const year = r.published_date ? r.published_date.slice(0, 4) : '';
    const meta_line = [r.author, year].filter(Boolean).join(' · ');
    const detail_parts = [
      r.publisher ? esc(r.publisher) : null,
      r.rating ? `★ ${parseFloat(r.rating).toFixed(1)}` : null,
    ].filter(Boolean);
    const desc_snippet = r.description ? esc(r.description.slice(0, 120)) + (r.description.length > 120 ? '…' : '') : '';
    const cats = r.categories ? `<div class="meta-result-cats">${esc(r.categories.split(',').slice(0,3).join(' · '))}</div>` : '';
    return `
    <div class="meta-result" data-index="${i}" onclick="selectMeta(${i})" title="Click to import this metadata">
      ${r.cover_url ? `<img src="${esc(r.cover_url)}" alt="" onerror="this.style.display='none'" loading="lazy">` : '<div class="meta-result-no-cover"></div>'}
      <div class="meta-result-info">
        <div class="meta-result-title">${esc(r.title || 'Unknown')}</div>
        ${meta_line ? `<div class="meta-result-author">${esc(meta_line)}</div>` : ''}
        ${detail_parts.length ? `<div class="meta-result-details">${detail_parts.join(' · ')}</div>` : ''}
        ${desc_snippet ? `<div class="meta-result-desc">${desc_snippet}</div>` : ''}
        ${cats}
        <span class="meta-source-badge">${esc(SOURCE_LABELS[r.source] || r.source || '')}</span>
      </div>
    </div>`;
  }).join('');
}

async function selectMeta(i) {
  if (!state.selectedBook) return;
  const meta = window._metaResultsList[i];
  if (!meta) return;
  // Highlight selection
  document.querySelectorAll('.meta-result').forEach((el, idx) => el.classList.toggle('selected', idx === i));
  document.getElementById('applyMetaBtn').disabled = false;
  // Auto-import immediately
  await api(`/api/books/${state.selectedBook.id}/apply-metadata`, {
    method: 'POST', body: JSON.stringify(meta),
  });
  snack('Metadata imported!');
  closeDialog('metaDialog');
  openBook(state.selectedBook.id);
  loadBooks();
}

// ── Tags ─────────────────────────────────────────────────
async function loadTagFilter() {
  const sel = document.getElementById('tagSelect');
  if (!sel) return;
  const tags = await apiJSON('/api/tags');
  sel.style.display = tags.length ? '' : 'none';
  const prev = state.activeTag;
  sel.innerHTML = '<option value="">All Tags</option>' +
    tags.map(t => `<option value="${esc(t.name)}"${t.name === prev ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  if (prev && !tags.find(t => t.name === prev)) {
    state.activeTag = null;
  }
}

function setTagFilter(name) {
  state.activeTag = name || null;
  state.page = 1;
  loadBooks();
}


// ── Tag management (settings) ─────────────────────────────
async function loadTagManagement() {
  const el = document.getElementById('tagManageList');
  if (!el) return;
  const tags = await apiJSON('/api/tags');
  if (!tags.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);padding:8px 0">No tags yet.</p>';
    return;
  }
  el.innerHTML = tags.map(t => `
    <div class="tag-manage-row">
      <span class="tag-manage-name">${esc(t.name)}</span>
      <button class="icon-btn" style="color:var(--md-sys-color-error)" onclick="deleteTagAdmin(${t.id})" title="Delete tag">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>`).join('');
}

async function deleteTagAdmin(tagId) {
  await api(`/api/tags/${tagId}`, { method: 'DELETE' });
  snack('Tag deleted');
  loadTagManagement();
  loadTagFilter();
}

async function addTagAdmin() {
  const input = document.getElementById('newTagInput');
  const name = input?.value.trim();
  if (!name) return;
  input.value = '';
  await api('/api/tags', { method: 'POST', body: JSON.stringify({ name }) });
  loadTagManagement();
  loadTagFilter();
}

// ── Send ─────────────────────────────────────────────────
// Send immediately to the default address (called from split-btn left side)
async function sendToDefault(bookId) {
  const addresses = await apiJSON('/api/email-addresses');
  const def = addresses.find(a => a.is_default);
  if (!def) {
    // No default set — fall through to picker
    openSendPicker(bookId, null);
    return;
  }
  await executeSend(bookId, def.email, def.label);
}

// Open the address picker dropdown anchored to `anchorEl` (or dialog if null)
async function openSendPicker(bookId, anchorEl) {
  closeSendPicker();
  state.sendBookId = bookId;
  const addresses = await apiJSON('/api/email-addresses');

  const picker = document.createElement('div');
  picker.className = 'send-picker';
  picker.id = 'sendPickerPopup';

  if (addresses.length) {
    picker.innerHTML = `
      <div class="send-picker-header">Send to…</div>
      ${addresses.map(a => `
        <button class="send-picker-item" onclick="event.stopPropagation();pickAndSend(${bookId},'${esc(a.email)}','${esc(a.label)}')">
          <div class="send-picker-item-info">
            <div class="send-picker-item-label">${esc(a.label)}</div>
            <div class="send-picker-item-email">${esc(a.email)}</div>
          </div>
          ${a.is_default ? '<span class="send-picker-item-default">Default</span>' : ''}
        </button>`).join('')}
      <hr class="send-picker-divider">
      <button class="send-picker-add" onclick="closeSendPicker();openSendDialog(${bookId})">
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
        Enter a different address…
      </button>`;
  } else {
    picker.innerHTML = `
      <div style="padding:16px;font-size:14px;color:var(--md-sys-color-on-surface-variant)">No saved addresses yet.</div>
      <button class="send-picker-add" onclick="closeSendPicker();openSendDialog(${bookId})">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>
        Enter address manually…
      </button>`;
  }

  document.body.appendChild(picker);

  // Position relative to anchor button or centre of screen
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const pw = 260;
    let left = rect.right - pw;
    if (left < 8) left = 8;
    let top = rect.bottom + 6;
    if (top + 300 > window.innerHeight) top = rect.top - picker.offsetHeight - 6;
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
  } else {
    picker.style.left = '50%';
    picker.style.top = '50%';
    picker.style.transform = 'translate(-50%,-50%)';
  }

  // Close on outside click
  setTimeout(() => document.addEventListener('click', closeSendPicker, { once: true }), 10);
}

function closeSendPicker() {
  document.getElementById('sendPickerPopup')?.remove();
}

// ── Book Card Context Menu ─────────────────────────────────
function openCardMenu(event, bookId) {
  event.stopPropagation();
  closeCardMenu();

  const menu = document.createElement('div');
  menu.id = 'cardMenuPopup';
  menu.className = 'card-menu-popup';
  menu.innerHTML = `
    <div class="card-menu-send-row" onclick="event.stopPropagation()">
      <button class="card-menu-send-main" onclick="closeCardMenu();sendToDefault(${bookId})">
        <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg>
        Send
      </button>
      <button class="card-menu-send-arrow" title="Choose address" onclick="event.stopPropagation();openSendPicker(${bookId},this)">
        <svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
      </button>
    </div>
    <a href="/api/books/${bookId}/download" onclick="closeCardMenu()">
      <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      Download
    </a>`;

  document.body.appendChild(menu);

  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menuWidth = 180;
  let left = rect.right - menuWidth;
  if (left < 8) left = 8;
  let top = rect.bottom + 4;
  if (top + 140 > window.innerHeight) top = rect.top - 140;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  setTimeout(() => document.addEventListener('click', closeCardMenu, { once: true }), 10);
}

function closeCardMenu() {
  document.getElementById('cardMenuPopup')?.remove();
}

async function pickAndSend(bookId, email, label) {
  closeSendPicker();
  await executeSend(bookId, email, label);
}

async function executeSend(bookId, recipient, label) {
  const book = state.books.find(b => b.id === bookId) || state.selectedBook;
  const title = book?.title || `Book #${bookId}`;
  snack(`Sending "${title}" to ${label || recipient}…`, 6000);
  const res = await api(`/api/books/${bookId}/send`, {
    method: 'POST', body: JSON.stringify({ recipient }),
  });
  const data = await res.json();
  if (res.ok) {
    snack(data.message || `Sent to ${recipient}`);
  } else {
    snack(`Send failed: ${data.error || 'Unknown error'}`, 5000);
  }
}

// Manual address dialog (fallback when no addresses saved, or "Enter different")
function openSendDialog(bookId) {
  state.sendBookId = bookId;
  const book = state.books.find(b => b.id === bookId) || state.selectedBook;
  document.getElementById('sendDialogTitle').textContent =
    `Send "${book?.title || 'Book'}"`;
  document.getElementById('sendDialogBody').innerHTML = `
    <div class="form-field">
      <label>Recipient Email</label>
      <input class="field" id="sendRecipient" type="email" placeholder="yourname@kindle.com" autofocus>
    </div>
    <div id="sendResult" style="font-size:14px;margin-top:4px"></div>`;
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

// ── Email Address Management ──────────────────────────────
let _emailAddrEditId = null;

async function loadEmailAddresses() {
  const addresses = await apiJSON('/api/email-addresses');
  const el = document.getElementById('emailAddressList');
  if (!el) return;
  if (!addresses.length) {
    el.innerHTML = `<p style="color:var(--md-sys-color-on-surface-variant);font-size:14px;padding:8px 0">
      No email addresses saved yet. Add your Kindle address to get started.</p>`;
    return;
  }
  el.innerHTML = addresses.map(a => `
    <div class="email-addr-row">
      <div class="email-addr-info">
        <div class="email-addr-label">${esc(a.label)}</div>
        <div class="email-addr-email">${esc(a.email)}</div>
      </div>
      ${a.is_default ? '<span class="email-addr-default-badge">Default</span>' : `<button class="btn btn-text" style="font-size:12px;padding:6px 10px" onclick="setDefaultEmail(${a.id})">Set default</button>`}
      <button class="icon-btn" onclick="editEmailAddr(${a.id})" title="Edit">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
      </button>
      <button class="icon-btn" style="color:var(--md-sys-color-error)" onclick="deleteEmailAddr(${a.id})" title="Delete">
        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>`).join('');
}

function openAddEmailAddr() {
  _emailAddrEditId = null;
  document.getElementById('emailAddrDialogTitle').textContent = 'Add Email Address';
  document.getElementById('emailAddrLabel').value = '';
  document.getElementById('emailAddrEmail').value = '';
  document.getElementById('emailAddrDefault').checked = false;
  document.getElementById('emailAddrResult').textContent = '';
  openDialog('emailAddrDialog');
}

function editEmailAddr(id) {
  const list = document.querySelectorAll('.email-addr-row');
  // Fetch from API to get current values
  apiJSON(`/api/email-addresses`).then(addresses => {
    const a = addresses.find(x => x.id === id);
    if (!a) return;
    _emailAddrEditId = id;
    document.getElementById('emailAddrDialogTitle').textContent = 'Edit Email Address';
    document.getElementById('emailAddrLabel').value = a.label;
    document.getElementById('emailAddrEmail').value = a.email;
    document.getElementById('emailAddrDefault').checked = a.is_default;
    document.getElementById('emailAddrResult').textContent = '';
    openDialog('emailAddrDialog');
  });
}

async function saveEmailAddr() {
  const label = v('emailAddrLabel').trim();
  const email = v('emailAddrEmail').trim();
  const is_default = document.getElementById('emailAddrDefault').checked;
  const resultEl = document.getElementById('emailAddrResult');
  if (!email) { resultEl.style.color='var(--md-sys-color-error)'; resultEl.textContent='Email is required'; return; }

  let res;
  if (_emailAddrEditId) {
    res = await api(`/api/email-addresses/${_emailAddrEditId}`, {
      method: 'PUT', body: JSON.stringify({ label, email, is_default }),
    });
  } else {
    res = await api('/api/email-addresses', {
      method: 'POST', body: JSON.stringify({ label, email, is_default }),
    });
  }
  const data = await res.json();
  if (!res.ok) { resultEl.style.color='var(--md-sys-color-error)'; resultEl.textContent=data.error||'Error'; return; }
  snack(_emailAddrEditId ? 'Address updated' : 'Address saved');
  closeDialog('emailAddrDialog');
  loadEmailAddresses();
}

async function deleteEmailAddr(id) {
  if (!confirm('Remove this email address?')) return;
  await api(`/api/email-addresses/${id}`, { method: 'DELETE' });
  snack('Address removed');
  loadEmailAddresses();
}

async function setDefaultEmail(id) {
  await api(`/api/email-addresses/${id}/set-default`, { method: 'POST' });
  snack('Default address updated');
  loadEmailAddresses();
}

// ── Cover Dialog ─────────────────────────────────────────
function openCoverDialog(bookId) {
  state.coverBookId = bookId;
  state.coverFile = null;
  state.selectedCoverUrl = null;
  document.getElementById('coverUrl').value = '';
  document.getElementById('coverPreviewArea').innerHTML = '';
  document.getElementById('coverInput').value = '';
  document.getElementById('coverSearchResults').innerHTML = '';
  const book = state.selectedBook;
  const query = [book?.title, book?.author].filter(Boolean).join(' ');
  document.getElementById('coverSearchQuery').value = query;
  openDialog('coverDialog');
  if (query) searchCovers();
}

async function searchCovers() {
  const q = document.getElementById('coverSearchQuery').value.trim();
  if (!q) return;
  const resultsEl = document.getElementById('coverSearchResults');
  resultsEl.innerHTML = '<div class="loading-indicator" style="padding:16px"><div class="spinner"></div></div>';
  // Search all enabled sources for cover-rich results
  const results = await apiJSON(`/api/metadata/search?q=${encodeURIComponent(q)}`);
  const list = Array.isArray(results) ? results : [];
  const withCovers = list.filter(r => r.cover_url);
  if (!withCovers.length) {
    resultsEl.innerHTML = '<p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);padding:8px 0">No covers found.</p>';
    return;
  }
  resultsEl.innerHTML = `<div class="cover-search-grid">${withCovers.map((r, i) => `
    <div class="cover-search-item" data-url="${esc(r.cover_url)}" data-index="${i}" onclick="selectSearchCover(this,'${esc(r.cover_url)}')">
      <div class="cover-img-wrap" style="position:relative">
        <img src="${esc(r.cover_url)}" alt="${esc(r.title || '')}" loading="lazy"
          onerror="this.closest('.cover-search-item').style.display='none'"
          onload="this.nextElementSibling.textContent=this.naturalWidth+'×'+this.naturalHeight">
        <span class="cover-res-badge"></span>
      </div>
      <div class="cover-search-item-title">${esc(r.title || '')} <span style="font-size:9px;opacity:.7">${esc(SOURCE_LABELS[r.source]||r.source||'')}</span></div>
    </div>`).join('')}</div>`;
}

function selectSearchCover(el, url) {
  // Show preview modal – apply only if user confirms
  const img = document.getElementById('coverPreviewImg');
  const dims = document.getElementById('coverPreviewDims');
  img.src = url;
  dims.textContent = 'Loading…';
  img.onload = () => { dims.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`; };
  img.onerror = () => { dims.textContent = 'Could not load image'; };
  document.getElementById('applyPreviewCoverBtn').onclick = () => {
    document.querySelectorAll('.cover-search-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    state.selectedCoverUrl = url;
    state.coverFile = null;
    document.getElementById('coverUrl').value = '';
    document.getElementById('coverPreviewArea').innerHTML =
      `<img src="${esc(url)}" style="max-height:160px;border-radius:8px;object-fit:contain;margin-top:8px">`;
    closeDialog('coverPreviewModal');
  };
  openDialog('coverPreviewModal');
}

async function saveCover() {
  if (!state.coverBookId) return;
  let res;
  if (state.coverFile) {
    const fd = new FormData();
    fd.append('file', state.coverFile);
    res = await fetch(`/api/books/${state.coverBookId}/cover`, { method: 'POST', body: fd });
  } else {
    const url = state.selectedCoverUrl || v('coverUrl');
    if (!url) { snack('Select a file, search result, or enter a URL'); return; }
    res = await api(`/api/books/${state.coverBookId}/cover`, { method: 'POST', body: JSON.stringify({ url }) });
  }
  if (!res.ok) {
    const d = await res.json(); snack(d.error || 'Failed to save cover'); return;
  }
  // Auto-embed cover into EPUB after saving
  const book = state.selectedBook;
  if (book && book.file_format === 'epub') {
    const embedRes = await api(`/api/books/${state.coverBookId}/cover/embed`, { method: 'POST' });
    if (embedRes.ok) snack('Cover saved and embedded in EPUB!');
    else snack('Cover saved (embed failed)');
  } else {
    snack('Cover saved!');
  }
  closeDialog('coverDialog');
  if (state.selectedBook) openBook(state.coverBookId);
  loadBooks();
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
  const result = await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/books/upload');
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 90) + '%';
    });
    xhr.addEventListener('load', () => {
      bar.style.width = '100%';
      bar.style.background = xhr.status < 300 ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)';
      if (xhr.status < 300) {
        let d;
        try { d = JSON.parse(xhr.responseText); } catch { d = {}; }
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

}

// ── Settings ─────────────────────────────────────────────
async function loadSettings() {
  const [data, srcData] = await Promise.all([
    apiJSON('/api/settings'),
    apiJSON('/api/metadata/sources'),
  ]);
  window._srcData = srcData;
  setVal('smtpHost', data.smtp_host || '');
  setVal('smtpPort', data.smtp_port || '587');
  setVal('smtpUser', data.smtp_user || '');
  setVal('smtpPassword', data.smtp_password || '');
  setVal('smtpSender', data.smtp_sender || '');
  document.getElementById('smtpTls').checked = (data.smtp_tls || 'true') === 'true';
  document.getElementById('autoMetadata').checked = (data.auto_metadata || 'false') === 'true';
  document.getElementById('metaReplaceMissing').checked = (data.meta_replace_missing || 'true') === 'true';
  setVal('folderOrganization', data.folder_organization || 'flat');
  setVal('renameScheme', data.rename_scheme || 'original');
  setVal('renameCustomTemplate', data.rename_custom_template || '');
  toggleCustomScheme();
  renderSourceToggles(srcData);
}

function renderSourceChips(srcData) {
  const container = document.getElementById('metaSourceChips');
  if (!container || !srcData) return;
  const disabled = new Set(srcData.disabled || []);
  const priority = (srcData.priority || srcData.all || []).filter(s => !disabled.has(s));
  container.innerHTML = priority.map(s =>
    `<button class="filter-chip active" data-src="${s}">${esc(SOURCE_LABELS[s] || s)}</button>`
  ).join('');
}

function renderSourceToggles(srcData) {
  const el = document.getElementById('sourceToggles');
  if (!el || !srcData) return;
  // Use saved priority order, append any unranked sources at end
  const priority = srcData.priority || [];
  const allSources = srcData.all || [];
  const ordered = [
    ...priority.filter(s => allSources.includes(s)),
    ...allSources.filter(s => !priority.includes(s)),
  ];
  const disabled = new Set(srcData.disabled || []);
  const labels = srcData.labels || {};
  el.innerHTML = ordered.map(s => `
    <div class="source-toggle-row" data-source="${s}">
      <div class="source-drag-handle">
        <svg viewBox="0 0 24 24"><path d="M20 9H4v2h16V9zM4 15h16v-2H4v2z"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:500">${labels[s] || s}</div>
      </div>
      <label class="switch">
        <input type="checkbox" class="source-enabled-chk" data-source="${s}" ${disabled.has(s) ? '' : 'checked'}>
        <span class="switch-track"></span>
        <span class="switch-thumb"></span>
      </label>
    </div>`).join('');
  initSourceDrag(el);
}

function initSourceDrag(container) {
  let dragged = null;
  container.querySelectorAll('.source-toggle-row').forEach(row => {
    row.draggable = true;
    row.addEventListener('dragstart', () => { dragged = row; row.style.opacity = '0.5'; });
    row.addEventListener('dragend', () => { dragged = null; row.style.opacity = ''; });
    row.addEventListener('dragover', e => { e.preventDefault(); if (dragged && dragged !== row) container.insertBefore(dragged, row); });
  });
}

async function saveSmtp() {
  const body = {
    smtp_host: v('smtpHost'), smtp_port: v('smtpPort'), smtp_user: v('smtpUser'),
    smtp_password: v('smtpPassword'), smtp_sender: v('smtpSender'),
    smtp_tls: document.getElementById('smtpTls').checked ? 'true' : 'false',
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
    meta_replace_missing: document.getElementById('metaReplaceMissing').checked ? 'true' : 'false',
  })});
  snack('Metadata settings saved!');
}

async function saveOrganization() {
  await api('/api/settings', { method: 'PUT', body: JSON.stringify({
    rename_scheme: v('renameScheme'),
    rename_custom_template: v('renameCustomTemplate'),
    folder_organization: v('folderOrganization'),
  })});
  snack('File organization settings saved!');
}


async function saveSources() {
  const rows = [...document.querySelectorAll('#sourceToggles .source-toggle-row')];
  const priority = rows.map(r => r.dataset.source);
  const disabled = rows.filter(r => !r.querySelector('.source-enabled-chk').checked).map(r => r.dataset.source);
  await api('/api/metadata/sources', { method: 'PUT', body: JSON.stringify({ priority, disabled }) });
  window._srcData = null; // invalidate cache so chips refresh on next dialog open
  snack('Source settings saved!');
}

async function sendTestEmail() {
  const result = document.getElementById('smtpTestResult');
  const recipient = v('smtpTestRecipient').trim();
  if (!recipient) { snack('Enter a test recipient email'); return; }
  result.textContent = 'Sending…';
  result.style.color = 'var(--md-sys-color-on-surface-variant)';
  const body = {
    smtp_host: v('smtpHost'), smtp_port: v('smtpPort'), smtp_user: v('smtpUser'),
    smtp_password: v('smtpPassword'), use_tls: document.getElementById('smtpTls').checked,
    sender_email: v('smtpSender'), recipient,
  };
  const res = await api('/api/settings/test-smtp-send', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (data.success) {
    result.style.color = 'var(--md-sys-color-primary)';
    result.textContent = '✓ ' + (data.message || 'Test email sent!');
  } else {
    result.style.color = 'var(--md-sys-color-error)';
    result.textContent = '✗ ' + (data.error || 'Failed');
  }
}

async function bulkRenamePreview() {
  const statusEl = document.getElementById('bulkRenameStatus');
  const previewEl = document.getElementById('bulkRenamePreview');
  const applyBtn = document.getElementById('bulkRenameApplyBtn');
  statusEl.textContent = 'Loading preview…';
  previewEl.innerHTML = '';
  applyBtn.disabled = true;
  const res = await apiJSON('/api/rename/bulk', { method: 'POST', body: JSON.stringify({ apply: false }) });
  const changed = res.results.filter(r => r.changed);
  const unchanged = res.results.filter(r => !r.changed).length;
  if (!changed.length && !res.errors.length) {
    statusEl.textContent = `All ${unchanged} files already match the current scheme.`;
    return;
  }
  statusEl.textContent = `${changed.length} file${changed.length !== 1 ? 's' : ''} will be renamed. ${unchanged} already match. ${res.errors.length ? `${res.errors.length} error(s).` : ''}`;
  previewEl.innerHTML = [
    ...changed.map(r => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--md-sys-color-outline-variant)">
      <span style="color:var(--md-sys-color-on-surface-variant)">${esc(r.original)}</span>
      <span style="margin:0 6px;color:var(--md-sys-color-primary)">→</span>
      <span>${esc(r.new)}</span></div>`),
    ...res.errors.map(e => `<div style="font-size:12px;padding:4px 0;color:var(--md-sys-color-error)">${esc(e.original)}: ${esc(e.error)}</div>`),
  ].join('');
  applyBtn.disabled = changed.length === 0;
}

async function bulkRenameApply() {
  const statusEl = document.getElementById('bulkRenameStatus');
  const applyBtn = document.getElementById('bulkRenameApplyBtn');
  applyBtn.disabled = true;
  statusEl.textContent = 'Renaming…';
  const res = await apiJSON('/api/rename/bulk', { method: 'POST', body: JSON.stringify({ apply: true }) });
  const changed = res.results.filter(r => r.changed).length;
  statusEl.textContent = `Done. ${changed} file${changed !== 1 ? 's' : ''} renamed.${res.errors.length ? ` ${res.errors.length} error(s).` : ''}`;
  document.getElementById('bulkRenamePreview').innerHTML = '';
  loadBooks();
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

// ── Live Search Dropdown ─────────────────────────────────
async function searchLive(q) {
  const dropdown = document.getElementById('searchDropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--md-sys-color-on-surface-variant)">Searching…</div>';
  dropdown.classList.add('open');
  try {
    const data = await apiJSON(`/api/books?q=${encodeURIComponent(q)}&per_page=8`);
    const books = data.books || [];
    if (!books.length) {
      dropdown.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--md-sys-color-on-surface-variant)">No results</div>';
      return;
    }
    dropdown.innerHTML = books.map(b => `
      <div class="search-dropdown-item" onclick="openBook(${b.id});closeSearchDropdown()">
        <div class="search-dropdown-cover">
          ${b.cover_filename
            ? `<img src="/api/books/${b.id}/cover?thumb=true" alt="" onerror="this.style.display='none'">`
            : `<svg viewBox="0 0 24 24" fill="currentColor" style="color:var(--md-sys-color-outline)"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`
          }
        </div>
        <div class="search-dropdown-info">
          <div class="search-dropdown-title">${esc(b.title || b.filename)}</div>
          <div class="search-dropdown-author">${esc(b.author || '')}</div>
        </div>
        <span class="format-badge">${esc(b.file_format || '')}</span>
      </div>`).join('');
  } catch(e) {
    dropdown.classList.remove('open');
  }
}

function closeSearchDropdown() {
  const dropdown = document.getElementById('searchDropdown');
  if (dropdown) dropdown.classList.remove('open');
}

// ── View Dropdown ─────────────────────────────────────────
function openViewDropdown() {
  closeViewDropdown();
  const btn = document.getElementById('viewDropdownBtn');
  const popup = document.createElement('div');
  popup.id = 'viewDropdownPopup';
  popup.className = 'view-dropdown-popup';

  const GRID_SIZES = [{ label: 'Compact', size: 130 }, { label: 'Standard', size: 180 }, { label: 'Large', size: 240 }];
  const savedSize = parseInt(localStorage.getItem('gridMin') || '180', 10);

  popup.innerHTML = `
    <div class="view-dropdown-section-label">Layout</div>
    <button class="view-dropdown-item${state.viewMode === 'grid' ? ' active' : ''}" onclick="setViewMode('grid');renderViewDropdown()">
      <svg viewBox="0 0 24 24"><path d="M3 3h8v8H3zm0 10h8v8H3zm10-10h8v8h-8zm0 10h8v8h-8z"/></svg> Grid
    </button>
    <button class="view-dropdown-item${state.viewMode === 'list' ? ' active' : ''}" onclick="setViewMode('list');renderViewDropdown()">
      <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg> List
    </button>
    ${state.viewMode === 'grid' ? `
    <hr style="border:none;border-top:1px solid var(--md-sys-color-outline-variant);margin:4px 0">
    <div class="view-dropdown-section-label">Size</div>
    ${GRID_SIZES.map(gs => `
    <button class="view-dropdown-item${savedSize === gs.size ? ' active' : ''}" onclick="setGridSize(${gs.size});closeViewDropdown()">
      ${gs.label}
    </button>`).join('')}` : ''}`;

  document.body.appendChild(popup);

  const rect = btn.getBoundingClientRect();
  let left = rect.right - 180;
  if (left < 8) left = 8;
  popup.style.left = left + 'px';
  popup.style.top = (rect.bottom + 4) + 'px';

  setTimeout(() => document.addEventListener('click', closeViewDropdown, { once: true }), 10);
}

function renderViewDropdown() {
  // Re-render in place (for layout toggle)
  const existing = document.getElementById('viewDropdownPopup');
  if (existing) { existing.remove(); openViewDropdown(); }
}

function closeViewDropdown() {
  document.getElementById('viewDropdownPopup')?.remove();
}

function setViewMode(mode) {
  state.viewMode = mode;
  localStorage.setItem('viewMode', mode);
  renderBooks(document.getElementById('bookContainer'));
}

function setGridSize(size) {
  document.documentElement.style.setProperty('--grid-min', size + 'px');
  localStorage.setItem('gridMin', size);
}

// ── Dialog helpers ───────────────────────────────────────
function openDialog(id) {
  document.getElementById(id).classList.add('open');
  document.body.classList.add('modal-open');
}
function closeDialog(id) {
  document.getElementById(id).classList.remove('open');
  if (!document.querySelector('.dialog-scrim.open')) {
    document.body.classList.remove('modal-open');
  }
}

// ── DOM helpers ──────────────────────────────────────────
function v(id) { return (document.getElementById(id) || {}).value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function svgBook(size=32) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" style="color:var(--md-sys-color-outline)"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`; }
function formatBytes(n) { if (!n) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n/1024).toFixed(1) + ' KB'; return (n/1048576).toFixed(1) + ' MB'; }
function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString(); }

function closeMenu() { document.getElementById('userMenu').style.display = 'none'; }

// ── Event Listeners ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Restore saved grid size
  const savedGridSize = parseInt(localStorage.getItem('gridMin') || '180', 10);
  document.documentElement.style.setProperty('--grid-min', savedGridSize + 'px');

  // View dropdown button
  document.getElementById('viewDropdownBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    openViewDropdown();
  });

  // Search (grid filter + live dropdown)
  let searchTimeout, liveSearchTimeout;
  const searchInput = document.getElementById('searchInput');

  // Search clear button — must come after searchTimeout/liveSearchTimeout are declared
  const searchClearBtn = document.getElementById('searchClearBtn');
  searchClearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    clearTimeout(searchTimeout);
    clearTimeout(liveSearchTimeout);
    closeSearchDropdown();
    state.filters.q = '';
    state.page = 1;
    loadBooks();
    searchInput.focus();
  });

  searchInput.addEventListener('input', e => {
    const q = e.target.value.trim();
    if (searchClearBtn) searchClearBtn.style.display = q ? '' : 'none';
    // Live dropdown (200ms debounce, min 2 chars)
    clearTimeout(liveSearchTimeout);
    if (q.length >= 2) {
      liveSearchTimeout = setTimeout(() => searchLive(q), 200);
    } else {
      closeSearchDropdown();
    }
    // Grid filter (350ms debounce)
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.q = q;
      state.page = 1;
      loadBooks();
    }, 350);
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSearchDropdown();
    if (e.key === 'Enter') closeSearchDropdown();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-bar')) closeSearchDropdown();
  });

  // Mobile search bar: tap the icon to expand, collapse on outside click when empty
  const searchBar = document.querySelector('.search-bar');
  searchBar?.querySelector('svg')?.addEventListener('click', e => {
    if (window.innerWidth <= 600 && !searchBar.classList.contains('expanded')) {
      e.stopPropagation();
      searchBar.classList.add('expanded');
      searchInput.focus();
    }
  });
  document.addEventListener('click', e => {
    if (window.innerWidth <= 600 && searchBar && !searchBar.contains(e.target)) {
      if (!searchInput.value.trim()) {
        searchBar.classList.remove('expanded');
      }
    }
  });
  searchInput.addEventListener('blur', () => {
    if (window.innerWidth <= 600 && !searchInput.value.trim()) {
      setTimeout(() => searchBar?.classList.remove('expanded'), 200);
    }
  });

  // Tag filter dropdown
  document.getElementById('tagSelect')?.addEventListener('change', e => {
    setTagFilter(e.target.value);
  });

  // Format filter dropdown
  document.getElementById('formatSelect')?.addEventListener('change', e => {
    state.filters.format = e.target.value;
    state.page = 1;
    loadBooks();
  });

  // Sort — restore persisted value
  const _sortSel = document.getElementById('sortSelect');
  if (_sortSel) _sortSel.value = state.filters.sort;
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.filters.sort = e.target.value;
    localStorage.setItem('sortBy', e.target.value);
    loadBooks();
  });
  // Order toggle (Asc/Desc)
  const _orderToggle = document.getElementById('orderToggle');
  if (_orderToggle) {
    if (state.filters.order === 'desc') { _orderToggle.textContent = '↓ Desc'; }
    _orderToggle.addEventListener('click', () => {
      state.filters.order = state.filters.order === 'asc' ? 'desc' : 'asc';
      _orderToggle.textContent = state.filters.order === 'asc' ? '↑ Asc' : '↓ Desc';
      localStorage.setItem('sortOrder', state.filters.order);
      loadBooks();
    });
  }

  // Clear filters button
  const _clearFiltersBtn = document.getElementById('clearFiltersBtn');
  if (_clearFiltersBtn) _clearFiltersBtn.addEventListener('click', clearFilters);

  // Dialog close buttons
  document.getElementById('closeBookDialog').addEventListener('click', () => closeDialog('bookDialog'));
  document.getElementById('closeMetaDialog').addEventListener('click', () => closeDialog('metaDialog'));
  document.getElementById('closeMetaDialogBtn').addEventListener('click', () => closeDialog('metaDialog'));
  document.getElementById('closeSendDialog').addEventListener('click', () => closeDialog('sendDialog'));
  document.getElementById('closeSendDialogBtn').addEventListener('click', () => closeDialog('sendDialog'));
  document.getElementById('closeEmailAddrDialog').addEventListener('click', () => closeDialog('emailAddrDialog'));
  document.getElementById('closeEmailAddrDialogBtn').addEventListener('click', () => closeDialog('emailAddrDialog'));
  document.getElementById('closeCoverDialog').addEventListener('click', () => closeDialog('coverDialog'));
  document.getElementById('closeCoverDialogBtn').addEventListener('click', () => closeDialog('coverDialog'));
  document.getElementById('refreshLibraryBtn').addEventListener('click', async () => {
    const data = await apiJSON('/api/books/scan', { method: 'POST' });
    const parts = [];
    if (data?.added > 0) parts.push(`${data.added} added`);
    if (data?.removed > 0) parts.push(`${data.removed} removed`);
    snack(parts.length ? parts.join(', ') : 'Library up to date');
    loadBooks();
  });

  // Close dialog on scrim click
  document.querySelectorAll('.dialog-scrim').forEach(scrim => {
    scrim.addEventListener('click', e => { if (e.target === scrim) scrim.classList.remove('open'); });
  });

  // Metadata dialog
  document.getElementById('metaSearchBtn').addEventListener('click', searchMeta);
  document.getElementById('metaQuery').addEventListener('keydown', e => { if (e.key === 'Enter') searchMeta(); });
  document.getElementById('applyMetaBtn').addEventListener('click', () => snack('Click a result to import its metadata'));

  // Metadata source chips: toggle active state and re-filter displayed results
  document.getElementById('metaSourceChips')?.addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip[data-src]');
    if (!chip) return;
    chip.classList.toggle('active');
    // Immediately re-filter currently displayed results by active sources
    if (window._metaResultsList) {
      const activeSrcs = new Set(_activeSources());
      const filtered = window._metaResultsList.filter(r => activeSrcs.has(r.source));
      renderMetaResults(filtered);
    }
  });

  // Filter controls toggle (mobile)
  document.getElementById('filterBarToggle')?.addEventListener('click', () => {
    document.getElementById('filterControls')?.classList.toggle('open');
  });

  // Send dialog (manual address entry fallback)
  document.getElementById('confirmSendBtn').addEventListener('click', confirmSend);

  // Email address management
  document.getElementById('addEmailBtn')?.addEventListener('click', openAddEmailAddr);
  document.getElementById('saveEmailAddrBtn').addEventListener('click', saveEmailAddr);

  // Cover dialog — Upload Image button triggers file picker; dialog body is drop target
  document.getElementById('coverUploadBtn')?.addEventListener('click', () => document.getElementById('coverInput').click());
  const coverDropZone = document.getElementById('coverDropZone');
  coverDropZone?.addEventListener('dragover', e => { e.preventDefault(); coverDropZone.classList.add('cover-drag-over'); });
  coverDropZone?.addEventListener('dragleave', () => coverDropZone.classList.remove('cover-drag-over'));
  coverDropZone?.addEventListener('drop', e => {
    e.preventDefault(); coverDropZone.classList.remove('cover-drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) { state.coverFile = file; previewCoverFile(file); }
  });
  document.getElementById('coverInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { state.coverFile = file; previewCoverFile(file); }
  });
  document.getElementById('saveCoverBtn').addEventListener('click', saveCover);
  document.getElementById('coverSearchBtn').addEventListener('click', searchCovers);
  document.getElementById('coverSearchQuery').addEventListener('keydown', e => { if (e.key === 'Enter') searchCovers(); });

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

  // Settings
  document.getElementById('saveSmtpBtn')?.addEventListener('click', saveSmtp);
  document.getElementById('testSmtpBtn')?.addEventListener('click', testSmtp);
  document.getElementById('sendTestEmailBtn')?.addEventListener('click', sendTestEmail);
  document.getElementById('saveMetaBtn')?.addEventListener('click', saveMeta);
  document.getElementById('saveSourcesBtn')?.addEventListener('click', saveSources);
  document.getElementById('saveOrganizationBtn')?.addEventListener('click', saveOrganization);
  document.getElementById('addTagBtn')?.addEventListener('click', addTagAdmin);
  document.getElementById('newTagInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') addTagAdmin(); });
  document.getElementById('bulkRenamePreviewBtn')?.addEventListener('click', bulkRenamePreview);
  document.getElementById('bulkRenameApplyBtn')?.addEventListener('click', bulkRenameApply);
  document.getElementById('renameScheme')?.addEventListener('change', toggleCustomScheme);
  document.getElementById('changePwdBtn')?.addEventListener('click', changePassword);

  // Settings tabs (sidebar buttons + mobile dropdown in sync) – uses module-level activateSettingsTab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => activateSettingsTab(tab.dataset.tab));
  });
  document.getElementById('settingsTabSelect')?.addEventListener('change', e => {
    activateSettingsTab(e.target.value);
  });

  // Log viewer buttons
  document.getElementById('refreshLogsBtn')?.addEventListener('click', loadLogs);
  document.getElementById('exportLogsBtn')?.addEventListener('click', exportLogs);
  document.getElementById('logLevelSelect')?.addEventListener('change', saveLogLevel);

  // User menu
  document.getElementById('uploadNavBtn')?.addEventListener('click', () => navigate('upload'));

  document.getElementById('userMenuBtn').addEventListener('click', e => {
    const menu = document.getElementById('userMenu');
    menu.style.display = menu.style.display === 'none' ? '' : 'none';
    e.stopPropagation();
  });
  document.addEventListener('click', closeMenu);

  // Set username in menu
  fetch('/api/auth/status').then(r => r.json()).then(d => {
    if (d.username) document.getElementById('userMenuLabel').textContent = d.username;
  });

  // Apply saved color theme
  const _savedTheme = localStorage.getItem('colorTheme');
  if (_savedTheme) applyTheme(_savedTheme);

  // Restore view from URL hash
  const _VIEWS = ['library', 'upload', 'settings'];
  const _rawHash = location.hash.replace('#', '');
  const _view = _rawHash.startsWith('settings') ? 'settings' : _rawHash;
  navigate(_VIEWS.includes(_view) ? _view : 'library');
});

function previewCoverFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('coverPreviewArea').innerHTML =
      `<img src="${e.target.result}" style="max-height:200px;border-radius:8px;object-fit:contain">`;
  };
  reader.readAsDataURL(file);
}
