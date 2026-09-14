import { mkdtemp,readFile,readdir,writeFile,copyFile,mkdir,appendFile,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
assert.equal(process.env.CI,'true');assert.ok(process.env.GITHUB_ENV);assert.ok(!process.env.SUPABASE_ACCESS_TOKEN,'Do not use a production management token.');
const parent=await realpath(tmpdir());const root=await mkdtemp(path.join(parent,'fixup-supabase-staging-'));
await appendFile(process.env.GITHUB_ENV,`STAGING_STACK_ROOT=${root}\n`);
await exec('supabase',['init','--workdir',root,'--yes']);
const configFile=path.join(root,'supabase/config.toml');let config=await readFile(configFile,'utf8');
config=config.replace(/^site_url\s*=.*$/m,'site_url = "https://studio.example.test:8443"').replace(/^additional_redirect_urls\s*=.*$/m,'additional_redirect_urls = ["https://studio.example.test:8443/**"]');
config=config.replace(/(\[auth.email\][\s\S]*?enable_confirmations\s*=\s*)false/,'$1true');
await writeFile(configFile,config);
const source=path.resolve('supabase/migrations');const files=(await readdir(source)).filter(name=>/^\d{12,14}_.*\.sql$/.test(name)).sort();
await mkdir(path.join(root,'supabase/migrations'),{recursive:true});
for(const file of files.filter(name=>name.split('_')[0]<'202609110010'))await copyFile(path.join(source,file),path.join(root,'supabase/migrations',file));
try{await exec('supabase',['start','--workdir',root,'--exclude','studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta'],{maxBuffer:32*1024*1024});}
catch(error){console.error(String(error.stderr??'').slice(-12000));throw new Error('Disposable Supabase startup failed.');}
const {stdout}=await exec('supabase',['status','--workdir',root,'--output','json']);const status=JSON.parse(stdout);
const statusFile=path.join(root,'status.json');await writeFile(statusFile,stdout,{mode:0o600});process.env.STAGING_STATUS_FILE=statusFile;await appendFile(process.env.GITHUB_ENV,`STAGING_STATUS_FILE=${statusFile}\n`);
const db=new URL(status.DB_URL);assert.equal(db.hostname,'127.0.0.1');
const env={...process.env,PGHOST:db.hostname,PGPORT:db.port,PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:db.pathname.slice(1)};
await exec('psql',['-X','-v','ON_ERROR_STOP=1','-c','ALTER TABLE public.profiles ALTER COLUMN monthly_quota SET DEFAULT 30;'],{env});
let red=false;
try{await exec(process.execPath,['scripts/staging-http-boundaries.mjs'],{env});}
catch(error){red=/AUTHENTICATED_DATA_WRITE_STATUS=(200|204)/.test(error.stdout??'');if(!red)throw error;console.log('RED: actual authenticated HTTP can overwrite server execution data before hardening.');}
assert.ok(red,'The baseline must reproduce the authorization defect.');
for(const file of files.filter(name=>name.split('_')[0]>='202609110010'))await exec('psql',['-X','-v','ON_ERROR_STOP=1','-f',path.join(source,file)],{env,maxBuffer:16*1024*1024});
const result=await exec(process.execPath,['scripts/staging-http-boundaries.mjs'],{env});console.log(result.stdout);
console.log('Disposable Supabase migration and HTTP RED-to-GREEN complete. Production was not connected.');
