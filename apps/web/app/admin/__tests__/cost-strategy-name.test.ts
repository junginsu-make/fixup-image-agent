import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **「비용 전략실」이 아니라 「비용 전략」이다**(2026-09-23 사용자 정정).
 *
 * ── 왜 값으로 재 두나 ──────────────────────────────────────
 *
 * 이름은 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고 시험도 통과한다.
 * 그래서 조용히 되돌아온다 — 새 화면을 만들며 옆 파일을 베끼거나, 옛 문서를
 * 보고 문구를 짓거나. 브랜드 이름(MCS → FormWith)과 추천코드에서 이미 두 번
 * 겪었다.
 *
 * ── 무엇은 안 바꾸나 ───────────────────────────────────────
 *
 * **주소(`/admin/cost-lab`)와 코드 속 이름(`CostLabFrame`·`cost-lab.ts`)은
 * 그대로다.** 사용자는 그것을 안 본다. 주소를 바꾸면 저장해 둔 링크가 끊긴다.
 */

const WEB = process.cwd();

/** 사용자 눈에 닿는 글이 사는 곳. */
const 보이는곳 = [
  "app/admin/admin-tabs.tsx",
  "app/admin/cost-lab/page.tsx",
  "app/admin/cost-lab/cost-lab-frame.tsx",
  "app/admin/cost-lab/doc/[file]/route.ts",
  "app/admin/cost-lab/assets/index.html",
  "app/admin/cost-lab/assets/prepaid.html",
  "lib/admin/cost-lab.ts",
];

const 읽기 = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/** 주석을 뺀 실제 코드. 고친 까닭을 적으려면 옛 이름을 인용해야 한다. */
const 코드만 = (rel: string) =>
  읽기(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("사용자에게 보이는 이름", () => {
  it("**셀 파일이 실제로 있다** — 못 찾으면 아래가 전부 조용히 통과한다", () => {
    for (const rel of 보이는곳) {
      expect(() => 읽기(rel), rel).not.toThrow();
    }
  });

  it("**옛 이름이 한 곳도 안 남았다**", () => {
    const 남은것 = 보이는곳.filter((rel) => 코드만(rel).includes("비용 전략실"));

    expect(남은것, `「비용 전략실」이 남은 곳: ${남은것.join(", ")}`).toEqual([]);
  });

  it("**새 이름이 실제로 쓰인다** — 지우기만 하면 빈 자리가 된다", () => {
    const 쓰는곳 = 보이는곳.filter((rel) => 코드만(rel).includes("비용 전략"));

    expect(쓰는곳.length, "새 이름을 쓰는 곳이 너무 적다").toBeGreaterThanOrEqual(5);
  });

  /**
   * **관리자 탭에 그 이름이 그대로 떠야 한다.** 파일에 글자가 있어도 탭이
   * 다른 이름을 그리면 사용자는 못 본다.
   */
  it("**관리자 탭이 「비용 전략」으로 부른다**", () => {
    const tabs = 코드만("app/admin/admin-tabs.tsx");

    expect(tabs).toMatch(/["']비용 전략["']/);
  });
});

/**
 * **주소는 안 바꾼다.** 저장해 둔 링크가 끊긴다.
 */
describe("주소는 그대로다", () => {
  it("**`/admin/cost-lab` 이 그대로 있다**", () => {
    expect(코드만("app/admin/admin-tabs.tsx")).toContain("/admin/cost-lab");
    expect(statSync(join(WEB, "app/admin/cost-lab/page.tsx")).isFile()).toBe(true);
  });
});

/**
 * **카드뉴스는 5장으로 센다**(2026-09-23 사용자).
 *
 * 비용 전략의 작업 표는 처음부터 「6카드 중 생성 이미지 5장 가정」이었는데
 * 플랜 표만 8이라, 같은 화면에서 두 숫자가 갈려 있었다.
 */
describe("카드뉴스 장수", () => {
  const html = 읽기("app/admin/cost-lab/assets/index.html");

  it("**플랜 표 머리가 5장이라고 적는다**", () => {
    expect(html, "아직 8장이라고 적혀 있다").not.toContain("카드뉴스 (8장)");
    expect(html).toContain("카드뉴스 (5장)");
  });

  it("**작업 표도 5장 가정 그대로다** — 두 숫자가 갈리면 안 된다", () => {
    expect(html).toContain("6카드 중 생성 이미지 5장 가정");
  });
});

/** 폴더를 통째로 훑어 빠뜨린 자리가 없는지 본다. */
describe("빠뜨린 자리", () => {
  const 훑기 = (dir: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(join(WEB, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(WEB, rel)).isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        out.push(...훑기(rel));
      } else if (/\.(ts|tsx|html|js)$/.test(name)) {
        out.push(rel);
      }
    }
    return out;
  };

  it("**cost-lab 폴더 어디에도 옛 이름이 없다**", () => {
    const 남은것 = 훑기("app/admin/cost-lab").filter((rel) => 코드만(rel).includes("비용 전략실"));

    expect(남은것, `옛 이름이 남은 곳: ${남은것.join(", ")}`).toEqual([]);
  });
});
