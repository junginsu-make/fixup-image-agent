import { spawnSync } from 'node:child_process';
for (const [mutation, pattern, evidence] of [
  ['duplicate','duplicate finalization','reserved_units'],
  ['expiry','expired lots protect','credit_settlement_invariant'],
  ['blocking','abandoned reservation','abandoned_reservation_must_not_block'],
]) {
  const result=spawnSync(process.execPath,['--test',`--test-name-pattern=${pattern}`,'scripts/tests/credit-ledger.test.mjs'],{
    cwd:new URL('../..',import.meta.url),windowsHide:true,encoding:'utf8',env:{...process.env,CREDIT_TEST_MUTATION:mutation},
  });
  const output=(result.stdout??'')+(result.stderr??'');
  if(result.status!==1 || !output.includes(evidence)) throw new Error(`Mutation ${mutation} did not fail as expected:\n${output}`);
  process.stdout.write(`Detected ${mutation} mutation in disposable PostgreSQL.\n`);
}
