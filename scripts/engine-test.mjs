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
  section('const basisCents=', 'const holdingsCents='),
  section('function pushEvent(', 'function valuationPressure('),
  section('function valuationPressure(', 'function advance('),
  section('function placeOptionOrder(', 'function maxQty('),
  section('function maxQty(', 'function setSide('),
  'let writeCount=0,renderCount=0,lastNotice="";',
  'function requireEditor(){return true}',
  'function save(){writeCount++}',
  'function render(){renderCount++}',
  'function renderTrade(){}',
  'function notify(message){lastNotice=message}',
  'function stopAuto(){}',
  [
    'globalThis.harness={',
    'getState:()=>state,',
    'placeOptionOrder:x=>placeOptionOrder(x),',
    'closeOption:id=>closeOptionPosition(id),',
    'settleOptions:()=>settleExpiringOptions(),',
    'applyAction:(ticker,kind,ratio)=>applyCorporateAction(company(ticker),kind,ratio),',
    'fairValue:ticker=>fundamentalFairPrice(company(ticker)),',
    'quote:ticker=>state.companies[ticker],',
    'company:ticker=>company(ticker),',
    'quoteOption:(ticker,type,strike,expiry)=>optionQuoteCents(ticker,type,strike,expiry),',
    'reservedCash:()=>reservedCashCents(),',
    'reservedShares:id=>reservedShares(id),',
    'buyingPower:()=>buyingPowerCents(),',
    'basis:id=>basisCents(id),',
    'netWorth:()=>cents(state.cash)+Object.keys(state.holdings).reduce((n,id)=>n+state.holdings[id]*priceCents(id),0)+optionsMarkCents(),',

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
  const normalized = copy(engine.normalize(starting));
  assert.equal(normalized.version, starting.version);
  assert.equal(normalized.seed, starting.seed);
  assert.deepEqual(normalized.companies, starting.companies);
  // The loader intentionally fills missing per-sector/per-company momentum defaults.
  assert.deepEqual(copy(engine.normalize(normalized)), normalized);
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
  // Only the selected buy/sell UI side changed during the invalid-order test.
  assert.deepEqual({ ...copy(engine.getState()), side: starting.side }, starting);
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

test('legacy v2 saves migrate to a stable macro economy without losing trading data', () => {
  const engine=createHarness();
  const previous=copy(engine.getState());
  delete previous.economy;
  const restored=copy(engine.normalize(previous));
  assert.ok(restored, 'Missing economy must not invalidate an existing portfolio');
  assert.equal(restored.economy.rate,3.5);
  assert.equal(restored.economy.inflation,2.6);
  assert.equal(restored.economy.lastReportDay,0);
  assert.deepEqual(restored.holdings,previous.holdings);
  assert.deepEqual(restored.companies,previous.companies);
  assert.equal(restored.seed,previous.seed);
  assert.deepEqual(copy(engine.normalize(restored)),restored);
});

test('the fictional economic cycle updates monthly and survives saves', () => {
  const a=createHarness(),b=createHarness();
  for(let i=0;i<84;i++){a.tick();b.tick()}
  const value=copy(a.getState());
  assert.equal(value.day,85);
  assert.equal(value.economy.lastReportDay,84);
  assert.ok(value.economy.rate>=0&&value.economy.rate<=10);
  assert.ok(value.economy.inflation>=0&&value.economy.inflation<=12);
  assert.ok(value.economy.confidence>=40&&value.economy.confidence<=160);
  assert.ok(value.events.some(event=>event.text.includes('Economic report:')));
  assert.deepEqual(value,copy(b.getState()),'Monthly reports must be reproducible with a saved RNG');
  assert.deepEqual(value,copy(a.normalize(value)),'Economic indicators must round-trip losslessly');
});

test('different macroeconomic conditions influence sector prices without changing share math', () => {
  const optimistic=createHarness(),stressed=createHarness();
  const a=copy(optimistic.getState()),b=copy(stressed.getState());
  a.economy={rate:0,inflation:1.0,growth:7.0,unemployment:2,confidence:145,lastReportDay:0,policyDirection:'hold'};
  b.economy={rate:9,inflation:9.0,growth:-5,unemployment:14,confidence:55,lastReportDay:0,policyDirection:'hold'};
  optimistic.setState(a);stressed.setState(b);
  optimistic.tick();stressed.tick();
  const up=copy(optimistic.getState()),down=copy(stressed.getState());
  assert.equal(up.day,down.day);
  assert.deepEqual(up.holdings,down.holdings);
  assert.notDeepEqual(Object.values(up.companies).map(x=>x.price),
    Object.values(down.companies).map(x=>x.price),
    'Interest rates and the wider economy should affect trading prices');
});

test('invalid economy values are rejected while legacy saves remain compatible', () => {
 const engine=createHarness(),state=copy(engine.getState());
 for(const change of [{rate:Infinity},{inflation:-5},{growth:100},
   {confidence:200},{unemployment:0},{lastReportDay:1000},{policyDirection:'crash'}]){
  const corrupt=copy(state);Object.assign(corrupt.economy,change);
  assert.equal(engine.normalize(corrupt),null);
 }
});


test('weighted-average share entry and realized/unrealized P&L use integer cents', () => {
 const h=createHarness();h.setQty(3);h.trade();
 assert.equal(h.basis('NEON'),13860);
 assert.equal(h.getState().realizedPnLCents,0);
 const q=h.getState().companies.NEON;q.price=50;q.history[q.history.length-1]=50;
 h.setQty(2);h.trade();
 assert.equal(h.basis('NEON'),23860);
 h.setSide('sell');h.setQty(2);h.trade();
 assert.equal(h.getState().holdings.NEON,3);
 assert.equal(h.basis('NEON'),14316);
 assert.equal(h.getState().realizedPnLCents,456);
 assert.equal(h.getState().realizedPnLCents+3*5000-h.basis('NEON'),1140);
 const normalized=copy(h.normalize(copy(h.getState())));
 assert.deepEqual(copy(h.normalize(normalized)),normalized);
});

test('legacy portfolios receive clearly estimated cost basis instead of invented trades', () => {
 const h=createHarness(),original=copy(h.getState());
 original.holdings.NEON=100;original.cash-=4620;
 delete original.positionCostCents;delete original.estimatedBasis;
 delete original.realizedPnLCents;delete original.options;delete original.nextOptionId;
 delete original.optionRealizedCents;
 const migrated=copy(h.normalize(original));
 assert.equal(migrated.positionCostCents.NEON,462000);
 assert.equal(migrated.estimatedBasis.NEON,true);
 assert.equal(migrated.cash,5380);
 assert.deepEqual(migrated.holdings,original.holdings);
 assert.deepEqual(migrated.companies,original.companies);
 assert.equal(migrated.seed,original.seed);
 assert.deepEqual(copy(h.normalize(migrated)),migrated);
});

test('long calls and puts debit premiums and cash-settle only their intrinsic value', () => {
 const h=createHarness(),original=h.getState().cash;
 const opened=h.placeOptionOrder({ticker:'NEON',type:'call',side:'long',qty:1,strike:4500,days:7});
 assert.equal(opened.ok,true);
 assert.ok(opened.premium>0);
 assert.equal(h.getState().cash,original-opened.premium/100);
 assert.equal(h.getState().options.length,1);
 h.getState().day=8;
 const q=h.getState().companies.NEON;q.price=52;
 h.settleOptions();
 assert.equal(h.getState().options.length,0);
 assert.equal(h.getState().optionRealizedCents,70000-opened.premium);
 assert.equal(h.getState().cash,original+(70000-opened.premium)/100);
 assert.equal(h.getState().holdings.NEON,undefined);
});

test('covered calls reserve owned stock; written puts reserve cash for assignment', () => {
 const h=createHarness();
 assert.equal(h.placeOptionOrder({ticker:'NEON',type:'call',side:'short',qty:1,strike:4600,days:7}).ok,false);
 h.setQty(100);h.trade();
 const call=h.placeOptionOrder({ticker:'NEON',type:'call',side:'short',qty:1,strike:4600,days:7});
 assert.equal(call.ok,true);
 assert.equal(h.reservedShares('NEON'),100);
 h.setSide('sell');h.setQty(1);assert.equal(h.validateOrder().ok,false);
 assert.equal(h.closeOption(call.option.id).ok,true);
 assert.equal(h.reservedShares('NEON'),0);
 h.setQty(100);assert.equal(h.validateOrder().ok,true);h.trade();
 const put=h.placeOptionOrder({ticker:'NEON',type:'put',side:'short',qty:1,strike:4600,days:7});
 assert.equal(put.ok,true);
 assert.ok(h.reservedCash()>=460000);
 assert.ok(h.buyingPower()<1000000);
 h.getState().day=8;
 h.getState().companies.NEON.price=40;
 h.getState().companies.NEON.history[519]=40;
 h.settleOptions();
 assert.equal(h.getState().holdings.NEON,100);
 assert.equal(h.basis('NEON'),460000);
 assert.equal(h.reservedCash(),0);
 assert.equal(h.getState().options.length,0);
 assert.ok(h.getState().optionRealizedCents>0);
 const normalized=copy(h.normalize(copy(h.getState())));
 assert.deepEqual(copy(h.normalize(normalized)),normalized);
});


test('in-the-money covered calls deliver reserved stock with realized stock and option gains',()=>{
 const h=createHarness();h.setQty(100);h.trade();
 const initialCash=h.getState().cash;
 const opened=h.placeOptionOrder({ticker:'NEON',type:'call',side:'short',qty:1,strike:4900,days:7});
 assert.equal(opened.ok,true);
 assert.equal(h.reservedShares('NEON'),100);
 h.getState().day=8;h.getState().companies.NEON.price=55;
 h.getState().companies.NEON.history[519]=55;
 h.settleOptions();
 assert.equal(h.getState().holdings.NEON,undefined,'Shares should be delivered');
 assert.equal(h.getState().realizedPnLCents,28000,'Stock delivery realizes strike less share basis');
 assert.equal(h.getState().optionRealizedCents,opened.premium);
 assert.equal(h.getState().cash,initialCash+(opened.premium+490000)/100);
 assert.equal(h.reservedShares('NEON'),0);
 assert.equal(h.getState().options.length,0);
});

test('option positions preserve net worth at the quoted entry premium and release collateral on closing',()=>{
 const h=createHarness(),starting=h.netWorth();
 const long=h.placeOptionOrder({ticker:'BYTE',type:'put',side:'long',qty:1,strike:900,days:21});
 assert.equal(long.ok,true);
 assert.equal(h.netWorth(),starting,'Opening a model-priced long option should not create instant P&L');
 const closed=h.closeOption(long.option.id);
 assert.equal(closed.ok,true);
 assert.equal(h.netWorth(),starting);
 const put=h.placeOptionOrder({ticker:'NEON',type:'put',side:'short',qty:1,strike:4600,days:21});
 assert.equal(put.ok,true);
 assert.equal(h.netWorth(),starting,'Premium is offset by an option liability at entry');
 assert.equal(h.reservedCash(),460000);
 assert.equal(h.closeOption(put.option.id).ok,true);
 assert.equal(h.reservedCash(),0);
 assert.equal(h.netWorth(),starting);
});

test('options validation rejects uncollateralized, expired, or malformed contracts', () => {
 const h=createHarness(),s=copy(h.getState());
 const valid={id:1,ticker:'NEON',type:'put',side:'short',qty:1,strike:4500,expiryDay:8,openedDay:1,entryPremiumCents:80};
 for(const patch of [{strike:1000001},{qty:20},{type:'future'},{expiryDay:0},{ticker:'NOPE'}]){
  const invalid=copy(s);invalid.options=[{...valid,...patch}];invalid.nextOptionId=2;
  assert.equal(h.normalize(invalid),null);
 }
 const shortCall=copy(s);shortCall.options=[{...valid,type:'call'}];shortCall.nextOptionId=2;
 assert.equal(h.normalize(shortCall),null,'Uncovered short call should be rejected on import');
 const overspent=copy(s);overspent.options=[{...valid,strike:100000}];overspent.nextOptionId=2;
 assert.equal(h.normalize(overspent),null,'Insufficient put collateral should be rejected');
});

test('quieter typical days coexist with infrequent large scheduled and surprise moves', () => {
 const h=createHarness();let huge=0,normal=0;
 for(let i=0;i<700;i++){
  const before=h.getState().companies.NEON.price;
  h.tick();
  const change=Math.abs(h.getState().companies.NEON.price/before-1);
  if(change>.1)huge++;
  if(change<.04)normal++;
 }
 assert.ok(normal>550,'Ordinary trading days should be predominantly moderate');
 assert.ok(huge<35,'Double-digit swings should be infrequent');
 assert.ok(h.getState().events.some(e=>/earnings|credit|market|session/i.test(e.text)));
});


test('4-for-1 stock split preserves ownership, cost basis, capitalization and adjusted history',()=>{
 const h=createHarness();h.setQty(7);h.trade();
 const s=h.getState(),q=h.quote('NEON');
 q.price=2313.12;q.previous=2300;q.history=q.history.map(()=>2313.12);
 const beforeValue=7*q.price,basis=h.basis('NEON');
 const beforeCap=q.price*q.sharesOutstanding;
 assert.equal(h.applyAction('NEON','split',4),true);
 assert.equal(h.getState().holdings.NEON,28);
 assert.equal(h.basis('NEON'),basis);
 assert.equal(q.price,578.28);
 assert.equal(q.sharesOutstanding,6400000000*4);
 assert.equal(q.publicFloat,3200000000*4);
 assert.equal(q.lastAction.kind,'split');
 assert.equal(q.lastAction.ratio,4);
 assert.equal(q.history.at(-1),q.price);
 assert.equal(q.previous,575);
 assert.equal(h.getState().realizedPnLCents,0);
 assert.ok(Math.abs(h.getState().holdings.NEON*q.price-beforeValue)<.001);
 assert.ok(Math.abs(q.price*q.sharesOutstanding-beforeCap)<.001);
 const canonical=copy(h.normalize(copy(s)));
 assert.deepEqual(copy(h.normalize(canonical)),canonical);
});

test('reverse split cashes fractional shares at market value and allocates basis exactly',()=>{
 const h=createHarness();h.getState().selected='MISO';h.setQty(5);h.trade();
 const s=h.getState(),q=h.quote('MISO'),basis=h.basis('MISO'),cash=s.cash;
 q.price=1.25;q.previous=1.25;q.history=q.history.map(()=>1.25);
 assert.equal(h.applyAction('MISO','reverse',2),true);
 assert.equal(s.holdings.MISO,2);
 assert.equal(q.price,2.5);
 assert.equal(s.cash,cash+1.25);
 assert.equal(h.basis('MISO'),basis-Math.round(basis/5));
 assert.equal(s.realizedPnLCents,125-Math.round(basis/5));
 assert.equal(q.sharesOutstanding,50000000);
 assert.equal(q.publicFloat,31000000);
 assert.equal(q.lastAction.kind,'reverse');
 assert.equal(q.history.at(-1),q.price);
 const canonical=copy(h.normalize(copy(s)));
 assert.deepEqual(copy(h.normalize(canonical)),canonical);
});

test('split-adjusted covered call keeps exercise cost and reserved shares through assignment',()=>{
 const h=createHarness();h.setQty(100);h.trade();
 const opened=h.placeOptionOrder({ticker:'NEON',type:'call',side:'short',qty:1,strike:4600,days:7});
 assert.equal(opened.ok,true);
 const cash=h.getState().cash;
 assert.equal(h.applyAction('NEON','split',2),true);
 const o=h.getState().options[0];
 assert.equal(o.contractShares,200);
 assert.equal(o.exerciseCents,460000);
 assert.equal(o.strike,2300);
 assert.equal(o.entryValueCents,opened.premium);
 assert.equal(h.reservedShares('NEON'),200);
 assert.equal(h.getState().holdings.NEON,200);
 const canonical=copy(h.normalize(copy(h.getState())));
 assert.deepEqual(copy(h.normalize(canonical)),canonical);
 h.getState().day=8;
 h.quote('NEON').price=26;h.quote('NEON').history[519]=26;
 h.settleOptions();
 assert.equal(h.getState().holdings.NEON,undefined);
 assert.equal(h.getState().realizedPnLCents,-2000);
 assert.equal(h.getState().optionRealizedCents,opened.premium);
 assert.equal(h.getState().cash,cash+(460000/100));
 assert.equal(h.reservedShares('NEON'),0);
});

test('reverse-split cash-secured put keeps original dollar collateral and assigns fewer shares',()=>{
 const h=createHarness();
 const opened=h.placeOptionOrder({ticker:'NEON',type:'put',side:'short',qty:1,strike:4500,days:7});
 assert.equal(opened.ok,true);
 assert.equal(h.reservedCash(),450000);
 assert.equal(h.applyAction('NEON','reverse',2),true);
 const o=h.getState().options[0];
 assert.equal(o.contractShares,50);
 assert.equal(o.exerciseCents,450000);
 assert.equal(o.strike,9000);
 assert.equal(h.reservedCash(),450000);
 const canonical=copy(h.normalize(copy(h.getState())));
 assert.deepEqual(copy(h.normalize(canonical)),canonical);
 h.getState().day=8;h.quote('NEON').price=70;
 h.quote('NEON').history[519]=70;
 const cash=h.getState().cash;
 h.settleOptions();
 assert.equal(h.getState().options.length,0);
 assert.equal(h.getState().holdings.NEON,50);
 assert.equal(h.basis('NEON'),450000);
 assert.equal(h.reservedCash(),0);
 assert.equal(h.getState().cash,cash-4500);
 assert.equal(h.getState().optionRealizedCents,opened.premium);
});

test('a legacy 23,365-day portfolio migrates at its current value then can split',()=>{
 const h=createHarness(),raw=copy(h.getState());
 raw.day=23365;
 raw.companies.NEON.price=2313.12;
 raw.companies.NEON.previous=2310;
 raw.companies.NEON.history=Array(520).fill(2313.12);
 delete raw.companies.NEON.sharesOutstanding;
 delete raw.companies.NEON.publicFloat;
 delete raw.companies.NEON.fundamentals;
 delete raw.companies.NEON.lastSplitDay;
 delete raw.companies.NEON.splitCount;
 delete raw.companies.NEON.lastAction;
 const migrated=copy(h.normalize(raw));
 assert.ok(migrated);
 assert.ok(Math.abs(migrated.companies.NEON.fundamentals.revenue)>0);
 h.setState(migrated);
 assert.ok(Math.abs(h.fairValue('NEON')/2313.12-1)<.04,
   'Historical portfolio should not be repriced against its original IPO');
 h.tick();
 assert.equal(h.quote('NEON').lastAction.kind,'split');
 assert.equal(h.quote('NEON').lastAction.ratio,4);
 assert.ok(h.quote('NEON').price<1000);
 const canonical=copy(h.normalize(copy(h.getState())));
 assert.deepEqual(copy(h.normalize(canonical)),canonical);
});

test('quarterly reports evolve business earnings, credit and guidance deterministically',()=>{
 const a=createHarness(),b=createHarness();
 const starting=a.quote('MISO').fundamentals.revenue;
 for(let i=0;i<630;i++){a.tick();b.tick()}
 assert.deepEqual(copy(a.getState()),copy(b.getState()));
 for(const ticker of ['NEON','HARB','MISO','VOLT','AERO','BYTE']){
  const q=a.quote(ticker);
  assert.ok(q.fundamentals.quarterCount>=9);
  assert.ok(['stable','expanding','strained','recovering'].includes(q.fundamentals.status));
  assert.ok(Number.isFinite(a.fairValue(ticker))&&a.fairValue(ticker)>0);
 }
 assert.notEqual(a.quote('MISO').fundamentals.revenue,starting);
 assert.deepEqual(copy(a.normalize(copy(a.getState()))),copy(a.getState()));
});

test('reject impossible split states and tampered adjusted option contracts',()=>{
 const h=createHarness(),base=copy(h.getState());
 const invalid=[
  s=>{s.companies.NEON.publicFloat=100000000000000;},
  s=>{s.companies.NEON.fundamentals.margin=2;},
  s=>{s.companies.NEON.lastAction={kind:'split',ratio:2,day:999};},
  s=>{s.companies.NEON.sharesOutstanding=3;},
  s=>{s.companies.NEON.fundamentals.revenue=-5;}
 ];
 for(const modify of invalid){const v=copy(base);modify(v);assert.equal(h.normalize(v),null)}
 const opened=h.placeOptionOrder({ticker:'NEON',type:'put',side:'long',qty:1,strike:4600,days:7});
 assert.equal(opened.ok,true);
 const corrupt=copy(h.getState());corrupt.options[0].contractShares=17.5;
 assert.equal(h.normalize(corrupt),null);
 const obligation=copy(h.getState());obligation.options[0].exerciseCents=300;
 assert.equal(h.normalize(obligation),null);
});


test('automatic reverse split is triggered by low prices and restates history',()=>{
 const h=createHarness(),s=h.getState(),q=h.quote('BYTE');
 s.day=100;q.price=.5;q.previous=.5;q.history=q.history.map(()=>.5);
 h.tick();
 assert.equal(q.lastAction?.kind,'reverse');
 assert.equal(q.lastAction?.ratio,2);
 assert.equal(q.history.at(-1),q.price);
 assert.equal(q.publicFloat,27000000);
 assert.deepEqual(copy(h.normalize(copy(h.normalize(copy(s))))),copy(h.normalize(copy(s))));
});

test('25,000-session economy remains reloadable, bounded, and split-aware',()=>{
 const h=createHarness();
 for(let i=0;i<25000;i++)h.tick();
 const state=copy(h.getState());
 assert.equal(state.day,25001);
 let totalActions=0;
 for(const ticker of ['NEON','HARB','MISO','VOLT','AERO','BYTE']){
  const q=state.companies[ticker];
  assert.ok(q.price>=.01&&q.price<=10000,ticker+' price out of bounds');
  assert.ok(q.sharesOutstanding>=q.publicFloat&&q.publicFloat>=100,
   ticker+' invalid share structure');
  assert.ok(Number.isSafeInteger(q.sharesOutstanding)&&Number.isSafeInteger(q.publicFloat));
  assert.equal(q.history.at(-1),q.price);
  assert.equal(q.history.length,520);
  assert.ok(q.fundamentals.revenue>=0&&Number.isSafeInteger(q.fundamentals.revenue));
  assert.ok(q.fundamentals.quarterCount>=300,'Quarterly reports stopped for '+ticker);
  totalActions+=q.splitCount;
 }
 assert.ok(totalActions>0,'A century of market history should generate corporate actions');
 const restored=copy(h.normalize(state));
 assert.ok(restored,'Long-running saves must not be rejected by the loader');
 assert.deepEqual(copy(h.normalize(restored)),restored);
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
