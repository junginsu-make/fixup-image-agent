import { describe, expect, it } from "vitest";
import { loadSnsRerun, snsRerunJump, type SnsRerunDeps } from "../rerun-load";

/**
 * 카드뉴스도 지난 단계로 돌아왔을 때 **무엇을 어떤 차례로 부르는지**를 값으로 잰다.
 *
 * 원문을 훑는 시험은 `if (found.body?.ok)` 를 뒤집어도, `!Boolean(rerunFrom)` 으로
 * 바꿔도 초록이었다(2026-09-16 독립 리뷰가 실증). 판단을 함수로 빼서 잰다.
 */
type Call = { method: "get" | "post"; url: string };

function 가짜(options: {
  member: { status: number; body: unknown };
  admin?: { status: number; body: unknown };
  copies?: unknown;
  copyFails?: boolean;
}) {
  const calls: Call[] = [];
  const deps: SnsRerunDeps = {
    async get(url) {
      calls.push({ method: "get", url });
      if (url.startsWith("/api/admin/")) return options.admin ?? { status: 403, body: { ok: false } };
      return options.member;
    },
    async post(url) {
      calls.push({ method: "post", url });
      if (options.copyFails) throw new Error("끊김");
      return options.copies ?? { ok: true, copies: [] };
    },
  };
  return { deps, calls };
}

const 작업 = {
  title: "가을 소식", ratio: "4:5", language: "ko", modelId: "m", cardCountMode: "auto",
  data: {
    source: { kind: "text", text: "신제품" },
    attachments: [
      { id: "a1", kind: "style_reference", assetPath: "회원A/references/a1.png", url: "u1", role: "cover" },
    ],
  },
};

describe("loadSnsRerun — 내 작업", () => {
  it("`/plan` 으로 읽고 첨부를 그대로 싣는다. 복사는 안 부른다", async () => {
    const { deps, calls } = 가짜({ member: { status: 200, body: { ok: true, project: 작업 } } });

    const result = await loadSnsRerun("w1", deps);

    expect(calls).toEqual([{ method: "get", url: "/api/sns/projects/w1/plan" }]);
    expect(result.ok && result.seed.attachments.map((attachment) => attachment.id)).toEqual(["a1"]);
  });
});

describe("loadSnsRerun — 관리자가 남의 작업을", () => {
  const 남의작업 = {
    member: { status: 404, body: { ok: false } },
    admin: { status: 200, body: { ok: true, work: 작업 } },
    copies: {
      ok: true,
      copies: [{ from: "a1", id: "내a1", storagePath: "관리자/references/내a1.png", url: "signed:내a1" }],
    },
  };

  it("**회원용 404 → 관리자 통로 → 복사** 차례로 부른다", async () => {
    const { deps, calls } = 가짜(남의작업);

    await loadSnsRerun("w1", deps);

    expect(calls).toEqual([
      { method: "get", url: "/api/sns/projects/w1/plan" },
      { method: "get", url: "/api/admin/works/sns/w1" },
      { method: "post", url: "/api/admin/works/sns/w1/references" },
    ]);
  });

  it("복사본으로 바꿔 싣는다 — 남의 경로는 안 싣는다", async () => {
    const { deps } = 가짜(남의작업);

    const result = await loadSnsRerun("w1", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.attachments).toEqual([
      expect.objectContaining({ id: "내a1", assetPath: "관리자/references/내a1.png", url: "signed:내a1" }),
    ]);
    expect(result.seed.droppedAttachments).toBe(0);
  });

  it("복사가 실패하면 **남의 첨부를 싣지 않고** 빠진 수로 센다", async () => {
    const { deps } = 가짜({ ...남의작업, copyFails: true });

    const result = await loadSnsRerun("w1", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.attachments).toEqual([]);
    expect(result.seed.droppedAttachments).toBe(1);
  });
});

describe("loadSnsRerun — 복사를 부르면 안 될 때", () => {
  it("관리자가 아니면(403) 복사를 안 부르고 실패로 끝난다", async () => {
    const { deps, calls } = 가짜({ member: { status: 404, body: { ok: false } } });

    expect((await loadSnsRerun("w1", deps)).ok).toBe(false);
    expect(calls.some((call) => call.method === "post")).toBe(false);
  });

  it("404 가 아닌 오류면 관리자 통로로 안 간다", async () => {
    const { deps, calls } = 가짜({ member: { status: 500, body: { ok: false } } });

    expect((await loadSnsRerun("w1", deps)).ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe("snsRerunJump", () => {
  it("01~03 은 이 화면 안에서 옮긴다", () => {
    for (const id of ["content", "images", "spec"]) {
      expect(snsRerunJump(id, { rerunFrom: "", seeded: false })).toEqual({ kind: "step", id });
    }
  });

  it("돌아온 길이면 04·05 는 원래 작업으로 간다", () => {
    expect(snsRerunJump("copy", { rerunFrom: "w1", seeded: true })).toEqual({ kind: "go", href: "/sns/w1" });
    expect(snsRerunJump("result", { rerunFrom: "w1", seeded: true })).toEqual({ kind: "go", href: "/sns/w1" });
  });

  it("새로 만드는 중이거나 값을 못 불러왔으면 04·05 를 안 연다", () => {
    expect(snsRerunJump("copy", { rerunFrom: "", seeded: false })).toBeNull();
    expect(snsRerunJump("result", { rerunFrom: "w1", seeded: false })).toBeNull();
  });

  it("모르는 단계는 못 간다", () => {
    expect(snsRerunJump("없는단계", { rerunFrom: "w1", seeded: true })).toBeNull();
  });
});
