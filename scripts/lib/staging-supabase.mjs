import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function stagingSupabase(){
  assert.equal(process.env.CI,'true','Disposable stack tests run only on CI.');
  assert.ok(process.env.STAGING_STATUS_FILE,'Missing disposable stack status.');
  const status=JSON.parse(await readFile(process.env.STAGING_STATUS_FILE,'utf8'));
  const base=new URL(status.API_URL);const db=new URL(status.DB_URL);
  assert.equal(base.hostname,'127.0.0.1');assert.equal(db.hostname,'127.0.0.1');
  async function request(route,{key=status.SERVICE_ROLE_KEY,method='GET',body,headers={}}={}){
    return fetch(new URL(route,base),{method,headers:{apikey:key===status.SERVICE_ROLE_KEY?status.SERVICE_ROLE_KEY:status.ANON_KEY,authorization:`Bearer ${key}`,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
  }
  async function json(route,options){const response=await request(route,options);if(!response.ok)throw new Error(`Disposable API ${route.split('?')[0]}: ${response.status} ${await response.text()}`);const text=await response.text();return text?JSON.parse(text):null;}
  return {status,base,db,request,json};
}
