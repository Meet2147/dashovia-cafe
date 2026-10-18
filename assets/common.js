// Shared by every page: nav, footer, theme, toasts, sign-in and referrals.
// Pages include <div id="site-nav"></div> and <div id="site-foot"></div>.
(function () {
  const SUPPORT_EMAIL = 'contact@dashovia.app';
  const APIS_URL = 'https://api.dashovia.app/';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // ---------- nav + footer
  const navEl = $('site-nav');
  if (navEl) {
    navEl.outerHTML = `
<nav class="land-nav" id="nav"><div class="in">
  <a class="brand" href="/" id="home"><span class="logo">🫖</span>dashovia<span class="dot">.café</span></a>
  <span class="grow"></span>
  <a class="lnk hide-md" href="/#menu">Menu</a>
  <a class="lnk hide-md" href="/#pricing">Pricing</a>
  <a class="lnk hide-md" href="/blog">Blog</a>
  <a class="lnk hide-md" href="${APIS_URL}" target="_blank" rel="noopener">APIs ↗</a>
  <button class="btn ghost sm" id="themeBtn" aria-label="Toggle dark mode">🌓</button>
  <div class="user-wrap" id="authSlot"><button class="btn sm" id="signinBtn">Sign in</button></div>
  <a class="btn primary sm hide-sm" href="/#pricing">Start free</a>
</div></nav>`;
  }
  const nav = $('nav');
  if (nav) addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });

  // ---------- theme
  $('themeBtn')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('dashovia_theme', next);
  });

  // ---------- toasts
  let toastBox = $('toasts');
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.id = 'toasts'; toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
  }
  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  // ---------- referrals: remember ?ref=CODE for 30 days
  (function captureRef() {
    const url = new URL(location.href);
    const ref = url.searchParams.get('ref');
    if (ref && /^[a-f0-9]{8}$/.test(ref)) {
      store.set('dashovia_ref', JSON.stringify({ ref, exp: Date.now() + 30 * 864e5 }));
      url.searchParams.delete('ref');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      setTimeout(() => toast('🎁 A friend sent you 20% off. It’s applied at checkout.', 'ok'), 400);
    }
  })();
  function getRef() {
    try {
      const r = JSON.parse(store.get('dashovia_ref') || 'null');
      return r && r.exp > Date.now() ? r.ref : '';
    } catch { return ''; }
  }

  // ---------- sign-in modal
  document.body.insertAdjacentHTML('beforeend', `
<div class="modal-back" id="authModal" role="dialog" aria-modal="true" aria-labelledby="authTitle">
  <div class="modal">
    <div class="modal-head">
      <h3 id="authTitle">Welcome to the café ☕</h3>
      <button class="btn ghost sm" id="authClose" aria-label="Close">✕</button>
    </div>
    <p class="lead">Sign in or create your account in one click. New here? Your account is created automatically.</p>
    <div class="gbtn-slot" id="googleSlot"></div>
    <button class="btn block" id="githubBtn" style="padding:11px 18px">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.4-5.25 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>
      Continue with GitHub
    </button>
    <p class="modal-note" id="authNote"></p>
    <div class="perks">
      <span>✓ Manage your subscription in one place</span>
      <span>✓ Your own Refer &amp; Earn link</span>
      <span>✓ No password to remember</span>
    </div>
    <p class="modal-note">By continuing you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
  </div>
</div>`);

  const modal = $('authModal');
  const authNote = $('authNote');
  const note = (msg, err) => { authNote.textContent = msg || ''; authNote.classList.toggle('err', !!err); };
  function openSignIn(message) {
    modal.classList.add('open');
    const none = !config.googleClientId && !config.githubClientId;
    note(message || (none ? 'Sign-in is being switched on. Please check back in a little while.' : ''), none && !message);
    renderGoogleButton();
  }
  const closeSignIn = () => modal.classList.remove('open');
  $('authClose').addEventListener('click', closeSignIn);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeSignIn(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSignIn(); closeMenu(); } });

  // ---------- auth state
  let config = { googleClientId: '', githubClientId: '' };
  let user = null;
  const listeners = [];
  function setUser(u) {
    user = u;
    renderAuthSlot();
    listeners.forEach((fn) => { try { fn(user); } catch {} });
  }
  function onUser(fn) { listeners.push(fn); if (ready) fn(user); }
  let ready = false;

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function avatar(u) {
    return u.picture
      ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="av">${esc((u.name || u.email || '?')[0].toUpperCase())}</span>`;
  }
  function closeMenu() { $('userMenu')?.classList.remove('open'); }
  function renderAuthSlot() {
    const slot = $('authSlot'); if (!slot) return;
    if (!user) {
      slot.innerHTML = '<button class="btn sm" id="signinBtn">Sign in</button>';
      $('signinBtn').addEventListener('click', () => openSignIn());
      return;
    }
    const first = esc((user.name || user.email).split(' ')[0]);
    slot.innerHTML = `
      <button class="btn sm user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false">${avatar(user)}<span class="hide-sm">${first}</span></button>
      <div class="user-menu" id="userMenu" role="menu">
        <div class="who"><b>${esc(user.name || 'Signed in')}</b><span>${esc(user.email)}</span></div>
        <button id="portalBtn" role="menuitem">🧾 Manage subscription</button>
        <a href="/refer" role="menuitem">🎁 Refer &amp; earn</a>
        <a href="/support" role="menuitem">💬 Support</a>
        <button id="logoutBtn" role="menuitem">👋 Sign out</button>
      </div>`;
    $('userBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const open = $('userMenu').classList.toggle('open');
      $('userBtn').setAttribute('aria-expanded', open);
    });
    $('portalBtn').addEventListener('click', openPortal);
    $('logoutBtn').addEventListener('click', logout);
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#authSlot')) closeMenu(); });

  async function openPortal() {
    closeMenu();
    try { const d = await api('/api/portal', {}); location.href = d.link; }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function logout() {
    closeMenu();
    try { await api('/api/auth/logout', {}); } catch {}
    window.google?.accounts?.id?.disableAutoSelect?.();
    setUser(null);
    toast('Signed out. See you soon ☕');
  }
  function signedIn(u, via) {
    setUser(u);
    closeSignIn();
    toast('Signed in' + (via ? ' with ' + via : '') + '. Welcome, ' + (u.name || u.email).split(' ')[0] + '!', 'ok');
  }

  // Google: the official button, rendered by Google's script.
  let gsiLoading = null;
  function loadGsi() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!gsiLoading) {
      gsiLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = resolve; s.onerror = () => { gsiLoading = null; reject(new Error('Google could not load.')); };
        document.head.appendChild(s);
      });
    }
    return gsiLoading;
  }
  let gsiReady = false;
  async function renderGoogleButton() {
    const slot = $('googleSlot');
    if (!config.googleClientId) { slot.hidden = true; return; }
    slot.hidden = false;
    try {
      await loadGsi();
      if (!gsiReady) {
        google.accounts.id.initialize({ client_id: config.googleClientId, callback: onGoogleCredential, ux_mode: 'popup' });
        gsiReady = true;
      }
      slot.innerHTML = '';
      google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
    } catch (e) {
      slot.innerHTML = '';
      note('Google sign-in couldn’t load. Check your connection or ad-blocker.', true);
    }
  }
  async function onGoogleCredential(resp) {
    note('Signing you in…');
    try { const d = await api('/api/auth/google', { credential: resp.credential }); signedIn(d.user, 'Google'); }
    catch (e) { note(e.message, true); }
  }

  // GitHub: redirect flow; the server swaps the code for the profile.
  $('githubBtn').addEventListener('click', () => {
    if (!config.githubClientId) { note('GitHub sign-in isn’t switched on yet. Please use Google.', true); return; }
    const state = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    try { sessionStorage.setItem('dashovia_gh_state', state); } catch {}
    const p = new URLSearchParams({
      client_id: config.githubClientId, redirect_uri: location.origin + location.pathname,
      scope: 'read:user user:email', state, allow_signup: 'true',
    });
    location.href = 'https://github.com/login/oauth/authorize?' + p;
  });
  async function handleGithubReturn() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code'), state = url.searchParams.get('state');
    if (!code || !state) return false;
    let saved = null;
    try { saved = sessionStorage.getItem('dashovia_gh_state'); sessionStorage.removeItem('dashovia_gh_state'); } catch {}
    url.searchParams.delete('code'); url.searchParams.delete('state');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (!saved || saved !== state) { openSignIn(); note('That sign-in link expired. Please try again.', true); return true; }
    try {
      const d = await api('/api/auth/github', { code, redirect_uri: location.origin + location.pathname });
      signedIn(d.user, 'GitHub');
    } catch (e) { openSignIn(); note(e.message, true); }
    return true;
  }

  (async function boot() {
    renderAuthSlot();
    try { config = await api('/api/config'); } catch {}
    if (!config.githubClientId) $('githubBtn').hidden = true;
    try { const d = await api('/api/me'); user = d.user; } catch { user = null; }
    ready = true;
    setUser(user);
    await handleGithubReturn();
  })();

  window.Cafe = { toast, esc, openSignIn, onUser, getUser: () => user, getRef, SUPPORT_EMAIL };
})();
