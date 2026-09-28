import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { confirmServerLibrary, nextLibraryStep, pageImageHashes, sectionImageHash } from "../library-server-sync";

/**
 * **화면은 서버가 모르는 섹션만 한 장씩 보낸다 — 페이지를 따로 올리지 않는다**
 * (2026-09-28, 2차 독립 리뷰 HIGH-A·MEDIUM-2).
 *
 * 전에는 서버가 다 못 넣었으면 화면이 페이지 전체를 새 작업으로 올려, 한 장을 다시
 * 만들 때마다 같은 페이지가 한 벌씩 늘었다. 확인 요청이 끊겨도 그렇게 올렸다.
 */
const image = { base64: "AAAA", mimeType: "image/png" };

function fakeServer(initialMissing: string[], options: { refuse?: string[] } = {}) {
  let missing = [...initialMissing];
  const sent: string[] = [];
  const request = async (supplied?: { sectionId: string }) => {
    if (supplied) {
      sent.push(supplied.sectionId);
      if (!options.refuse?.includes(supplied.sectionId)) missing = missing.filter((id) => id !== supplied.sectionId);
    }
    return { ok: true, missing: [...missing] };
  };
  return { request, sent };
}

describe("서버 라이브러리 확인", () => {
  it("**서버가 다 가졌으면 아무것도 안 보낸다**", async () => {
    const server = fakeServer([]);
    expect(await confirmServerLibrary({ request: server.request, sectionIds: ["a", "b"], imageOf: () => image })).toBe("saved");
    expect(server.sent).toEqual([]);
  });

  it("**서버가 모르는 섹션만 한 장씩 보낸다**", async () => {
    const server = fakeServer(["b", "c"]);
    expect(await confirmServerLibrary({ request: server.request, sectionIds: ["a", "b", "c"], imageOf: () => image })).toBe("saved");
    expect(server.sent).toEqual(["b", "c"]);
  });

  it("화면에 그림이 없는 섹션은 신경 쓰지 않는다", async () => {
    const server = fakeServer(["x"]);
    expect(await confirmServerLibrary({ request: server.request, sectionIds: ["a"], imageOf: () => image })).toBe("saved");
    expect(server.sent).toEqual([]);
  });

  it("**보낸 장이 안 들어가면 멈춘다** — 같은 장을 되풀이해 보내지 않는다", async () => {
    const server = fakeServer(["b"], { refuse: ["b"] });
    expect(await confirmServerLibrary({ request: server.request, sectionIds: ["a", "b"], imageOf: () => image })).toBe("incomplete");
    expect(server.sent).toEqual(["b"]);
  });

  it("그림을 못 읽으면 다 못 넣은 것이다", async () => {
    const server = fakeServer(["b"]);
    expect(await confirmServerLibrary({ request: server.request, sectionIds: ["a", "b"], imageOf: () => null })).toBe("incomplete");
  });

  it("**서버가 맞출 수 없는 환경이라고 할 때만 화면이 올린다**", async () => {
    expect(await confirmServerLibrary({ request: async () => ({ ok: false, reason: "unavailable" }), sectionIds: ["a"], imageOf: () => image })).toBe("unavailable");
  });

  it("**연결이 끊기면 짐작으로 올리지 않는다**(2차 리뷰 MEDIUM-2)", async () => {
    const outcome = await confirmServerLibrary({
      request: async () => { throw new TypeError("Failed to fetch"); },
      sectionIds: ["a"],
      imageOf: () => image,
    });
    expect(outcome).toBe("error");
  });

  it("서버가 실패로 답해도 올리지 않는다", async () => {
    expect(await confirmServerLibrary({ request: async () => ({ ok: false, reason: "failed" }), sectionIds: ["a"], imageOf: () => image })).toBe("error");
  });
});

describe("확인 뒤 할 일", () => {
  const context = { auto: true, singleRun: true, hasProgress: true };

  it("**서버가 다 넣었으면 끝**", () => {
    expect(nextLibraryStep("saved", context)).toBe("done");
  });

  it.each(["error", "incomplete"] as const)("**%s 이면 올리지 않고 다시 누르게 한다**(2차 리뷰 MEDIUM-2)", (outcome) => {
    expect(nextLibraryStep(outcome, { auto: false, singleRun: false, hasProgress: false })).toBe("retry");
  });

  it("서버가 맞출 수 없으면 화면이 올린다", () => {
    expect(nextLibraryStep("unavailable", { auto: true, singleRun: false, hasProgress: true })).toBe("upload");
    expect(nextLibraryStep("unavailable", { auto: false, singleRun: true, hasProgress: true })).toBe("upload");
  });

  it("**그래도 한 장 다시 만들기의 자동 저장은 이미 올린 판 뒤에 또 올리지 않는다**(2차 리뷰 HIGH-A)", () => {
    expect(nextLibraryStep("unavailable", context)).toBe("skip");
    expect(nextLibraryStep("unavailable", { ...context, hasProgress: false })).toBe("upload");
  });
});

describe("그림의 지문", () => {
  it("**서버와 같은 규칙** — 바이트의 sha1 앞 8자리", async () => {
    const bytes = Buffer.from("some image bytes");
    const expected = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
    expect(await sectionImageHash(`data:image/png;base64,${bytes.toString("base64")}`)).toBe(expected);
  });

  it("**깨진 그림 한 장은 지문 없이 넘어간다** — 확인 전체가 매번 실패하지 않는다", async () => {
    const good = `data:image/png;base64,${Buffer.from("ok").toString("base64")}`;
    const hashes = await pageImageHashes([good, "data:image/png;base64,A", undefined]);
    expect(hashes[0]).toMatch(/^[0-9a-f]{8}$/);
    expect(hashes.slice(1)).toEqual([null, null]);
  });

  it("data 주소가 아니면 없다", async () => {
    expect(await sectionImageHash("https://example.com/a.png")).toBeNull();
  });
});
