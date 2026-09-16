import { describe, expect, it } from "vitest";
import { loadPosterRerun, posterRerunJump, type RerunDeps } from "../rerun-load";

/**
 * 지난 단계로 돌아왔을 때 **무엇을 어떤 차례로 부르는지**를 값으로 잰다.
 *
 * 처음에는 화면 원문을 훑어 「이 글자가 있나」를 셌다. 독립 리뷰가 조건을
 * 뒤집고(`if (!found.body?.ok)`), 호출을 가지 밖으로 옮기고, `!Boolean(...)` 으로
 * 바꿔도 전부 초록인 것을 실증했다(2026-09-16). 그래서 판단을 함수로 빼고,
 * 가짜 요청으로 **실제로 무엇이 불렸는지** 기록해서 잰다.
 */

type Call = { method: "get" | "post" | "visible"; url?: string };

function 가짜(options: {
  member: { status: number; body: unknown };
  admin?: { status: number; body: unknown };
  copies?: unknown;
  copyFails?: boolean;
  visible?: string[];
}) {
  const calls: Call[] = [];
  const deps: RerunDeps = {
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
    async loadVisible() {
      calls.push({ method: "visible" });
      return new Set(options.visible ?? []);
    },
  };
  return { deps, calls };
}

const 작업 = (userId = "회원A") => ({
  title: "가을", ratio: "2:3", modelId: "m", userId,
  data: { instruction: "가을 포스터", referenceIds: ["남A"], preservedIds: [], attachmentOrder: ["남A"] },
});

describe("loadPosterRerun — 내 작업", () => {
  it("회원용 길로 읽고 **복사는 안 부른다**", async () => {
    const { deps, calls } = 가짜({ member: { status: 200, body: { ok: true, project: 작업() } }, visible: ["남A"] });

    const result = await loadPosterRerun("w1", deps);

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.method)).toEqual(["get", "visible"]);
    expect(calls.some((call) => call.method === "post")).toBe(false);
  });

  it("그림이 보이면 그대로 심는다", async () => {
    const { deps } = 가짜({ member: { status: 200, body: { ok: true, project: 작업() } }, visible: ["남A"] });

    const result = await loadPosterRerun("w1", deps);

    expect(result.ok && result.seed.pickOrder).toEqual(["남A"]);
  });
});

describe("loadPosterRerun — 관리자가 남의 작업을", () => {
  const 남의작업 = {
    member: { status: 404, body: { ok: false } },
    admin: { status: 200, body: { ok: true, work: 작업() } },
    copies: { ok: true, copies: [{ from: "남A", id: "내A" }] },
    visible: ["내A"],
  };

  it("**회원용 404 → 관리자 통로 → 복사 → 목록 읽기** 차례로 부른다", async () => {
    const { deps, calls } = 가짜(남의작업);

    await loadPosterRerun("w1", deps);

    expect(calls).toEqual([
      { method: "get", url: "/api/poster/projects/w1" },
      { method: "get", url: "/api/admin/works/poster/w1" },
      { method: "post", url: "/api/admin/works/poster/w1/references" },
      // 목록을 복사보다 먼저 읽으면 복사본이 없어서 전부 빠진다.
      { method: "visible" },
    ]);
  });

  it("복사본으로 바꿔 끼워 **02 가 채워진다**", async () => {
    const { deps } = 가짜(남의작업);

    const result = await loadPosterRerun("w1", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.pickOrder).toEqual(["내A"]);
    expect(result.seed.roles).toEqual({ 내A: "style" });
    expect(result.seed.missingReferences).toBe(0);
  });

  it("복사가 실패해도 멈추지 않고, 빠진 그림을 센다", async () => {
    const { deps } = 가짜({ ...남의작업, copyFails: true, visible: [] });

    const result = await loadPosterRerun("w1", deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seed.pickOrder).toEqual([]);
    expect(result.seed.missingReferences).toBe(1);
  });

  it("복사 응답이 이상해도 넘어지지 않는다", async () => {
    const { deps } = 가짜({ ...남의작업, copies: { ok: true, copies: "망가짐" }, visible: [] });

    expect((await loadPosterRerun("w1", deps)).ok).toBe(true);
  });
});

describe("loadPosterRerun — 복사를 부르면 안 될 때", () => {
  it("**관리자가 아니면(403)** 복사를 안 부르고 실패로 끝난다", async () => {
    const { deps, calls } = 가짜({
      member: { status: 404, body: { ok: false } },
      admin: { status: 403, body: { ok: false } },
    });

    const result = await loadPosterRerun("w1", deps);

    expect(result.ok).toBe(false);
    expect(calls.some((call) => call.method === "post")).toBe(false);
  });

  it("회원용 길이 404 가 아닌 오류면 관리자 통로로 안 간다", async () => {
    // 500 은 「남의 것」이 아니라 「고장」이다. 관리자 통로로 넘어갈 이유가 없다.
    const { deps, calls } = 가짜({ member: { status: 500, body: { ok: false } } });

    const result = await loadPosterRerun("w1", deps);

    expect(result.ok).toBe(false);
    expect(calls.map((call) => call.url ?? call.method)).toEqual(["/api/poster/projects/w1"]);
  });

  it("주소 조각을 인코딩한다", async () => {
    const { deps, calls } = 가짜({ member: { status: 200, body: { ok: true, project: 작업() } } });

    await loadPosterRerun("a/../b", deps);

    expect(calls[0]!.url).toBe("/api/poster/projects/a%2F..%2Fb");
  });
});

/**
 * 새 작업 화면의 단계 막대에서 **어디로 갈 수 있나.**
 *
 * 04·05 는 작업을 만든 뒤에 생긴다. 그런데 이미 만든 작업에서 넘어온 사람은
 * 그 작업의 기획·결과가 있어서, 막아 두니 돌아갈 길이 없었다(2026-09-16 사용자
 * 보고). 값을 **못 불러왔으면** 열지 않는다 — 열면 열 수 없는 주소로 간다.
 */
describe("posterRerunJump", () => {
  it("01~03 은 늘 이 화면 안에서 옮긴다", () => {
    for (const id of ["instruction", "reference", "spec"]) {
      expect(posterRerunJump(id, { rerunFrom: "", seeded: false })).toEqual({ kind: "step", id });
      expect(posterRerunJump(id, { rerunFrom: "w1", seeded: true })).toEqual({ kind: "step", id });
    }
  });

  it("돌아온 길이면 04 는 원래 작업의 기획 칸으로 간다", () => {
    expect(posterRerunJump("plan", { rerunFrom: "w1", seeded: true }))
      .toEqual({ kind: "go", href: "/poster/w1?view=plan" });
  });

  it("돌아온 길이면 05 는 원래 작업으로 간다", () => {
    expect(posterRerunJump("result", { rerunFrom: "w1", seeded: true }))
      .toEqual({ kind: "go", href: "/poster/w1" });
  });

  it("새로 만드는 중이면 04·05 는 못 간다", () => {
    expect(posterRerunJump("plan", { rerunFrom: "", seeded: false })).toBeNull();
    expect(posterRerunJump("result", { rerunFrom: "", seeded: false })).toBeNull();
  });

  it("**값을 못 불러왔으면** 04·05 를 안 연다", () => {
    // 남의 id 를 주소에 친 회원 — 열면 열 수 없는 작업으로 간다(2026-09-16 리뷰).
    expect(posterRerunJump("plan", { rerunFrom: "w1", seeded: false })).toBeNull();
    expect(posterRerunJump("result", { rerunFrom: "w1", seeded: false })).toBeNull();
  });

  it("주소 조각을 인코딩한다", () => {
    expect(posterRerunJump("result", { rerunFrom: "a/b", seeded: true }))
      .toEqual({ kind: "go", href: "/poster/a%2Fb" });
  });

  it("모르는 단계는 못 간다", () => {
    expect(posterRerunJump("없는단계", { rerunFrom: "w1", seeded: true })).toBeNull();
  });
});
