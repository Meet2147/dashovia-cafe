'use strict';

// dashovia.café — static storefront + a tiny auth endpoint for GitHub OAuth.
// No third-party dependencies: Node's built-in http/fs plus global fetch (Node 18+).
//
//   GET  /api/config        → public client IDs for the browser (from env)
//   POST /api/auth/github    → exchange the OAuth code for the user's profile
//   everything else          → static files from the repo root
//
// Secrets (GITHUB_CLIENT_SECRET) live only in the environment, never in the repo.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.dmg': 'application/x-apple-diskimage',
  '.zip': 'application/zip',
  '.woff2': 'font/woff2',
};

// Never serve these over HTTP (server internals / deploy config).
const BLOCKED = new Set([
  'server.js', 'package.json', 'package-lock.json',
  'render.yaml', 'netlify.toml', 'vercel.json',
]);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function githubExchange(req, res) {
  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return sendJson(res, 500, { error: 'GitHub sign-in is not configured on the server.' });
  }
  let payload;
  try { payload = JSON.parse((await readBody(req)) || '{}'); }
  catch { return sendJson(res, 400, { error: 'Invalid request body.' }); }

  const { code, redirect_uri } = payload;
  if (!code) return sendJson(res, 400, { error: 'Missing code.' });

  try {
    const tokRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri }),
    });
    const tok = await tokRes.json();
    if (tok.error || !tok.access_token) {
      return sendJson(res, 400, { error: tok.error_description || tok.error || 'Token exchange failed.' });
    }

    const gh = (p) => fetch('https://api.github.com' + p, {
      headers: {
        Authorization: 'Bearer ' + tok.access_token,
        'User-Agent': 'dashovia-cafe',
        Accept: 'application/vnd.github+json',
      },
    });

    const user = await (await gh('/user')).json();
    let email = user.email || '';
    if (!email) {
      try {
        const emails = await (await gh('/user/emails')).json();
        if (Array.isArray(emails)) {
          const primary = emails.find((e) => e.primary && e.verified)
            || emails.find((e) => e.verified) || emails[0];
          if (primary) email = primary.email;
        }
      } catch { /* email scope not granted — carry on without it */ }
    }

    return sendJson(res, 200, {
      provider: 'github',
      login: user.login,
      name: user.name || user.login,
      email,
      avatarUrl: user.avatar_url || '',
    });
  } catch {
    return sendJson(res, 502, { error: 'Could not reach GitHub.' });
  }
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  const base = path.basename(filePath);
  if (base.startsWith('.') || BLOCKED.has(base)
      || filePath.startsWith(path.join(ROOT, 'node_modules'))
      || filePath.startsWith(path.join(ROOT, '.git'))) {
    return send(res, 404, 'Not found');
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
      if (ext === '.dmg' || ext === '.zip') {
        headers['Content-Disposition'] = 'attachment; filename="' + base + '"';
      }
      res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(filePath).pipe(res);
    }
    // Extensionless routes fall back to the SPA shell; missing assets 404.
    if (!path.extname(filePath)) {
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES['.html'] });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
    }
    return send(res, 404, 'Not found');
  });
}

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); }
  catch { return send(res, 400, 'Bad request'); }
  const { pathname } = u;

  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, {
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      githubClientId: process.env.GITHUB_CLIENT_ID || '',
    });
  }
  if (pathname === '/api/auth/github' && req.method === 'POST') {
    return githubExchange(req, res);
  }
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method not allowed');
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => console.log('dashovia.café listening on :' + PORT));
