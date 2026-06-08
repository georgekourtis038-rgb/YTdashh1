# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open any `.html` file directly in a browser, or use VS Code Live Server. There is no `package.json`, npm, or bundler.

For local development:
- Double-click any `.html` file, or
- Use VS Code Live Server (right-click → Open with Live Server)

Deploy to production: push to `main` — the repo is wired to Vercel one-click deploy.

## Architecture

This is a zero-dependency personal dashboard PWA called **Axis**. All pages are self-contained HTML files with inline `<style>` and `<script>`. No framework, no build tool.

### Pages

| File | Purpose |
|---|---|
| `landing.html` | Animated entry screen (star field, ambient glow). PWA `start_url`. Swipe-down from any page navigates here. |
| `index.html` | Home — Day Ring, Goal Ticker, Today/Tomorrow To Do cards |
| `health.html` | Supplement / daily stack tracker + water section |
| `gym.html` | Progressive overload gym tracker + body weight chart |
| `po-water.html` | Detailed water intake tracker (embeddable in health.html via iframe) |
| `finance.html` | Finances — topbar chrome is suppressed on this page |
| `settings.html` | User profile (weight, sex, wake time), notification prefs, Supabase sync |
| `ai.html` | AI chat — bottom tab bar suppressed; topbar logo is the only nav |

### Shared scripts (drop on every page)

- **`topbar.js`** — Self-injects the fixed top bar (logo → landing, water pill, settings button) and the bottom tab bar (Main / Health / Fitness). Skips chrome on `finance.html` and inside iframes. Suppresses bottom tabs on `ai.html`. Also patches `localStorage.setItem` to call `window._pcTriggerSync` when keys change (used by pages that need cross-page reactivity).
- **`push-init.js`** — Registers the service worker, shows the in-app permission card, runs smart notification checks (water pace, morning weigh-in) on load and every 5 min.
- **`animations.css`** — All keyframe definitions + declarative animation classes (page entry stagger, progress bars, ring draw, etc.). Link on every page; covers all pages.
- **`anim-hooks.js`** — JS layer that wires dynamic animation classes (checkbox pop, supplement flash, streak roll, ripple, workout overlay, scroll reveal). Must be loaded **after** the page's main `<script>`.
- **`swipe-nav.js`** — Detects a fast downward swipe from the top 20% of the viewport and navigates to `landing.html` with a slide-out animation.
- **`service-worker.js`** — Handles push delivery, notification click routing, and a SW-side setInterval that fires checks using state posted from `push-init.js` (the SW cannot read `localStorage`).

### State / Storage

All persistence is `localStorage` only — no accounts, no server reads at runtime.

Key patterns:
- `goals:YYYY-MM-DD` → `[{ text, done, doneAt?, queued? }]` — daily goal lists
- `goal_streak_v1` → `{ count, lastProcessedDate }`
- `po_water_v1` → `{ history: { "YYYY-MM-DD": ml }, logs: { "YYYY-MM-DD": [ml,...] }, settings: { bottleMl, glassMl }, profile: {...}, ... }`
- `dash_weight`, `dash_sex`, `dash_wake_time` — user profile (used by water target calc across all pages)
- `notification_prefs` → `{ enabled, water: {...}, weight: {...} }`
- `dash_notif_sent` / `dash_notif_dismissed_at` — notification dedup state

**Day boundary is 6 AM, not midnight.** Before 6 AM, the "active date" is the previous calendar day. `getTomorrowDateString()` returns today's calendar date when the clock is before 6 AM.

### Supabase sync

`topbar.js` holds `TOPBAR_SUPABASE_URL` and `TOPBAR_SUPABASE_KEY` (anon key). On water add (from topbar), it merges `po_water_v1` into the `app_state` table (`key = 'health'`). `settings.html` handles full bidirectional sync. Replace those constants with your own project for a new deployment.

### Claude API (Polish button)

`index.html` has a `ANTHROPIC_API_KEY` constant at the top of its `<script>`. When set, the Polish button POSTs to `https://api.anthropic.com/v1/messages` with header `anthropic-dangerous-direct-browser-access: true` to rewrite a goal text using `claude-sonnet-4-5`.

### PWA

`manifest.json` points `start_url` to `/landing.html`. The service worker (`service-worker.js`) uses `skipWaiting` + `clients.claim()` so updates take effect immediately. Push notifications use VAPID keys (configured server-side, not in this repo).

## Conventions

- **CSS variables** are defined per-page in `:root` — always use `var(--text-primary/secondary/tertiary)`, `var(--success)`, `var(--warning)`, `var(--danger)` for color.
- **Card glass style** is applied via `animations.css` section 24 (`.gm-card`, `.wt-card`, etc.) — do not duplicate inline.
- **Animation class naming**: prefix `gd-` for dynamic classes added by JS (e.g. `gd-new-row`, `gd-check-flash`); the keyframe names use the same prefix.
- `topbar.js` wraps its entire body in an IIFE; pages must not assume any global from it except `window.__lsOrigSet` and `window._pcTriggerSync`.
- `finance.html` intentionally receives no topbar/bottombar chrome — keep it that way.
