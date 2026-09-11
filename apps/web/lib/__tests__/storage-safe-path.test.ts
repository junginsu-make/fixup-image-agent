import {it,expect} from "vitest";
import {assertStoragePath} from "../storage/safe-path";
it("rejects bucket traversal, URL control characters and encoded separators",()=>{
  for(const path of ["../generation-internal/x","owner/../../other","owner/%2e%2e/x","owner\\x","/owner/x","owner/x?bucket=secret","owner//x"])
    expect(()=>assertStoragePath(path)).toThrow();
  expect(()=>assertStoragePath("owner/sns/project/run/1.png")).not.toThrow();
  expect(()=>assertStoragePath("",true)).not.toThrow();
});
