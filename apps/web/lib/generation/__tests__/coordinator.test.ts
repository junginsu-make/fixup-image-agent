import { describe, it, expect, vi } from "vitest";
import { advanceQueueAttempt } from "../coordinator";

describe("durable provider execution", () => {
  it("keeps cost unknown after explicit provider failure and never stores a success image",async()=>{
    const attempt={id:"a",state:"submitted",endpoint:"server-endpoint",provider_request_id:"known-id"} as never;
    const store={advance:vi.fn(async()=>attempt)};
    const queue={submitJob:vi.fn(),jobStatus:vi.fn(async()=>"completed"),jobResult:vi.fn(async()=>({images:[],failed:true}))};
    const save=vi.fn();
    await advanceQueueAttempt(attempt,store as never,queue as never,save);
    expect(store.advance).toHaveBeenCalledWith("a",{state:"failed",errorCode:"provider_result_failed",meteringState:"unknown"});
    expect(save).not.toHaveBeenCalled();expect(queue.submitJob).not.toHaveBeenCalled();
  });
  it("persists submitting before sending and never resubmits an ambiguous request", async () => {
    const calls: string[]=[];
    const attempt={id:"a",state:"prepared",endpoint:"server-endpoint",request_payload:{prompt:"server input"}} as never;
    const store={advance:vi.fn(async (_id:string,patch:{state:string})=>{calls.push(patch.state);Object.assign(attempt,{state:patch.state});return attempt;})};
    const queue={submitJob:vi.fn(async()=>{calls.push("provider");throw new Error("network lost");})};
    await advanceQueueAttempt(attempt,store as never,queue as never,async()=>({}));
    expect(calls).toEqual(["submitting","provider","unknown"]);
    await advanceQueueAttempt(attempt,store as never,queue as never,async()=>({}));
    expect(queue.submitJob).toHaveBeenCalledTimes(1);
  });
  it("retries result storage without another provider submission",async()=>{
    const attempt={id:"a",state:"result_ready",endpoint:"server-endpoint",output_manifest:{images:[{url:"https://example.invalid/image"}]}} as never;
    const store={advance:vi.fn(async()=>attempt)};
    const queue={submitJob:vi.fn(),jobStatus:vi.fn(),jobResult:vi.fn()};
    const save=vi.fn().mockRejectedValueOnce(new Error("storage down")).mockResolvedValueOnce({deliveredImages:1,output:{path:"stored"}});
    await expect(advanceQueueAttempt(attempt,store as never,queue as never,save)).rejects.toThrow("storage down");
    await advanceQueueAttempt(attempt,store as never,queue as never,save);
    expect(queue.submitJob).not.toHaveBeenCalled();expect(queue.jobResult).not.toHaveBeenCalled();
    expect(store.advance).toHaveBeenCalledWith("a",{state:"stored",deliveredImages:1,output:{path:"stored"}});
  });
});
