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
      const shown = id => $(id).getClientRects().length > 0;
      const overflowFree = name => assert(document.documentElement.scrollWidth <= window.innerWidth + 3,
        name + ' creates horizontal overflow');
      assert(getComputedStyle(nav).position === 'fixed', 'Mobile navigation is not fixed');
      assert(!shown('clockpanel'), 'Advanced market clock should start collapsed');
      assert(!shown('marketNote'), 'Market explanation should start collapsed');
      $('mobileClockToggle').click();
      assert(shown('clockpanel') && $('mobileClockToggle').getAttribute('aria-expanded') === 'true',
        'Expanding market clock failed');
      $('mobileClockToggle').click();
      assert(!shown('clockpanel') && $('mobileClockToggle').getAttribute('aria-expanded') === 'false',
        'Collapsing market clock failed');
      $('marketInfoToggle').click();
      assert(shown('marketNote'), 'Expanding market explanation failed');
      $('marketInfoToggle').click();
      assert(!shown('marketNote'), 'Collapsing market explanation failed');
      overflowFree('Explore');
      nav.querySelector('[data-tab="portfolio"]').click();
      assert(document.body.dataset.tab === 'portfolio', 'Portfolio navigation failed');
      assert(shown('networth') && shown('invested'), 'Portfolio balances are missing');
      assert(!shown('tapepanel'), 'Activity feed should start collapsed');
      $('portfolioActivityToggle').click();
      assert(shown('tapepanel'), 'Expanding activity feed failed');
      $('portfolioActivityToggle').click();
      assert(!shown('tapepanel'), 'Collapsing activity feed failed');
      overflowFree('Portfolio');
      nav.querySelector('[data-tab="chart"]').click();
      assert(document.body.dataset.tab === 'chart', 'Chart navigation failed');
      assert(!shown('chartExtraBody') && !shown('indexoverlay'), 'Extra chart controls should be collapsed');
      assert(getComputedStyle(document.querySelector('.stats')).display === 'none',
        'Portfolio hero should not cover chart screen');
      $('chartExtraToggle').click();
      assert(shown('chartExtraBody') && shown('indexoverlay'), 'Expanding chart tools failed');
      $('singlechart').click();
      assert($('singlechart').getAttribute('aria-pressed') === 'true', 'Expanded chart mode control failed');
      $('allchart').click();
      $('chartExtraToggle').click();
      assert(!shown('chartExtraBody'), 'Collapsing chart tools failed');
      overflowFree('Charts');
      nav.querySelector('[data-tab="trade"]').click();
      assert(!shown('networth') && shown('cash'), 'Trade screen should show cash, not the large net-worth hero');
      assert(!shown('tradeMoreBody'), 'Extra trade details should start collapsed');
      $('tradeMoreToggle').click();
      assert(shown('tradeMoreBody'), 'Expanding trade details failed');
      $('tradeMoreToggle').click();
      assert(!shown('tradeMoreBody'), 'Collapsing trade details failed');
      overflowFree('Trade');
      $('openSettings').click();
      assert($('settingsDialog').open, 'Settings dialog did not open');
      const sections = [...document.querySelectorAll('.settings-accordion')];
      assert(sections.length === 4, 'Expected four settings disclosure groups');
      assert(sections.filter(x => x.open).length === 1 &&
             sections.some(x => x.open && x.dataset.mobileDefault === 'open'),
        'Settings sections should default to Portable Save only');
      sections[0].querySelector('summary').click();
      assert(sections[0].open, 'Settings disclosure cannot be expanded');
      $('closeSettings').click();
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
    // Benchmark real rendering and layout. This is a 120Hz (8.33ms) budget
    // indicator, NOT a claim that headless CI presents frames at 120 FPS.
    const stockRow = $('stocks').firstElementChild;
    const mobile = document.body.dataset.profile === 'mobile';
    if (mobile) $('mobilenav').querySelector('[data-tab="chart"]').click();
    $('chartrange').value = '520';
    $('chartrange').dispatchEvent(new Event('change', { bubbles: true }));
    const samples = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      $('next').click();
      void document.documentElement.offsetHeight;
      samples.push(performance.now() - start);
    }
    samples.sort((a,b)=>a-b);
    const p50 = Number(samples[19].toFixed(2));
    const p95 = Number(samples[37].toFixed(2));
    const maxPoints = Math.max(...[...$('chart').querySelectorAll('[data-line]')].map(path => (path.getAttribute('d').match(/[LM]/g)||[]).length));
    if (mobile) {
      assert(maxPoints < 410, 'Mobile 520-day chart path was not pixel-limited');
      $('mobilenav').querySelector('[data-tab="market"]').click();
      for (let i = 0; i < 15; i++) $('next').click();
    }
    assert(stockRow === $('stocks').firstElementChild, 'Market updates replaced persistent stock cards');
    document.documentElement.setAttribute('data-marketlab-render-metrics', [p50,p95,maxPoints].join(','));
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
    for (const [label, width, height] of [['desktop', 1280, 850], ['mobile-compact', 360, 740], ['mobile', 390, 844], ['mobile-large', 430, 932]]) {
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
      const perf = root.match(/data-marketlab-render-metrics="([^"]+)"/)?.[1];
      assert.ok(perf, label + ' missing render performance sample');
      const [p50,p95,points] = perf.split(',').map(Number);
      console.log(label + ' JS+layout: median ' + p50 + 'ms, p95 ' + p95 + 'ms, SVG points ' + points + ' (120Hz budget 8.33ms)');
      assert.ok(p95 < 100, label + ' extreme render time regression');
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
