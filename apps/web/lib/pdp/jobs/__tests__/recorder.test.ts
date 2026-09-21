import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 서버 전용 모듈. 시험에서는 실제 Supabase 를 부르지 않는다.
vi.mock("server-only", () => ({}));
import { createLocalJobRepository } from "../local-repository";
import { createJobRecorder } from "../recorder";
import { fingerprintOf } from "../claim";

/**
 * **기록이 생성을 망치면 안 된다.**
 *
 * 이 코드가 붙는 자리는 돈이 오가는 생성 경로다. 거기서 기록이 던지면 사용자는
 * **이미 값을 치른 그림을 못 받는다** — 원래 고치려던 것과 똑같은 손실이 된다.
 *
 * 그래서 기록기는 두 가지를 지킨다.
 *   1. 꺼져 있으면 아무것도 안 한다(스위치가 기본 꺼짐)
 *   2. **어떤 실패도 밖으로 던지지 않는다**
 */
let dir = "";
const 입력 = {
  userId: "u1",
  teamId: null,
  idempotencyKey: "key-1",
  fingerprint: fingerprintOf({
    documentId: "doc-1", revision: 1, operation: "pdp_image",
    sectionIds: ["s1"], imageModel: "nano-banana", aspectRatio: "3:4",
  }),
  documentId: "doc-1",
  revision: 1,
  operation: "pdp_image",
  sectionIds: ["s1"],
  reservationRequestId: "res-1",
};

/** 시험에서는 실제 저장소에 안 올린다. 올린 것만 적어 둔다. */
const 올린것: string[] = [];
const 잘올라감 = async (storagePath: string) => {
  올린것.push(storagePath);
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pdp-rec-"));
  올린것.length = 0;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("꺼져 있으면 아무것도 안 한다", () => {
  it("**스위치가 꺼지면 저장소를 만들지도 않는다**", async () => {
    const 만들기 = vi.fn();
    const recorder = await createJobRecorder({ enabled: false, input: 입력, repository: 만들기 });

    await recorder.started();
    await recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "AAA", mimeType: "image/png" });
    await recorder.finished({ succeeded: 1, requested: 1, settled: true });

    expect(만들기).not.toHaveBeenCalled();
    expect(recorder.jobId).toBeNull();
  });
});

describe("켜지면 적는다", () => {
  it("작업을 만들고 상태를 옮긴다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.state.generation).toBe("submitted");
  });

  it("섹션 결과를 경로와 함께 적는다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();
    await recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "AAA", mimeType: "image/png" });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.items[0]!.outputPath).toMatch(/^u1\/pdp-jobs\//);
  });

  it("전부 성공하면 완료로 닫는다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();
    await recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "AAA", mimeType: "image/png" });
    await recorder.finished({ succeeded: 1, requested: 1, settled: true });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.state.generation).toBe("completed");
    expect(job!.state.settlement).toBe("settled");
  });

  it("일부만 성공하면 partial 이다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();
    await recorder.finished({ succeeded: 1, requested: 3, settled: true });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.state.generation).toBe("partial");
  });

  it("**정산이 실패해도 결과는 남는다**", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();
    await recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "AAA", mimeType: "image/png" });
    await recorder.finished({ succeeded: 1, requested: 1, settled: false });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.items).toHaveLength(1);
    expect(job!.state.settlement).toBe("retry_required");
  });
});

describe("**어떤 실패도 생성을 막지 않는다**", () => {
  const 터지는저장소 = () =>
    ({
      createOrGet: async () => { throw new Error("DB down"); },
      get: async () => null,
      advance: async () => { throw new Error("DB down"); },
      claimNext: async () => null,
      recordItem: async () => { throw new Error("DB down"); },
    }) as never;

  it("작업을 못 만들어도 던지지 않는다", async () => {
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: 터지는저장소, putObject: 잘올라감 });

    expect(recorder.jobId).toBeNull();
    // 뒤따르는 호출도 전부 조용해야 한다 — 하나라도 던지면 그림을 잃는다.
    await expect(recorder.started()).resolves.toBeUndefined();
    await expect(
      recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "A", mimeType: "image/png" }),
    ).resolves.toBeUndefined();
    await expect(recorder.finished({ succeeded: 1, requested: 1, settled: true })).resolves.toBeUndefined();
  });

  it("**작업은 만들어졌는데 그 뒤 기록이 실패해도 던지지 않는다**", async () => {
    // 이것이 실제 운영에서 가장 그럴듯한 모양이다 — DB 가 중간에 흔들린다.
    // 앞의 「작업을 못 만들어도」 시험은 빈 기록기로 빠지므로 이 길을 안 지난다.
    const repo = createLocalJobRepository(dir);
    const 중간에터짐 = {
      ...repo,
      advance: async () => { throw new Error("DB down"); },
      recordItem: async () => { throw new Error("DB down"); },
    } as never;
    const recorder = await createJobRecorder({
      enabled: true, input: 입력, repository: () => 중간에터짐, putObject: 잘올라감,
    });

    expect(recorder.jobId).not.toBeNull();
    await expect(recorder.started()).resolves.toBeUndefined();
    await expect(
      recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "A", mimeType: "image/png" }),
    ).resolves.toBeUndefined();
    await expect(recorder.finished({ succeeded: 1, requested: 1, settled: true })).resolves.toBeUndefined();
  });

  it("그림 저장이 실패해도 던지지 않는다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({
      enabled: true,
      input: 입력,
      repository: () => repo,
      putObject: async () => { throw new Error("storage down"); },
    });
    await recorder.started();

    await expect(
      recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "A", mimeType: "image/png" }),
    ).resolves.toBeUndefined();
  });

  it("저장이 실패하면 **그 사실을 남긴다** — 조용히 사라지지 않는다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({
      enabled: true,
      input: 입력,
      repository: () => repo,
      putObject: async () => { throw new Error("storage down"); },
    });
    await recorder.started();
    await recorder.sectionDone({ sectionId: "s1", attempt: 1, imageBase64: "A", mimeType: "image/png" });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.state.persistence).toBe("retry_required");
    // **없는 자리를 가리키지 않는다.** 경로만 적혀 있으면 되찾을 때가 되어서야
    // 파일이 없다는 것이 드러난다.
    expect(job!.items[0]!.outputPath).toBeUndefined();
    expect(job!.items[0]!.errorCode).toBe("artifact_upload_failed");
  });
});

/**
 * **어느 장이 왜 안 만들어졌는지 적는다**(F-7-8).
 *
 * 설계 §14.6: 「failedSections 미표시·토스트만 존재 | **영구 상태·섹션별
 * 실패/미시도 이유 표시** | W4 / T-JOB」.
 *
 * ── 무엇이 빠져 있었나 ─────────────────────────────────────
 *
 * 묶음 라우트는 성공한 섹션만 적었다(`if (!result.ok) continue`). 그래서
 * 되찾을 때 서버가 아는 것은 「만들어진 것」뿐이고, **왜 빠졌는지는 아무
 * 데도 안 남았다.**
 *
 * 사용자가 보는 것은 집계 숫자뿐이다 — 「성공 4장 · 실패 1장」. 어느 장이 왜
 * 빠졌는지 알 길이 없어 여덟 장을 통째로 다시 만들고, 그때 이미 만든 넉 장
 * 값이 또 나간다. 리디자인 쪽은 이미 닫았고(`failed-sections.ts`) PDP 만
 * 남아 있었다.
 *
 * `JobItemRecord` 에는 `errorCode` 칸이 처음부터 있었다. 적지를 않았을 뿐이다.
 */
describe("안 만들어진 섹션도 적는다", () => {
  it("**까닭과 함께 적는다** — 그래야 그 섹션만 다시 만든다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();

    await recorder.sectionFailed({ sectionId: "s1", attempt: 1, errorCode: "AI_QUOTA_EXCEEDED" });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.items[0]!.sectionId).toBe("s1");
    expect(job!.items[0]!.errorCode).toBe("AI_QUOTA_EXCEEDED");
  });

  /**
   * **없는 자리를 가리키지 않는다.** 실패한 섹션에는 올린 그림이 없다.
   * 경로를 적으면 되찾을 때 그 자리를 읽으러 갔다가 빈손으로 온다.
   */
  it("**그림 경로는 안 적는다**", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();

    await recorder.sectionFailed({ sectionId: "s1", attempt: 1, errorCode: "AI_PROVIDER_UNAVAILABLE" });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.items[0]!.outputPath).toBeUndefined();
    // 올리러 가지도 않는다. 올릴 것이 없다.
    expect(올린것).toEqual([]);
  });

  it("**까닭을 모르면 그렇게 적는다** — 빈 칸으로 두면 왜 빠졌는지 모른다", async () => {
    const repo = createLocalJobRepository(dir);
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => repo, putObject: 잘올라감 });
    await recorder.started();

    await recorder.sectionFailed({ sectionId: "s1", attempt: 1 });

    const job = await repo.get(recorder.jobId!, "u1");
    expect(job!.items[0]!.errorCode).toBeTruthy();
  });

  /**
   * **기록이 생성을 망치면 안 된다.** 이 파일의 다른 묶음이 지키는 것과 같은
   * 규칙이다 — 실패를 적다가 던지면 성공한 그림까지 못 받는다.
   */
  it("**적다가 터져도 안 던진다**", async () => {
    const 터지는저장소 = {
      createOrGet: async () => ({ kind: "created" as const, jobId: "job-1" }),
      get: async () => null,
      findLatestForDocument: async () => null,
      advance: async () => { throw new Error("터졌다"); },
      claimNext: async () => null,
      recordItem: async () => { throw new Error("터졌다"); },
    };
    const recorder = await createJobRecorder({ enabled: true, input: 입력, repository: () => 터지는저장소, putObject: 잘올라감 });

    await expect(recorder.sectionFailed({ sectionId: "s1", attempt: 1, errorCode: "X" })).resolves.toBeUndefined();
  });

  it("**꺼져 있으면 아무것도 안 한다**", async () => {
    const 만들기 = vi.fn();
    const recorder = await createJobRecorder({ enabled: false, input: 입력, repository: 만들기 });

    await recorder.sectionFailed({ sectionId: "s1", attempt: 1, errorCode: "X" });

    expect(만들기).not.toHaveBeenCalled();
  });
});
