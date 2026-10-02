import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const helperPath=path.join(root,'deploy/ec2/release-recovery.sh');

function run(scenario,script='deploy-release.sh'){
  const source=readFileSync(path.join(root,'deploy/ec2',script),'utf8').replaceAll('\r\n','\n');
  const begin=source.includes('# BEGIN RELEASE SWITCH')?source.indexOf('# BEGIN RELEASE SWITCH'):source.indexOf('bash "$(dirname "$0")/sync-static.sh" "${release_root}" "${release_id}"');
  const end=source.includes('# END RELEASE SWITCH')?source.indexOf('# END RELEASE SWITCH'):source.indexOf('# 워커는 웹이 건강한 것을 본 뒤에 넘긴다.');
  assert.ok(begin>=0&&end>begin);
  const helper=existsSync(helperPath)?readFileSync(helperPath,'utf8').replaceAll('\r\n','\n'):'';
  const harness=`set -euo pipefail
scenario="$1"
release_root=/fixture/new
release_id=new
current_link=/fixture/app/current
previous_release=/tmp
static_link=/fixture/static/current
previous_static=/tmp
ops_dir=/fixture/ops
restart_attempted=false
APP_CURRENT=old
STATIC_CURRENT=old
RESTARTS=0
HEALTH_CALLS=0
trap 'rc=$?; printf "STATE app=%s static=%s restarts=%s health=%s exit=%s\\n" "$APP_CURRENT" "$STATIC_CURRENT" "$RESTARTS" "$HEALTH_CALLS" "$rc"' EXIT
bash(){
  if [[ $scenario == static_failure && $2 == /fixture/new ]]; then return 1; fi
  STATIC_CURRENT="$2"
}
ln(){
  if [[ $3 == "$static_link" ]]; then STATIC_CURRENT="$2"; else APP_CURRENT="$2"; fi
}
systemctl(){
  RESTARTS=$((RESTARTS+1))
  if [[ $scenario == restart_failure && $RESTARTS == 1 ]]; then return 1; fi
  if [[ $scenario == rollback_restart_failure && $RESTARTS == 2 ]]; then return 1; fi
  return 0
}
curl(){
  HEALTH_CALLS=$((HEALTH_CALLS+1))
  if [[ $scenario == app_failure && $APP_CURRENT == /fixture/new ]]; then return 1; fi
  if [[ ( $scenario == readiness_failure || $scenario == rollback_restart_failure || $scenario == rollback_health_failure ) && $APP_CURRENT == /fixture/new && $* == *'/ready'* ]]; then return 1; fi
  if [[ $scenario == rollback_health_failure && $APP_CURRENT == /tmp ]]; then return 1; fi
  return 0
}
sleep(){ :; }
`;
  const result=spawnSync(bash,['-s','--',scenario],{input:harness+helper+'\n'+source.slice(begin,end),encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);return {code:result.status,output:result.stdout+result.stderr};
}
test('normal release remains active without a recovery restart',()=>{
  const r=run('healthy');assert.equal(r.code,0);assert.match(r.output,/app=\/fixture\/new static=\/fixture\/new restarts=1/);
});
test('restart command failure restores both pointers and verifies the restored service',()=>{
  const r=run('restart_failure');assert.equal(r.code,1);assert.match(r.output,/app=\/tmp static=\/tmp restarts=2/);assert.match(r.output,/health=2/);assert.match(r.output,/Previous release restored/);
});
test('app and readiness failures still restore both pointers',()=>{
  for(const scenario of ['app_failure','readiness_failure']){const r=run(scenario);assert.equal(r.code,1);assert.match(r.output,/app=\/tmp static=\/tmp restarts=2/);assert.match(r.output,/Previous release restored/);}
});
test('recovery restart or health failure cannot be announced as a successful recovery',()=>{
  for(const scenario of ['rollback_restart_failure','rollback_health_failure']){const r=run(scenario);assert.equal(r.code,1);assert.doesNotMatch(r.output,/Previous release restored/);assert.match(r.output,/RECOVERY FAILED/);}
});
test('manual rollback uses the same recovery guarantee',()=>{
  const r=run('restart_failure','rollback-release.sh');assert.equal(r.code,1);assert.match(r.output,/app=\/tmp static=\/tmp restarts=2/);assert.match(r.output,/Previous release restored/);
});
