(() => {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const KEY_LAST = 'asahina-editor:last-draft';
  const KEY_THEME = 'asahina-editor:theme';
  const KEY_SPLIT = 'asahina-editor:split';

  const el = {
    topbar: $('.topbar'),
    title: $('#post-title'),
    slug: $('#meta-slug'),
    date: $('#meta-date'),
    categoryChips: $('#category-chips'),
    tagChips: $('#tag-chips'),
    categoryInput: $('#category-input'),
    tagInput: $('#tag-input'),
    categoryOptions: $('#category-options'),
    tagOptions: $('#tag-options'),
    excerpt: $('#meta-excerpt'),
    comments: $('#meta-comments'),
    coverPreview: $('#cover-preview'),
    coverBtn: $('#cover-btn'),
    coverClear: $('#cover-clear'),
    coverInput: $('#cover-input'),
    draftList: $('#draft-list'),
    newDraft: $('#new-draft'),
    postList: $('#post-list'),
    postSearch: $('#post-search'),
    postCount: $('#post-count'),
    filePreview: $('#file-preview'),
    draftLabel: $('#draft-label'),
    toolbar: $('#toolbar'),
    rich: $('#rich-editor'),
    md: $('#md-editor'),
    editorScroll: $('#editor-scroll'),
    modeHint: $('#mode-hint'),
    cursorInfo: $('#cursor-info'),
    preview: $('#preview'),
    previewStat: $('#preview-stat'),
    wordCount: $('#word-count'),
    saveDot: $('#save-dot'),
    saveText: $('#save-text'),
    saveDraft: $('#save-draft-btn'),
    publishBtn: $('#publish-btn'),
    publishCaret: $('#publish-caret'),
    publishMenu: $('#publish-menu'),
    exportBtn: $('#export-btn'),
    exportMenu: $('#export-menu'),
    themeBtn: $('#theme-btn'),
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebar-toggle'),
    previewToggle: $('#preview-toggle'),
    workspace: $('#workspace'),
    splitter: $('#splitter'),
    toast: $('#toast'),
    modalRoot: $('#modal-root'),
    imageInput: $('#image-input'),
    dropHint: $('#drop-hint'),
    statusLeft: $('#status-left')
  };

  const state = {
    mode: 'rich',
    markdown: '',
    draftId: null,
    createdAt: null,
    dirty: false,
    saving: false,
    syncing: false,
    meta: emptyMeta(),
    categories: [],
    tags: [],
    posts: [],
    savedTimer: null,
    previewTimer: null,
    saveTimer: null,
    lastRange: null
  };

  function emptyMeta() {
    return {
      title: '',
      file: '',
      slug: '',
      date: toLocalInput(new Date()),
      categories: [],
      tags: [],
      excerpt: '',
      comments: true,
      cover: ''
    };
  }

  function normalizeMeta(meta) {
    const m = meta || {};
    return {
      title: String(m.title || ''),
      file: String(m.file || ''),
      slug: String(m.slug || ''),
      date: m.date ? String(m.date) : toLocalInput(new Date()),
      categories: Array.isArray(m.categories) ? m.categories.slice() : [],
      tags: Array.isArray(m.tags) ? m.tags.slice() : [],
      excerpt: String(m.excerpt || ''),
      comments: m.comments !== false,
      cover: String(m.cover || '')
    };
  }

  /* ---------------- utils ---------------- */
  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function toLocalInput(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function dateParts(date) {
    return { y: date.getFullYear(), m: pad(date.getMonth() + 1), d: pad(date.getDate()) };
  }

  function parseMetaDate(value) {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function slugify(title) {
    return String(title || '')
      .trim()
      .replace(/[\\/:*?"<>|\r\n\t]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'untitled';
  }

  function currentFileName() {
    if (state.meta.file) return state.meta.file;
    const date = parseMetaDate(state.meta.date);
    const parts = dateParts(date);
    const slug = state.meta.slug ? slugify(state.meta.slug) : slugify(state.meta.title);
    return `${parts.y}-${parts.m}-${parts.d}-${slug}.md`;
  }

  function countWords(text) {
    const clean = String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_~\-|]/g, ' ');
    const cjk = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (clean.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
    return cjk + words;
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.toast.classList.add('hidden'), 2600);
  }

  async function api(path, options = {}) {
    const opts = { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } };
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      const err = new Error(data.error || `请求失败（${res.status}）`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------------- markdown ---------------- */
  if (window.marked && marked.setOptions) {
    marked.setOptions({ gfm: true, breaks: false });
  }

  const turndown = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**'
  });

  turndown.addRule('gfmTable', {
    filter: 'table',
    replacement: (content, node) => {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (!rows.length) return `\n\n${content}\n\n`;
      const cellsOf = row => Array.from(row.children).map(cell =>
        String(cell.textContent || '').trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|')
      );
      const header = cellsOf(rows[0]);
      if (!header.length) return `\n\n${content}\n\n`;
      const separator = header.map(() => '---');
      const body = rows.slice(1).map(cellsOf);
      const lines = [header, separator, ...body].map(cells => `| ${cells.join(' | ')} |`);
      return `\n\n${lines.join('\n')}\n\n`;
    }
  });

  // 富文本转 Markdown 时保护公式/Liquid，避免 Turndown 把反斜杠和 _ 转义掉
  turndown.addRule('rawSyntax', {
    filter: node => node.nodeName === 'SPAN' && node.hasAttribute('data-raw'),
    replacement: (content, node) => node.getAttribute('data-raw')
  });

  turndown.addRule('liquidLink', {
    filter: node => node.nodeName === 'A' && /\{\{|\{%/.test(node.getAttribute('href') || ''),
    replacement: (content, node) => `[${content}](${node.getAttribute('href')})`
  });

  turndown.addRule('liquidImage', {
    filter: node => node.nodeName === 'IMG' && /\{\{|\{%/.test(node.getAttribute('src') || ''),
    replacement: (content, node) => `![${node.getAttribute('alt') || ''}](${node.getAttribute('src')})`
  });

  function protectRawSyntax(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('pre, code, script, style, textarea')) return NodeFilter.FILTER_REJECT;
        return /[$\\{]/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    const pattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\{\{[\s\S]+?\}\}|\{%[\s\S]+?%\})/g;

    nodes.forEach(node => {
      const parts = String(node.nodeValue || '').split(pattern);
      if (parts.length <= 1) return;
      const fragment = document.createDocumentFragment();
      parts.forEach((part, index) => {
        if (!part) return;
        if (index % 2 === 1) {
          const span = document.createElement('span');
          span.setAttribute('data-raw', part);
          span.textContent = part;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });
      node.parentNode.replaceChild(fragment, node);
    });
  }

  function normalizeMarkdown(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
  }

  function hasLiquid(value = state.markdown) {
    return /\{\{|\{%/.test(String(value || ''));
  }

  function richToMarkdown() {
    const html = el.rich.innerHTML || '';
    if (!html.trim()) return '';
    const clone = el.rich.cloneNode(true);
    protectRawSyntax(clone);
    return normalizeMarkdown(turndown.turndown(clone));
  }

  function markdownToRichHTML(markdown) {
    if (!String(markdown || '').trim()) return '';
    const html = marked.parse(markdown);
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'class'] });
  }

  function preprocessLiquid(html) {
    return String(html || '')
      .replace(/\{\{\s*['"]([^'"]+)['"]\s*\|\s*relative_url\s*\}\}/g, '/Asahina.github.io$1')
      .replace(/\{\{\s*['"]([^'"]+)['"]\s*\|\s*absolute_url\s*\}\}/g, 'https://ironi-2.github.io$1');
  }

  function preprocessLiquidMarkdown(markdown) {
    return String(markdown || '')
      .replace(/(\]\()\{\{\s*['"]([^'"]+)['"]\s*\|\s*relative_url\s*\}\}\)/g, '$1/Asahina.github.io$2)')
      .replace(/((?:src|href)=["'])\{\{\s*['"]([^'"]+)['"]\s*\|\s*relative_url\s*\}\}(["'])/g, '$1/Asahina.github.io$2$3');
  }

  function renderPreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(() => {
      const md = state.markdown.trim();
      if (!md) {
        el.preview.innerHTML = `
          <div class="preview-empty">
            <strong>开始写第一篇文章</strong>
            <p>左侧输入内容，这里会按博客样式实时渲染。</p>
          </div>`;
        updateCounts();
        return;
      }

      let html;
      try {
        html = marked.parse(preprocessLiquidMarkdown(md));
      } catch (err) {
        el.preview.innerHTML = `<p style="color:var(--danger)">Markdown 渲染失败：${escapeHTML(err.message)}</p>`;
        return;
      }

      html = preprocessLiquid(html);
      el.preview.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });

      el.preview.querySelectorAll('a[href]').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });

      el.preview.querySelectorAll('pre code').forEach(code => {
        try { window.hljs && hljs.highlightElement(code); } catch (_) { /* ignore */ }
      });

      if (window.renderMathInElement) {
        try {
          renderMathInElement(el.preview, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false,
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
          });
        } catch (_) { /* ignore */ }
      }

      updateCounts();
    }, 120);
  }

  function updateCounts() {
    const count = countWords(state.markdown);
    const minutes = Math.max(1, Math.ceil(count / 300));
    el.wordCount.textContent = `${count} 字 · 约 ${minutes} 分钟`;
    el.cursorInfo.textContent = `${count} 字`;
    el.previewStat.textContent = count ? `约 ${minutes} 分钟阅读` : '草稿';
  }

  /* ---------------- mode ---------------- */
  function setMode(mode, options = {}) {
    if (mode === state.mode && !options.force) return;
    if (mode === 'rich' && hasLiquid()) {
      toast('含 Liquid 模板的文章请用 Markdown 模式编辑');
      updateModeAvailability();
      return;
    }

    if (mode === 'md') {
      if (state.mode === 'rich') state.markdown = richToMarkdown();
      el.md.value = state.markdown;
      el.md.classList.remove('hidden');
      el.rich.classList.add('hidden');
      el.md.focus();
    } else {
      if (state.mode === 'md') state.markdown = el.md.value;
      state.syncing = true;
      el.rich.innerHTML = markdownToRichHTML(state.markdown);
      state.syncing = false;
      el.rich.classList.remove('hidden');
      el.md.classList.add('hidden');
      el.rich.focus();
    }

    state.mode = mode;
    $$('#mode-switch button').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    el.modeHint.textContent = mode === 'rich' ? '富文本模式 · Markdown 自动同步' : 'Markdown 模式 · 右侧实时预览';
    updateModeAvailability();
    renderPreview();
  }

  function updateModeAvailability() {
    const richButton = document.querySelector('#mode-switch button[data-mode="rich"]');
    if (!richButton) return;
    const liquid = hasLiquid();
    richButton.disabled = liquid;
    richButton.title = liquid ? '含 Liquid 模板，请用 Markdown 模式编辑' : '';
  }

  /* ---------------- save state ---------------- */
  function setSaveState(kind, text) {
    el.saveDot.className = 'save-dot' + (kind === 'saved' ? ' saved' : kind === 'error' ? ' error' : '');
    el.saveText.textContent = text || (kind === 'saved' ? '已保存' : kind === 'error' ? '保存失败' : '未保存');
  }

  function scheduleSave() {
    state.dirty = true;
    setSaveState('dirty', '未保存');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveDraft(false), 1200);
  }

  function draftPayload() {
    return {
      id: state.draftId,
      createdAt: state.createdAt,
      title: state.meta.title,
      markdown: state.markdown,
      meta: { ...state.meta }
    };
  }

  async function saveDraft(manual) {
    if (state.saving) return;
    state.saving = true;
    setSaveState('dirty', '保存中…');
    try {
      const res = await api('/api/drafts', { method: 'POST', body: draftPayload() });
      if (!state.draftId) {
        state.draftId = res.id;
        state.createdAt = res.createdAt || new Date().toISOString();
        updateDraftLabel();
      }
      state.dirty = false;
      setSaveState('saved', `已保存 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
      localStorage.setItem(KEY_LAST, state.draftId);
      if (manual) {
        toast('草稿已保存');
        await loadDrafts();
      } else {
        localStorage.setItem(KEY_LAST, state.draftId);
        refreshDraftListQuietly();
      }
    } catch (err) {
      setSaveState('error', '仅本地暂存');
      try { localStorage.setItem('asahina-editor:fallback', JSON.stringify(draftPayload())); } catch (_) { /* ignore */ }
      if (manual) toast('服务未连接，已暂存到浏览器');
    } finally {
      state.saving = false;
    }
  }

  /* ---------------- meta UI ---------------- */
  function renderChips(kind) {
    const container = kind === 'categories' ? el.categoryChips : el.tagChips;
    const values = state.meta[kind] || [];
    container.innerHTML = values.map((value, index) => `
      <span class="chip">${escapeHTML(value)}
        <button type="button" data-kind="${kind}" data-index="${index}" aria-label="移除 ${escapeHTML(value)}">
          <svg class="icon"><use href="#i-close"/></svg>
        </button>
      </span>`).join('');
  }

  function addChip(kind, value) {
    const text = String(value || '').trim().replace(/[,，]$/, '');
    if (!text) return;
    const list = state.meta[kind];
    if (!list.includes(text)) {
      list.push(text);
      renderChips(kind);
      scheduleSave();
    }
  }

  function renderOptions() {
    el.categoryOptions.innerHTML = state.categories.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
    el.tagOptions.innerHTML = state.tags.map(t => `<option value="${escapeHTML(t)}"></option>`).join('');
  }

  function updateFilePreview() {
    el.filePreview.textContent = state.meta.file ? `_posts/${state.meta.file}` : currentFileName();
  }

  function updateDraftLabel() {
    if (state.meta.file) {
      el.draftLabel.textContent = '编辑已有文章';
    } else if (state.draftId) {
      el.draftLabel.textContent = '草稿';
    } else {
      el.draftLabel.textContent = '新文章';
    }
  }

  function updateCover() {
    if (state.meta.cover) {
      el.coverPreview.innerHTML = `<img src="${escapeHTML(state.meta.cover)}" alt="封面预览">`;
    } else {
      el.coverPreview.innerHTML = '<span>未选择封面</span>';
    }
  }

  function applyMetaToUI() {
    el.title.value = state.meta.title;
    el.slug.value = state.meta.slug;
    el.date.value = state.meta.date;
    el.excerpt.value = state.meta.excerpt;
    el.comments.checked = state.meta.comments !== false;
    renderChips('categories');
    renderChips('tags');
    updateCover();
    updateFilePreview();
    updateDraftLabel();
  }

  function readMetaFromUI() {
    state.meta.title = el.title.value.trim();
    state.meta.slug = el.slug.value.trim();
    state.meta.date = el.date.value || toLocalInput(new Date());
    state.meta.excerpt = el.excerpt.value.trim();
    state.meta.comments = el.comments.checked;
  }

  /* ---------------- drafts ---------------- */
  function formatDraftTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return sameDay
      ? `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`
      : `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function renderDrafts(drafts) {
    if (!drafts.length) {
      el.draftList.innerHTML = '<div class="side-empty">暂无草稿</div>';
      return;
    }
    el.draftList.innerHTML = drafts.map(draft => `
      <div class="draft-item ${draft.id === state.draftId ? 'active' : ''}" data-draft="${escapeHTML(draft.id)}">
        <div class="draft-main">
          <div class="draft-name">${escapeHTML(draft.title || '未命名草稿')}</div>
          <div class="draft-time">${escapeHTML(formatDraftTime(draft.updatedAt))}</div>
        </div>
        <button type="button" class="draft-del" data-delete-draft="${escapeHTML(draft.id)}" title="删除草稿">
          <svg class="icon"><use href="#i-trash"/></svg>
        </button>
      </div>`).join('');
  }

  async function loadDrafts() {
    try {
      const data = await api('/api/drafts');
      renderDrafts(data.drafts || []);
    } catch (_) {
      el.draftList.innerHTML = '<div class="side-empty">草稿列表不可用</div>';
    }
  }

  let quietTimer = null;
  function refreshDraftListQuietly() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(loadDrafts, 700);
  }

  async function loadDraft(id) {
    const data = await api(`/api/drafts/${encodeURIComponent(id)}`);
    if (state.dirty) await saveDraft(false);
    state.draftId = data.id;
    state.createdAt = data.createdAt;
    state.meta = normalizeMeta(data.meta);
    state.markdown = normalizeMarkdown(data.markdown || '');
    state.dirty = false;

    if (state.meta.file && !state.meta.slug) {
      state.meta.slug = state.meta.file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/i, '');
    }
    applyMetaToUI();
    setMode(hasLiquid() ? 'md' : 'rich', { force: true });
    el.md.value = state.markdown;
    renderPreview();
    updateCounts();
    setSaveState('saved', '草稿已载入');
    await loadDrafts();
  }

  async function newDraft() {
    if (state.dirty) await saveDraft(false);
    state.draftId = null;
    state.createdAt = null;
    state.meta = emptyMeta();
    state.markdown = '';
    state.dirty = false;
    localStorage.removeItem(KEY_LAST);
    applyMetaToUI();
    el.rich.innerHTML = '';
    el.md.value = '';
    setMode('rich', { force: true });
    renderPreview();
    updateCounts();
    setSaveState('dirty', '未保存');
    await loadDrafts();
    el.title.focus();
  }

  /* ---------------- posts ---------------- */
  function renderPosts(filter) {
    const keyword = String(filter || '').trim().toLowerCase();
    const list = state.posts.filter(post => !keyword || String(post.title).toLowerCase().includes(keyword));
    el.postCount.textContent = `${state.posts.length} 篇`;
    if (!list.length) {
      el.postList.innerHTML = '<div class="side-empty">没有匹配的文章</div>';
      return;
    }
    el.postList.innerHTML = list.map(post => `
      <button type="button" class="post-item" data-post="${escapeHTML(post.file)}">
        <strong>${escapeHTML(post.title)}</strong>
        <span>${escapeHTML(String(post.date || '').slice(0, 16))}</span>
      </button>`).join('');
  }

  function parseFrontMatter(text) {
    const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { data: {}, body: String(text) };
    const data = {};
    for (const line of match[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!m) continue;
      let value = m[2].trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(item => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        value = value.replace(/^["']|["']$/g, '');
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
      }
      data[m[1]] = value;
    }
    return { data, body: String(text).slice(match[0].length) };
  }

  function dateInputFromFrontMatter(value) {
    const text = String(value || '');
    const m = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[1]}T${m[2]}` : toLocalInput(new Date());
  }

  async function openPost(file) {
    if (state.dirty) await saveDraft(false);
    const data = await api(`/api/post?file=${encodeURIComponent(file)}`);
    const parsed = parseFrontMatter(data.text);
    const fm = parsed.data;

    state.draftId = null;
    state.createdAt = null;
    state.meta = normalizeMeta({
      title: fm.title || '',
      file: data.file,
      slug: '',
      date: dateInputFromFrontMatter(fm.date),
      categories: Array.isArray(fm.categories) ? fm.categories : [],
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      excerpt: fm.excerpt || '',
      comments: fm.comments !== false,
      cover: fm.cover || ''
    });
    state.markdown = normalizeMarkdown(parsed.body);
    state.dirty = false;

    applyMetaToUI();
    el.md.value = state.markdown;
    renderPreview();
    updateCounts();
    setSaveState('saved', '已打开文章');
    localStorage.removeItem(KEY_LAST);

    if (hasLiquid()) {
      setMode('md', { force: true });
      toast('检测到 Liquid 模板，已切换到 Markdown 模式');
    } else {
      setMode('rich', { force: true });
    }
    await loadDrafts();
  }

  /* ---------------- modal ---------------- */
  function showModal(options) {
    const { title, desc = '', body = '', confirmText = '确定', cancelText = '取消', danger = false, onConfirm, onCancel, onOpen } = options;
    el.modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${escapeHTML(title)}</h3>
          ${desc ? `<p class="modal-desc">${desc}</p>` : ''}
          <div class="modal-body">${body}</div>
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-modal-cancel>${escapeHTML(cancelText)}</button>
            <button type="button" class="btn primary ${danger ? 'danger' : ''}" data-modal-confirm>${escapeHTML(confirmText)}</button>
          </div>
        </div>
      </div>`;

    const backdrop = el.modalRoot.firstElementChild;
    const close = () => {
      el.modalRoot.innerHTML = '';
      document.removeEventListener('keydown', onKey);
    };
    const onKey = event => { if (event.key === 'Escape') { close(); onCancel && onCancel(); } };

    backdrop.querySelector('[data-modal-cancel]').onclick = () => { close(); onCancel && onCancel(); };
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) { close(); onCancel && onCancel(); }
    });
    document.addEventListener('keydown', onKey);

    const confirmBtn = backdrop.querySelector('[data-modal-confirm]');
    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      try {
        const keep = await onConfirm?.(backdrop, close);
        if (keep !== false) close();
      } catch (err) {
        toast(err.message || '操作失败');
      } finally {
        confirmBtn.disabled = false;
      }
    };

    onOpen && onOpen(backdrop);
    const firstInput = backdrop.querySelector('input, textarea, select');
    if (firstInput) setTimeout(() => firstInput.focus(), 30);
    return { close, backdrop };
  }

  /* ---------------- selection / insertion ---------------- */
  function saveRichSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (el.rich.contains(range.commonAncestorContainer)) {
        state.lastRange = range.cloneRange();
      }
    }
  }

  function restoreRichSelection() {
    if (!state.lastRange) {
      const range = document.createRange();
      range.selectNodeContents(el.rich);
      range.collapse(false);
      state.lastRange = range;
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(state.lastRange);
    el.rich.focus();
  }

  function insertRichHTML(html, block = false) {
    restoreRichSelection();
    if (block) {
      document.execCommand('insertParagraph');
      document.execCommand('insertHTML', false, `${html}<p><br></p>`);
    } else {
      document.execCommand('insertHTML', false, html);
    }
    state.lastRange = null;
    syncFromRich();
  }

  function insertMarkdownAtCursor(text) {
    const area = el.md;
    const start = area.selectionStart || 0;
    const end = area.selectionEnd || 0;
    area.setRangeText(text, start, end, 'end');
    area.focus();
    state.markdown = area.value;
    renderPreview();
    scheduleSave();
    updateCounts();
  }

  function wrapMarkdown(before, after = '') {
    const area = el.md;
    const start = area.selectionStart || 0;
    const end = area.selectionEnd || 0;
    const selected = area.value.slice(start, end);
    const replacement = `${before}${selected}${after || before}`;
    area.setRangeText(replacement, start, end, 'end');
    area.focus();
    area.setSelectionRange(start + before.length, start + before.length + selected.length);
    state.markdown = area.value;
    renderPreview();
    scheduleSave();
    updateCounts();
  }

  function prefixMarkdownLines(prefix) {
    const area = el.md;
    const value = area.value;
    const start = area.selectionStart || 0;
    const end = area.selectionEnd || 0;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const segment = value.slice(lineStart, sliceEnd);
    const replaced = segment.split('\n').map(line => prefix + line).join('\n');
    area.setRangeText(replaced, lineStart, sliceEnd, 'select');
    area.focus();
    state.markdown = area.value;
    renderPreview();
    scheduleSave();
    updateCounts();
  }

  function syncFromRich() {
    if (state.syncing) return;
    state.markdown = richToMarkdown();
    scheduleSave();
    renderPreview();
    updateCounts();
    if (hasLiquid() && state.mode === 'rich') {
      toast('检测到 Liquid 模板，已切换到 Markdown 模式');
      setMode('md', { force: true });
    }
  }

  /* ---------------- toolbar ---------------- */
  function exec(command, value) {
    if (state.mode === 'rich') {
      restoreRichSelection();
      document.execCommand(command, false, value);
      saveRichSelection();
      syncFromRich();
    }
  }

  function handleRichAction(action) {
    if (action === 'link') return openLinkDialog();
    if (action === 'image') { saveRichSelection(); el.imageInput.click(); return; }
    if (action === 'code') { saveRichSelection(); return openCodeDialog(); }
    if (action === 'table') { saveRichSelection(); return openTableDialog(); }
    if (action === 'hr') return insertRichHTML('<hr>', true);
    if (action === 'clear') {
      restoreRichSelection();
      document.execCommand('removeFormat');
      document.execCommand('unlink');
      document.execCommand('formatBlock', false, '<p>');
      syncFromRich();
      return;
    }
  }

  function handleMarkdownAction(action) {
    const map = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      strikeThrough: ['~~', '~~']
    };
    if (map[action]) return wrapMarkdown(map[action][0], map[action][1]);
    if (action === 'link') return openLinkDialog();
    if (action === 'image') return el.imageInput.click();
    if (action === 'code') return openCodeDialog();
    if (action === 'table') return openTableDialog();
    if (action === 'hr') return insertMarkdownAtCursor('\n\n---\n\n');
  }

  el.toolbar.addEventListener('mousedown', event => {
    if (event.target.closest('button')) event.preventDefault();
  });

  el.toolbar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const { cmd, value, block, action } = button.dataset;

    if (state.mode === 'md') {
      if (block === 'h2') return prefixMarkdownLines('## ');
      if (block === 'h3') return prefixMarkdownLines('### ');
      if (cmd === 'formatBlock') return prefixMarkdownLines('> ');
      if (cmd === 'insertUnorderedList') return prefixMarkdownLines('- ');
      if (cmd === 'insertOrderedList') return prefixMarkdownLines('1. ');
      if (cmd === 'undo' || cmd === 'redo') { document.execCommand(cmd); return; }
      if (action) return handleMarkdownAction(action);
      return;
    }

    if (cmd) return exec(cmd, value);
    if (block) return exec('formatBlock', `<${block}>`);
    if (action) return handleRichAction(action);
  });

  /* ---------------- dialogs ---------------- */
  function openLinkDialog() {
    if (state.mode === 'rich') saveRichSelection();
    const area = el.md;
    const selected = state.mode === 'rich'
      ? (window.getSelection()?.toString() || '')
      : area.value.slice(area.selectionStart || 0, area.selectionEnd || 0);

    showModal({
      title: '插入链接',
      body: `
        <label>链接文字<input id="dlg-link-text" value="${escapeHTML(selected)}" placeholder="显示的文字"></label>
        <label>链接地址<input id="dlg-link-url" placeholder="https:// 或 /posts/"></label>`,
      confirmText: '插入',
      onConfirm: (backdrop, close) => {
        const text = backdrop.querySelector('#dlg-link-text').value.trim() || '链接';
        const url = backdrop.querySelector('#dlg-link-url').value.trim();
        if (!url) throw new Error('请填写链接地址');
        close();
        if (state.mode === 'rich') {
          insertRichHTML(`<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(text)}</a>`);
        } else {
          insertMarkdownAtCursor(`[${text}](${url})`);
        }
        return false;
      }
    });
  }

  function openCodeDialog() {
    const languages = ['c', 'cpp', 'java', 'python', 'javascript', 'typescript', 'bash', 'sql', 'html', 'css', 'json', 'markdown', 'text'];
    showModal({
      title: '插入代码块',
      body: `
        <div class="modal-row">
          <label>语言<select id="dlg-code-lang">${languages.map(lang => `<option value="${lang}">${lang}</option>`).join('')}</select></label>
        </div>
        <label>代码<textarea id="dlg-code-body" placeholder="粘贴或输入代码…" spellcheck="false"></textarea></label>`,
      confirmText: '插入代码',
      onConfirm: (backdrop, close) => {
        const lang = backdrop.querySelector('#dlg-code-lang').value;
        const code = backdrop.querySelector('#dlg-code-body').value.replace(/\s+$/g, '');
        if (!code.trim()) throw new Error('请填写代码内容');
        close();
        if (state.mode === 'rich') {
          insertRichHTML(`<pre><code class="language-${lang}">${escapeHTML(code)}</code></pre>`, true);
        } else {
          insertMarkdownAtCursor(`\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`);
        }
        return false;
      }
    });
  }

  function makeMarkdownTable(rows, cols, header) {
    const line = cells => `| ${cells.join(' | ')} |`;
    const headerCells = Array.from({ length: cols }, (_, i) => `列 ${i + 1}`);
    const separator = Array.from({ length: cols }, () => '---');
    const lines = [line(headerCells), line(separator)];
    for (let r = 0; r < rows; r++) {
      lines.push(line(Array.from({ length: cols }, (_, i) => `内容 ${r + 1}-${i + 1}`)));
    }
    if (!header) lines.splice(0, 2);
    return lines.join('\n');
  }

  function openTableDialog() {
    showModal({
      title: '插入表格',
      body: `
        <div class="modal-row">
          <label>行数<input id="dlg-table-rows" type="number" min="1" max="20" value="3"></label>
          <label>列数<input id="dlg-table-cols" type="number" min="1" max="10" value="3"></label>
        </div>
        <label class="check-row" style="margin:2px 0"><input id="dlg-table-header" type="checkbox" checked> 第一行为表头</label>`,
      confirmText: '插入表格',
      onConfirm: (backdrop, close) => {
        const rows = Math.max(1, Math.min(20, Number(backdrop.querySelector('#dlg-table-rows').value) || 1));
        const cols = Math.max(1, Math.min(10, Number(backdrop.querySelector('#dlg-table-cols').value) || 1));
        const header = backdrop.querySelector('#dlg-table-header').checked;
        const markdown = makeMarkdownTable(header ? rows - 1 : rows, cols, header);
        close();
        if (state.mode === 'rich') {
          insertRichHTML(marked.parse(markdown), true);
        } else {
          insertMarkdownAtCursor(`\n\n${markdown}\n\n`);
        }
        return false;
      }
    });
  }

  /* ---------------- media ---------------- */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) throw new Error('请选择图片文件');
    if (file.size > 15 * 1024 * 1024) throw new Error('图片不能超过 15MB');
    const dataUrl = await fileToDataURL(file);
    const data = await api('/api/upload', {
      method: 'POST',
      body: { filename: file.name, dataUrl }
    });
    return data.path;
  }

  async function insertImageFile(file) {
    try {
      toast('正在上传图片…');
      const path = await uploadImage(file);
      const alt = String(file.name || '图片').replace(/\.[^.]+$/, '');
      if (state.mode === 'rich') {
        insertRichHTML(`<img src="${escapeHTML(path)}" alt="${escapeHTML(alt)}">`, true);
      } else {
        insertMarkdownAtCursor(`\n\n![${alt}](${path})\n\n`);
      }
      toast('图片已插入');
    } catch (err) {
      toast(err.message || '上传失败');
    }
  }

  el.imageInput.addEventListener('change', async () => {
    const file = el.imageInput.files && el.imageInput.files[0];
    el.imageInput.value = '';
    if (file) await insertImageFile(file);
  });

  el.coverInput.addEventListener('change', async () => {
    const file = el.coverInput.files && el.coverInput.files[0];
    el.coverInput.value = '';
    if (!file) return;
    try {
      toast('正在上传封面…');
      const path = await uploadImage(file);
      state.meta.cover = path;
      updateCover();
      scheduleSave();
      toast('封面已更新');
    } catch (err) {
      toast(err.message || '封面上传失败');
    }
  });

  el.coverBtn.addEventListener('click', () => el.coverInput.click());
  el.coverClear.addEventListener('click', () => {
    state.meta.cover = '';
    updateCover();
    scheduleSave();
  });

  el.rich.addEventListener('paste', async event => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (imageItem) {
      event.preventDefault();
      saveRichSelection();
      const file = imageItem.getAsFile();
      if (file) await insertImageFile(file);
    }
  });

  el.md.addEventListener('paste', async event => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) await insertImageFile(file);
    }
  });

  let dragDepth = 0;
  el.editorScroll.addEventListener('dragenter', event => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return;
    event.preventDefault();
    dragDepth++;
    el.dropHint.classList.remove('hidden');
  });
  el.editorScroll.addEventListener('dragover', event => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
  });
  el.editorScroll.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) el.dropHint.classList.add('hidden');
  });
  el.editorScroll.addEventListener('drop', async event => {
    event.preventDefault();
    dragDepth = 0;
    el.dropHint.classList.add('hidden');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range && el.rich.contains(range.commonAncestorContainer)) state.lastRange = range.cloneRange();
    }
    await insertImageFile(file);
  });

  /* ---------------- draft actions ---------------- */
  el.draftList.addEventListener('click', async event => {
    const deleteBtn = event.target.closest('[data-delete-draft]');
    if (deleteBtn) {
      event.stopPropagation();
      const id = deleteBtn.dataset.deleteDraft;
      showModal({
        title: '删除这份草稿？',
        desc: '删除后无法恢复，已发布到 _posts 的文章不受影响。',
        confirmText: '删除',
        danger: true,
        onConfirm: async (backdrop, close) => {
          close();
          await api(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (state.draftId === id) {
            state.draftId = null;
            localStorage.removeItem(KEY_LAST);
            updateDraftLabel();
          }
          await loadDrafts();
          toast('草稿已删除');
          return false;
        }
      });
      return;
    }
    const item = event.target.closest('[data-draft]');
    if (item) {
      try {
        await loadDraft(item.dataset.draft);
        el.sidebar.classList.remove('open');
        document.body.classList.remove('sidebar-open');
      } catch (err) { toast(err.message || '草稿载入失败'); }
    }
  });

  el.newDraft.addEventListener('click', () => {
    el.sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    newDraft().catch(err => toast(err.message));
  });

  /* ---------------- post actions ---------------- */
  el.postSearch.addEventListener('input', () => renderPosts(el.postSearch.value));
  el.postList.addEventListener('click', async event => {
    const item = event.target.closest('[data-post]');
    if (!item) return;
    try {
      await openPost(item.dataset.post);
      el.sidebar.classList.remove('open');
      document.body.classList.remove('sidebar-open');
      toast('已打开文章');
    } catch (err) {
      toast(err.message || '文章打开失败');
    }
  });

  /* ---------------- publish / export ---------------- */
  function buildFrontMatter() {
    const date = parseMetaDate(state.meta.date);
    const yaml = value => JSON.stringify(String(value));
    const lines = [
      '---',
      'layout: post',
      `title: ${yaml(state.meta.title || '未命名文章')}`,
      `date: ${formatDateForYaml(date)}`
    ];
    if (state.meta.categories.length) lines.push(`categories: [${state.meta.categories.map(yaml).join(', ')}]`);
    if (state.meta.tags.length) lines.push(`tags: [${state.meta.tags.map(yaml).join(', ')}]`);
    if (state.meta.cover) lines.push(`cover: ${yaml(state.meta.cover)}`);
    if (state.meta.excerpt) lines.push(`excerpt: ${yaml(state.meta.excerpt)}`);
    lines.push(`comments: ${state.meta.comments === false ? 'false' : 'true'}`);
    lines.push('---', '');
    return lines.join('\n');
  }

  function formatDateForYaml(date) {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
      `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  }

  function buildFullMarkdown() {
    return `${buildFrontMatter()}\n${normalizeMarkdown(state.markdown)}\n`;
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('已复制到剪贴板');
  }

  async function runPublish(action, overwrite = false) {
    readMetaFromUI();
    if (!state.meta.title) {
      toast('请先填写文章标题');
      el.title.focus();
      return;
    }
    const meta = { ...state.meta };
    try {
      const result = await api('/api/publish', {
        method: 'POST',
        body: { meta, markdown: state.markdown, action, overwrite }
      });
      state.meta.file = result.file;
      updateFilePreview();
      updateDraftLabel();

      const logBlock = result.log
        ? `<div class="modal-pre">${escapeHTML(result.log)}</div>`
        : '<p class="modal-desc">文章已写入本地，尚未提交到 Git。</p>';
      showModal({
        title: result.pushed ? '已发布并推送' : '已保存到 _posts',
        desc: `<code>_posts/${escapeHTML(result.file)}</code>${result.pushed ? '<br>GitHub Pages 通常需要约 1 分钟完成构建。' : ''}`,
        body: logBlock,
        confirmText: '知道了',
        cancelText: '关闭',
        onConfirm: (backdrop, close) => { close(); return false; }
      });
      toast(result.pushed ? '已推送上线' : '已保存到 _posts');
    } catch (err) {
      if (err.status === 409 && !overwrite) {
        showModal({
          title: '同名文章已存在',
          desc: `<code>_posts/${escapeHTML(err.data.file)}</code> 已存在，是否覆盖？`,
          confirmText: '覆盖',
          danger: true,
          onConfirm: async (backdrop, close) => {
            close();
            await runPublish(action, true);
            return false;
          }
        });
        return;
      }
      showModal({
        title: '操作未完成',
        desc: escapeHTML(err.message || '未知错误'),
        body: err.data && err.data.log ? `<div class="modal-pre">${escapeHTML(err.data.log)}</div>` : '',
        confirmText: '知道了',
        onConfirm: (backdrop, close) => { close(); return false; }
      });
    }
  }

  function publishFlow(action) {
    readMetaFromUI();
    if (!state.meta.title) {
      toast('请先填写文章标题');
      el.title.focus();
      return;
    }
    if (action === 'save') {
      runPublish('save');
      return;
    }
    const fileName = currentFileName();
    showModal({
      title: '发布到博客？',
      desc: `将写入 <code>_posts/${escapeHTML(fileName)}</code>，并执行：<br>
        <code>git add</code> → <code>git commit</code> → <code>git push origin main</code><br>
        推送后 GitHub Pages 会自动构建。`,
      confirmText: '保存并推送',
      onConfirm: async (backdrop, close) => {
        close();
        await runPublish('push');
        return false;
      }
    });
  }

  el.publishBtn.addEventListener('click', () => publishFlow('push'));
  el.publishCaret.addEventListener('click', event => {
    event.stopPropagation();
    el.publishMenu.classList.toggle('hidden');
    el.exportMenu.classList.add('hidden');
  });
  el.publishMenu.addEventListener('click', event => {
    event.stopPropagation();
    const button = event.target.closest('[data-publish]');
    if (!button) return;
    el.publishMenu.classList.add('hidden');
    publishFlow(button.dataset.publish);
  });

  el.exportBtn.addEventListener('click', event => {
    event.stopPropagation();
    el.exportMenu.classList.toggle('hidden');
    el.publishMenu.classList.add('hidden');
  });
  el.exportMenu.addEventListener('click', async event => {
    event.stopPropagation();
    const button = event.target.closest('[data-export]');
    if (!button) return;
    el.exportMenu.classList.add('hidden');
    readMetaFromUI();

    if (button.dataset.export === 'md') {
      download(currentFileName(), buildFullMarkdown());
      toast('已下载 Markdown 文件');
    } else if (button.dataset.export === 'copy') {
      await copyText(normalizeMarkdown(state.markdown));
    } else if (button.dataset.export === 'frontmatter') {
      await copyText(buildFullMarkdown());
    }
  });

  document.addEventListener('click', () => {
    el.exportMenu.classList.add('hidden');
    el.publishMenu.classList.add('hidden');
    el.sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  });
  el.sidebar.addEventListener('click', event => event.stopPropagation());
  el.sidebarToggle.addEventListener('click', event => {
    event.stopPropagation();
    const open = el.sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open', open);
  });
  el.previewToggle.addEventListener('click', () => document.body.classList.toggle('show-preview'));

  el.saveDraft.addEventListener('click', () => saveDraft(true));

  el.themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY_THEME, next);
  });

  /* ---------------- editor events ---------------- */
  $('#mode-switch').addEventListener('click', event => {
    const button = event.target.closest('button[data-mode]');
    if (button) setMode(button.dataset.mode);
  });

  el.title.addEventListener('input', () => {
    state.meta.title = el.title.value;
    updateFilePreview();
    scheduleSave();
  });

  el.slug.addEventListener('input', () => {
    state.meta.slug = el.slug.value.trim();
    updateFilePreview();
    scheduleSave();
  });

  el.date.addEventListener('change', () => {
    state.meta.date = el.date.value;
    updateFilePreview();
    scheduleSave();
  });

  el.excerpt.addEventListener('input', () => {
    state.meta.excerpt = el.excerpt.value;
    scheduleSave();
  });

  el.comments.addEventListener('change', () => {
    state.meta.comments = el.comments.checked;
    scheduleSave();
  });

  [['category', 'categories'], ['tag', 'tags']].forEach(([inputKey, metaKey]) => {
    const input = inputKey === 'category' ? el.categoryInput : el.tagInput;
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
        event.preventDefault();
        addChip(metaKey, input.value);
        input.value = '';
        updateFilePreview();
      } else if (event.key === 'Backspace' && !input.value && state.meta[metaKey].length) {
        state.meta[metaKey].pop();
        renderChips(metaKey);
        scheduleSave();
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) {
        addChip(metaKey, input.value);
        input.value = '';
      }
    });
  });

  el.categoryChips.addEventListener('click', event => {
    const button = event.target.closest('button[data-kind]');
    if (!button) return;
    state.meta[button.dataset.kind].splice(Number(button.dataset.index), 1);
    renderChips(button.dataset.kind);
    scheduleSave();
  });
  el.tagChips.addEventListener('click', event => {
    const button = event.target.closest('button[data-kind]');
    if (!button) return;
    state.meta[button.dataset.kind].splice(Number(button.dataset.index), 1);
    renderChips(button.dataset.kind);
    scheduleSave();
  });

  el.rich.addEventListener('input', () => {
    if (state.syncing) return;
    syncFromRich();
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === el.rich) saveRichSelection();
  });

  el.md.addEventListener('input', () => {
    state.markdown = el.md.value;
    scheduleSave();
    renderPreview();
    updateCounts();
  });

  el.md.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      insertMarkdownAtCursor('  ');
    }
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveDraft(true);
    }
  });

  window.addEventListener('beforeunload', event => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* ---------------- splitter ---------------- */
  let dragging = false;
  function applySplit(width) {
    if (window.innerWidth <= 980) return;
    const max = el.workspace.getBoundingClientRect().width - 360;
    const clamped = Math.max(380, Math.min(max, width));
    el.workspace.style.setProperty('--editor-width', `${clamped}px`);
  }

  el.splitter.addEventListener('mousedown', event => {
    dragging = true;
    document.body.classList.add('resizing');
    event.preventDefault();
  });
  document.addEventListener('mousemove', event => {
    if (!dragging) return;
    const rect = el.workspace.getBoundingClientRect();
    applySplit(event.clientX - rect.left);
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    const width = parseInt(getComputedStyle(el.workspace).getPropertyValue('--editor-width'), 10);
    if (width) localStorage.setItem(KEY_SPLIT, width);
  });

  /* ---------------- init ---------------- */
  async function loadMeta() {
    const data = await api('/api/meta');
    state.categories = data.categories || [];
    state.tags = data.tags || [];
    state.posts = data.posts || [];
    renderOptions();
    renderPosts('');
  }

  function applyInitialTheme() {
    const saved = localStorage.getItem(KEY_THEME);
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  }

  async function init() {
    applyInitialTheme();
    el.rich.dataset.placeholder = '开始写作，或用上方工具栏插入标题、列表、图片、代码块和表格…';
    el.date.value = state.meta.date;
    updateCover();
    updateFilePreview();
    updateDraftLabel();
    setSaveState('dirty', '未保存');

    const savedSplit = parseInt(localStorage.getItem(KEY_SPLIT) || '', 10);
    if (savedSplit) applySplit(savedSplit);

    try { await loadMeta(); } catch (err) { toast('无法读取文章列表，请确认本地服务已启动'); }
    await loadDrafts();

    const last = localStorage.getItem(KEY_LAST);
    if (last) {
      try {
        await loadDraft(last);
      } catch (_) {
        await newDraft();
      }
    } else {
      await newDraft();
    }

    renderPreview();
    updateCounts();
  }

  init().catch(err => {
    console.error(err);
    toast(err.message || '编辑器初始化失败');
  });
})();
