import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,realpath,rm,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('packaged helper calls loopback with release and server-secret authentication',async()=>{
  const parent=await realpath(tmpdir());const root=await mkdtemp(path.join(parent,'fixup-generation-helper-'));
  const releaseId='a'.repeat(40);const secret='secret'.repeat(10);const calls=[];
  const server=createServer((request,response)=>{
    calls.push({url:request.url,headers:request.headers,method:request.method});
    request.resume();response.setHeader('content-type','application/json');response.end(JSON.stringify({ok:true,protocol:2,schemaVersion:31,releaseId,executorFresh:true,processed:false}));
  });
  try{
    await mkdir(path.join(root,'ops'));await copyFile(new URL('../../deploy/ec2/generation-tick.mjs',import.meta.url),path.join(root,'ops/generation-tick.mjs'));
    await writeFile(path.join(root,'RELEASE_INFO.json'),JSON.stringify({releaseId,generationProtocol:2,generationSchemaVersion:31,generationSchemaMin:31,generationSchemaMax:31}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const env={...process.env,GENERATION_EXECUTOR_SECRET:secret,GENERATION_INTERNAL_PORT:String(server.address().port)};
    const helper=path.join(root,'ops/generation-tick.mjs');
    const first=await exec(process.execPath,[helper],{env});const check=await exec(process.execPath,[helper,'--check'],{env});
    assert.equal(calls[0].url,'/api/internal/generation/tick');assert.equal(calls[0].method,'POST');assert.equal(calls[1].method,'GET');
    assert.equal(calls[0].headers.authorization,`Bearer ${secret}`);assert.equal(calls[0].headers['x-generation-release'],releaseId);
    assert.equal(calls[0].headers.cookie,undefined);assert.ok(!`${first.stdout}${first.stderr}${check.stdout}${check.stderr}`.includes(secret));
  }finally{
    await new Promise(resolve=>server.close(resolve));
    const target=await realpath(root);assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('fixup-generation-helper-'));await rm(target,{recursive:true});
  }
});
