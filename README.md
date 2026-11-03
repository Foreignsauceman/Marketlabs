# MarketLab v0.4.5

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
2. GitHub Actions runs **MarketLab Smoke Tests / Verify static app and PWA** for every pull request and push to `main`. Run the same tests locally with `node --test scripts/smoke-test.mjs` (Node.js 22 or newer).
3. After the checks pass and the changes are reviewed, merge the pull request. GitHub Pages deploys updates to the same website URL.
4. For new releases, update the visible version in `index.html`, the README heading, and `CACHE` version in `sw.js`. Do not change local-save keys casually: that could reset or strand portfolios.
5. Smoke tests verify JavaScript syntax, DOM references, local-save controls, PWA manifest, PNG dimensions, offline cache files, version alignment, and self-contained runtime dependencies. They do not replace manual trading, save import/export, or iPhone checks.

### One-time `main` branch protection setup (repository owner)

In GitHub go to **Settings > Rules > Rulesets > New branch ruleset**, create an active branch ruleset targeting `main` (or use **Settings > Branches > Add branch protection rule** if Rulesets is not available), then enable:

- Require a pull request before merging.
- Require status checks to pass before merging, selecting `Verify static app and PWA` after the first CI run completes.
- Block force pushes and branch deletion (normally enabled by default for protected branches).

On a personal repository, choose review requirements that do not lock out the sole maintainer. **This setup requires owner action in GitHub's settings**; repository content commits cannot apply protection rules themselves.
