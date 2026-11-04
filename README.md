# MarketLab v0.6.3.1

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

## v0.6.1: portfolio analytics, calmer market, economy expansion, options beta

### Portfolio cost basis and P&L
- Every stock position records a **weighted-average acquisition cost in integer cents**. Buys add their cost to the position; sells proportionately reduce cost basis, reporting realized gains/losses. Unrealized P&L is current market value minus remaining basis. Current price, average purchase price, share quantity, total basis, unrealized P&L and return percentage appear on every holding card.
- The Portfolio view also summarizes realized stock P&L, realized options P&L and total unrealized stock-plus-options P&L. Net worth includes marked long options and subtracts short-option liabilities.
- **Backward-compatible migration:** MarketLab did not previously track purchase prices. Existing portfolios retain their cash, shares, quote history and RNG seed. For older positions, starting basis is estimated using the price **when the updated save is first loaded**, explicitly marked by an asterisk. Real historical acquisition prices cannot be recovered from old saves.
- The existing `marketlab.tiny-exchange.v2` key and version-2 save envelope are retained, with additional optional position/contract fields. Exports and cloud-folder backups contain the expanded portfolio data.

### A more robust but less frantic economy
- The Economy Pulse includes credit spreads, manufacturing PMI and annualized wage growth in addition to rates, inflation, GDP growth, unemployment and confidence.
- Economic releases continue every 21 simulated sessions. Fictional policy moves are now more gradual and occur only on alternating reports; credit stress and industrial activity influence market regimes.
- Lower ordinary market, sector and stock noise reduces day-to-day volatility. **Large shocks still occur but are rarer**. Quarterly earnings can trigger company-specific repricings. These are intentionally game-balanced fictional behaviors, not calibrated stock-return or macroeconomic forecasts.

### Simulated options beta
- The Trade ticket has a collapsed **Options Desk (BETA)** with **calls and puts**, 100-share contracts, strikes near the current price, 7/21/63-day expirations, estimated premiums and contract quantity controls.
- Buying a call or put is a **long option** and debits the premium. You can sell to close before expiry. Purchased options settle intrinsic value **in cash** at expiration, rather than automatically exercising into stock.
- Writing a **covered call** collects premium but reserves 100 owned shares per contract; those shares cannot be sold until the call is closed or expires. In-the-money calls deliver shares at the strike price on expiry.
- Writing a **cash-secured put** collects premium and reserves the full strike-cost in cash; this amount is unavailable for other stock or option purchases. In-the-money puts purchase 100 shares per contract at the strike price on expiry. Available public float is also reserved.
- Closing a written contract uses a **buy-to-close** at the current simulated model mark. Premiums and option P&L, reserved cash/shares, open contracts and expiry dates are shown in the interface.
- **No naked calls, no margin borrowing, no selling puts without cash, no early-exercise model, no real option exchange/greeks or bid-ask book.** Quotes use a bounded, time-decaying fictional intrinsic-plus-time-value model. This is a beta game mechanic, **not real-world investment pricing or execution**.
- Options positions are limited to 30 open lots and up to 10 contracts per lot. Margin/collateral and expiry are checked during saves and test runs.

### Testing and backup
- Automated tests cover cent-accurate average-cost accounting, trade execution, legacy basis migration, options premiums, collateral, exercise/assignment, deterministic simulations and corrupted save rejection, plus responsive options UI and real-browser two-tab locks.
- The existing optional frame monitor remains available in Settings; watch p95 frame timing while opening options and after longer market simulation.
- **Export JSON before updating** because trading and save mechanics are changing. No import is needed if your current local save loads correctly. Retain the backup until you have verified positions and trading in v0.6.1.

## v0.6.2: Holdings panel layout hotfix

- Fix a regression where a short, user-resized desktop Holdings panel could allocate nearly all its height to P&L tiles and the empty Options section, leaving the actual stock position list hidden.
- Show **stock positions first**. Keep the detailed realized/unrealized P&L cards in a keyboard-accessible, collapsed **Position P&L Breakdown** with an always-visible unrealized P&L preview.
- Hide the **Open Options** disclosure entirely when there are no open contracts; restore it automatically when contracts are opened. Existing option positions remain available below the stock cards.
- Put stocks, P&L breakdown, and options in a **single scrollable desktop Holdings body**. Small saved panel heights still show the start of the stock card and can scroll to secondary information. Mobile Portfolio continues to grow naturally without a nested scroll area.
- Use a legible two-column detail grid for narrow position cards and shorten the panel's position-count label.
- Add real desktop/360/390/430px browser checks for compact saved-height behavior, card ordering, expandable P&L and open/empty option visibility. Preserve all market/option calculations and the v2 save format.
- **No import/export needed:** this is a layout-only patch. A JSON backup is always optional if you want one.

## v0.6.3: corporate actions and living companies

- **Stock splits:** Above roughly $500 a share, companies can execute a 2-for-1 split; above roughly $1,400, a 4-for-1 split. They have a 252-session cooldown and can postpone when the required conversion is not financially safe. **Reverse splits:** Below about $1.75, eligible companies can perform a 1-for-2 reverse split. No cash is created by a routine split.
- A split adjusts share price, the user's share quantity, outstanding shares, public float, trading volume, prior-day quote, and the entire 520-day chart history to a common basis. **Aggregate stock position value and total cost basis should stay unchanged within cents rounding**. Reverse splits pay cash in lieu of fractional shares and allocate their acquisition cost to realized P&L. Corporate actions appear in the news feed and company briefing.
- Open simulated options also receive adjusted share deliverables and per-share strikes without changing their **total exercise obligation or original premium**. The contract can deliver a nonstandard number of shares after a split; covered calls and secured puts continue to enforce their adjusted share and cash collateral. Exercised contracts use exact original total strike costs. No market-value transfer should arise merely because the company re-denominated its shares.
- Companies now have persistent annual revenue, operating margin, cash, debt, annual revenue growth guidance, quarterly reports, earnings surprises and a simple business state (stable, expanding, strained, recovering). Reports are staggered rather than all arriving on the same day. Sector-specific strategic developments can raise or lower forecasts.
- **Fundamental valuation:** Each company has a rough earnings-based per-share value tied to actual fictional revenue, operating profitability, leverage and its current share count. The simulated price gradually responds to this value, with volatility and unusual news still able to produce major moves. This replaces the fixed historical IPO-price fair-value anchor. It is deliberately simplified game modeling, not a professional security valuation or earnings forecast.
- A compact, **collapsible Company Briefing** under the Exchange reveals the selected company's financial information, expected next earnings date, capital structure and latest split/reverse split. Mobile stays collapsed by default.
- **Old portfolio migration:** The save key `marketlab.tiny-exchange.v2`, existing holdings/cost basis/cash/options, history and RNG seed are preserved. A portfolio from an earlier version receives initial fundamentals anchored to **its current saved prices** and initial outstanding share counts. There are no retroactive splits and no surprise reset to Day 1 quotes. Legacy options receive 100-share deliverables until they experience a corporate action.
- Run a JSON export **before upgrading**, because both simulation and contract accounting have changed. Reimport only if a recovery is needed. Do not use an older tab to overwrite a save that has already upgraded.
- Tests cover 2-for-1/4-for-1 splits, reverse splits with cash-in-lieu, options adjustments, strike collateral, price/cap/holdings invariants, quarterly reports, 23,365-day save migration, responsive UI, deterministic simulation, multi-tab safety and production GitHub Pages deployment.

## v0.6.3.1: sector rotation / three new industries

### Nine stocks across seven industries
- **Finance:** FINA / Meridian Financial, driven by yield curve profitability, loan credit spreads, unemployment and interest-rate cycles.
- **Healthcare:** MEDI / Morrow Health, with less broad-market beta, independent care-demand factors and occasional clinical news.
- **Utilities:** GRID / Northstar Utilities, emphasizing electricity demand, financing costs and defensive behavior during weak economic regimes.
- The original Technology, Industrials, Consumer and Energy sectors remain. **Energy now responds to an independent commodity-price index**, allowing occasional divergence from broad market conditions even when inflation is quiet.
- Industry-specific quarterly corporate news, revenue outlook and earnings catalysts are integrated with the operating model, not arbitrary price labels.

### Distinct multi-month sector behavior
- Every sector follows its own **headwind, neutral, or tailwind cycle** lasting ~42–127 simulated sessions. Cycle transitions are weighted by the prevailing economy but do not deterministically follow the broad market. Sector-specific events create occasional sharper, rarer industry-wide moves.
- Economic reports every 21 sessions evolve four new macro drivers: **commodity index**, **yield-curve spread**, **medical demand index**, and **electricity demand index**. Each has independent bounded shocks and mean reversion. Rates, factory PMI, inflation, confidence and credit spreads remain important.
- A collapsed **Sector Rotation** disclosure inside the scrollable Exchange lists all seven industries, daily average share-price return, cycle direction and simulated drivers. It keeps stock rows visible when desktop panels are resized and uses a responsive two-column mobile grid.
- Industry-specific sensitivity and broad-market beta mean an Energy bull trend can occur during a weak wider exchange, and Finance/Utilities may react in opposite directions to interest-rate changes. These figures are deliberately stylized fictional market dynamics, not market forecasts.

### Migration, polish and testing
- Existing save key and format remain `marketlab.tiny-exchange.v2`. A six-stock portfolio imports without any changes to its existing quotes, holdings, cost basis, options or market RNG seed. Three new companies are added via a deterministic separate seed, so **migration never consumes a saved market RNG draw**.
- Players who showed the entire original six-stock watchlist automatically see the three listings; customized watchlists remain customized.
- Sector cycles and additional economic indicators load with safe defaults from old saves and round-trip through JSON backup. New companies are available for stock and options trading.
- The static/browser/live-site version check now accepts four-segment releases, and the exported frame-profiling JSON identifies the actual current app version.
- Full engine, migration, multi-tab, responsive chart/market/trade, performance and live-site smoke checks are required. A JSON backup before upgrading is recommended; imports are not needed unless recovering a portfolio.
