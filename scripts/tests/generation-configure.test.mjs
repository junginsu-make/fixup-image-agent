import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,realpath,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
test('deployment configuration creates a private secret without printing it and preserves existing settings',async()=>{
  const parent=await realpath(tmpdir());const root=await mkdtemp(path.join(parent,'fixup-generation-configure-'));
  const calls=[];const server=createServer((request,response)=>{
    calls.push(request.url);request.resume();response.setHeader('content-type','application/json');
    response.end(JSON.stringify(request.url.endsWith('pause_generation_for_deploy')?{pauseId:'pause',wasEnabled:false,activeLegacy:0}:request.url.endsWith('generation_runtime_status')?{admissionEnabled:false,activeInline:0}:true));
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const config=path.join(root,'app.env');const manifest=path.join(root,'RELEASE_INFO.json');const state=path.join(root,'pause.json');
    await writeFile(config,`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${server.address().port}\nSUPABASE_SECRET_KEY=fake\nKEEP_THIS=unchanged\n`);
    await writeFile(manifest,JSON.stringify({generationProtocol:2,generationSchemaVersion:31,generationSchemaMin:31,generationSchemaMax:31,releaseId:'a'.repeat(40)}));
    const helper=fileURLToPath(new URL('../../deploy/ec2/configure-generation.mjs',import.meta.url));
    const env={...process.env,NODE_ENV:'test',GENERATION_ENV_FILE:config};
    const outputs=[];
    for(const mode of ['--pause','--drain','--resume'])outputs.push(await exec(process.execPath,[helper,mode,manifest,state],{env}));
    const saved=await readFile(config,'utf8');const secret=/^GENERATION_EXECUTOR_SECRET=([a-f0-9]{64})$/m.exec(saved)?.[1];
    assert.ok(secret);assert.match(saved,/KEEP_THIS=unchanged/);assert.equal((saved.match(/GENERATION_EXECUTOR_SECRET=/g)||[]).length,1);
    assert.ok(!outputs.map(o=>o.stdout+o.stderr).join('').includes(secret));assert.equal(calls.length,3);
  }finally{
    await new Promise(resolve=>server.close(resolve));const target=await realpath(root);assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('fixup-generation-configure-'));await rm(target,{recursive:true});
  }
});
