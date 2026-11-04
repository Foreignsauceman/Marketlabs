# MarketLab v0.6.0

A lightweight, offline-first fictional stock market simulator with desktop and mobile UI profiles.

## v0.4.6 maintenance notes

- Mobile exchange and portfolio selections now save and repaint once per action instead of repeating full layout work.
- Chart scaling finds minimum and maximum directly without allocating a flattened history array on each frame.
- The service worker precaches `index.html` once (instead of storing duplicate HTML responses for `/` and `/index.html`); offline navigation still falls back to the cached page.
- CI now runs deterministic market simulation, buy/sell ledger, invalid-order, saved-state validation, and mobile UI efficiency regression checks alongside existing PWA/static checks. Headless Chrome additionally checks real desktop and mobile rendering, buy/sell actions, and day advancement. After every `main` push, the `Verify published MarketLab` job checks the live Pages version, service worker and icons (allowing time for propagation).
- Trading rules, cash/share calculations, market RNG, and the existing `marketlab.tiny-exchange.v2` save key are unchanged. Before major upgrades, export saves in Settings.

Browser/iPhone manual testing is still advised; Node smoke tests do not emulate Safari rendering, install behavior, or File System Access APIs.

## v0.5.0 mobile redesign

- A new mobile-first dark portfolio dashboard with a large net-worth summary, cash and invested balance tiles.
- A compact quick market clock, market-screen labels and navigation icons sized for touch.
- Watchlist cards show 24-session mini trend lines, prices and daily changes.
- Redesigned chart, trading and portfolio screens, including one-tap 25%, 50% and MAX share quantity presets.
- The desktop workspace, fictional market engine, and existing `marketlab.tiny-exchange.v2` save format remain unchanged.
- Rebuilt mobile CSS remains scoped to the mobile profile. Switch to desktop mode through the profile selector if preferred.

**Safety:** Export a JSON save before any major release. The v0.5.0 update leaves the save key and market mechanics untouched. Automated browser checks cover common actions, but test the installed app on iPhone after deployment.

## GitHub username and Pages URL changes

GitHub repository links usually redirect when the owner renames their account, but GitHub Pages moves to a **different subdomain**. This project currently publishes at https://foreignsauceman.github.io/Marketlabs/ . The post-deploy smoke test derives the GitHub Pages address from `GITHUB_REPOSITORY` instead of hardcoding a username.

**Local portfolio safety:** Browser `localStorage`, service workers, and installed web-app data belong to a specific site origin. The old and new `*.github.io` subdomains do not share local data. Before abandoning or deleting an existing Home Screen installation, launch it and export a JSON save if it still opens. Then visit the new Pages URL and import that backup under **Saves & Settings**. If the old app no longer opens, do not uninstall it until recovery options are reviewed. Repository content and GitHub Pages redeployment cannot migrate browser storage across origins.

If you set a custom Pages domain later, override the CI URL with `MARKETLAB_URL` to test the custom-domain origin instead.

## v0.5.1 mobile screen-space refinement

- Mobile Explore defaults to a compact net-worth card. Full cash and invested summaries stay on the Portfolio tab.
- Charts devote the screen to the plot. Toggle **Chart settings & series** to access the index overlay, chart modes, visibility, and focus controls.
- Trade shows the cash balance and order ticket up front. Toggle **Buying power & order details** for remaining float and purchasing power.
- Market time controls open from the **⋯** button beside PLAY. Market explanations and Portfolio activity can be revealed on demand.
- Settings groups now collapse independently on phones. **Portable Save** is open by default, while cloud sync, desktop shortcuts, and full wipe are tucked away.
- All disclosure buttons expose their state with `aria-expanded`; mobile controls are designed for touch and the desktop workspace remains fully expanded.
- The market engine, existing save key `marketlab.tiny-exchange.v2`, and trading and sync logic are unchanged. Disclosure state is temporary UI-only state, not added to save JSON.
- Automated Chromium smoke tests check disclosure behaviors, the four mobile tabs, no horizontal overflow, stock buy/sell, and narrow phone viewport sizes.

## v0.5.2 two-tab and session safety

- MarketLab uses **one active editor per website origin** where the browser's Web Locks API is available. A second tab follows the current saved portfolio in read-only mode. Trading, automatic market advancement, imports, resets, and cloud writes are unavailable in that second tab.
- When the editing tab closes, a viewer can automatically become the editor or use **CHECK AGAIN**. Its state is reloaded from the latest save before trading.
- Every local save checks that its starting snapshot is still current. A foreign or outdated tab's write pauses editing instead of silently overwriting the other tab's progress. **Close other tabs before resuming.**
- Browsers without Web Locks use a weaker optimistic snapshot check and storage-change listener. Concurrent writes in unsupported browsers are not guaranteed to be atomic; avoid editing in multiple tabs simultaneously.
- The one-editor rule covers tabs on the **same origin** in the same browser storage profile. Separate browsers, private windows, distinct devices, and the old vs new GitHub Pages username subdomains do **not** share local portfolios or browser locks.
- Folder-based cloud sync remains an optional manual external backup, not real-time cross-device collaboration. Existing cloud revision checks and backup safeguards remain.
- Save format and key `marketlab.tiny-exchange.v2` are unchanged. Export a JSON recovery file before updating if your current portfolio matters.
- CI now tests two real same-origin browser frames, writer/follower enforcement, cross-tab updates, handoff on editor closure, and rogue legacy writes, in addition to trading and mobile UI checks.

## v0.5.3 performance and 120 Hz rendering target

- Target: keep individual UI updates within an **8.33 ms** frame budget on capable 120 Hz screens. Actual FPS depends on device, browser, compositing, thermal throttling, and refresh-rate settings. A 60 Hz display cannot present 120 distinct frames per second.
- The stock list now updates six persistent row elements in place instead of replacing all their HTML every market day. This reduces GC/DOM churn and preserves keyboard focus.
- On mobile, after initial boot only the active panel is repainted; hidden Charts, Trade, and Portfolio content refresh when navigated to.
- Chart SVG geometry is pixel-aware: long histories are downsampled with chronological min/max buckets, retaining local spikes and endpoints while rendering fewer path segments on narrow screens. Full 520-day history, hover values, pricing, and saved data are untouched.
- Automatic market stepping uses `requestAnimationFrame` with wall-clock timing instead of unaligned `setInterval`; it does not pile up catch-up steps after hidden/slow frames.
- Removed duplicated profile syncing and clock rendering.
- Browser CI now records median and 95th percentile synchronous JS+layout time, verifies persistent DOM stock rows, and checks mobile 520-session chart geometry. These timings are diagnostics from a shared CI runner, **not a real-device 120 FPS guarantee**.
- Market math, trading validation, multi-tab editor lock, and `marketlab.tiny-exchange.v2` save schema remain unchanged. A JSON export is prudent before testing this release.

## v0.6.0: economy foundation + frame diagnostics

**Economic Pulse** is a collapsible section below the market watchlist. Five fictional indicators (policy rate, inflation, GDP growth, unemployment, confidence) start from baseline values, then evolve every 21 simulated trading days. Policy decisions and economic reports appear in market news. Macro indicators slightly influence all prices and create different pressures by sector: technology is more rate-sensitive; industrials respond to growth and employment; retail to confidence and inflation; energy to growth and inflation. This is a stylized *fictional* economic simulator, not real data or a forecast. No credit, bonds, or government budgets yet; these can be future phases.

The **Frame & Render Profiler** in Settings is opt-in and local-only. Start it, close Settings, use the app for 20–30 seconds on a 120 Hz-capable display, then stop and export diagnostics. A floating HUD reports observed requestAnimationFrame cadence, p95 frame-callback interval, estimated display rate and missed refresh opportunities. Browsers supporting the Long Animation Frames API additionally report >50 ms frames and paint/presentation/layout estimates when exposed. No portfolio data is included in the diagnostic file. This is **not** a true GPU frame-present measurement: rAF happens before repaint, and true rasterization/compositor/GPU bottlenecks require Chrome DevTools Performance or Safari Web Inspector. Keep the monitor off outside profiling to minimize overhead.

**Save compatibility:** The save key and version-2 schema remain intact. Older saves without an economy field receive conservative baseline indicators on load, preserving cash, holdings, share prices, history and RNG seed; newly saved games include their economic state. Import/export and folder backups include the economic state. Export a JSON backup before a major upgrade. Re-import only if you need to restore a different portfolio, switch origins or recover progress.

**QA:** CI verifies deterministic long-running simulations and monthly reports, economic migration and validation, sector effects, save/trading math, responsive economy/profiler UI, live Chrome rendering, multi-tab locks and the published PWA.
