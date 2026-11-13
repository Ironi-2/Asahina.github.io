'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { execFile, exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const EDITOR = __dirname;
const POSTS = path.join(ROOT, '_posts');
const DRAFTS = path.join(EDITOR, '.drafts');
const UPLOADS = path.join(ROOT, 'assets', 'images', 'uploads');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8090);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

function yamlString(value) {
  return JSON.stringify(String(value == null ? '' : value));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDate(date) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
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

function parseScalar(raw) {
  let value = String(raw || '').trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1)
      .split(',')
      .map(item => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  value = value.replace(/^["']|["']$/g, '');
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function parseFrontMatter(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: String(text) };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = parseScalar(m[2]);
  }
  return { data, body: String(text).slice(match[0].length) };
}

function safePostFile(file) {
  if (!file || typeof file !== 'string') return null;
  const base = path.basename(file);
  if (!/^[^\\/]+\.md$/i.test(base)) return null;
  const full = path.join(POSTS, base);
  if (!full.startsWith(POSTS + path.sep)) return null;
  return base;
}

async function listPosts() {
  const files = (await fsp.readdir(POSTS).catch(() => []))
    .filter(name => name.toLowerCase().endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const text = await fsp.readFile(path.join(POSTS, file), 'utf8').catch(() => '');
    const { data } = parseFrontMatter(text);
    posts.push({
      file,
      title: data.title || file.replace(/\.md$/i, ''),
      date: data.date || '',
      categories: Array.isArray(data.categories) ? data.categories : (data.categories ? [data.categories] : []),
      tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : [])
    });
  }
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return posts;
}

async function apiMeta(res) {
  const posts = await listPosts();
  const categories = [...new Set(posts.flatMap(p => p.categories))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const tags = [...new Set(posts.flatMap(p => p.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  sendJSON(res, 200, {
    categories,
    tags,
    posts: posts.map(p => ({ file: p.file, title: p.title, date: p.date })),
    root: ROOT
  });
}

async function apiDrafts(req, res, url) {
  await fsp.mkdir(DRAFTS, { recursive: true });

  if (req.method === 'GET' && url.pathname === '/api/drafts') {
    const files = (await fsp.readdir(DRAFTS)).filter(name => name.endsWith('.json'));
    const drafts = [];
    for (const file of files) {
      try {
        const raw = JSON.parse(await fsp.readFile(path.join(DRAFTS, file), 'utf8'));
        drafts.push({ id: raw.id, title: raw.title || '未命名草稿', updatedAt: raw.updatedAt || '' });
      } catch (_) { /* ignore broken draft */ }
    }
    drafts.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return sendJSON(res, 200, { drafts });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/drafts/')) {
    const id = url.pathname.slice('/api/drafts/'.length);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJSON(res, 400, { error: '无效的草稿 ID' });
    try {
      const raw = await fsp.readFile(path.join(DRAFTS, `${id}.json`), 'utf8');
      return sendJSON(res, 200, JSON.parse(raw));
    } catch (_) {
      return sendJSON(res, 404, { error: '草稿不存在' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/drafts') {
    const body = await readJSON(req);
    const now = new Date().toISOString();
    const id = body.id && /^[A-Za-z0-9_-]+$/.test(body.id)
      ? body.id
      : `draft-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const record = {
      id,
      title: body.title || '',
      markdown: body.markdown || '',
      meta: body.meta || {},
      createdAt: body.createdAt || now,
      updatedAt: now
    };
    await fsp.writeFile(path.join(DRAFTS, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');
    return sendJSON(res, 200, { id, updatedAt: now });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/drafts/')) {
    const id = url.pathname.slice('/api/drafts/'.length);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return sendJSON(res, 400, { error: '无效的草稿 ID' });
    await fsp.unlink(path.join(DRAFTS, `${id}.json`)).catch(() => {});
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 405, { error: '不支持的草稿操作' });
}

async function apiUpload(req, res) {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
  const body = await readJSON(req);
  const match = String(body.dataUrl || '').match(/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return sendJSON(res, 400, { error: '只支持 PNG / JPEG / WebP / GIF / SVG 图片' });

  const extMap = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif', 'svg+xml': 'svg' };
  const ext = extMap[match[1]] || 'png';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return sendJSON(res, 400, { error: '图片内容为空' });
  if (buffer.length > 15 * 1024 * 1024) return sendJSON(res, 413, { error: '图片不能超过 15MB' });

  const now = new Date();
  const folder = `${now.getFullYear()}${pad(now.getMonth() + 1)}`;
  const original = path.basename(String(body.filename || 'image')).replace(/\.[^.]+$/, '');
  const base = original.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  const name = `${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const targetDir = path.join(UPLOADS, folder);
  await fsp.mkdir(targetDir, { recursive: true });
  await fsp.writeFile(path.join(targetDir, name), buffer);

  sendJSON(res, 200, {
    path: `/assets/images/uploads/${folder}/${name}`,
    size: buffer.length
  });
}

function buildPostFile(meta, markdown, file) {
  const date = meta.date ? new Date(meta.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('日期格式无效');

  const lines = [
    '---',
    'layout: post',
    `title: ${yamlString(meta.title || '未命名文章')}`,
    `date: ${formatDate(date)}`
  ];
  const categories = Array.isArray(meta.categories) ? meta.categories.filter(Boolean) : [];
  const tags = Array.isArray(meta.tags) ? meta.tags.filter(Boolean) : [];
  if (categories.length) lines.push(`categories: [${categories.map(yamlString).join(', ')}]`);
  if (tags.length) lines.push(`tags: [${tags.map(yamlString).join(', ')}]`);
  if (meta.cover) lines.push(`cover: ${yamlString(meta.cover)}`);
  if (meta.excerpt) lines.push(`excerpt: ${yamlString(meta.excerpt)}`);
  lines.push(`comments: ${meta.comments === false ? 'false' : 'true'}`);
  lines.push('---', '');

  const body = String(markdown || '').replace(/\s+$/g, '');
  return { text: `${lines.join('\n')}\n${body}\n`, date };
}

function collectAssets(markdown, cover) {
  const text = `${markdown || ''}\n${cover || ''}`;
  const assets = new Set();
  const re = /(?:\/Asahina\.github\.io)?(\/assets\/images\/[^\s)"'<>]+)/g;
  let match;
  while ((match = re.exec(text))) {
    let rel;
    try {
      rel = decodeURIComponent(match[1].split(/[?#]/)[0]);
    } catch (_) {
      continue;
    }
    const full = path.resolve(ROOT, '.' + rel);
    const assetsRoot = path.join(ROOT, 'assets') + path.sep;
    if (full.startsWith(assetsRoot) && fs.existsSync(full)) {
      assets.add(path.relative(ROOT, full));
    }
  }
  return [...assets];
}

function runGit(args, cwd) {
  return new Promise(resolve => {
    execFile('git', args, {
      cwd,
      timeout: 180000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? (error.code || 1) : 0,
        output: [stdout, stderr].filter(Boolean).join('\n').trim()
      });
    });
  });
}

async function apiPublish(req, res) {
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
  const body = await readJSON(req);
  const meta = body.meta || {};
  const markdown = body.markdown || '';
  const action = body.action === 'push' ? 'push' : 'save';

  if (!meta.title || !String(meta.title).trim()) {
    return sendJSON(res, 400, { error: '请先填写文章标题' });
  }

  let file = safePostFile(meta.file);
  if (!file) {
    const date = meta.date ? new Date(meta.date) : new Date();
    if (Number.isNaN(date.getTime())) return sendJSON(res, 400, { error: '日期格式无效' });
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    file = `${day}-${slugify(meta.slug || meta.title)}.md`;
  }

  const full = path.join(POSTS, file);
  const exists = fs.existsSync(full);
  if (exists && !meta.file && !body.overwrite) {
    return sendJSON(res, 409, { error: '同名文章已存在', file, exists: true });
  }

  let built;
  try {
    built = buildPostFile(meta, markdown, file);
  } catch (err) {
    return sendJSON(res, 400, { error: err.message });
  }

  await fsp.mkdir(POSTS, { recursive: true });
  await fsp.writeFile(full, built.text, 'utf8');

  let log = '';
  let pushed = false;
  if (action === 'push') {
    const rel = path.relative(ROOT, full);
    const assets = collectAssets(markdown, meta.cover);
    const add = await runGit(['add', '--', rel, ...assets], ROOT);
    log += add.output ? `${add.output}\n` : '';
    if (!add.ok) return sendJSON(res, 500, { error: 'git add 失败', file, log });

    const commit = await runGit(['commit', '-m', `post: ${meta.title}`], ROOT);
    log += commit.output ? `${commit.output}\n` : '';
    if (!commit.ok && !/nothing to commit|没有要提交的更改/i.test(commit.output)) {
      return sendJSON(res, 500, { error: 'git commit 失败', file, log });
    }

    const push = await runGit(['push', 'origin', 'main'], ROOT);
    log += push.output ? `${push.output}\n` : '';
    if (!push.ok) return sendJSON(res, 500, { error: 'git push 失败，文件已保存', file, log, pushed: false });
    pushed = true;
  }

  sendJSON(res, 200, {
    ok: true,
    file,
    path: `/_posts/${file}`,
    pushed,
    log: log.trim()
  });
}

async function serveAsset(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  const rel = decoded.replace(/^\/Asahina\.github\.io/, '');
  const full = path.resolve(ROOT, '.' + rel);
  const assetsRoot = path.join(ROOT, 'assets') + path.sep;
  if (!full.startsWith(assetsRoot)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const stat = await fsp.stat(full);
    if (!stat.isFile()) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  } catch (_) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (_) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const full = path.resolve(EDITOR, '.' + pathname);
  if (!full.startsWith(EDITOR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const stat = await fsp.stat(full);
    if (stat.isDirectory()) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=86400'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  } catch (_) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname === '/api/health') return sendJSON(res, 200, { ok: true, root: ROOT });
    if (url.pathname === '/api/meta') return apiMeta(res);
    if (url.pathname.startsWith('/api/drafts')) return apiDrafts(req, res, url);
    if (url.pathname === '/api/upload') return apiUpload(req, res);
    if (url.pathname === '/api/publish') return apiPublish(req, res);

    if (req.method === 'GET' && url.pathname === '/api/post') {
      const file = safePostFile(url.searchParams.get('file'));
      if (!file) return sendJSON(res, 400, { error: '无效的文件名' });
      try {
        const text = await fsp.readFile(path.join(POSTS, file), 'utf8');
        return sendJSON(res, 200, { file, text });
      } catch (_) {
        return sendJSON(res, 404, { error: '文章不存在' });
      }
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/Asahina.github.io/assets/')) {
      return serveAsset(req, res, url.pathname);
    }

    await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: err.message || '服务器内部错误' });
  }
});

fs.mkdirSync(DRAFTS, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`\n  Asahina 写作台已启动`);
  console.log(`  ${url}\n`);
  console.log(`  工作目录: ${ROOT}`);
  console.log(`  草稿目录: ${DRAFTS}`);
  console.log(`  图片目录: ${UPLOADS}\n`);

  if (process.argv.includes('--open')) {
    const command = process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(command, () => {});
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，可用 PORT=8091 启动。`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
