import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **「추천인」이 아니라 「추천코드」다**(2026-09-22 사용자 정정).
 *
 * ── 왜 값으로 재 두나 ──────────────────────────────────────
 *
 * 이름은 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고 시험도 통과한다.
 * 그래서 조용히 되돌아온다 — 새 화면을 만들며 옆 파일을 베끼거나, 옛 문서를
 * 보고 문구를 짓거나. 브랜드 이름에서 이미 한 번 겪었다.
 *
 * ── 무엇은 안 바꾸나 ───────────────────────────────────────
 *
 * **표의 칸 이름(`referrer_input`)과 코드 속 이름(`referrer`)은 그대로다.**
 * 사용자는 그것을 안 본다. 칸 이름을 바꾸면 마이그레이션이 하나 더 필요하고,
 * 그 사이 가입이 전부 실패한다.
 */

const WEB = join(process.cwd(), "app");

/** 사용자 눈에 닿는 글이 사는 곳. */
const 보이는곳 = [
  "signup/page.tsx",
  "settings/profile-card.tsx",
  "admin/member-list/member-info.tsx",
  "admin/member-list/member-table.tsx",
  "admin/page.tsx",
];

/** 주석을 뺀 실제 코드. 고친 까닭을 적으려면 옛 이름을 인용해야 한다. */
const 코드만 = (rel: string) =>
  readFileSync(join(WEB, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("사용자에게 보이는 이름", () => {
  it("**셀 파일이 실제로 있다** — 못 찾으면 아래가 전부 조용히 통과한다", () => {
    for (const rel of 보이는곳) {
      expect(() => 코드만(rel), rel).not.toThrow();
    }
  });

  it("**옛 이름이 한 곳도 안 남았다**", () => {
    const 남은것 = 보이는곳.filter((rel) => 코드만(rel).includes("추천인"));

    expect(남은것, `「추천인」이 남은 곳: ${남은것.join(", ")}`).toEqual([]);
  });

  it("**새 이름이 실제로 쓰인다** — 지우기만 하면 빈 자리가 된다", () => {
    const 쓰는곳 = 보이는곳.filter((rel) => 코드만(rel).includes("추천코드"));

    expect(쓰는곳.length, "새 이름을 쓰는 곳이 너무 적다").toBeGreaterThanOrEqual(4);
  });
});

/**
 * **회원이 적은 것을 관리자가 본다**(2026-09-22 사용자 요청).
 *
 * 「여기에 작성된게 관리자페이지 각 회원들도 다 보여야 합니다」.
 *
 * ── 어디서 재는가 ──────────────────────────────────────────
 *
 * 값이 화면까지 오는 길이 셋이다 — 표에서 읽고(`readProfileExtras`), 줄에
 * 실어(`admin/page.tsx`), 회원마다 그린다(`member-table.tsx`). 가운데가
 * 하나만 끊겨도 **아무 말 없이 빈 칸**이 된다.
 */
describe("관리자 화면이 회원마다 보여 준다", () => {
  const table = 코드만("admin/member-list/member-table.tsx");
  const page = 코드만("admin/page.tsx");

  it("**회원 줄마다 그린다**", () => {
    expect(table, "회원 줄에 추천코드를 안 그린다").toMatch(/row\.referrer/);
  });

  it("**내려받는 표에도 들어간다**", () => {
    expect(table).toContain("추천코드");
    expect(table, "CSV 줄에 값을 안 싣는다").toMatch(/row\.referrer\s*\?\?\s*""/);
  });

  it("**목록을 만들 때 값을 실어 준다**", () => {
    expect(page, "줄에 추천코드를 안 싣는다").toMatch(/referrer:\s*extras\.get/);
  });

  it("**모든 회원 몫을 한 번에 읽는다** — 한 명씩 읽으면 목록이 비는 날이 온다", () => {
    expect(page).toMatch(/readProfileExtras\(ids\)/);
  });
});
