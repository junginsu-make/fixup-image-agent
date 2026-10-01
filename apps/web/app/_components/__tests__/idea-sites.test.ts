import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IDEA_SITE_GROUPS } from "../idea-sites";

/**
 * 「아이디어 발굴」 — 바깥 사이트로 **안내만** 한다.
 *
 * 저작권 때문에 한 사이트(핀터레스트)로 바로 내보내던 버튼을, 고르는 창을
 * 거쳐 나가게 바꿨다. 이 시험은 그 약속 셋을 지킨다 — 이름, 창을 거친다는 것,
 * 사용자가 꼭 넣어 달라고 한 사이트.
 *
 * jsdom 이 없는 저장소라 버튼은 소스를 글자로 읽는다.
 */
const sites = IDEA_SITE_GROUPS.flatMap((group) => group.sites);
const button = readFileSync(
  path.join(process.cwd(), "app/_components/reference-hunt-button.tsx"),
  "utf8",
);

describe("아이디어 발굴 사이트 목록", () => {
  it("사용자가 지정한 사이트가 다 있다", () => {
    const names = sites.map((site) => site.name);
    for (const name of ["핀터레스트", "픽사베이", "망고보드", "미리캔버스"]) {
      expect(names).toContain(name);
    }
  });

  it("주소는 모두 https 이고 겹치지 않는다", () => {
    const urls = sites.map((site) => site.url);
    for (const url of urls) expect(new URL(url).protocol).toBe("https:");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("빈 묶음이 없고, 사이트마다 한 줄 설명이 있다", () => {
    for (const group of IDEA_SITE_GROUPS) expect(group.sites.length).toBeGreaterThan(0);
    for (const site of sites) expect(site.note.trim().length).toBeGreaterThan(0);
  });
});

describe("아이디어 발굴 버튼", () => {
  it("이름이 「아이디어 발굴」이다 — 옛 이름이 남지 않는다", () => {
    expect(button).toContain("아이디어 발굴");
    expect(button).not.toContain("레퍼런스 찾기");
  });

  it("바로 나가지 않고 창을 먼저 연다", () => {
    expect(button).toContain("<Dialog");
    // 버튼 자체가 바깥 주소로 가는 링크면 창을 건너뛴다.
    expect(button).not.toMatch(/href="https?:/);
  });

  it("바깥 링크는 새 탭에서, 우리 주소를 넘기지 않고 연다", () => {
    expect(button).toContain('target="_blank"');
    expect(button).toContain('rel="noreferrer noopener"');
  });
});
