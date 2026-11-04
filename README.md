# MarketLab v0.5.2

A lightweight, offline-first fictional stock market simulator with desktop and mobile UI profiles.

## One-time deployment with GitHub Pages (no Netlify needed)

1. Sign in to [GitHub](https://github.com) and create a **new public repository** named `marketlab` (you can choose a different name).
2. Add the **contents** of this folder at the repository root: `index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, and `.nojekyll`. You can drag all extracted files and the `icons` folder onto **Add file > Upload files**, then commit.
3. Open repository **Settings > Pages**.
4. Under **Build and deployment**, set **Source: Deploy from a branch**; choose `main` and `/ (root)`, then save.
5. After GitHub publishes your site, open `https://YOUR-USERNAME.github.io/marketlab/` (change the username and repo name if needed).
6. On iPhone use Safari > Share > Add to Home Screen. Chrome on iPhone can also open the URL; installation support may vary by iOS version.

## Future updates

Replace the website files in the same repository and commit to `main`. GitHub Pages will publish automatically, keeping the same URL. You do **not** manually redeploy on Netlify. For new app releases, update the cache version string in `sw.js` and the app's displayed version so installed devices do not keep an old offline shell.

## Save safety

Trading progress is stored in each browser's local storage, **not** in GitHub and **not** on a server. Browser data can be cleared, and installed Home Screen apps may have isolated storage. Export JSON from MarketLab before testing upgrades, reinstalling the app, or switching browsers. GitHub Pages is public, so do not upload personal JSON saves to this repo.

## Notes

- Static HTML/CSS/JS only; no build step, npm, or third-party dependencies.
- PWA uses relative paths and can run from a GitHub Pages subpath.
- Site is public. For private deployments use a different service/security configuration.
- Browser and iPhone functionality should be verified manually after releases; smoke tests cover static source and assets, not interactive trading behavior.

## Development and release workflow

1. Create a branch from `main`, edit the app, and open a pull request.
2. GitHub Actions runs **MarketLab Smoke Tests / Verify static app and PWA** for every pull request and push to `main`. Run the same tests locally with `node --test scripts/smoke-test.mjs scripts/engine-test.mjs` (Node.js 22 or newer).
3. After the checks pass and the changes are reviewed, merge the pull request. GitHub Pages deploys updates to the same website URL.
4. For new releases, update the visible version in `index.html`, the README heading, and `CACHE` version in `sw.js`. Do not change local-save keys casually: that could reset or strand portfolios.
5. Smoke tests verify JavaScript syntax, DOM references, local-save controls, PWA manifest, PNG dimensions, offline cache files, version alignment, and self-contained runtime dependencies. They do not replace manual trading, save import/export, or iPhone checks.

### One-time `main` branch protection setup (repository owner)

In GitHub go to **Settings > Rules > Rulesets > New branch ruleset**, create an active branch ruleset targeting `main` (or use **Settings > Branches > Add branch protection rule** if Rulesets is not available), then enable:

- Require a pull request before merging.
- Require status checks to pass before merging, selecting `Verify static app and PWA` after the first CI run completes.
- Block force pushes and branch deletion (normally enabled by default for protected branches).

On a personal repository, choose review requirements that do not lock out the sole maintainer. **This setup requires owner action in GitHub's settings**; repository content commits cannot apply protection rules themselves.

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
