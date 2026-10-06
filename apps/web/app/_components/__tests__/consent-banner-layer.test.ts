import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **동의 띠는 첫 화면의 떠 있는 것들보다 위에 있어야 한다**(2026-10-06 운영 확인).
 *
 * 첫 화면을 내리면 「맨 위로」 단추(`.mcs-to-top`, z-index 60)가 오른쪽 아래에 떠서 동의 띠(z-50)를
 * 덮었다. 「거부」를 누르려던 손이 그 아래로 빠져 다른 것이 눌렸다 — 거부를 못 하는 동의 띠는
 * 처리방침 제11조 약속을 못 지킨다. 그렇다고 처리방침 창(`.mcs-legal-backdrop`, 100)보다 높으면
 * 띠의 「개인정보 처리방침」을 열었을 때 그 창을 가린다. 그래서 둘 사이에 둔다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function cssZ(css: string, selector: string): number {
  const block = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return Number(block.match(/z-index:\s*(\d+)/)?.[1]);
}

const banner = read("../consent-banner.tsx");
const bannerZ = Number(banner.match(/fixed inset-x-0 bottom-0 z-\[?(\d+)\]?/)?.[1]);
const hero = read("../../_landing/hero/hero.css");
const landing = read("../../_landing/landing.css");

describe("동의 띠 층 순서", () => {
  it("코드에서 층 값을 읽는다", () => {
    expect(bannerZ).toBeGreaterThan(0);
    expect(cssZ(hero, ".mcs-to-top")).toBeGreaterThan(0);
    expect(cssZ(landing, ".mcs-header")).toBeGreaterThan(0);
    expect(cssZ(hero, ".mcs-legal-backdrop")).toBeGreaterThan(0);
  });

  it("「맨 위로」 단추와 머리보다 위", () => {
    expect(bannerZ).toBeGreaterThan(cssZ(hero, ".mcs-to-top"));
    expect(bannerZ).toBeGreaterThan(cssZ(landing, ".mcs-header"));
  });

  it("처리방침 창보다는 아래 — 띠에서 처리방침을 열면 그 창이 위에 뜬다", () => {
    expect(bannerZ).toBeLessThan(cssZ(hero, ".mcs-legal-backdrop"));
  });
});
