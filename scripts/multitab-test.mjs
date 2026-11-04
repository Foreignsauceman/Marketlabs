import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const probe=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MarketLab dual editor test</title></head><body>
<p>Testing simultaneous same-origin browser sessions.</p>
<script>
(async()=>{
 const $=id=>document.getElementById(id);
 const KEY='marketlab.tiny-exchange.v2';
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(v,message)=>{if(!v)throw Error(message)};
 const wait=async(fn,name,limit=11500)=>{
  const start=Date.now();
  while(Date.now()-start<limit){try{if(fn())return}catch{}await sleep(85)}
  throw Error(name+' timed out');
 };
 const open=()=>new Promise((resolve,reject)=>{
  const iframe=document.createElement('iframe');iframe.src='/index.html';
  iframe.style.width='390px';iframe.style.height='500px';
  iframe.onload=()=>resolve(iframe);iframe.onerror=()=>reject(Error('Could not load app frame'));
  document.body.append(iframe);
 });
 const elem=(f,id)=>f.contentDocument.getElementById(id);
 try{
  assert(!!navigator.locks&&window.isSecureContext,'Web Locks are not available on localhost');
  const a=await open();
  await wait(()=>elem(a,'sessionNotice')?.hidden===true,'first writer');
  assert(!elem(a,'next').disabled,'First tab cannot advance market');
  const b=await open();
  await wait(()=>elem(b,'sessionNotice')?.hidden===false &&
    elem(b,'sessionHeading').textContent==='VIEW-ONLY SESSION','second follower');
  assert(elem(b,'execute').disabled,'Follower trade button should be disabled');
  assert(elem(b,'next').disabled,'Follower market time controls should be disabled');
  assert(elem(b,'chooseImport').disabled,'Follower import must be disabled');
  elem(a,'next').click();
  await wait(()=>elem(a,'day').textContent==='002'&&elem(b,'day').textContent==='002',
    'follower live refresh');
  const expected=localStorage.getItem(KEY);
  elem(b,'next').click();
  assert(localStorage.getItem(KEY)===expected,'Read-only follower overwrote market');
  // Simulate the actual browser pagehide lifecycle before tearing down a frame.
  // Some headless Chromium builds do not dispatch pagehide on iframe.remove().
  a.contentWindow.dispatchEvent(new Event('pagehide'));
  a.remove();
  await wait(()=>elem(b,'sessionNotice').hidden===true && !elem(b,'next').disabled,
    'second tab automatic takeover',12500);
  elem(b,'next').click();
  await wait(()=>JSON.parse(localStorage.getItem(KEY)).day===3,'promoted writer save');
  assert(elem(b,'day').textContent==='003','Promoted writer UI day is stale');
  // Simulate a legacy/old-version tab writing without respecting Web Locks.
  const foreign=JSON.parse(localStorage.getItem(KEY));
  foreign.day=4;
  localStorage.setItem(KEY,JSON.stringify(foreign));
  await wait(()=>elem(b,'sessionHeading').textContent==='SAVE CONFLICT DETECTED',
    'foreign writer conflict detection');
  assert(elem(b,'next').disabled,'Conflict did not pause editor');
  const stable=localStorage.getItem(KEY);
  elem(b,'next').click();
  assert(localStorage.getItem(KEY)===stable,'Conflict tab overwrote external portfolio');
  assert(foreign.day===4,'Unexpected external state');
  document.documentElement.setAttribute('data-multitab-test','PASS');
 }catch(e){
  document.documentElement.setAttribute('data-multitab-test','FAIL');
  document.documentElement.setAttribute('data-multitab-error',(e?.message||String(e)).slice(0,200));
 }
})();
</script></body></html>`;

function chromeBinary(){
 for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  const found=spawnSync('which',[name],{encoding:'utf8'});
  if(found.status===0)return found.stdout.trim();
 }
 throw Error('Headless Chrome unavailable');
}
test('two same-origin browser sessions use one editor, live updates, and safe handoff',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'marketlab-multitab-'));
 const probeFile=join(dir,'probe.html');writeFileSync(probeFile,probe);
 const child=spawn(process.execPath,[join(root,'scripts/test-http-server.mjs'),probeFile],{stdio:['ignore','pipe','pipe']});
 try{
  const port=await new Promise((resolve,reject)=>{
   let out='';
   const deadline=setTimeout(()=>reject(Error('Test HTTP server not ready')),10000);
   child.stdout.on('data',chunk=>{out+=chunk.toString();const found=out.match(/PORT:(\d+)/);if(found){clearTimeout(deadline);resolve(Number(found[1]))}});
   child.on('error',reject);
   child.on('exit',code=>reject(Error('Test server exited with code '+code)));
  });
  const chrome=chromeBinary();
  const result=spawnSync(chrome,[
   '--headless=new','--no-sandbox','--disable-gpu',
   '--disable-background-networking','--disable-dev-shm-usage','--no-first-run',
   '--disable-extensions','--virtual-time-budget=23000','--window-size=1200,900',
   '--user-data-dir='+join(dir,'chrome-profile'),'--dump-dom',
   'http://127.0.0.1:'+port+'/probe.html'
  ],{encoding:'utf8',timeout:45000,maxBuffer:3_000_000});
  assert.equal(result.status,0,'Chrome failed: '+(result.stderr||'').slice(-400));
  const rootTag=result.stdout.match(/<html\b[^>]*>/)?.[0]||'';
  assert.match(rootTag,/data-multitab-test="PASS"/,'Two-tab regression failed: '+rootTag);
 }finally{
  child.kill('SIGTERM');
  rmSync(dir,{recursive:true,force:true});
 }
});
