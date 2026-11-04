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
    assert($('companyBrief').open === false, 'Company briefing should not occupy screen by default');
    $('companyBrief').open = true;
    assert($('briefMetrics').querySelectorAll('.company-brief-metric').length === 9,
      'Selected company should show revenue, margins, debt and corporate actions');
    assert($('briefTitle').textContent.includes('NEON'),'Company briefing ticker out of sync');
    assert($('briefNarrative').textContent.includes('Next earnings Day'),
      'Company earnings schedule missing');
    $('companyBrief').open = false;
    assert($('companyBrief').parentElement === $('boardlist') &&
      $('economyPanel').parentElement === $('boardlist'),
      'Secondary company/economy information must scroll below listed stocks');
    if (document.body.dataset.profile === 'desktop') {
      const exchange=$('exchangepanel'),oldHeight=exchange.style.height;
      exchange.style.height='170px';
      void exchange.offsetHeight;
      const viewport=$('boardlist').getBoundingClientRect(),
        firstStock=$('stocks').firstElementChild.getBoundingClientRect();
      assert($('boardlist').clientHeight>40,
        'Compact Exchange cannot display stock rows');
      assert(firstStock.top>=viewport.top-2&&firstStock.top<viewport.bottom-10,
        'A compact Exchange should show stock rows before its secondary panels');
      assert($('boardlist').scrollHeight>$('boardlist').clientHeight,
        'Secondary company/economy information should be scrollable');
      exchange.style.height=oldHeight;
    }
    assert($('economyPanel').querySelectorAll('.economy-stat').length === 8,
      'Economy panel should contain five indicators');
    assert($('economyRate').textContent === '3.50%', 'Starting policy rate incorrect');
    $('economyPanel').open=true;
    assert($('economyPanel').querySelector('#economyGrowth').textContent.includes('%'),
      'Economic growth metric was not rendered');
    $('economyPanel').open=false;
    $('perfStart').click();
    assert($('perfHud').hidden===false && !$('perfStop').disabled,
      'Live performance monitor did not start');
    $('perfStop').click();
    assert($('perfHud').hidden===true && !$('perfStart').disabled,
      'Live performance monitor did not stop');
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
      assert(sections.length === 5, 'Expected five settings disclosure groups');
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
    let positionCard=$('holdings').querySelector('[data-holding="HARB"]');
    assert(positionCard.textContent.includes('AVG BUY') && positionCard.textContent.includes('UNREALIZED P&L'),
      'Position card lacks average acquisition cost or unrealized profit');
    assert(positionCard.textContent.includes('$72.50'), 'New stock position has incorrect average purchase price');
    // Regression: v0.6.1 could allocate 0px to actual positions when its P&L
    // tiles and the empty options section occupied a resized desktop panel.
    const positionBody = $('holdingsBody');
    assert(positionBody.firstElementChild === $('holdings'),
      'Stock positions must appear before secondary analytics');
    assert($('portfolioSummary').open === false,
      'P&L details should start collapsed to prioritize holdings');
    assert($('portfolioOptions').hidden,
      'The empty options section should be hidden');
    if (document.body.dataset.profile === 'mobile') {
      // A stock purchase happens on the Trade tab, where Portfolio is hidden.
      // Check actual visibility after entering the Portfolio tab.
      $('mobilenav').querySelector('[data-tab="portfolio"]').click();
      positionCard = $('holdings').querySelector('[data-holding="HARB"]');
    }
    assert(positionCard.getClientRects().length > 0,
      'Stock position should be visibly rendered');
    if (document.body.dataset.profile === 'desktop') {
      const panel = $('holdingspanel');
      const originalHeight = panel.style.height;
      panel.style.height = '210px';
      void panel.offsetHeight;
      const viewport = positionBody.getBoundingClientRect();
      const card = positionCard.getBoundingClientRect();
      assert(positionBody.clientHeight > 65,
        'Resizing Holdings leaves no viewport for the actual positions');
      assert(card.top >= viewport.top - 2 && card.top < viewport.bottom - 22,
        'Position card is hidden by P&L summary in a compact Holdings panel');
      assert(positionBody.scrollHeight > positionBody.clientHeight + 8,
        'Resized Holdings should scroll its content, not hide the stock card');
      positionBody.scrollTop = positionBody.scrollHeight;
      assert(positionBody.scrollTop > 0,
        'Compact Holdings cannot scroll down to secondary information');
      positionBody.scrollTop = 0;
      panel.style.height = originalHeight;
    } else {
      assert(getComputedStyle(positionBody).overflowY === 'visible',
        'Mobile Portfolio should expand instead of hiding positions in a scroll box');
    }
    $('portfolioSummary').open = true;
    assert($('realizedTotal').textContent.includes('$0.00'),
      'Expandable realized P&L summary is missing');
    $('portfolioSummary').open = false;
    if (document.body.dataset.profile === 'mobile') {
      $('mobilenav').querySelector('[data-tab="trade"]').click();
    }
    assert(Math.abs(cash() - (before - 72.5)) < 0.001, 'Buy cash ledger is incorrect');
    $('sell').click();
    $('qty').value = '1';
    $('qty').dispatchEvent(new Event('input', { bubbles: true }));
    $('execute').click();
    assert(!$('holdings').querySelector('[data-holding="HARB"]'), 'Sell did not clear holding');
    assert(Math.abs(cash() - before) < 0.001, 'Sell did not restore cash');
    assert($('realizedTotal').textContent.includes('$0.00'), 'Round-trip stock P&L should be zero');
    assert(!$('optionsBeta').open,'Options beta should default to collapsed');
    $('optionsBeta').open=true;
    $('optionType').value='call';
    $('optionSide').value='long';
    $('optionQty').value='1';
    $('optionExpiry').value='7';
    $('optionExpiry').dispatchEvent(new Event('change',{bubbles:true}));
    assert($('optionExecute').disabled===false, 'Long option order should be enabled');
    $('optionExecute').click();
    assert($('optionPositions').querySelectorAll('.option-position-row').length===1,
      'Buying a simulated call did not create an option contract');
    assert($('optionsPortfolio').querySelectorAll('.option-position-row').length===1,
      'Open options missing from Portfolio');
    assert(!$('portfolioOptions').hidden, 'Open option positions should reveal the options section');
    $('optionPositions').querySelector('[data-option-close]').click();
    assert($('optionPositions').querySelectorAll('.option-position-row').length===0,
      'Sell to close did not settle a long option');
    assert($('portfolioOptions').hidden, 'Empty options section should collapse again after closing');
    assert(Math.abs(cash()-before)<.001,'Closing an unchanged-price option lost cash');
    $('optionsBeta').open=false;
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
    assert($('briefMetrics').textContent.includes('GROWTH OUTLOOK'),
      'Company briefing should remain synchronized after market progression');
    assert(Number($('day').textContent)>21, 'Economic reports were not reached');
    assert($('economyNext').textContent.includes('Next report:'), 'Macro report schedule not updated');
    assert($('economyInflation').textContent.includes('%'), 'Macroeconomy missing after repeated ticks');
    assert($('economyCredit').textContent.includes('%') &&
      Number($('economyPmi').textContent)>0 &&
      $('economyWages').textContent.includes('%'),'New macro indicators missing after repeated ticks');
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
