import {it,expect,vi} from "vitest";
import {withIssueFallback} from "../provider-fallback";
it("does not turn an executor pause or uncertain outcome into another paid provider call",async()=>{
  const pause=Object.assign(new Error("pause"),{generationControl:true});
  const backup=vi.fn(async()=>"charged twice");
  await expect(withIssueFallback(async()=>{throw pause;},backup,{primaryFailure:"primary",backupMissing:"missing",backupFailure:"backup",backupSuccess:"fallback"})).rejects.toBe(pause);
  expect(backup).not.toHaveBeenCalled();
});
