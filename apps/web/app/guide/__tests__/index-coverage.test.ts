import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS } from "../_components/topics";

/**
 * **설명서를 더하면 봇도 그것을 알아야 한다**(2026-09-28).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 설명서 둘(`계정과 플랜`·`막혔을 때`)을 새로 써서 배포하고 색인을 돌렸는데
 * **봇은 그 글을 못 봤다.** 색인 스크립트가 쪽 목록을 **손으로** 들고 있고
 * 거기 안 넣었기 때문이다.
 *
 * 화면에는 멀쩡히 있고 봇만 모르는 상태라 **알아채기가 어렵다.** 사용자가
 * 「탈퇴는 어떻게 하나요」를 물었을 때 「모릅니다」가 나와야 비로소 안다.
 *
 * ── 왜 목록이 둘인가 ───────────────────────────────────────
 *
 * 목차(`topics.ts`)는 **꺼진 기능의 설명서를 뺀다**(`isDisabledRoute`).
 * 지식은 반대다 — 꺼진 기능도 알아야 「팀 기능이 왜 안 보이나요」에 답한다.
 * 그래서 색인은 제 목록을 따로 든다. 그 판단 자체는 맞다.
 *
 * **둘이 어긋나는 것만 막으면 된다.** 파일이 정본이다.
 */

const web = join(__dirname, "..", "..", "..");
const 설명서폴더 = join(web, "app", "guide");
const 색인스크립트 = readFileSync(join(web, "..", "..", "scripts", "index-guide.mjs"), "utf8");

/** `app/guide` 아래 실제로 있는 쪽. 이것이 정본이다. */
function 실제쪽들(): string[] {
  const 하위 = readdirSync(설명서폴더, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && entry.name !== "__tests__")
    .map((entry) => `/guide/${entry.name}`);
  return ["/guide", ...하위].sort();
}

/** 색인이 긁으러 가는 주소. */
function 색인쪽들(): string[] {
  return [...색인스크립트.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]!).sort();
}

describe("설명서와 색인", () => {
  it("빈 목록을 재고 있지 않다", () => {
    expect(실제쪽들().length).toBeGreaterThan(5);
    expect(색인쪽들().length).toBeGreaterThan(5);
  });

  /**
   * **이것이 이 파일의 핵심이다.** 쪽을 더하고 색인에 안 넣으면 여기서 붉어진다.
   */
  it("모든 설명서 쪽이 색인에 들어 있다", () => {
    const 색인 = new Set(색인쪽들());
    const 빠진것 = 실제쪽들().filter((href) => !색인.has(href));

    expect(
      빠진것,
      "이 쪽들이 `scripts/index-guide.mjs` 의 목록에 없다. 화면에는 보이는데 도우미는 못 읽는다",
    ).toEqual([]);
  });

  /** 없는 쪽을 긁으러 가면 배포 때마다 「건너뜀」이 찍힌다. */
  it("색인이 없는 쪽을 긁으러 가지 않는다", () => {
    const 실제 = new Set(실제쪽들());
    const 없는것 = 색인쪽들().filter((href) => !실제.has(href));

    expect(없는것, "이 쪽들은 없는데 색인이 찾아간다").toEqual([]);
  });

  /**
   * **목차에만 없는 것은 정당하다.** 꺼진 기능의 설명서가 그렇다.
   * 그 반대(색인에만 없는 것)는 위에서 막았다.
   */
  it("목차에 있는 쪽은 색인에도 있다", () => {
    const 색인 = new Set(색인쪽들());
    const 빠진것 = GUIDE_TOPICS.map((topic) => topic.href).filter((href) => !색인.has(href));

    expect(빠진것, "목차에는 있는데 도우미가 못 읽는 쪽이 있다").toEqual([]);
  });

  /** 이름이 비면 조각의 출처가 빈 채로 들어간다. */
  it("쪽마다 이름이 있다", () => {
    const 이름없는것 = [...색인스크립트.matchAll(/\{\s*href:\s*"([^"]+)",\s*label:\s*"([^"]*)"/g)]
      .filter((m) => !m[2]!.trim())
      .map((m) => m[1]);

    expect(이름없는것).toEqual([]);
  });
});
