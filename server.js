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
//   GET/POST /api/reviews     → public approved reviews / submit your own
//   GET/POST /api/refunds     → your refundable payments / request a refund
//   /api/admin/*              → admin dashboard (ADMIN_EMAILS only)
//   everything else           → static files from the repo root
//
// Sessions are signed cookies, so no database is needed for sign-in.
// Secrets live only in environment variables, never in the repo.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const createStore = require('./store');

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
  'render.yaml', 'netlify.toml', 'vercel.json', 'README.md', 'LICENSE', 'store.js',
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
// ---------------- Store + admin ----------------
const store = createStore(ROOT);
const ADMIN_EMAILS = (env.ADMIN_EMAILS || 'meetjethwa3@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const isAdmin = (u) => !!(u && u.email && ADMIN_EMAILS.includes(u.email.toLowerCase()));

function publicUser(u) {
  return u ? { ...u, refCode: u.email ? refCode(u.email) : '', isAdmin: isAdmin(u) } : null;
}
// Remember everyone who signs in (for the admin sign-up list and referral lookups).
async function recordUser(u) {
  const id = u.email.toLowerCase();
  const prev = (await store.get('user', id)) || {};
  const now = new Date().toISOString();
  await store.put('user', id, {
    email: u.email, name: u.name || '', provider: u.provider, picture: u.picture || '',
    refCode: refCode(u.email), first_seen: prev.first_seen || now, last_seen: now,
    sign_ins: (prev.sign_ins || 0) + 1,
  });
}
function startSession(req, res, user) {
  recordUser(user).catch((e) => console.error('Could not record user', e.message));
  sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(req, user) });
}
function requireUser(req, res) {
  const u = getSession(req);
  if (!u || !u.email) { sendJson(res, 401, { error: 'Please sign in first.' }); return null; }
  return u;
}
function requireAdmin(req, res) {
  const u = getSession(req);
  if (!isAdmin(u)) { sendJson(res, u ? 403 : 401, { error: u ? 'Admins only.' : 'Please sign in as an admin.' }); return null; }
  return u;
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

// ---------------- Dodo data (source of truth for sales) ----------------
const PRODUCT_LABEL = {
  CUTTING_MONTHLY: 'Cutting Chai · monthly', CUTTING_ANNUAL: 'Cutting Chai · annual',
  KETTLE_MONTHLY: 'Full Kettle · monthly', KETTLE_ANNUAL: 'Full Kettle · annual', KADAK: 'Kadak (one-time)',
};
const cafeProducts = () => PRODUCT_KEYS.filter((k) => env['DODO_PRODUCT_' + k])
  .map((k) => ({ key: k, id: env['DODO_PRODUCT_' + k], label: PRODUCT_LABEL[k], recurring: k !== 'KADAK' }));

async function dodoGet(p) {
  const r = await dodo(p);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Dodo ' + r.status + ' on ' + p.split('?')[0]);
  return d;
}
async function dodoListAll(p, params) {
  const out = [];
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ ...params, page_size: '100', page_number: String(page) });
    const d = await dodoGet(p + '?' + q);
    const items = d.items || [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}
// Payments for café products only (the Dodo account is shared with other sites).
async function cafePayments(extra = {}) {
  const seen = new Map();
  for (const prod of cafeProducts()) {
    for (const p of await dodoListAll('/payments', { product_id: prod.id, ...extra })) {
      if (!seen.has(p.payment_id)) seen.set(p.payment_id, { ...p, _product: prod });
    }
  }
  return [...seen.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
async function cafeSubscriptions() {
  const all = [];
  for (const prod of cafeProducts().filter((x) => x.recurring)) {
    for (const s of await dodoListAll('/subscriptions', { product_id: prod.id })) all.push({ ...s, _product: prod });
  }
  return all;
}
async function dodoCustomerId(email) {
  const d = await dodoGet('/customers?email=' + encodeURIComponent(email));
  const c = (d.items || []).find((x) => String(x.email).toLowerCase() === email.toLowerCase());
  return c ? c.customer_id : null;
}
const REFUND_DAYS = 14;
const withinRefundWindow = (p) => Date.now() - new Date(p.created_at).getTime() < REFUND_DAYS * 864e5;

// ---------------- Reviews ----------------
const cleanText = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

async function listPublicReviews(req, res) {
  const rows = await store.list('review');
  const reviews = rows.filter((r) => r.data.approved).map((r) => ({
    name: r.data.name, org: r.data.org, rating: r.data.rating, quote: r.data.quote, at: r.data.updated_at || r.created_at,
  }));
  return sendJson(res, 200, { reviews });
}
async function myReview(req, res) {
  const u = requireUser(req, res); if (!u) return;
  const r = await store.get('review', u.email.toLowerCase());
  return sendJson(res, 200, { review: r });
}
async function submitReview(req, res) {
  const u = requireUser(req, res); if (!u) return;
  const b = await readJson(req);
  const rating = Math.round(Number(b && b.rating));
  const quote = cleanText(b && b.quote, 600);
  if (!(rating >= 1 && rating <= 5)) return sendJson(res, 400, { error: 'Please pick a rating from 1 to 5 stars.' });
  if (quote.length < 10) return sendJson(res, 400, { error: 'Please write at least a sentence.' });
  const id = u.email.toLowerCase();
  const prev = await store.get('review', id);
  await store.put('review', id, {
    email: u.email, name: cleanText(b.name, 60) || u.name || u.email.split('@')[0],
    org: cleanText(b.org, 80), rating, quote, improve: cleanText(b.improve, 600),
    approved: false, // every new or edited review waits for an admin
    created_at: prev ? prev.created_at : new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  return sendJson(res, 200, { ok: true });
}

// ---------------- Refund requests ----------------
async function refundOptions(req, res) {
  const u = requireUser(req, res); if (!u) return;
  if (!env.DODO_PAYMENTS_API_KEY) return sendJson(res, 503, { error: 'Payments are not set up yet.' });
  const requests = (await store.list('refund')).filter((r) => r.data.email.toLowerCase() === u.email.toLowerCase()).map((r) => r.data);
  const cid = await dodoCustomerId(u.email);
  const payments = cid ? (await cafePayments({ customer_id: cid })).filter((p) => p.status === 'succeeded') : [];
  return sendJson(res, 200, {
    days: REFUND_DAYS,
    requests,
    payments: payments.map((p) => ({
      payment_id: p.payment_id, product: p._product.label, amount: p.total_amount, currency: p.currency,
      created_at: p.created_at, eligible: withinRefundWindow(p) && !p.refund_status
        && !requests.some((r) => r.payment_id === p.payment_id && r.status !== 'declined'),
    })),
  });
}
async function requestRefund(req, res) {
  const u = requireUser(req, res); if (!u) return;
  const b = await readJson(req);
  const paymentId = String((b && b.payment_id) || '');
  const reason = cleanText(b && b.reason, 800);
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return sendJson(res, 400, { error: 'Pick the payment to refund.' });
  const cid = await dodoCustomerId(u.email);
  const p = cid ? (await cafePayments({ customer_id: cid })).find((x) => x.payment_id === paymentId) : null;
  if (!p || p.status !== 'succeeded') return sendJson(res, 404, { error: 'We couldn’t find that payment on your account.' });
  if (!withinRefundWindow(p)) return sendJson(res, 400, { error: `That payment is older than ${REFUND_DAYS} days.` });
  const existing = (await store.list('refund')).find((r) => r.data.payment_id === paymentId && r.data.status !== 'declined');
  if (existing) return sendJson(res, 409, { error: 'You’ve already asked for a refund on this payment.' });
  const id = crypto.randomUUID();
  await store.put('refund', id, {
    id, email: u.email, name: u.name || '', payment_id: paymentId, product: p._product.label,
    amount: p.total_amount, currency: p.currency, paid_at: p.created_at, reason,
    status: 'new', requested_at: new Date().toISOString(),
  });
  return sendJson(res, 200, { ok: true });
}

// ---------------- Admin ----------------
let summaryCache = { at: 0, data: null };
async function adminSummary(req, res) {
  if (!requireAdmin(req, res)) return;
  const users = await store.list('user');
  const base = {
    users: users.length,
    signups_7d: users.filter((r) => Date.now() - new Date(r.data.first_seen).getTime() < 7 * 864e5).length,
    recent: users.slice(0, 50).map((r) => r.data),
    reviews_pending: (await store.list('review')).filter((r) => !r.data.approved).length,
    refunds_new: (await store.list('refund')).filter((r) => r.data.status === 'new').length,
    store: store.kind,
  };
  if (!env.DODO_PAYMENTS_API_KEY) return sendJson(res, 200, { ...base, dodo: null, dodo_error: 'DODO_PAYMENTS_API_KEY is not set.' });
  try {
    if (!summaryCache.data || Date.now() - summaryCache.at > 60e3) {
      const [subs, pays] = await Promise.all([cafeSubscriptions(), cafePayments()]);
      const succeeded = pays.filter((p) => p.status === 'succeeded');
      const revenue = {};
      succeeded.forEach((p) => { revenue[p.currency] = (revenue[p.currency] || 0) + p.total_amount; });
      const byPlan = {};
      cafeProducts().forEach((x) => { byPlan[x.label] = 0; });
      subs.filter((x) => x.status === 'active').forEach((x) => { byPlan[x._product.label]++; });
      byPlan[PRODUCT_LABEL.KADAK] = succeeded.filter((p) => p._product.key === 'KADAK').length;
      const onTrial = (x) => x.status === 'active' && x.trial_period_days
        && Date.now() < new Date(x.created_at).getTime() + x.trial_period_days * 864e5;
      summaryCache = { at: Date.now(), data: {
        active: subs.filter((x) => x.status === 'active' && !onTrial(x)).length,
        trial: subs.filter(onTrial).length,
        cancelled: subs.filter((x) => ['cancelled', 'expired'].includes(x.status)).length,
        revenue, payments: succeeded.length, by_plan: byPlan,
        recent_payments: pays.slice(0, 20).map((p) => ({
          payment_id: p.payment_id, email: p.customer && p.customer.email, product: p._product.label,
          amount: p.total_amount, currency: p.currency, status: p.status, refund_status: p.refund_status || '',
          referrer: (p.metadata && p.metadata.referrer) || '', created_at: p.created_at,
        })),
      } };
    }
    return sendJson(res, 200, { ...base, dodo: summaryCache.data });
  } catch (e) {
    return sendJson(res, 200, { ...base, dodo: null, dodo_error: e.message });
  }
}

async function adminUsersCsv(req, res) {
  if (!requireAdmin(req, res)) return;
  const users = await store.list('user');
  const cell = (v) => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from running formulas
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const cols = ['email', 'name', 'provider', 'refCode', 'first_seen', 'last_seen', 'sign_ins'];
  const csv = [cols.join(','), ...users.map((r) => cols.map((c) => cell(r.data[c])).join(','))].join('\n');
  send(res, 200, csv, {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': 'attachment; filename="dashovia-cafe-users.csv"',
  });
}

async function adminListReviews(req, res) {
  if (!requireAdmin(req, res)) return;
  return sendJson(res, 200, { reviews: (await store.list('review')).map((r) => ({ id: r.id, ...r.data })) });
}
async function adminReviewAction(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const b = await readJson(req);
  const r = await store.get('review', id);
  if (!r) return sendJson(res, 404, { error: 'Review not found.' });
  const act = b && b.action;
  if (act === 'delete') await store.del('review', id);
  else if (act === 'approve' || act === 'hide') await store.put('review', id, { ...r, approved: act === 'approve' });
  else return sendJson(res, 400, { error: 'Unknown action.' });
  return sendJson(res, 200, { ok: true });
}

async function adminListRefunds(req, res) {
  if (!requireAdmin(req, res)) return;
  return sendJson(res, 200, { refunds: (await store.list('refund')).map((r) => r.data) });
}
async function adminRefundAction(req, res, id) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const b = await readJson(req);
  const r = await store.get('refund', id);
  if (!r) return sendJson(res, 404, { error: 'Request not found.' });
  const act = b && b.action;
  if (act === 'decline' || act === 'reopen') {
    await store.put('refund', id, { ...r, status: act === 'decline' ? 'declined' : 'new', handled_by: admin.email, handled_at: new Date().toISOString() });
    return sendJson(res, 200, { ok: true });
  }
  if (act !== 'refund') return sendJson(res, 400, { error: 'Unknown action.' });
  if (r.status === 'refunded' || r.status === 'processing') return sendJson(res, 409, { error: 'This refund was already issued.' });
  try {
    const resp = await dodo('/refunds', { method: 'POST', body: JSON.stringify({ payment_id: r.payment_id, reason: (r.reason || 'Customer request').slice(0, 300) }) });
    const d = await resp.json().catch(() => ({}));
    if (!resp.ok) return sendJson(res, 502, { error: 'Dodo refused the refund' + (d.message ? ': ' + d.message : '.') });
    await store.put('refund', id, { ...r, status: d.status === 'succeeded' ? 'refunded' : 'processing', refund_id: d.refund_id || '',
      handled_by: admin.email, handled_at: new Date().toISOString() });
    summaryCache.at = 0;
    return sendJson(res, 200, { ok: true, status: d.status });
  } catch {
    return sendJson(res, 502, { error: 'Could not reach Dodo.' });
  }
}

async function adminReferrals(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!env.DODO_PAYMENTS_API_KEY) return sendJson(res, 200, { referrals: [] });
  try {
    const owners = {};
    (await store.list('user')).forEach((r) => { owners[r.data.refCode] = r.data.email; });
    const rewards = {};
    (await store.list('reward')).forEach((r) => { rewards[r.id] = r.data; });
    const referred = (await cafePayments()).filter((p) => p.metadata && p.metadata.referrer && p.status === 'succeeded');
    return sendJson(res, 200, { referrals: referred.map((p) => ({
      payment_id: p.payment_id, buyer: p.customer && p.customer.email, product: p._product.label,
      amount: p.total_amount, currency: p.currency, created_at: p.created_at, refunded: !!p.refund_status,
      code: p.metadata.referrer, referrer: owners[p.metadata.referrer] || '', rewarded: !!rewards[p.payment_id],
      reward_ready: !withinRefundWindow(p) && !p.refund_status,
    })) });
  } catch (e) {
    return sendJson(res, 502, { error: e.message });
  }
}
async function adminRewardAction(req, res, paymentId) {
  const admin = requireAdmin(req, res); if (!admin) return;
  const b = await readJson(req);
  if (b && b.rewarded) await store.put('reward', paymentId, { by: admin.email, at: new Date().toISOString() });
  else await store.del('reward', paymentId);
  return sendJson(res, 200, { ok: true });
}

async function dodoWebhook(req, res) {
  const raw = await readBody(req);
  if (!verifyDodoSignature(req.headers, raw)) return sendJson(res, 401, { error: 'Invalid signature.' });
  let event;
  try { event = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'Invalid JSON.' }); }
  const d = event.data || {};
  try {
    if (/^(payment|subscription|refund)\./.test(event.type || '')) summaryCache.at = 0;
    // When Dodo confirms a refund, mark the matching request as refunded.
    if ((event.type === 'refund.succeeded' || event.type === 'refund.failed') && d.payment_id) {
      for (const r of await store.list('refund')) {
        if (r.data.payment_id === d.payment_id && r.data.status !== 'declined') {
          await store.put('refund', r.id, { ...r.data, status: event.type === 'refund.succeeded' ? 'refunded' : 'failed' });
        }
      }
    }
  } catch (err) { console.error('Webhook handling failed', err.message); }
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
      || filePath.startsWith(path.join(ROOT, 'scripts'))
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
const ROUTES = {
  'GET /api/config': (req, res) => sendJson(res, 200, { googleClientId: env.GOOGLE_CLIENT_ID || '', githubClientId: env.GITHUB_CLIENT_ID || '' }),
  'GET /api/me': (req, res) => sendJson(res, 200, { user: publicUser(getSession(req)) }),
  'POST /api/auth/google': googleSignIn,
  'POST /api/auth/github': githubSignIn,
  'POST /api/auth/logout': (req, res) => sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, null) }),
  'POST /api/checkout': createCheckout,
  'POST /api/portal': customerPortal,
  'POST /api/webhooks/dodo': dodoWebhook,
  'GET /api/reviews': listPublicReviews,
  'GET /api/reviews/mine': myReview,
  'POST /api/reviews': submitReview,
  'GET /api/refunds': refundOptions,
  'POST /api/refunds': requestRefund,
  'GET /api/admin/summary': adminSummary,
  'GET /api/admin/users.csv': adminUsersCsv,
  'GET /api/admin/reviews': adminListReviews,
  'GET /api/admin/refunds': adminListRefunds,
  'GET /api/admin/referrals': adminReferrals,
};
const PARAM_ROUTES = [
  [/^POST \/api\/admin\/reviews\/([^/]+)$/, adminReviewAction],
  [/^POST \/api\/admin\/refunds\/([^/]+)$/, adminRefundAction],
  [/^POST \/api\/admin\/referrals\/([^/]+)$/, adminRewardAction],
];

const server = http.createServer(async (req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
  const { pathname } = u;
  const route = req.method + ' ' + pathname;
  try {
    if (ROUTES[route]) return await ROUTES[route](req, res);
    for (const [re, fn] of PARAM_ROUTES) {
      const m = route.match(re);
      if (m) return await fn(req, res, decodeURIComponent(m[1]));
    }
  } catch (err) {
    console.error('Error on', route, err);
    if (!res.headersSent) return sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    return;
  }
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  return serveStatic(req, res, pathname);
});

store.init()
  .then(() => console.log('Store ready (' + store.kind + ')'))
  .catch((e) => console.error('Store failed to start:', e.message))
  .finally(() => server.listen(PORT, () => console.log('dashovia.café listening on :' + PORT)));
