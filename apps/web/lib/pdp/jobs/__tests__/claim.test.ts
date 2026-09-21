import { describe, expect, it } from "vitest";
import { fingerprintOf, resolveSubmission, leaseExpiredAt, type ExistingJob } from "../claim";

/**
 * **같은 요청을 두 번 보내도 한 번만 만든다.**
 *
 * 네트워크가 끊겼거나 사용자가 두 번 눌렀을 때, 이미 값을 치른 작업을 또 만들면
 * 두 번 낸다. 반대로 **다른 내용인데 같은 key 로 오면** 조용히 옛 결과를 주면
 * 안 된다 — 사용자는 고친 구성안으로 만든 줄 안다.
 *
 * 설계 §8.3: 같은 key + 같은 fingerprint → 기존 job, 같은 key + 다른 fingerprint → 409.
 */
const 요청 = {
  documentId: "doc-1",
  revision: 3,
  operation: "pdp_image" as const,
  sectionIds: ["s1", "s2"],
  imageModel: "nano-banana",
  aspectRatio: "3:4",
};

describe("fingerprint 는 내용이 같으면 같다", () => {
  it("같은 내용이면 같은 값", () => {
    expect(fingerprintOf(요청)).toBe(fingerprintOf({ ...요청 }));
  });

  it("섹션 순서가 달라도 같은 작업이다", () => {
    expect(fingerprintOf({ ...요청, sectionIds: ["s2", "s1"] })).toBe(fingerprintOf(요청));
  });

  it.each([
    ["revision", { revision: 4 }],
    ["섹션 목록", { sectionIds: ["s1"] }],
    ["모델", { imageModel: "gpt-image-2.5-flare" }],
    ["화면비", { aspectRatio: "16:9" }],
    ["문서", { documentId: "doc-2" }],
  ])("%s 가 바뀌면 다른 값이다", (_label, patch) => {
    expect(fingerprintOf({ ...요청, ...patch })).not.toBe(fingerprintOf(요청));
  });
});

describe("같은 key 로 다시 왔을 때", () => {
  const 기존 = (patch: Partial<ExistingJob> = {}): ExistingJob => ({
    id: "job-1",
    fingerprint: fingerprintOf(요청),
    generation: "generating",
    leaseUntil: null,
    ...patch,
  });

  it("내용이 같으면 기존 작업을 돌려준다 — 새로 만들지 않는다", () => {
    const 결과 = resolveSubmission(기존(), fingerprintOf(요청));

    expect(결과).toEqual({ kind: "existing", jobId: "job-1" });
  });

  it("**내용이 다르면 거절한다.** 옛 결과를 새 요청의 답으로 주지 않는다", () => {
    const 결과 = resolveSubmission(기존(), fingerprintOf({ ...요청, revision: 4 }));

    expect(결과.kind).toBe("conflict");
  });

  it("기존 작업이 없으면 새로 만든다", () => {
    expect(resolveSubmission(null, fingerprintOf(요청))).toEqual({ kind: "create" });
  });

  it("이미 끝난 작업도 같은 내용이면 그것을 돌려준다 — 다시 만들지 않는다", () => {
    const 결과 = resolveSubmission(기존({ generation: "completed" }), fingerprintOf(요청));

    expect(결과).toEqual({ kind: "existing", jobId: "job-1" });
  });
});

describe("lease — 누가 이 작업을 돌리고 있는가", () => {
  const 지금 = new Date("2026-09-17T10:00:00Z");

  it("아무도 안 잡았으면 잡을 수 있다", () => {
    expect(leaseExpiredAt(null, 지금)).toBe(true);
  });

  it("남이 잡고 있고 아직 안 끝났으면 못 잡는다", () => {
    expect(leaseExpiredAt(new Date("2026-09-17T10:05:00Z"), 지금)).toBe(false);
  });

  it("**잡은 뒤 죽었으면** 시간이 지나 풀린다 — 작업이 영영 멈추면 안 된다", () => {
    expect(leaseExpiredAt(new Date("2026-09-17T09:59:00Z"), 지금)).toBe(true);
  });

  it("정확히 지금 끝나는 것은 아직 살아 있다고 본다", () => {
    expect(leaseExpiredAt(지금, 지금)).toBe(false);
  });
});
