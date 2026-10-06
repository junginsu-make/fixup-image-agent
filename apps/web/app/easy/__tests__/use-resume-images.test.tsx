import React from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const c = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock("../collect", () => ({ collectEasyImage: c.collect, NO_IMAGE_MADE: "이미지가 나오지 않았습니다." }));

import { resumeTargets, useEasyResume } from "../use-resume-images";
import { withRowJob } from "../row-image";
import type { EasyMessage } from "../turn";

/**
 * **다시 열면 이어 받는다**(2026-10-06 설계 B3). 그림을 받아 저장하는 일은 화면이 상태를
 * 물을 때만 일어나서, 만드는 중에 떠나면 「이미지를 만들고 있습니다」가 영원히 돌았다.
 */
const 일감 = { requestRowId: "r1", falRequestId: "f1", endpoint: "fal-ai/x" };
const 줄들: EasyMessage[] = [
  { id: "u1", role: "user", body: "포스터" },
  { id: "a", role: "image", body: withRowJob("", 일감), workId: "p1" },
  { id: "b", role: "image", body: withRowJob("", { ...일감, requestRowId: "r2" }), workId: "p2" },
  { id: "c", role: "image", body: withRowJob("", 일감), workId: "p3" },
  { id: "d", role: "image", body: "", workId: "p4" },
  { id: "e", role: "image", body: withRowJob("", 일감), workId: "p5" },
  // 끝났는데 주소가 없는 줄(0장 · 거절) — 서버가 「아직 안 받은 줄」에 안 넣는다.
  { id: "f", role: "image", body: withRowJob("", { ...일감, requestRowId: "r6" }), workId: "p6" },
];
const 그림있음 = { c: "https://x/c.png" };
const 카드뉴스 = new Set(["e"]);
// 서버(`load.ts`)가 준 「아직 결과를 안 받은 줄」. f 는 끝난 요청이라 없다.
const 안받은줄 = new Set(["a", "b", "c", "e"]);

let view: ReactTestRenderer;
let failed: Readonly<Record<string, string>> = {};
const onImage = vi.fn();
function Probe() {
  failed = useEasyResume({ messages: 줄들, urls: 그림있음, cardnewsIds: 카드뉴스, pendingIds: 안받은줄, isAlive: () => true, onImage });
  return null;
}
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };

beforeEach(() => {
  c.collect.mockReset();
  onImage.mockReset();
  c.collect.mockImplementation(async (projectId: string) => {
    if (projectId === "p1") return { id: "img", url: "https://x/a.png" };
    throw new Error("내용 검사에 걸렸습니다.");
  });
});
afterEach(() => { act(() => view?.unmount()); });

describe("이어 받을 줄", () => {
  it("그림이 없고 받을 정보가 있는 이미지 줄만 — 그림 있는 줄 · 옛 줄 · 카드뉴스 줄은 아니다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, 안받은줄)).toEqual([
      { rowId: "a", projectId: "p1", job: 일감 },
      { rowId: "b", projectId: "p2", job: { ...일감, requestRowId: "r2" } },
    ]);
  });

  /**
   * 최종 리뷰(2026-10-06): 끝난 요청을 다시 물으면 `status` 가 결과를 또 저장하고 또 정산한다.
   * 주소가 없어도 끝난 줄은 이어 받지 않는다.
   */
  it("끝났는데 그림이 없는 줄은 이어 받지 않는다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, 안받은줄).map((one) => one.rowId)).not.toContain("f");
  });

  it("아직 안 끝난 줄은 이어 받는다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, new Set(["f"])).map((one) => one.rowId)).toEqual(["f"]);
  });

  it("서버가 안 받은 줄을 못 알려 주면(빈 목록) 아무것도 안 묻는다", () => {
    expect(resumeTargets(줄들, 그림있음, 카드뉴스, new Set())).toEqual([]);
  });
});

describe("다시 열 때", () => {
  it("받으면 그 줄에 걸고, 못 받으면 까닭을 그 줄에 남긴다", async () => {
    await act(async () => { view = create(<Probe />); });
    await flush();
    expect(c.collect).toHaveBeenCalledTimes(2);
    expect(c.collect.mock.calls[0]!.slice(0, 2)).toEqual(["p1", 일감]);
    expect(onImage).toHaveBeenCalledWith("a", { id: "img", url: "https://x/a.png" });
    expect(failed).toEqual({ b: "내용 검사에 걸렸습니다." });
  });

  it("다시 그려도 또 묻지 않는다", async () => {
    await act(async () => { view = create(<Probe />); });
    await flush();
    await act(async () => { view.update(<Probe />); });
    await flush();
    expect(c.collect).toHaveBeenCalledTimes(2);
  });
});

describe("화면이 같은 받기 함수를 쓴다", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
  it("만든 직후 · 다시 열 때 모두 collectEasyImage 다", () => {
    expect(화면).toContain("useEasyResume(");
    expect(화면).toContain("collectEasyImage(body.projectId, body.submission, () => alive.current)");
    expect(화면).not.toContain("async function collect(");
  });
  it("서버가 준 「아직 안 받은 줄」만 넘긴다", () => {
    expect(화면).toContain("pendingIds: new Set(initialPending ?? [])");
  });
  it("못 받은 줄을 줄과 결과 칸에 알린다", () => {
    expect(화면).toContain("failed={failed[message.id]}");
    expect(화면).toContain("!failed[one.id]");
  });
});
