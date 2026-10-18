// Home shelves, the menu sidebar, and the /menu, /menu/<category>,
// /picks/<collection> and /app/<key> pages. Data comes from assets/apps.js.
(function () {
  const { CATS, PICKS, APPS, byKey, catById, pickById, inCat } = window.MENU;
  const { esc, toast } = window.Cafe;
  const $ = (id) => document.getElementById(id);
  const SUPPORT = window.Cafe.SUPPORT_EMAIL;

  const KIND = { macos: 'macOS app', python: 'Python library', cli: 'Command-line tool' };
  const BADGE = { included: ['Included', 'violet'], free: ['Free', 'ok'], soon: ['Coming soon', 'flame'] };
  const badge = (a) => `<span class="chip ${BADGE[a.status][1]}">${BADGE[a.status][0]}</span>`;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  // ---------- building blocks
  function appCard(a) {
    return `<a class="card feature app" href="/app/${a.key}" data-search="${esc([a.name, a.tagline, KIND[a.kind], catById[a.cat].name, catById[a.cat].sub].join(' ').toLowerCase())}">
      <div class="top"><div class="ic">${esc(a.icon)}</div>${badge(a)}</div>
      <h4>${esc(a.name)}</h4><p>${esc(a.tagline)}</p>
      <div class="meta">${esc(KIND[a.kind])} · ${esc(catById[a.cat].sub)}</div></a>`;
  }
  function catCard(c) {
    const apps = inCat(c.id);
    return `<a class="card cat-card" href="/menu/${c.id}">
      <div class="row"><div class="cat-ico">${esc(c.icon)}</div><span class="grow"></span>
        <span class="chip ${c.free ? 'ok' : ''}">${c.free ? 'Free · ' : ''}${plural(apps.length, 'app')}</span></div>
      <h3>${esc(c.name)}</h3><div class="sub">${esc(c.sub)}</div>
      <p>${esc(c.blurb)}</p>
      <div class="mini" aria-hidden="true">${apps.map((a) => `<span title="${esc(a.name)}">${esc(a.icon)}</span>`).join('')}</div></a>`;
  }
  function pickCard(p) {
    return `<a class="card cat-card pick" href="/picks/${p.id}">
      <div class="row"><div class="cat-ico">${esc(p.icon)}</div><span class="grow"></span><span class="chip">${plural(p.apps.length, 'app')}</span></div>
      <h3>${esc(p.name)}</h3><div class="sub">${esc(p.sub)}</div>
      <div class="mini" aria-hidden="true">${p.apps.map((k) => `<span title="${esc(byKey[k].name)}">${esc(byKey[k].icon)}</span>`).join('')}</div></a>`;
  }
  function shelf(id, apps) {
    const el = $(id); if (!el) return;
    el.innerHTML = apps.map(appCard).join('');
  }
  // ‹ › buttons scroll their shelf
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scroll]'); if (!b) return;
    const s = $(b.dataset.scroll); if (s) s.scrollBy({ left: (b.dataset.dir === 'prev' ? -1 : 1) * s.clientWidth * 0.8, behavior: 'smooth' });
  });

  function sidebar(active) {
    const item = (href, icon, name, sub, count, on) =>
      `<a class="side-item ${on ? 'on' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}><span class="ico">${esc(icon)}</span>
        <span class="txt">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${count != null ? `<span class="count">${count}</span>` : ''}</a>`;
    return `
      <div class="side-group"><div class="side-label">Today's menu</div>
        ${item('/menu', '☕', 'Full menu', '', APPS.length, active === 'menu')}
        ${CATS.map((c) => item('/menu/' + c.id, c.icon, c.name, c.sub + (c.free ? ' · free' : ''), inCat(c.id).length, active === c.id)).join('')}
      </div>
      <div class="side-group"><div class="side-label">Barista's picks</div>
        ${PICKS.map((p) => item('/picks/' + p.id, p.icon, p.name, '', p.apps.length, active === p.id)).join('')}
      </div>
      <div class="side-group side-counter"><div class="side-label">Counter</div>
        ${item('/#pricing', '🏷️', 'Membership', '7-day free trial')}
        ${item('/refer', '🎁', 'Refer & earn')}
        ${item('/blog', '📓', 'Blog')}
        ${item('/support', '💬', 'Support')}
      </div>`;
  }

  // ---------- home
  function renderHome() {
    shelf('shelfFree', APPS.filter((a) => a.status === 'free'));
    shelf('shelfMac', APPS.filter((a) => a.kind === 'macos'));
    $('catGrid').innerHTML = CATS.map(catCard).join('');
    $('picksGrid').innerHTML = PICKS.map(pickCard).join('');
    $('menuCount').textContent = APPS.length;
    loadReviews();
    const words = ['☕ apps, served fresh', ...APPS.map((a) => a.name), '🔒 on-device', '🫖 one subscription'];
    const run = words.map((w, i) => `<span class="${i % 2 ? 'alt' : ''}">${esc(w)}</span>`).join('');
    $('marq').innerHTML = run + run;
  }

  async function loadReviews() {
    const box = $('reviewList'); if (!box) return;
    let reviews = [];
    try { ({ reviews } = await window.Cafe.api('/api/reviews')); } catch {}
    box.innerHTML = reviews.length ? reviews.slice(0, 9).map((t) => `<figure class="card testimonial">
        <div class="stars" aria-label="${t.rating} out of 5">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
        <blockquote>“${esc(t.quote)}”</blockquote>
        <figcaption><b>${esc(t.name)}</b>${t.org ? `<span>${esc(t.org)}</span>` : ''}</figcaption></figure>`).join('')
      : `<div class="card testimonial empty"><div style="font-size:30px">🌱</div>
        <h3>We’re brand new, and that’s your edge.</h3>
        <p class="muted">The café just opened. Try an app, and your review could be the first one here.</p>
        <a class="btn primary" href="/review">Write the first review</a></div>`;
  }

  // ---------- shell pages
  function shell(active, html, title) {
    $('homeView').hidden = true;
    $('menuShell').hidden = false;
    $('side').innerHTML = sidebar(active);
    $('shellMain').innerHTML = html;
    document.title = title + ' · Dashovia Café';
    scrollTo(0, 0);
  }

  function renderMenu() {
    shell('menu', `
      <div class="aisle-head"><div class="cat-ico">☕</div><div>
        <h1>The full menu</h1>
        <p class="muted">${plural(APPS.length, 'app')} in ${CATS.length} aisles. Every Mac app is included in one subscription; the developer tools are free.</p>
      </div></div>
      <input id="menuSearch" class="search" type="search" placeholder="🔍  Search the menu…" aria-label="Search apps" style="max-width:420px;margin:6px 0 4px" />
      ${CATS.map((c) => `<section class="cat" data-cat="${c.id}">
        <div class="cat-head"><div class="cat-ico">${esc(c.icon)}</div><h3><a href="/menu/${c.id}" style="color:inherit">${esc(c.name)}</a></h3>
          <span class="muted">· ${esc(c.sub)}${c.free ? ' · free' : ''}</span></div>
        <div class="feature-grid">${inCat(c.id).map(appCard).join('')}</div></section>`).join('')}
      <div class="empty-state" id="noResults" hidden><div style="font-size:34px">🫗</div>
        <h3 style="margin:6px 0">Nothing on the menu by that name.</h3><p class="muted" style="margin:0">Try another word.</p></div>`,
    'Full menu');
    $('menuSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      let shown = 0;
      document.querySelectorAll('#shellMain section.cat').forEach((sec) => {
        let any = 0;
        sec.querySelectorAll('.app').forEach((card) => {
          const ok = !q || card.dataset.search.includes(q);
          card.hidden = !ok; if (ok) any++;
        });
        sec.hidden = !any; shown += any;
      });
      $('noResults').hidden = shown > 0;
    });
  }

  function aisle(active, icon, name, sub, blurb, apps, extra) {
    shell(active, `
      <a class="crumb" href="/menu">← Back to the full menu</a>
      <div class="aisle-head"><div class="cat-ico">${esc(icon)}</div><div>
        <h1>${esc(name)} <span class="muted">· ${esc(sub)}</span></h1>
        <p class="muted">${esc(blurb)}</p>
      </div></div>
      ${extra || ''}
      <div class="feature-grid">${apps.map(appCard).join('')}</div>
      <section class="app-section"><h2>More aisles</h2>
        <div class="cat-grid">${CATS.filter((c) => c.id !== active).map(catCard).join('')}</div></section>`,
    name + ' · ' + sub);
  }
  function renderCat(id) {
    const c = catById[id]; if (!c) return renderNotFound();
    const note = c.free
      ? '<p class="chip ok" style="margin:0 0 6px">🎁 Free to use, no account or subscription needed</p>'
      : '<p style="margin:0 0 6px"><span class="chip violet">☕ One membership unlocks every app in this aisle</span> <a href="/#pricing">See the plans →</a></p>';
    aisle(id, c.icon, c.name, c.sub, c.blurb, inCat(id), note);
  }
  function renderPick(id) {
    const p = pickById[id]; if (!p) return renderNotFound();
    aisle(id, p.icon, p.name, p.sub, 'A hand-picked collection from across the menu.', p.apps.map((k) => byKey[k]));
  }

  function renderApp(key) {
    const a = byKey[key]; if (!a) return renderNotFound();
    const c = catById[a.cat];
    const meta = [KIND[a.kind], a.requires, a.version && 'v' + a.version].filter(Boolean).join(' · ');

    const faq = [[`What is ${a.name}?`, `${a.tagline} It’s ${a.kind === 'macos' ? 'a native Mac app' : a.kind === 'cli' ? 'a command-line tool written in Python' : 'a Python library'} on the Dashovia Café menu.`]];
    if (a.kind === 'macos') faq.push([`Which Macs does ${a.name} run on?`, a.requires ? `${a.name} needs ${a.requires}.` : `${a.name} is a native app for macOS.`]);
    if (a.status === 'included') faq.push([`Is ${a.name} included in my subscription?`, `Yes. ${a.name} is included with every café plan, along with every other premium app and all future updates. Plans start with a 7-day free trial.` + (a.buy ? ` You can also buy ${a.name} on its own for a one-time $${a.price}.` : '')]);
    if (a.status === 'free') faq.push([`Is ${a.name} really free?`, `Yes. ${a.name} is on the house: free to use, with no subscription or account needed.`]);
    if (a.status === 'soon') faq.push([`When is ${a.name} available?`, `${a.name} is coming soon. Visit its website to join the early-bird list, and it will be part of the café menu when it launches.`]);
    if (a.onDevice) faq.push([`Does ${a.name} upload my data?`, `No. ${a.name} does its work on your Mac. There’s no account and nothing is sent to a server.`]);

    shell(a.cat, `
      <a class="crumb" href="/menu/${c.id}">← Back to ${esc(c.name)}</a>
      <div class="detail-head">
        <div class="detail-ico">${esc(a.icon)}</div>
        <div>
          <span class="chip violet">${esc(c.icon)} ${esc(c.name)} · ${esc(c.sub)}</span> ${badge(a)}
          <h1>${esc(a.name)}</h1>
          <p class="detail-desc">${esc(a.tagline)}</p>
          <div class="detail-meta">${esc(meta)}</div>
        </div>
      </div>
      <div class="detail-actions" id="dActions"></div>
      <p class="detail-note" id="dNote"></p>

      <section class="app-section prose" style="max-width:760px">${a.about.map((p) => `<p>${esc(p)}</p>`).join('')}</section>

      ${a.highlights ? `<section class="app-section"><h2>Highlights</h2><div class="hl-grid">
        ${a.highlights.map(([i, t, d]) => `<div class="card hl"><div class="feature"><div class="ic">${esc(i)}</div></div><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></div>`).join('')}
      </div></section>` : ''}

      ${a.steps ? `<section class="app-section"><h2>How it works</h2><ol class="steps">
        ${a.steps.map(([t, d]) => `<li><div><b>${esc(t)}</b><br><span class="muted">${esc(d)}</span></div></li>`).join('')}
      </ol></section>` : ''}

      ${a.shots ? `<section class="app-section"><h2>Screenshots</h2><div class="shots-row">${shots()}</div></section>` : ''}

      ${a.perfectFor ? `<section class="app-section"><h2>Perfect for</h2><div class="feature-grid">
        ${a.perfectFor.map(([t, d]) => `<div class="card feature"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}
      </div></section>` : ''}

      <section class="app-section faq" style="max-width:760px"><h2>Questions</h2>
        ${faq.map(([q, ans]) => `<details><summary>${esc(q)}</summary><p>${esc(ans)}</p></details>`).join('')}
      </section>

      ${inCat(a.cat).length > 1 ? `<section class="app-section"><h2>More from ${esc(c.name)}</h2>
        <div class="feature-grid">${inCat(a.cat).filter((x) => x.key !== a.key).map(appCard).join('')}</div></section>` : ''}`,
    a.name);

    // Action buttons
    const acts = $('dActions');
    const btn = (cls, label, href, onClick) => {
      const n = document.createElement(href ? 'a' : 'button');
      n.className = 'btn ' + cls; n.textContent = label;
      if (href) { n.href = href; if (/^https?:/.test(href)) { n.target = '_blank'; n.rel = 'noopener'; } if (/\.dmg$/.test(href)) n.setAttribute('download', ''); }
      else n.type = 'button';
      if (onClick) n.addEventListener('click', onClick);
      acts.appendChild(n);
    };
    const note = $('dNote');
    if (a.kind === 'macos') {
      if (a.dmg) btn('primary lg', '⬇ Download for macOS', a.dmg);
      if (a.url) btn(a.dmg ? 'lg' : 'primary lg', a.status === 'soon' ? 'Join the early-bird list ↗' : 'Visit website ↗', a.url);
      if (a.buy) btn('lime lg', `Buy ${a.name} · $${a.price}`, null, (e) => window.CafeCheckout(a.buy, e.currentTarget));
      if (a.status === 'included') btn('lg', 'Included in every plan →', '/#pricing');
      note.textContent = a.status === 'soon' ? 'Coming soon to the café menu.'
        : a.buy ? `Buy it once for $${a.price}, or get it with every other app in any café plan.`
        : 'Included with every café subscription. Plans start with a 7-day free trial.';
    } else {
      btn('primary lg', 'Request access ✉️', `mailto:${SUPPORT}?subject=${encodeURIComponent('Access to ' + a.name)}`);
      note.textContent = 'On the house: free to use, no account needed.';
    }
  }

  function shots() {
    const samples = [
      '<span class="c"># Welcome to Kadak</span>\n\n<span class="s">1.</span> Paste a URL\n<span class="s">2.</span> Pick screenshots (0–10)\n<span class="s">3.</span> Brew → PDF + PNGs\n\n<span class="c">Saved to ~/Downloads/Kadak/</span>',
      'Screenshots  <span class="f">▓▓▓▓▓▓▓▓</span>░░  8/10\n\nexample.com … <span class="s">loaded</span>\nExporting PDF … <span class="s">done</span>\n<span class="s">✓</span> example.com.pdf\n<span class="s">✓</span> example.com-01.png … -08.png',
    ];
    return samples.map((s) => `<div class="shot"><div class="mock"><div class="dots"><i></i><i></i><i></i></div><div class="code">${s}</div></div></div>`).join('');
  }

  function renderNotFound() {
    shell('', `<div class="empty-state"><div style="font-size:40px">🫗</div>
      <h2 style="margin:6px 0">That’s not on the menu.</h2>
      <p class="muted">The page you’re looking for doesn’t exist.</p>
      <a class="btn primary" href="/menu">Browse the full menu</a></div>`, 'Not found');
  }

  // ---------- routing (real URLs; the server sends unknown paths to this page)
  if (location.hash.startsWith('#app/')) {
    location.replace('/app/' + encodeURIComponent(decodeURIComponent(location.hash.slice(5))));
    return;
  }
  const path = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
  let m;
  if (path === '/') renderHome();
  else if ((m = path.match(/^\/menu(?:\/([\w-]+))?$/))) m[1] ? renderCat(m[1]) : renderMenu();
  else if ((m = path.match(/^\/picks\/([\w-]+)$/))) renderPick(m[1]);
  else if ((m = path.match(/^\/app\/([\w-]+)$/))) renderApp(m[1]);
  else renderNotFound();
})();
