import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]??'dist/ec2');
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const child=spawn(process.execPath,['server.js'],{
  cwd:path.join(root,'apps/web'),stdio:'ignore',
  env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),ANTHROPIC_API_KEY:'',GENERATION_EXECUTOR_SECRET:''},
});
let launchError;child.on('error',error=>{launchError=error;});
const origin=`http://127.0.0.1:${port}`;
try {
  const deadline=Date.now()+45000;
  for(;;){
    if(launchError)throw launchError;
    if(child.exitCode!==null)throw new Error('Standalone runtime exited before readiness.');
    try { const response=await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(1000)});if(response.status===200)break; } catch { /* startup */ }
    if(Date.now()>deadline)throw new Error('Standalone liveness timeout.');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  const ready=await fetch(`${origin}/api/health/ready`);
  assert.equal(ready.status,503); // Missing provider configuration must not claim readiness.
  assert.deepEqual(Object.keys(await ready.json()).sort(),['ok','status']);
  const internal=await fetch(`${origin}/api/internal/generation/tick`);
  assert.equal(internal.status,404);
  assert.ok(internal.headers.has('content-security-policy'));
  console.log('Packaged Linux runtime: liveness, private readiness response and unauthenticated executor denial passed.');
} finally {
  if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);}
  if(child.exitCode===null)child.kill('SIGKILL');
}
