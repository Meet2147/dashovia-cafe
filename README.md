# Dashovia Café ☕

**apps, served fresh** — the storefront for the Dashovia family of apps & APIs.

One subscription, every app on the menu. A warm, café-menu storefront: chai
categories in the sidebar, "Two cups. No surprises." pricing (Cutting Chai
**$3.99/mo**, Full Kettle **$7.99/mo**, annual −50%), and every Dashovia app on
the menu.

The look follows a bold, playful style: cream/ink surfaces, violet + lime
accents, chunky outlined buttons with hard shadows, and a scrolling marquee.

It's one `index.html` plus a tiny dependency-free `server.js` (Node 18+) that
handles sign-in and Dodo Payments checkout.

## Editing links and apps

Every link on the site lives in the `LINKS` and `APPS` blocks at the top of the
`<script>` in `index.html`. Leave a value as `''` and the button hides or shows
"coming soon".

## Payments (Dodo Payments)

1. In the Dodo dashboard, create 5 products: Cutting Chai monthly ($3.99) and
   annual ($23.88), Full Kettle monthly ($7.99) and annual ($47.88), and Kadak
   as a one-time product ($4.99).
2. Set the env vars listed in `.env.example` (API key, product IDs, webhook
   secret). Start with `DODO_PAYMENTS_ENV=test`, switch to `live` when ready.
3. Add a webhook in Dodo pointing to `https://YOUR-DOMAIN/api/webhooks/dodo`.

Flow: a pricing button calls `POST /api/checkout`, which creates a Dodo
checkout session and redirects the buyer to Dodo's hosted page. Dodo sends them
back to `/?checkout=done`. Signed webhook events are verified and saved to
`data/customers.json` (not served publicly, gitignored). On Render's free plan
that file resets on every deploy, so move it to a database before relying on it.

## Preview locally

```bash
cp .env.example .env   # fill in what you have
set -a; source .env; set +a; npm start
# open http://localhost:3000
```

## Deploy

### Render (chosen host)

Two ways — both need **no build step**:

- **Blueprint (easiest):** Render dashboard → **New ▸ Blueprint** → connect this
  repo. It reads `render.yaml` and creates the static site automatically.
- **Manual:** **New ▸ Static Site** → connect the repo →
  - **Build Command:** *(leave empty)*
  - **Publish Directory:** `.`
  - Create. You get `https://dashovia-cafe.onrender.com`.

Then add a custom domain (`dashovia.app` / `cafe.dashovia.app`) under the
service's **Settings ▸ Custom Domains**, and point your DNS at Render.

> ⚠️ **After deploy, for Google sign-in:** add your Render URL (and any custom
> domain) to the Google OAuth client's **Authorized JavaScript origins** — e.g.
> `https://dashovia-cafe.onrender.com` and `https://dashovia.app`.

### Other hosts

- **GitHub Pages:** Settings → Pages → Source `main` / root.
- **Netlify:** import repo (`netlify.toml` included).
- **Vercel:** import repo (`vercel.json` included).

## Chai menu

App categories are chai types; pricing tiers are chai sizes.

| Category | Idea | Apps |
|----------|------|------|
| 🫖 Full Chai | the whole pot | sitepdf |
| 💪 Kadak Chai | strong capture | Kadak |
| 🖤 Sulaimani | black, no milk = no deps | htmlpdf |
| 🔥 Adrak Chai | a protective kick | redactor, publishkey |
| 🧡 Masala Chai | the blend / APIs | promptkit, vectorlite |
| 🌿 Elaichi Chai | aromatic utilities | chunkwise |
| ✨ Kesar Chai | premium / saffron | Kesar API (soon) |

## Pages

| URL | File |
|-----|------|
| `/` | `index.html` (menu, pricing, app pages) |
| `/blog` | `blog.html` |
| `/support` | `support.html` |
| `/refer` | `refer.html` |
| `/terms`, `/privacy`, `/refunds` | `terms.html`, `privacy.html`, `refunds.html` |

All pages share `assets/site.css` and `assets/common.js` (nav, footer, theme,
sign-in, toasts). The support email lives at the top of `assets/common.js`.

## Sign in (Google + GitHub)

One-click sign-in; the first sign-in creates the account. The server verifies
the Google token / GitHub code and stores the user in a signed, HttpOnly cookie
(`dc_session`), so there is no user database. Signed-in users get "Manage
subscription" (Dodo customer portal) and their own referral link.

- **Google:** Google Cloud Console → Credentials → OAuth client ID (Web
  application). Add `https://getapps.dashovia.cafe` to *Authorized JavaScript
  origins*. Set `GOOGLE_CLIENT_ID`.
- **GitHub:** GitHub → Settings → Developer settings → OAuth Apps → New. Homepage
  and callback URL: `https://getapps.dashovia.cafe/`. Set `GITHUB_CLIENT_ID` and
  `GITHUB_CLIENT_SECRET`.
- Set `SESSION_SECRET` (the Render blueprint generates one).

## Refer & Earn

Each user's code is derived from their email. A friend opening `/?ref=CODE`
gets `REFERRAL_DISCOUNT_CODE` (20% off the first payment) at checkout, and the
code is saved on the order as `metadata.referrer` (visible in the Dodo
dashboard). To check a claim, compute the claimant's code:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('dashovia-ref:'+process.argv[1].toLowerCase()).digest('hex').slice(0,8))" friend@example.com
```

## Notes

- **Payments:** Dodo Payments (see above).
- **Theme:** follows the visitor's OS light/dark; the ☀︎/☾ button overrides it.
- **Editing the menu:** add an entry to `APPS` in `index.html`. Cards, filters,
  search and the detail page are generated from it.
