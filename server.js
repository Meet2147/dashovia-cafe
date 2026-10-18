'use strict';

// dashovia.café — storefront server. No third-party dependencies: Node's
// built-in http/fs/crypto plus global fetch (Node 18+).
//
//   GET  /api/config          → public client IDs for the browser
//   GET  /api/me              → the signed-in user (from the session cookie)
//   POST /api/auth/google     → verify a Google ID token, start a session
//   POST /api/auth/github     → exchange a GitHub OAuth code, start a session
//   POST /api/auth/logout     → end the session
//   POST /api/checkout        → create a Dodo Payments checkout session
//   POST /api/portal          → link to the Dodo customer portal (manage subscription)
//   POST /api/webhooks/dodo   → receive signed Dodo Payments events
//   everything else           → static files from the repo root
//
// Sessions are signed cookies, so no database is needed for sign-in.
// Secrets live only in environment variables, never in the repo.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const env = process.env;

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
  'render.yaml', 'netlify.toml', 'vercel.json', 'README.md', 'LICENSE',
]);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function readJson(req) {
  try { return JSON.parse((await readBody(req)) || '{}'); } catch { return null; }
}
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ---------------- Sessions (signed cookie) ----------------
// Set SESSION_SECRET in production; without it, a random one is used and
// everyone is signed out whenever the server restarts.
const SESSION_SECRET = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!env.SESSION_SECRET) console.warn('SESSION_SECRET is not set: sessions will reset on restart.');
const COOKIE = 'dc_session';
const SESSION_DAYS = 30;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');

function readCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function getSession(req) {
  const raw = readCookies(req)[COOKIE];
  if (!raw) return null;
  const [data, sig] = raw.split('.');
  if (!data || !sig) return null;
  const good = Buffer.from(sign(data));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return s.exp > Date.now() ? s.user : null;
  } catch { return null; }
}
function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}
function sessionCookie(req, user) {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (user) {
    const data = b64u(JSON.stringify({ user, exp: Date.now() + SESSION_DAYS * 864e5 }));
    parts[0] = `${COOKIE}=${data}.${sign(data)}`;
    parts.push(`Max-Age=${SESSION_DAYS * 86400}`);
  } else {
    parts.push('Max-Age=0');
  }
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

// Stable, shareable referral code for a user (derived from their email).
function refCode(email) {
  return crypto.createHash('sha256').update('dashovia-ref:' + String(email).toLowerCase()).digest('hex').slice(0, 8);
}
function publicUser(u) {
  return u ? { ...u, refCode: u.email ? refCode(u.email) : '' } : null;
}
function startSession(req, res, user) {
  sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, user) });
}

// ---------------- Google ----------------
async function googleSignIn(req, res) {
  if (!env.GOOGLE_CLIENT_ID) return sendJson(res, 503, { error: 'Google sign-in is not set up yet.' });
  const body = await readJson(req);
  if (!body || typeof body.credential !== 'string') return sendJson(res, 400, { error: 'Missing credential.' });
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.credential));
    const t = await r.json();
    const issuerOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
    if (!r.ok || t.aud !== env.GOOGLE_CLIENT_ID || !issuerOk || Number(t.exp) * 1000 < Date.now()) {
      return sendJson(res, 401, { error: 'Google sign-in could not be verified.' });
    }
    if (String(t.email_verified) !== 'true') return sendJson(res, 401, { error: 'Please verify your Google email first.' });
    return startSession(req, res, {
      provider: 'google', id: t.sub, email: t.email, name: t.name || t.email.split('@')[0], picture: t.picture || '',
    });
  } catch {
    return sendJson(res, 502, { error: 'Could not reach Google.' });
  }
}

// ---------------- GitHub ----------------
async function githubSignIn(req, res) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return sendJson(res, 503, { error: 'GitHub sign-in is not set up yet.' });
  }
  const body = await readJson(req);
  if (!body || !body.code) return sendJson(res, 400, { error: 'Missing code.' });

  try {
    const tokRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
        code: body.code, redirect_uri: body.redirect_uri,
      }),
    });
    const tok = await tokRes.json();
    if (tok.error || !tok.access_token) {
      return sendJson(res, 400, { error: tok.error_description || tok.error || 'Token exchange failed.' });
    }
    const gh = (p) => fetch('https://api.github.com' + p, {
      headers: { Authorization: 'Bearer ' + tok.access_token, 'User-Agent': 'dashovia-cafe', Accept: 'application/vnd.github+json' },
    });
    const user = await (await gh('/user')).json();
    let email = '';
    try {
      const emails = await (await gh('/user/emails')).json();
      if (Array.isArray(emails)) {
        const best = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        if (best) email = best.email;
      }
    } catch { /* email scope not granted */ }
    if (!email) return sendJson(res, 400, { error: 'Your GitHub account needs a verified email address.' });

    return startSession(req, res, {
      provider: 'github', id: String(user.id), email, name: user.name || user.login, picture: user.avatar_url || '',
    });
  } catch {
    return sendJson(res, 502, { error: 'Could not reach GitHub.' });
  }
}

// ---------------- Dodo Payments ----------------
const DODO_BASE = env.DODO_PAYMENTS_ENV === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
const dodo = (p, opts = {}) => fetch(DODO_BASE + p, {
  ...opts,
  headers: { Authorization: 'Bearer ' + env.DODO_PAYMENTS_API_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

const PRODUCT_KEYS = ['CUTTING_MONTHLY', 'CUTTING_ANNUAL', 'KETTLE_MONTHLY', 'KETTLE_ANNUAL', 'KADAK'];
function dodoProduct(plan, period) {
  const m = period === 'monthly';
  return {
    cutting: env[m ? 'DODO_PRODUCT_CUTTING_MONTHLY' : 'DODO_PRODUCT_CUTTING_ANNUAL'],
    kettle: env[m ? 'DODO_PRODUCT_KETTLE_MONTHLY' : 'DODO_PRODUCT_KETTLE_ANNUAL'],
    kadak: env.DODO_PRODUCT_KADAK,
  }[plan];
}

function publicOrigin(req) {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/+$/, '');
  return (isHttps(req) ? 'https' : 'http') + '://' + req.headers.host;
}

async function createCheckout(req, res) {
  if (!env.DODO_PAYMENTS_API_KEY) return sendJson(res, 503, { error: 'Payments are not set up yet. Please check back soon.' });
  const body = await readJson(req);
  if (!body) return sendJson(res, 400, { error: 'Invalid request body.' });

  const plan = String(body.plan || '');
  const period = body.period === 'monthly' ? 'monthly' : 'annual';
  const productId = dodoProduct(plan, period);
  if (!productId) return sendJson(res, 400, { error: 'That plan is not available yet.' });

  const user = getSession(req);
  const email = user && isEmail(user.email) ? user.email : '';
  const origin = publicOrigin(req);
  const payload = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: origin + '/?checkout=done#pricing',
    cancel_url: origin + '/#pricing',
    metadata: { site: 'dashovia-cafe', plan, period },
  };
  if (email) payload.customer = { email, name: user.name || email.split('@')[0] };

  // Referrals: friend gets the referral discount; the code is saved on the order.
  const ref = typeof body.ref === 'string' && /^[a-f0-9]{8}$/.test(body.ref) ? body.ref : '';
  if (ref && (!email || refCode(email) !== ref)) {
    payload.metadata.referrer = ref;
    if (env.REFERRAL_DISCOUNT_CODE) payload.discount_codes = [env.REFERRAL_DISCOUNT_CODE];
  }

  try {
    const r = await dodo('/checkouts', { method: 'POST', body: JSON.stringify(payload) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.checkout_url) {
      console.error('Dodo checkout failed', r.status, data);
      return sendJson(res, 502, { error: 'Could not start checkout. Please try again.' });
    }
    return sendJson(res, 200, { checkout_url: data.checkout_url });
  } catch (err) {
    console.error('Dodo checkout error', err);
    return sendJson(res, 502, { error: 'Could not reach the payment provider.' });
  }
}

// Customer portal: lets a signed-in buyer manage or cancel their subscription.
async function customerPortal(req, res) {
  const user = getSession(req);
  if (!user || !user.email) return sendJson(res, 401, { error: 'Please sign in first.' });
  if (!env.DODO_PAYMENTS_API_KEY) return sendJson(res, 503, { error: 'Payments are not set up yet.' });
  try {
    const list = await (await dodo('/customers?email=' + encodeURIComponent(user.email))).json();
    const items = (list && list.items) || [];
    const c = items.find((x) => String(x.email).toLowerCase() === user.email.toLowerCase());
    if (!c) return sendJson(res, 404, { error: 'No purchases found for ' + user.email + '.' });
    const q = new URLSearchParams({ return_url: publicOrigin(req) + '/' });
    const r = await dodo('/customers/' + encodeURIComponent(c.customer_id) + '/customer-portal/session?' + q, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.link) return sendJson(res, 502, { error: 'Could not open the customer portal.' });
    return sendJson(res, 200, { link: d.link });
  } catch {
    return sendJson(res, 502, { error: 'Could not reach the payment provider.' });
  }
}

// Standard Webhooks signature check: HMAC-SHA256 over "id.timestamp.body",
// keyed with the base64-decoded part of the whsec_ secret.
function verifyDodoSignature(headers, rawBody) {
  const secret = env.DODO_PAYMENTS_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(id + '.' + ts + '.' + rawBody).digest();
  return String(sigHeader).split(' ').some((part) => {
    const [ver, sig] = part.split(',');
    if (ver !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

// The Dodo account is shared with other sites, so only keep events for café products.
function isCafeEvent(d) {
  const ours = new Set(PRODUCT_KEYS.map((k) => env['DODO_PRODUCT_' + k]).filter(Boolean));
  const ids = [d.product_id, ...((d.product_cart || []).map((i) => i && i.product_id))].filter(Boolean);
  return ids.some((id) => ours.has(id));
}

// Paid customers are kept in data/customers.json (email → latest status).
// On Render's free plan the disk resets on each deploy; Dodo's dashboard stays
// the source of truth (every order there also carries plan + referrer metadata).
const DATA_FILE = path.join(ROOT, 'data', 'customers.json');
function recordCustomer(event) {
  const d = event.data || {};
  const email = (d.customer && d.customer.email) || '';
  if (!email || !isCafeEvent(d)) return;
  let db = {};
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* first write */ }
  db[email.toLowerCase()] = {
    event: event.type,
    status: d.status || '',
    plan: (d.metadata && d.metadata.plan) || '',
    referrer: (d.metadata && d.metadata.referrer) || '',
    product_id: d.product_id || ((d.product_cart || [])[0] || {}).product_id || '',
    subscription_id: d.subscription_id || '',
    payment_id: d.payment_id || '',
    at: event.timestamp || new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

async function dodoWebhook(req, res) {
  const raw = await readBody(req);
  if (!verifyDodoSignature(req.headers, raw)) return sendJson(res, 401, { error: 'Invalid signature.' });
  let event;
  try { event = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'Invalid JSON.' }); }
  if (/^(payment|subscription)\./.test(event.type || '')) {
    try { recordCustomer(event); } catch (err) { console.error('Could not record customer', err); }
  }
  return sendJson(res, 200, { received: true });
}

// ---------------- Static files ----------------
function streamFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
  if (ext === '.dmg' || ext === '.zip') headers['Content-Disposition'] = 'attachment; filename="' + path.basename(filePath) + '"';
  res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  const base = path.basename(filePath);
  if (base.startsWith('.') || BLOCKED.has(base)
      || filePath.startsWith(path.join(ROOT, 'node_modules'))
      || filePath.startsWith(path.join(ROOT, 'data'))
      || filePath.startsWith(path.join(ROOT, '.git'))) {
    return send(res, 404, 'Not found');
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) return streamFile(req, res, filePath);
    if (path.extname(filePath)) return send(res, 404, 'Not found');
    // Clean URLs: /terms → terms.html, otherwise fall back to the home page.
    fs.stat(filePath + '.html', (err2, st2) => {
      streamFile(req, res, !err2 && st2.isFile() ? filePath + '.html' : path.join(ROOT, 'index.html'));
    });
  });
}

// ---------------- Router ----------------
const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
  const { pathname } = u;
  const route = req.method + ' ' + pathname;

  switch (route) {
    case 'GET /api/config':
      return sendJson(res, 200, { googleClientId: env.GOOGLE_CLIENT_ID || '', githubClientId: env.GITHUB_CLIENT_ID || '' });
    case 'GET /api/me':
      return sendJson(res, 200, { user: publicUser(getSession(req)) });
    case 'POST /api/auth/google': return googleSignIn(req, res);
    case 'POST /api/auth/github': return githubSignIn(req, res);
    case 'POST /api/auth/logout':
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, null) });
    case 'POST /api/checkout': return createCheckout(req, res);
    case 'POST /api/portal': return customerPortal(req, res);
    case 'POST /api/webhooks/dodo': return dodoWebhook(req, res);
  }
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => console.log('dashovia.café listening on :' + PORT));
