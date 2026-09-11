import {it,expect} from "vitest";
import {ExecutionControlError} from "@fixup/shared";
import {groupAttachments} from "../attachments";
import {writeImagePrompt} from "../image-prompt";
it("does not replace an executor pause with an empty scene prompt",async()=>{
  const pause=new ExecutionControlError("execution_yield");
  await expect(writeImagePrompt({role:"body",copy:{index:1,headline:"test"},plan:{index:1,role:"body",intent:"test",visualBrief:"test"},
    grouped:groupAttachments([]),size:{width:1000,height:1000},language:"ko"},{generate:async()=>{throw pause;}})).rejects.toBe(pause);
});
