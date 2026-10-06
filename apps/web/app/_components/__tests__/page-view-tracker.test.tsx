import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **화면이 바뀔 때마다 한 줄 보낸다**(계획 2026-10-06 site-analytics).
 * 첫 화면만 referrer·utm 을 싣고, 관리자 화면은 안 보내며, 쿠키·저장소를 직접 만지지 않는다
 * (동의한 번호표는 브라우저가 알아서 같이 보낸다).
 *
 * 이 저장소에는 jsdom 이 없다. 다른 화면 시험(`app/create/__tests__/draft-ui.test.tsx`)처럼
 * 브라우저 전역값을 `vi.stubGlobal` 로 흉내 낸다.
 */
let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const { PageViewTracker } = await import("../page-view-tracker");

const sent: Array<Record<string, unknown>> = [];
beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { referrer: "https://www.instagram.com/" });
  vi.stubGlobal("window", { location: { search: "?utm_source=insta&token_hash=secret" } });
  vi.stubGlobal("navigator", {
    sendBeacon: (_url: string, blob: Blob) => {
      void blob.text().then((text) => sent.push(JSON.parse(text)));
      return true;
    },
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("PageViewTracker", () => {
  it("첫 화면은 referrer 와 utm 만 싣고, 다음 화면은 주소만", async () => {
    pathname = "/";
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<PageViewTracker />); });
    pathname = "/guide";
    await act(async () => { tree.update(<PageViewTracker />); });
    await flush();
    expect(sent).toEqual([
      { path: "/", entry: true, referrer: "https://www.instagram.com/", search: "utm_source=insta" },
      { path: "/guide", entry: false },
    ]);
  });

  it("관리자 화면은 안 보낸다 — 그 뒤 첫 일반 화면도 entry 가 아니다", async () => {
    pathname = "/admin";
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<PageViewTracker />); });
    pathname = "/library";
    await act(async () => { tree.update(<PageViewTracker />); });
    await flush();
    expect(sent).toEqual([{ path: "/library", entry: false }]);
  });

  it("쿠키·브라우저 저장소를 직접 만지지 않는다(처리방침 제11조)", () => {
    const source = readFileSync(new URL("../page-view-tracker.tsx", import.meta.url), "utf8");
    for (const 저장 of ["document.cookie", "localStorage", "sessionStorage", "indexedDB"]) {
      expect(source).not.toContain(저장);
    }
  });
});
