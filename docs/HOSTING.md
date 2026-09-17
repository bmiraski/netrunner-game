# Hosting & Accounts (Phase 8 pivot)

How the game moved from "single offline file" to "hosted, invite-only, with
cloud stats" — and the steps only a human with dashboard access can do
(this sandbox has no network route to Supabase or to a hosting provider, so
none of this could be verified end-to-end from inside a session; the first
real test of the full flow has to happen in a real browser).

## What changed, what didn't

The rules engine, AI, card scripts, tutorial, and Phase 7's post-game
analysis are unchanged — all still plain client-side JS with no server
dependency. What's new sits in two folders:

```
cloud/
  supabase.js   createClient(URL, anon key) — the key is meant to be public
  auth.js       passwordless magic-link sign-in/out, session listener
  stats.js      shapeGameRow() (pure) + saveGame()/fetchMyGames() (Supabase)
db/
  schema.sql    the `games` table + Row Level Security policies
ui/
  statspanel.js "My stats" overlay (mirrors reviewpanel.js)
```

`ui/main.js` gates `#setup`/`#table` behind `#auth` until a session exists,
and every `render()` call now routes through `app.repaint()`, which also
calls `app.maybeSaveGame()` — the first repaint after `game.state.winner` is
set inserts one row into `games` via `cloud/stats.js`, built from Phase 7's
`analyzeGame()` report.

**Trade-off to know about:** magic-link sign-in redirects the browser back
to a URL, and Supabase won't redirect to a `file://` URL. That means the
double-click-a-local-file workflow no longer works for sign-in — the built
`netrunner.html` (or the dev source) now needs to be served over http(s),
either a local dev server for testing or the real hosted URL day to day.

## One-time Supabase setup (do this first)

1. **Run the schema.** Dashboard → SQL Editor → New query → paste all of
   `db/schema.sql` → Run. This creates the `games` table and locks it down
   with RLS so each account can only ever see its own rows (the anon key
   shipped in `cloud/supabase.js` is public by design — RLS is the actual
   gate, not the key).
2. **Turn off public signup.** Authentication → Settings (or Providers, UI
   varies by dashboard version) → find "Allow new users to sign up" (or
   similarly named) → turn it OFF. This makes the app genuinely invite-only:
   nobody can create an account just by knowing the URL.
3. **Set the Site URL / redirect allow-list.** Authentication → URL
   Configuration → set **Site URL** to wherever this ends up hosted (see
   below), and add it to the redirect allow-list too. Update this again once
   you know the real hosting URL — magic links silently fail to redirect
   correctly if this doesn't match.
4. **Invite your friends.** Authentication → Users → Invite user → their
   email. Supabase emails them a link; clicking it signs them in and creates
   their account in one step — no separate password to set. Repeat per
   person. (Supabase's default email sending has a low rate limit meant for
   testing; fine for a handful of friends, but if invites/logins start
   silently not arriving, that's the first thing to check — Authentication →
   Logs will show send attempts.)

## Known issue (found + fixed 2026-09-16): root URL 404s on static hosts

The first real invite-link test hit two stacked problems, both worth knowing
about since either can recur:

1. **`tools/bundle.js` only wrote `netrunner.html`, not `index.html`.**
   Static hosts (Netlify, Vercel, GitHub Pages, ...) serve `index.html` for
   the bare root URL (`https://your-site.netlify.app/`) with zero config —
   but with no `index.html` in the published output, that path 404s even
   though `/netrunner.html` works fine. Supabase's Site URL is normally just
   the bare origin, so the invite/magic-link redirect lands on `/` and hits
   that 404 — this is exactly the "Page not found" Netlify shows if you
   click through past the auth redirect. **Fixed:** `npm run build` now
   writes both `netrunner.html` and `index.html` (identical content) to the
   repo root, so the bare root URL works out of the box on any static host.
   Redeploy after pulling this fix so the live site picks up `index.html`.
2. **Invite links are single-use and short-lived.** If an invite email sits
   around, gets opened more than once, or passes through a link-scanning
   proxy (some corporate mail security, and a few consumer webmail
   "safe links" features, silently pre-visit links in incoming email to scan
   them — which consumes a one-time auth token before the real click ever
   happens), the link comes back with
   `#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
   in the URL fragment. This looks like a bug but usually just means the
   token is spent — **the fix is to send a fresh invite**, not to debug the
   old link. Practical tips: invite (or resend/re-invite) *after* the Site
   URL is already pointed at the real hosting URL and the `index.html` fix
   above is deployed, click it promptly, and if it keeps happening for the
   same person, check Authentication → Logs in the Supabase dashboard for
   repeated `verify` hits on the same token (a sign something is
   pre-fetching the link) — try a different mail client/webmail for that
   invite if so.

## Deploying

Any static host works since this is still a static bundle — Vercel, Netlify,
and Cloudflare Pages all offer a free tier and will auto-deploy on every push
to `main` once connected:

1. Push this repo to GitHub (already the case — `bmiraski/netrunner-game`).
2. On Vercel or Netlify: "New Project" / "Add new site" → import from GitHub
   → pick this repo.
3. Build command: `npm run build`. Publish directory: the repo root. The
   build now writes both `netrunner.html` and `index.html` (see "Known
   issue" above), so the host's default root-serving behavior just works —
   no manual rename/copy step needed.
4. Once it's live, go back to Supabase (step 3 above) and set the Site
   URL/redirect allow-list to the real deployed URL.

## Testing locally before/instead of deploying

`file://` won't work (see the trade-off above), but a local dev server will,
and Supabase auth works fine against `http://localhost`:

```
npm run build && python3 -m http.server 8080
# open http://localhost:8080/netrunner.html
```

Set `http://localhost:8080` as an additional allowed redirect URL in
Supabase (Authentication → URL Configuration) if you want to test sign-in
locally — you can list more than one allowed redirect URL at once, so local
and production can coexist.

## Verification

- `tests/cloud.test.js` — unit tests `shapeGameRow()` (the pure logic) since
  the actual network calls (`saveGame`/`fetchMyGames`) need a live Supabase
  project this sandbox can't reach.
- `tests/ui.test.js` — `statsHtml()` renders empty/populated/error states
  without throwing or leaking `undefined`.
- `tools/ui-smoke.js` — unaffected functionally (auth is a soft UI gate;
  gameplay itself doesn't require a session, only stats-saving does, and
  that's skipped when `app.user` is null) but now polyfills `window.fetch`
  since jsdom doesn't provide one, so a future smoke test could exercise the
  auth form without a confusing "fetch is not defined" masking real bugs.
- **What's NOT verified by any automated test here:** the actual magic-link
  round trip and a real `games` insert/select against your live project.
  That first real test has to happen in an actual browser, after the
  Supabase setup steps above.
