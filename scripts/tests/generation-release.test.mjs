import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec=promisify(execFile);
test('rollback refuses an incompatible release before touching the running web service',async()=>{
  const script=`source deploy/ec2/generation-release.sh
generation_compatible() { return 1; }
ln() { echo unsafe_symlink_change; return 1; }
systemctl() { echo unsafe_service_change; return 1; }
generation_restore_previous /unsupported-release
code=$?
[[ $code -eq 1 ]]
`;
  const {stdout,stderr}=await exec(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash',['-c',script],{cwd:fileURLToPath(new URL('../..',import.meta.url))});
  assert.equal(stdout,'');assert.match(stderr,/Refusing to restore an incompatible V1 application/);
});
