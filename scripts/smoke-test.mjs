import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script, runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(resolve(root, name), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const readme = read('README.md');

function asset(ref) {
  assert.match(ref, /^\.\//, 'Use relative paths for GitHub Pages: ' + ref);
  const path = resolve(root, ref);
  assert.ok(path.startsWith(root + sep), 'Asset must remain inside repository: ' + ref);
  assert.ok(existsSync(path), 'Missing asset: ' + ref);
  return path;
}

function pngInfo(path) {
  const data = readFileSync(path);
  assert.ok(data.length > 32, 'Empty PNG: ' + path);
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  assert.equal(data.subarray(12, 16).toString('ascii'), 'IHDR', 'PNG header');
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return { width, height };
}

test('application scripts and service worker have valid JavaScript syntax', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 1, 'Expected inline JavaScript');
  scripts.forEach((script, i) => new Script(script[1], { filename: 'index.html script ' + (i + 1) }));
  new Script(sw, { filename: 'sw.js' });
});

test('every referenced DOM id exists exactly once', () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML ids');
  const idSet = new Set(ids);
  const refs = [...html.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 30, 'Expected application DOM references');
  for (const id of refs) assert.ok(idSet.has(id), 'Missing DOM id referenced by application: ' + id);
});

test('required application controls and local save format remain present', () => {
  for (const id of ['exportSave', 'chooseImport', 'openSettings', 'importFile']) {
    assert.match(html, new RegExp('id=["\\x27]' + id + '["\\x27]'), 'Missing save control: ' + id);
  }
  assert.ok(html.includes("marketlab.tiny-exchange.v2"), 'Local save key must remain stable');
  assert.ok(html.includes('localStorage'), 'Expected offline local saves');
  assert.match(html, /serviceWorker\.register\(['"]\.\/sw\.js['"]/, 'PWA registration missing');
  assert.match(html, /name="viewport"/, 'Mobile viewport missing');
});

test('PWA icons exist, are PNGs, and have their declared dimensions', () => {
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length >= 3);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    const { width, height } = pngInfo(asset(icon.src));
    const sizes = icon.sizes.match(/^(\d+)x(\d+)$/);
    assert.ok(sizes, 'Bad manifest icon size');
    assert.equal(width, Number(sizes[1]));
    assert.equal(height, Number(sizes[2]));
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  const apple = pngInfo(asset('./icons/apple-touch-icon.png'));
  assert.deepEqual(apple, { width: 180, height: 180 });
});

test('HTML local links and service-worker app shell resolve inside the repo', () => {
  const urls = [...html.matchAll(/\b(?:href|src)=["'](\.[^"']+)["']/g)].map((m) => m[1]);
  for (const ref of urls) asset(ref);
  const match = sw.match(/const SHELL\s*=\s*(\[[^;]+?\]);/);
  assert.ok(match, 'Service worker SHELL list missing');
  const shell = runInNewContext(match[1], {});
  assert.ok(shell.includes('./index.html'));
  assert.ok(shell.includes('./manifest.webmanifest'));
  for (const ref of shell) {
    if (ref === './') continue;
    asset(ref);
  }
  for (const icon of manifest.icons) {
    assert.ok(shell.includes(icon.src), 'Manifest icon absent from offline shell: ' + icon.src);
  }
});

test('visible version, README version, and service-worker cache version agree', () => {
  const title = html.match(/<title>[^<]*\s(v\d+\.\d+\.\d+)<\/title>/);
  assert.ok(title, 'App version missing from title');
  const version = title[1];
  assert.ok(html.includes('>' + version + '</span>'), 'Visible app version mismatch');
  assert.ok(readme.startsWith('# MarketLab ' + version), 'README version mismatch');
  assert.ok(sw.includes("const CACHE='marketlab-shell-" + version + "'"), 'Service worker cache version mismatch');
});

test('source remains self-contained with no third-party runtime dependencies', () => {
  assert.equal([...html.matchAll(/<script\b[^>]*\bsrc=/gi)].length, 0, 'Unexpected external JS');
  assert.equal([...html.matchAll(/<link\b[^>]*\bhref=["']https?:\/\//gi)].length, 0, 'Unexpected external CSS');
});
