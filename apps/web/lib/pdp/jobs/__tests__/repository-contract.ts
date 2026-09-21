import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PdpJobRepository } from "../repository";
import { fingerprintOf } from "../claim";

/**
 * **작업 저장소가 지켜야 하는 것.**
 *
 * 저장 방식과 무관한 **계약**이다. 로컬 파일 구현과 Supabase 구현이 **같은
 * 시험을 통과해야** 로컬에서 본 동작을 운영에서 믿을 수 있다. 계약을 글로만
 * 적어 두면 한쪽이 조용히 달라진다.
 *
 * 지키는 것 넷:
 *   1. 같은 요청을 두 번 받아도 한 번만 만든다
 *   2. 남의 작업은 못 본다
 *   3. 두 워커가 동시에 잡아도 하나만 잡는다
 *   4. 결과는 어떤 실패에도 안 사라진다
 *   5. 문서로 자기 작업을 찾을 수 있다
 */
const 요청 = {
  documentId: "doc-1",
  revision: 3,
  operation: "pdp_image",
  sectionIds: ["s1", "s2"],
  imageModel: "nano-banana",
  aspectRatio: "3:4",
};

export const 만들기 = (userId = "u1", key = "key-1", patch: Partial<typeof 요청> = {}) => ({
  userId,
  teamId: null,
  idempotencyKey: key,
  fingerprint: fingerprintOf({ ...요청, ...patch }),
  documentId: 요청.documentId,
  revision: 요청.revision,
  operation: 요청.operation,
  sectionIds: 요청.sectionIds,
  reservationRequestId: "res-1",
});

/**
 * 두 구현에 같은 시험을 돌린다.
 *
 * `setup` 은 매 시험 앞에서 **빈 저장소**를 만들어 준다. 앞 시험이 남긴 것이
 * 보이면 「같은 열쇠는 한 번만」 같은 시험이 엉뚱하게 통과한다.
 */
export function describeJobRepositoryContract(
  label: string,
  setup: () => Promise<{ repo: PdpJobRepository; cleanup: () => Promise<void> }>,
): void {
  describe(label, () => {
    let repo: PdpJobRepository;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const made = await setup();
      repo = made.repo;
      cleanup = made.cleanup;
    });
    afterEach(async () => {
      await cleanup();
    });

    /**
     * 만들어진 작업의 id. **conflict 였으면 시험을 여기서 멈춘다.**
     *
     * 눌러 쓰면 conflict 가 와도 `undefined` 로 조용히 흘러 엉뚱한 자리에서
     * 깨진다. 무엇이 잘못됐는지 그 줄에서 말하게 한다.
     */
    async function 만들고id(input: Parameters<PdpJobRepository["createOrGet"]>[0]): Promise<string> {
      const result = await repo.createOrGet(input);
      if (result.kind === "conflict") throw new Error("작업을 만들지 못했습니다: conflict");
      return result.jobId;
    }

    describe("1. 같은 요청은 한 번만", () => {
      it("처음 오면 만든다", async () => {
        const 결과 = await repo.createOrGet(만들기());
    
        expect(결과.kind).toBe("created");
      });
    
      it("같은 key 로 또 오면 **같은 작업**을 돌려준다", async () => {
        const 처음 = await 만들고id(만들기());
        const 다시 = await repo.createOrGet(만들기());
    
        expect(다시.kind).toBe("existing");
        expect(다시.kind === "existing" && 다시.jobId).toBe(처음);
      });
    
      it("**내용이 다르면 거절한다** — 옛 결과를 새 요청의 답으로 주지 않는다", async () => {
        await repo.createOrGet(만들기());
        const 다른내용 = await repo.createOrGet(만들기("u1", "key-1", { revision: 4 }));
    
        expect(다른내용.kind).toBe("conflict");
      });
    
      it("다른 사람의 같은 key 는 남남이다", async () => {
        const 내것 = await 만들고id(만들기("u1", "key-1"));
        const 남의것 = await 만들고id(만들기("u2", "key-1"));
    
        expect(남의것).not.toBe(내것);
      });
    });
    
    describe("2. 남의 작업은 못 본다", () => {
      it("**job ID 만 알아서는 못 읽는다**", async () => {
        const jobId = await 만들고id(만들기("u1"));
    
        expect(await repo.get(jobId, "u2")).toBeNull();
        expect(await repo.get(jobId, "u1")).not.toBeNull();
      });
    
      it("남의 작업 상태를 바꿀 수 없다", async () => {
        const jobId = await 만들고id(만들기("u1"));
    
        await expect(repo.advance(jobId, "u2", { type: "reserved" })).rejects.toThrow(/찾지|권한/);
      });
    });
    
    describe("3. 두 워커가 동시에 잡아도 하나만", () => {
      it("먼저 잡은 쪽만 가져간다", async () => {
        const jobId = await 만들고id(만들기());
        await repo.advance(jobId, "u1", { type: "reserved" });
    
        const 첫째 = await repo.claimNext("worker-a", 60_000);
        const 둘째 = await repo.claimNext("worker-b", 60_000);
    
        expect(첫째?.id).toBe(jobId);
        expect(둘째).toBeNull();
      });
    
      it("**잡은 워커가 죽으면 시간이 지나 풀린다** — 작업이 영영 멈추면 안 된다", async () => {
        const jobId = await 만들고id(만들기());
        await repo.advance(jobId, "u1", { type: "reserved" });
        await repo.claimNext("worker-a", 1);
    
        await new Promise((resolve) => setTimeout(resolve, 20));
        const 이어받음 = await repo.claimNext("worker-b", 60_000);
    
        expect(이어받음?.id).toBe(jobId);
      });
    
      it("끝난 작업은 아무도 안 잡는다", async () => {
        const jobId = await 만들고id(만들기());
        for (const type of ["reserved", "submitting", "submitted", "result_available", "persisted"] as const) {
          await repo.advance(jobId, "u1", { type });
        }
        await repo.advance(jobId, "u1", { type: "settled" });
        await repo.advance(jobId, "u1", { type: "reviewed", passed: true });
    
        expect(await repo.claimNext("worker-a", 60_000)).toBeNull();
      });
    });
    
    describe("4. 결과는 안 사라진다", () => {
      const 결과까지 = async () => {
        const jobId = await 만들고id(만들기());
        for (const type of ["reserved", "submitting", "submitted", "result_available"] as const) {
          await repo.advance(jobId, "u1", { type });
        }
        return jobId;
      };
    
      it("정산이 실패해도 결과 자리는 그대로다", async () => {
        const jobId = await 결과까지();
        await repo.advance(jobId, "u1", { type: "settlement_failed" });
    
        const job = await repo.get(jobId, "u1");
        expect(job!.state.generation).toBe("result_available");
        expect(job!.state.settlement).toBe("retry_required");
      });
    
      it("섹션별 결과를 적어 두면 다시 읽을 수 있다", async () => {
        const jobId = await 결과까지();
        await repo.recordItem(jobId, {
          sectionId: "s1",
          attempt: 1,
          providerRequestId: "fal-123",
          model: "nano-banana",
          outputPath: "u1/pdp/doc-1/s1.png",
          costUsd: 0.039,
        });
    
        const job = await repo.get(jobId, "u1");
        expect(job!.items).toHaveLength(1);
        expect(job!.items[0]!.outputPath).toBe("u1/pdp/doc-1/s1.png");
      });
    
      it("**같은 섹션의 같은 시도는 두 줄이 되지 않는다**", async () => {
        const jobId = await 결과까지();
        const item = { sectionId: "s1", attempt: 1, providerRequestId: "fal-123", model: "nano-banana" };
        await repo.recordItem(jobId, item);
        await repo.recordItem(jobId, { ...item, outputPath: "u1/pdp/doc-1/s1.png" });
    
        const job = await repo.get(jobId, "u1");
        expect(job!.items).toHaveLength(1);
        // 나중 것이 이긴다 — 저장이 끝난 뒤에 경로가 생긴다.
        expect(job!.items[0]!.outputPath).toBe("u1/pdp/doc-1/s1.png");
      });
    
  
    });

    /**
     * **5. 문서로 자기 작업을 찾을 수 있다**(K-04).
     *
     * 탭을 닫았다 돌아온 사용자는 **작업 번호를 모른다.** 번호는 생성 응답에
     * 실려 오는데, 닫고 나간 경우가 바로 그 응답을 못 받은 경우다. 그런데
     * 서버는 그동안 그림을 저장소에 올려 두었다.
     *
     * 화면이 아는 것은 **자기 초안 id** 뿐이다. 그것으로 찾을 수 없으면
     * `GET /api/pdp/jobs/:id` 는 아무도 못 부르는 문이고, 사용자는 이미 값을
     * 치른 그림을 다시 만들어 두 번 낸다.
     *
     * 설계 §8.1 이 `pdp_generation_jobs` 에 document/revision 을 둔 까닭이 이것이다.
     */
    describe("5. 문서로 자기 작업을 찾는다", () => {
      it("**초안 id 로 찾는다**", async () => {
        const id = await 만들고id(만들기());

        const found = await repo.findLatestForDocument("u1", 요청.documentId, 요청.revision);

        expect(found?.id).toBe(id);
      });

      it("**남의 문서는 못 찾는다** — 초안 id 만 알아서는 안 된다", async () => {
        await 만들고id(만들기());

        expect(await repo.findLatestForDocument("u2", 요청.documentId, 요청.revision)).toBeNull();
      });

      it("**다른 개정판은 남남이다** — 구성을 다시 짠 뒤의 옛 그림을 끌어오지 않는다", async () => {
        await 만들고id(만들기());

        expect(await repo.findLatestForDocument("u1", 요청.documentId, 요청.revision + 1)).toBeNull();
      });

      it("없으면 `null` 이다", async () => {
        expect(await repo.findLatestForDocument("u1", "없는문서", 0)).toBeNull();
      });

      /**
       * **가장 나중 것을 준다.** 같은 개정판으로 여러 번 만들었으면 마지막
       * 것이 사용자가 기억하는 화면이다.
       */
      it("**여러 번 만들었으면 마지막 것을 준다**", async () => {
        await 만들고id(만들기("u1", "key-1"));
        const 나중 = await 만들고id(만들기("u1", "key-2", { sectionIds: ["s3"] }));

        const found = await repo.findLatestForDocument("u1", 요청.documentId, 요청.revision);

        expect(found?.id).toBe(나중);
      });

      it("**섹션 결과도 함께 온다** — 되찾을 그림이 거기 적혀 있다", async () => {
        const id = await 만들고id(만들기());
        await repo.recordItem(id, {
          sectionId: "s1", attempt: 1, outputPath: "u1/j/s1.png",
        });

        const found = await repo.findLatestForDocument("u1", 요청.documentId, 요청.revision);

        expect(found?.items.map((item) => item.outputPath)).toContain("u1/j/s1.png");
      });
    });
  });
}
