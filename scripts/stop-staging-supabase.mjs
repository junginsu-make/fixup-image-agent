import { realpath,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.env.CI,'true');
if(process.env.STAGING_STACK_ROOT){
  const target=await realpath(process.env.STAGING_STACK_ROOT);const parent=await realpath(tmpdir());
  assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('fixup-supabase-staging-'));
  execFileSync('supabase',['stop','--workdir',target,'--no-backup'],{stdio:'ignore'});
  await rm(target,{recursive:true});
}
