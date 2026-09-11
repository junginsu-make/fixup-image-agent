import { describe, expect, it, vi } from "vitest";
import { createFalQueueClient } from "../queue";
import { ApiError } from "@fal-ai/client";

it("keeps explicit provider result failures distinct from a temporary lookup outage",async()=>{
  const result=vi.fn().mockRejectedValueOnce(new ApiError({status:422,message:"generation rejected"})).mockResolvedValueOnce({data:{error:"generation failed",images:[{url:"https://invalid/partial"}]}}).mockRejectedValueOnce(new ApiError({status:503,message:"try later"}));
  const queue=createFalQueueClient("key",()=>({queue:{result}} as never));
  expect(await queue.jobResult("endpoint","id")).toEqual({images:[],failed:true});
  expect(await queue.jobResult("endpoint","id")).toEqual({images:[],failed:true});
  await expect(queue.jobResult("endpoint","id")).rejects.toThrow("try later");
});

describe("공용 fal queue", () => {
  it("자동 재시도 없이 한 번 제출하고 requestId를 즉시 돌려준다", async () => {
    const submit = vi.fn(async () => ({
      status: "IN_QUEUE", request_id: "fal-1", queue_position: 0,
      status_url: "https://queue/status/fal-1", response_url: "https://queue/result/fal-1", cancel_url: "https://queue/cancel/fal-1",
    }));
    const config: unknown[] = [];
    const queue = createFalQueueClient("key", (value) => {
      config.push(value);
      return { queue: { submit, status: vi.fn(), result: vi.fn() } } as never;
    });

    const result = await queue.submitJob("openai/gpt-image-2/edit", { prompt: "x", num_images: 1 });

    expect(config).toMatchObject([{ credentials: "key", retry: { maxRetries: 0 } }]);
    expect(submit).toHaveBeenCalledOnce();
    expect(result).toEqual({ requestId: "fal-1" });
  });

  it("상태와 결과 조회는 새 작업을 제출하지 않는다", async () => {
    const submit = vi.fn();
    const status = vi.fn(async () => ({
      status: "COMPLETED", request_id: "fal-1", logs: [],
      status_url: "u", response_url: "r", cancel_url: "c",
    }));
    const result = vi.fn(async () => ({ data: { images: [{ url: "https://fal.media/result.png" }] }, requestId: "fal-1" }));
    const queue = createFalQueueClient("key", () => ({ queue: { submit, status, result } } as never));

    expect(await queue.jobStatus("openai/gpt-image-2/edit", "fal-1")).toBe("completed");
    expect(await queue.jobResult("openai/gpt-image-2/edit", "fal-1")).toEqual({ images: [{ url: "https://fal.media/result.png" }] });
    expect(submit).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledOnce();
    expect(result).toHaveBeenCalledOnce();
  });
});
