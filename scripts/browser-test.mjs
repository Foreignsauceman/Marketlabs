import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const version = html.match(/<title>[^<]*\s(v\d+\.\d+\.\d+)<\/title>/)?.[1];
assert.ok(version, 'Missing MarketLab version');

const probe = String.raw`
<script>
(function () {
  const failures = [];
  try {
    const $ = id => document.getElementById(id);
    const cash = () => Number($('cash').textContent.replace(/[^0-9.]/g, ''));
    const assert = (truth, message) => { if (!truth) throw Error(message); };
    assert($('stocks').querySelectorAll('[data-stock]').length === 6, 'Exchange did not render 6 stocks');
    assert($('chart').querySelectorAll('path').length >= 1, 'Chart SVG did not draw');
    assert($('stocks').querySelectorAll('.stock-spark svg path').length === 6, 'Watchlist mini charts were not rendered');
    assert($('mobilenav').querySelectorAll('button svg').length === 4, 'Bottom navigation icons missing');
    if (document.body.dataset.profile === 'mobile') {
      assert(getComputedStyle(document.querySelector('.mobile-session')).display === 'flex', 'Quick market controls not visible');
      assert(getComputedStyle(document.querySelector('.stats>.stat')).display === 'flex', 'Portfolio hero card missing');
      assert(document.querySelector('.stats>.stat').getBoundingClientRect().width > window.innerWidth * 0.70, 'Hero card is not full width');
      assert(document.documentElement.scrollWidth <= window.innerWidth + 3, 'Mobile layout scrolls sideways');
      const nav = $('mobilenav');
      assert(getComputedStyle(nav).position === 'fixed', 'Mobile navigation is not fixed');
      nav.querySelector('[data-tab="portfolio"]').click();
      assert(document.body.dataset.tab === 'portfolio', 'Portfolio navigation failed');
      nav.querySelector('[data-tab="chart"]').click();
      assert(document.body.dataset.tab === 'chart', 'Chart navigation failed');
      nav.querySelector('[data-tab="market"]').click();
      assert(document.body.dataset.tab === 'market', 'Watchlist navigation failed');
    } else {
      assert(getComputedStyle(document.querySelector('.mobile-session')).display === 'none', 'Mobile toolbar leaked onto desktop');
    }
    const before = cash();
    const target = $('stocks').querySelector('[data-stock="HARB"]');
    assert(target, 'Could not find HARB stock');
    target.click();
    assert($('orderticker').textContent === 'HARB', 'Stock selection did not update trade panel');
    if (window.innerWidth <= 760) {
      assert(document.body.dataset.profile === 'mobile', 'Mobile profile did not activate');
      assert(document.body.dataset.tab === 'trade', 'Selecting ticker did not navigate to mobile trade tab');
    }
    if (document.body.dataset.profile === 'mobile') {
      $('mobileQtyPresets').querySelector('[data-qty-pct="25"]').click();
      assert(Number($('qty').value) >= 1, 'Quick quantity preset failed');
    }
    $('qty').value = '1';
    $('qty').dispatchEvent(new Event('input', { bubbles: true }));
    $('buy').click();
    $('execute').click();
    assert($('holdings').querySelector('[data-holding="HARB"]'), 'Buy did not create holding');
    assert(Math.abs(cash() - (before - 72.5)) < 0.001, 'Buy cash ledger is incorrect');
    $('sell').click();
    $('qty').value = '1';
    $('qty').dispatchEvent(new Event('input', { bubbles: true }));
    $('execute').click();
    assert(!$('holdings').querySelector('[data-holding="HARB"]'), 'Sell did not clear holding');
    assert(Math.abs(cash() - before) < 0.001, 'Sell did not restore cash');
    $('next').click();
    assert(Number($('day').textContent) === 2, 'Advancing the simulated day failed');
    if (document.body.dataset.profile === 'mobile') {
      $('mobileAdvance').click();
      assert(Number($('day').textContent) === 3, 'Mobile quick day advance failed');
      assert($('mobileMarketDay').textContent.includes('3'), 'Quick market clock failed to update');
    }
  } catch (error) {
    failures.push(error.message);
  }
  document.documentElement.setAttribute('data-marketlab-browser-smoke', failures.length ? 'FAIL' : 'PASS');
  document.documentElement.setAttribute('data-marketlab-browser-note', failures.join('; ').slice(0, 180));
})();
</script>
`;

function findChrome() {
  for (const exe of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const lookup = spawnSync('which', [exe], { encoding: 'utf8' });
    if (lookup.status === 0) return lookup.stdout.trim();
  }
  throw Error('Chrome/Chromium not installed on CI runner');
}

test('headless browser renders, buys, sells, and advances on desktop and mobile', () => {
  const temp = mkdtempSync(join(tmpdir(), 'marketlab-browser-'));
  try {
    const local = join(temp, 'index.html');
    writeFileSync(local, html.replace('</body>', probe + '</body>'));
    const url = pathToFileURL(local).href;
    const chrome = findChrome();
    for (const [label, width, height] of [['desktop', 1280, 850], ['mobile', 390, 844]]) {
      const command = spawnSync(chrome, [
        '--headless=new', '--no-sandbox', '--disable-gpu',
        '--disable-dev-shm-usage', '--disable-background-networking',
        '--no-first-run', '--disable-extensions', '--virtual-time-budget=1800',
        '--window-size=' + width + ',' + height,
        '--dump-dom', url
      ], { encoding: 'utf8', timeout: 30000, maxBuffer: 3_000_000 });
      assert.equal(command.status, 0, label + ' Chrome failed: ' + (command.stderr || '').slice(-350));
      const root = command.stdout.match(/<html\b[^>]*>/)?.[0] || '';
      assert.match(root, /data-marketlab-browser-smoke="PASS"/,
        label + ' browser smoke failed: ' + root + ' ' + (command.stderr || '').slice(-350));
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
