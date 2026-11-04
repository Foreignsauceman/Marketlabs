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
  const statuses=[...document.querySelectorAll('iframe')].map(frame=>{
   try{
    const doc=frame.contentDocument;
    return (doc?.getElementById('sessionHeading')?.textContent||'no-heading')+
     '/hidden='+String(doc?.getElementById('sessionNotice')?.hidden)+
     '/day='+String(doc?.getElementById('day')?.textContent)+
     '/nextDisabled='+String(doc?.getElementById('next')?.disabled);
   }catch(e){return 'frame-error:'+e.message}
  }).join('|');
  throw Error(name+' timed out; '+statuses);
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

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function openDevtools(url){
 const socket=new WebSocket(url);
 const waiting=new Map();
 let sequence=0;
 socket.addEventListener('message',event=>{
  let message;
  try{message=JSON.parse(event.data)}catch{return}
  if(!message.id)return;
  const pending=waiting.get(message.id);
  if(!pending)return;
  waiting.delete(message.id);
  if(message.error)pending.reject(Error(message.error.message||'DevTools protocol error'));
  else pending.resolve(message.result||{});
 });
 await new Promise((resolve,reject)=>{
  socket.addEventListener('open',resolve,{once:true});
  socket.addEventListener('error',reject,{once:true});
 });
 return{
  async send(method,params={},sessionId){
   const id=++sequence;
   return new Promise((resolve,reject)=>{
    waiting.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
   });
  },
  close(){socket.close()}
 };
}
test('two same-origin browser sessions use one editor, live updates, and safe handoff',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'marketlab-multitab-'));
 const probeFile=join(dir,'probe.html');writeFileSync(probeFile,probe);
 const server=spawn(process.execPath,[join(root,'scripts/test-http-server.mjs'),probeFile],{stdio:['ignore','pipe','pipe']});
 let chrome=null,devtools=null;
 try{
  const port=await new Promise((resolve,reject)=>{
   let out='';
   const timeout=setTimeout(()=>reject(Error('Test HTTP server not ready')),10000);
   server.stdout.on('data',chunk=>{
    out+=chunk.toString();
    const match=out.match(/PORT:(\\d+)/);
    if(match){clearTimeout(timeout);resolve(Number(match[1]))}
   });
   server.on('error',reject);
   server.on('exit',code=>reject(Error('Test server exited with code '+code)));
  });
  // Unlike Chrome --virtual-time-budget, DevTools polling uses actual time.
  // Web Locks callbacks are asynchronous browser-service operations.
  chrome=spawn(chromeBinary(),[
   '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--disable-background-networking','--disable-extensions',
   '--disable-background-timer-throttling','--disable-renderer-backgrounding',
   '--no-first-run','--remote-debugging-address=127.0.0.1',
   '--remote-debugging-port=0','--window-size=1200,900',
   '--user-data-dir='+join(dir,'chrome-profile'),'about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  const websocketUrl=await new Promise((resolve,reject)=>{
   let out='';
   const timeout=setTimeout(()=>reject(Error('Chrome DevTools did not start: '+out.slice(-400))),12000);
   chrome.stderr.on('data',chunk=>{
    out+=chunk.toString();
    const found=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if(found){clearTimeout(timeout);resolve(found[1])}
   });
   chrome.on('error',reject);
   chrome.on('exit',code=>reject(Error('Chrome exited with code '+code+': '+out.slice(-400))));
  });
  devtools=await openDevtools(websocketUrl);
  const target=await devtools.send('Target.createTarget',{url:'http://127.0.0.1:'+port+'/probe.html'});
  const attached=await devtools.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  const sessionId=attached.sessionId;
  await devtools.send('Runtime.enable',{},sessionId);
  const deadline=Date.now()+30000;
  let result='',error='';
  while(Date.now()<deadline){
   const report=await devtools.send('Runtime.evaluate',{
    expression:'[document.documentElement.getAttribute("data-multitab-test"),document.documentElement.getAttribute("data-multitab-error")]',
    returnByValue:true
   },sessionId);
   const attrs=report.result?.value;
   if(Array.isArray(attrs)){
    result=attrs[0]||'';error=attrs[1]||'';
    if(result==='PASS'||result==='FAIL')break;
   }
   await pause(120);
  }
  assert.equal(result,'PASS','Two-tab browser regression: '+(error||'Timed out'));
 }finally{
  try{devtools?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  server.kill('SIGTERM');
  rmSync(dir,{recursive:true,force:true});
 }
});
