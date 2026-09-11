import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('../packages/ingest-core/node_modules/playwright');
const {reply}=require('./fixtures/security-supabase.cjs');
const root=path.resolve(process.argv[2]??'dist/ec2');
const origin='https://studio.example.test';
assert.equal(JSON.parse(readFileSync(path.join(root,'RELEASE_INFO.json'),'utf8')).publicSiteOrigin,origin,'Use only the isolated security build.');
const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const child=spawn(process.execPath,['-r',path.resolve('scripts/fixtures/security-supabase.cjs'),'server.js'],{cwd:path.join(root,'apps/web'),stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),CSP_MODE:'enforce',SUPABASE_SECRET_KEY:'fixture-only'}});
let serverLog='';child.stdout.on('data',b=>{serverLog=(serverLog+b).slice(-8000);});child.stderr.on('data',b=>{serverLog=(serverLog+b).slice(-8000);});
let browser;
try{
  for(let i=0;;i++){
    try{if((await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}
    if(i>=120||child.exitCode!==null)throw new Error('Security runtime startup failed');await new Promise(r=>setTimeout(r,250));
  }
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();const authCalls=[];const pageErrors=[];
  await context.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',event=>window.__csp.push({directive:event.effectiveDirective,blocked:event.blockedURI,disposition:event.disposition}));});
  await context.route('**/*',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.origin===origin){
      const response=await route.fetch({url:`http://127.0.0.1:${port}${url.pathname}${url.search}`,headers:{...request.headers(),host:url.host},maxRedirects:0});return route.fulfill({response});
    }
    if(url.hostname==='supabase.example.test'){
      authCalls.push({path:url.pathname,method:request.method(),body:request.postDataJSON()});return route.fulfill(reply(url,request.method()));
    }
    if(url.hostname==='challenges.cloudflare.com'){
      if(url.pathname.endsWith('/api.js'))return route.fulfill({contentType:'application/javascript',body:`window.turnstile={render(el,options){el.dataset.fixtureWidget='ready';const frame=document.createElement('iframe');frame.src='https://challenges.cloudflare.com/fixture';el.append(frame);options.callback('fixture-captcha');return 'widget';},remove(){}};`});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Challenge fixture</title>'});
    }
    return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
  async function go(route){const response=await page.goto(origin+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,route);return response;}
  async function healthy(){await page.waitForTimeout(100);for(const frame of page.frames())assert.deepEqual(await frame.evaluate(()=>window.__csp??[]),[],`Unexpected CSP violations: ${frame.url()}`);assert.deepEqual(pageErrors,[]);}
  await go('/signup');await page.locator('[data-fixture-widget=ready]').waitFor();
  await page.locator('#email').fill('security@example.test');await page.locator('#password').fill('fixture-password-123');await page.locator('input[type=password]').nth(1).fill('fixture-password-123');
  await page.locator('button[type=submit]').click();await page.getByText('메일함을 확인해 주세요',{exact:true}).waitFor();await healthy();
  assert.equal(authCalls.find(c=>c.path==='/auth/v1/signup').body.gotrue_meta_security.captcha_token,'fixture-captcha');
  await go('/forgot-password');await page.locator('[data-fixture-widget=ready]').waitFor();await page.locator('#email').fill('security@example.test');await page.locator('button[type=submit]').click();await page.getByText('계정이 존재하면 재설정 메일이 발송됩니다.').waitFor();await healthy();
  await page.goto(origin+'/auth/confirm?token_hash=fixture&type=recovery&next=%2Freset-password',{waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/reset-password');await page.locator('#password').fill('new-fixture-password-123');await page.locator('#confirm').fill('new-fixture-password-123');await page.locator('button[type=submit]').click();await page.waitForURL(url=>['/login','/guide'].includes(url.pathname));await healthy();assert.ok(authCalls.some(c=>c.path==='/auth/v1/user'&&c.method==='PUT'));
  await context.clearCookies();await go('/login');await page.locator('[data-fixture-widget=ready]').waitFor();
  await page.locator('#email').fill('security@example.test');await page.locator('#password').fill('fixture-password-123');await page.locator('button[type=submit]').click();await page.waitForURL('**/guide');await healthy();
  const first=await go('/guide');const nonce=/nonce-([^']+)/.exec(first.headers()['content-security-policy'])?.[1];assert.ok(nonce);
  assert.ok(await page.locator('script').evaluateAll(scripts=>scripts.filter(s=>!s.src).every(s=>Boolean(s.nonce))));
  const second=await go('/guide');assert.notEqual(first.headers()['content-security-policy'],second.headers()['content-security-policy']);await healthy();
  await go('/admin/cost-lab');const frame=page.frameLocator('iframe[title="비용 전략실"]');await frame.locator('body').waitFor();await frame.locator('a[href="prepaid.html"]').first().click();await frame.locator('#wallet-main-inputs input').first().waitFor();
  const input=frame.locator('#wallet-main-inputs input').first();await input.fill('123');await input.dispatchEvent('input');assert.notEqual(await frame.locator('#wallet-profit').innerText(),'—');await healthy();
  await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.__untrustedRan=true';document.body.append(script);});await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.__untrustedRan),undefined);assert.ok((await page.evaluate(()=>window.__csp)).some(v=>v.disposition==='enforce'&&v.blocked==='inline'));
  console.log('T24 browser enforcement passed: signup, recovery, login, fresh nonces, theme bootstrap, cost calculator and injected-script denial. Auth and Turnstile transports are fixtures; no real mail or AI calls.');
}catch(error){console.error(serverLog);throw error;}
finally{await browser?.close();if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,5000))]);}if(child.exitCode===null)child.kill('SIGKILL');}
