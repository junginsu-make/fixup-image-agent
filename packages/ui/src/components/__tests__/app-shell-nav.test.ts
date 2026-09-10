import { describe, expect, it } from "vitest";
import { navGroupsFor } from "../app-shell";

const hrefs = (hasAd: boolean) => navGroupsFor(hasAd).flatMap((g) => g.items.map((i) => i.href));

describe("사이드바 메뉴", () => {
  /**
   * **꺼져 있으면 메뉴에도 없다.** 화면을 감추는 것은 안내일 뿐이고 실제
   * 차단은 `/ad` 의 `notFound()` 가 하지만, 눌러서 404 를 만나는 메뉴는
   * 관리자·팀 메뉴가 이미 안 하는 일이다.
   */
  it("광고 스위치가 꺼지면 광고 메뉴가 없다", () => {
    expect(hrefs(false)).not.toContain("/ad");
  });

  it("켜지면 광고 메뉴가 생긴다", () => {
    expect(hrefs(true)).toContain("/ad");
  });

  /** 만들고 → 뽑는 차례가 눈에 보여야 한다. */
  it("「이미지 만들기」 바로 뒤에 온다", () => {
    const list = hrefs(true);
    expect(list[list.indexOf("/poster") + 1]).toBe("/ad");
  });

  /** 스위치는 광고 하나만 건드린다 — 다른 메뉴가 딸려 사라지면 안 된다. */
  it("다른 메뉴는 그대로다", () => {
    expect(hrefs(true).filter((h) => h !== "/ad")).toEqual(hrefs(false));
  });

  /**
   * 수집 화면 둘을 2026-09-10 에 뺐다. 운영자 판단으로 자동 수집을 당분간
   * 안 쓴다. 화면과 표는 그대로 두고 입구만 닫았다 — 켜는 곳은
   * `apps/web/lib/access/routes.ts` 의 `disabled` 두 줄이고, 그때 이 묶음도
   * 같이 되살린다. 저쪽 시험(`access/__tests__/routes.test.ts`)이 이 파일을
   * 글자로 읽어 둘이 어긋나지 않는지 본다.
   */
  it("꺼 둔 수집 화면이 메뉴에 없다", () => {
    for (const on of [true, false]) {
      expect(hrefs(on)).not.toContain("/inbox");
      expect(hrefs(on)).not.toContain("/sources");
    }
  });

  it("어느 쪽이든 주소가 겹치지 않는다", () => {
    for (const on of [true, false]) {
      expect(new Set(hrefs(on)).size).toBe(hrefs(on).length);
    }
  });
});
