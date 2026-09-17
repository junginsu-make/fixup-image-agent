import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalJobRepository } from "../local-repository";
import { describe, expect, it } from "vitest";
import { describeJobRepositoryContract, 만들기 } from "./repository-contract";

/**
 * 로컬 파일 구현이 계약을 지키는가.
 *
 * `LOCAL_STORE=1` 에서 쓰는 구현이다. 같은 계약 시험을 Supabase 구현에도 돌린다
 * (`supabase-repository.test.ts`).
 */
describeJobRepositoryContract("로컬 파일 저장소", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pdp-jobs-"));
  return {
    repo: createLocalJobRepository(dir),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
});

/**
 * 로컬 구현에만 있는 검사.
 *
 * **저장한 파일 안을 직접 들여다본다.** 「무엇을 안 담는지」는 계약으로 못 잰다 —
 * 운영 구현에서는 원문을 꺼낼 길이 없어서, 계약에 넣으면 거기서는 빈 문자열을
 * 보고 조용히 통과한다. 그런 시험은 지켜 주는 것이 없다.
 */
describe("로컬 파일에 무엇이 들어가나", () => {
  it("**base64 원본을 담지 않는다** — 경로만 남긴다", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pdp-jobs-raw-"));
    try {
      const repo = createLocalJobRepository(dir);
      const created = await repo.createOrGet(만들기());
      if (created.kind === "conflict") throw new Error("작업을 만들지 못했습니다");

      for (const type of ["reserved", "submitting", "submitted", "result_available"] as const) {
        await repo.advance(created.jobId, "u1", { type });
      }
      await repo.recordItem(created.jobId, {
        sectionId: "s1",
        attempt: 1,
        model: "nano-banana",
        outputPath: "u1/pdp/doc-1/s1.png",
      });

      const raw = await repo.debugRaw();
      expect(raw).toContain("u1/pdp/doc-1/s1.png");
      expect(raw).not.toMatch(/base64|imageBase64/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
