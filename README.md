# MarketLab v0.4.4

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
- Initial publishing and actual phone installation have not been exercised through your GitHub account.
MarketLabs deployment test
