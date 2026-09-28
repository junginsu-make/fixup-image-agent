import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalJobRepository } from "../local-repository";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/**
 * **같은 밀리초에 만든 둘**(2026-09-28 CI 가 잡았다).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 계약 시험의 「여러 번 만들었으면 마지막 것을 준다」가 CI 에서만 붉어졌다.
 * `createdAt` 이 밀리초까지라 빠른 기계에서는 **두 작업이 같은 시각**을 갖고,
 * 그때 안정 정렬이 들어온 차례를 지킨다.
 *
 *     로컬      넣은 차례(오래된 것 먼저) → **오래된 것**을 골랐다
 *     Supabase  `created_at desc`        → 최근 것을 골랐다
 *
 * **같은 계약을 두 구현이 다르게 답하고 있었다.**
 *
 * ── 왜 계약 시험에 안 넣나 ─────────────────────────────────
 *
 * 계약 시험은 진짜 시계를 쓰므로 **시계 운으로만** 잡는다 — 로컬에서 다섯 번
 * 돌려도 안 나왔다. 시각을 멈춰 놓고 재는 것은 구현마다 길이 달라서, 로컬
 * 구현의 시험으로 둔다.
 */
describe("로컬 저장소 · 같은 시각에 만든 둘", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("**마지막에 만든 것을 준다**", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pdp-jobs-tie-"));
    try {
      const repo = createLocalJobRepository(dir);

      // 시계를 멈춘다. 두 작업이 같은 `createdAt` 을 갖는다.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-28T01:00:00.000Z"));

      const 만들고id = async (input: Parameters<typeof repo.createOrGet>[0]) => {
        const result = await repo.createOrGet(input);
        if (result.kind === "conflict") throw new Error("작업을 만들지 못했습니다: conflict");
        return result.jobId;
      };

      const 요청 = 만들기("u1", "key-1");
      const 먼저 = await 만들고id(요청);
      const 나중 = await 만들고id(만들기("u1", "key-2", { sectionIds: ["s3"] }));

      const 둘 = await Promise.all([repo.get(먼저, "u1"), repo.get(나중, "u1")]);
      expect(둘[0]?.createdAt, "시계가 안 멈췄으면 이 시험은 아무것도 못 잰다")
        .toBe(둘[1]?.createdAt);

      const found = await repo.findLatestForDocument("u1", 요청.documentId, 요청.revision);

      expect(found?.id, "같은 시각이면 오래된 것을 골랐다").toBe(나중);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
