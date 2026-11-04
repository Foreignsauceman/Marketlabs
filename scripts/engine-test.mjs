import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Script, createContext } from 'node:vm';

// Exercise the real MarketLab market/portfolio functions in an isolated VM.
// No browser data, network requests, or app save keys are touched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const appScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
assert.ok(appScript, 'Expected inline MarketLab app script');

function section(startMarker, endMarker) {
  const start = appScript.indexOf(startMarker);
  const end = appScript.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, 'Cannot find engine section: ' + startMarker);
  return appScript.slice(start, end);
}

const engineSource = [
  "'use strict';",
  section('const KEY=', 'function load()'),
  'let state=fresh();',
  'const quote=id=>state.companies[id],priceCents=id=>cents(quote(id).price),shares=id=>state.holdings[id]||0;',
  'const dayChange=id=>changePct(quote(id).price,quote(id).previous);',
  section('function pushEvent(', 'function valuationPressure('),
  section('function valuationPressure(', 'function advance('),
  section('function maxQty(', 'function setSide('),
  'let writeCount=0,renderCount=0,lastNotice="";',
  'function save(){writeCount++}',
  'function render(){renderCount++}',
  'function renderTrade(){}',
  'function notify(message){lastNotice=message}',
  'function stopAuto(){}',
  [
    'globalThis.harness={',
    'getState:()=>state,',
    'setState:s=>{state=s},',
    'fresh:()=>fresh(),',
    'normalize:s=>normalize(s),',
    'tick:()=>tick(),',
    'trade:()=>trade(),',
    'validateOrder:()=>validateOrder(),',
    'maxQty:()=>maxQty(),',
    "setQty:v=>{document.getElementById('qty').value=String(v)},",
    'setSide:v=>{state.side=v},',
    'getWriteCount:()=>writeCount,',
    'getRenderCount:()=>renderCount,',
    'getNotice:()=>lastNotice',
    '};'
  ].join('\n')
].join('\n');

new Script(engineSource, { filename: 'marketlab-engine-test.js' });

function createHarness() {
  const inputs = new Map();
  const context = createContext({
    document: {
      getElementById(id) {
        if (!inputs.has(id)) inputs.set(id, { value: '1' });
        return inputs.get(id);
      }
    }
  });
  new Script(engineSource).runInContext(context, { timeout: 2000 });
  return context.harness;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

test('fresh market is deterministic and round-trips through saved-state validation', () => {
  const engine = createHarness();
  const starting = copy(engine.getState());
  assert.equal(starting.version, 2);
  assert.equal(starting.day, 1);
  assert.equal(starting.cash, 10000);
  assert.equal(Object.keys(starting.companies).length, 6);
  assert.equal(Object.keys(starting.holdings).length, 0);
  for (const quote of Object.values(starting.companies)) {
    assert.equal(quote.history.length, 520);
    assert.equal(quote.history.at(-1), quote.price);
  }
  assert.deepEqual(copy(engine.fresh()), starting);
  assert.deepEqual(copy(engine.normalize(starting)), starting);
});

test('buy and sell preserve cent arithmetic and do not create phantom shares', () => {
  const engine = createHarness();
  const initialCash = engine.getState().cash;
  engine.setQty(5);
  assert.equal(engine.validateOrder().ok, true);
  engine.trade();
  assert.equal(engine.getState().holdings.NEON, 5);
  assert.equal(engine.getState().cash, initialCash - 5 * 46.20);
  engine.setSide('sell');
  engine.setQty(5);
  assert.equal(engine.validateOrder().ok, true);
  engine.trade();
  assert.equal(engine.getState().holdings.NEON, undefined);
  assert.equal(engine.getState().cash, initialCash);
  assert.equal(engine.getWriteCount(), 2);
  assert.equal(engine.getRenderCount(), 2);
});

test('invalid orders never modify balances, holdings or trigger saves', () => {
  const engine = createHarness();
  const starting = copy(engine.getState());
  for (const qty of ['0', '-1', '1.5', 'abc', '9999999999999999999999']) {
    engine.setQty(qty);
    assert.equal(engine.validateOrder().ok, false);
    engine.trade();
  }
  engine.setSide('sell');
  engine.setQty('1');
  assert.equal(engine.validateOrder().ok, false);
  engine.trade();
  assert.equal(engine.getWriteCount(), 0);
  assert.deepEqual(copy(engine.getState()), starting);
});

test('reject corrupt saved quotes, invalid history and impossible holdings', () => {
  const engine = createHarness();
  const valid = copy(engine.getState());
  const badPrice = copy(valid);
  badPrice.companies.NEON.price = -1;
  assert.equal(engine.normalize(badPrice), null);
  const badHistory = copy(valid);
  badHistory.companies.NEON.history.pop();
  assert.equal(engine.normalize(badHistory), null);
  const badShares = copy(valid);
  badShares.holdings.NEON = 3200000001;
  assert.equal(engine.normalize(badShares), null);
  const badSeed = copy(valid);
  badSeed.seed = -1;
  assert.equal(engine.normalize(badSeed), null);
});

test('long-running market remains bounded, deterministic and reloadable', () => {
  const a = createHarness();
  const b = createHarness();
  for (let day = 0; day < 1500; day++) {
    a.tick();
    b.tick();
  }
  const state = copy(a.getState());
  assert.equal(state.day, 1501);
  assert.deepEqual(state, copy(b.getState()));
  assert.ok(state.events.length <= 14);
  for (const stock of Object.values(state.companies)) {
    assert.equal(stock.history.length, 520);
    assert.equal(stock.history.at(-1), stock.price);
    assert.ok(stock.price >= 0.01 && stock.price <= 10000);
    assert.ok(stock.history.every(v => v >= 0.01 && v <= 10000));
  }
  assert.deepEqual(copy(a.normalize(state)), state);
});

test('mobile selection handlers use one save and repaint per action', () => {
  const stocks = section("$('stocks').addEventListener('click'", "$('profilemode').addEventListener");
  const holdings = section("$('holdings').addEventListener('click'", "$('mobileReset').addEventListener");
  for (const [name, code] of [['stock selection', stocks], ['holdings selection', holdings]]) {
    assert.equal((code.match(/\bsave\(\)/g) || []).length, 1, name + ' writes more than once');
    assert.equal((code.match(/\brender\(\)/g) || []).length, 1, name + ' repaints more than once');
    assert.ok(!code.includes("setMobileTab('trade')"), name + ' triggers redundant tab rendering');
  }
});
