# Dashovia Café ☕

**apps, served fresh** — the storefront for the Dashovia family of apps & APIs.

One subscription, every app on the menu. A warm, café-menu storefront: chai
categories in the sidebar, "Two cups. No surprises." pricing (Cutting Chai
**$3.99/mo**, Full Kettle **$7.99/mo**, annual −50%), and every Dashovia app on
the menu.

It's a single static `index.html` — no build step, no dependencies — so it
deploys anywhere in seconds.

## Preview locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
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

## Sign in (Google + email)

The sidebar **Sign in** opens a modal with **Continue with Google** and an email
option.

**Enable Google on your live site (2 min):**
1. Google Cloud Console → *APIs & Services → Credentials → Create OAuth client ID*
   → **Web application**.
2. Under *Authorized JavaScript origins* add your domain (e.g.
   `https://dashovia.app`) and `http://localhost:8000` for local testing.
3. Copy the client ID and paste it into `index.html` at:
   ```js
   const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
   ```
   Google sign-in now works on your deployed site. (It's inert in the sandbox
   preview because Google's script is blocked there — the UI still renders.)

**What works now vs. what needs a backend:**
- ✅ Real Google account chooser + verified ID token (client-side).
- ✅ Signed-in state persists in the browser (`localStorage`).
- ⏳ **Secure sessions and gating who paid** need a backend. Both
  `handleCredential()` (Google) and the email form have a `TODO(backend)` marker
  — POST the token/email to your server (or Supabase/Firebase/Clerk) to verify,
  create a session, and check the Polar subscription before unlocking premium.

## Notes

- **Demo data:** the "Top pourers" leaderboard and prices are placeholders. Wire
  real checkout when payments land (Polar).
- **Theme:** follows the visitor's OS light/dark; the ☀︎/☾ button overrides it.
- **Editing the menu:** each app is one `.item` block in `index.html`. Add a card,
  bump the sidebar count, done.
