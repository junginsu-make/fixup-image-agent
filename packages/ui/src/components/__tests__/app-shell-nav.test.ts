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

  /**
   * **이미지 갈래의 맨 끝에 온다** (2026-09-21 사용자가 정한 차례 —
   * 쉽게 · 다양하게 · 캐릭터 · 광고소재).
   *
   * 전에는 「만들고 → 뽑는」 차례가 보이게 `/poster` **바로 뒤**였다. 갈래가
   * 생기면서 **갈래 안에 있다는 것**이 그 뜻을 대신한다.
   *
   * 갈래 한가운데에 끼면 화면이 깨진다 — 사이드바는 「앞 항목과 갈래가 다르면
   * 머리말」로 그리므로, 갈래가 섞이면 같은 머리말이 두 번 뜬다.
   */
  it("이미지 갈래의 맨 끝에 온다", () => {
    const 이미지갈래 = navGroupsFor(true)
      .flatMap((group) => group.items)
      .filter((item) => item.section === "이미지");

    expect(이미지갈래[이미지갈래.length - 1]?.href).toBe("/ad");
  });

  /** 갈래가 섞이면 같은 머리말이 두 번 뜬다. */
  it("갈래가 이어져 있다", () => {
    for (const on of [true, false]) {
      for (const group of navGroupsFor(on)) {
        const 나온갈래 = group.items
          .map((item) => item.section)
          .filter((section, at, all) => section !== all[at - 1]);

        expect(new Set(나온갈래).size, `${group.label} 의 갈래가 흩어졌다`)
          .toBe(나온갈래.length);
      }
    }
  });

  /**
   * **이름이 짧아진 만큼 갈래가 뜻을 진다.** 갈래 없는 「만들기」는 무엇의
   * 만들기인지 알 수 없다.
   */
  it("도구는 모두 갈래에 든다", () => {
    const 도구 = navGroupsFor(true).find((group) => group.label === "도구");

    expect(도구).toBeTruthy();
    expect(도구!.items.filter((item) => !item.section)).toEqual([]);
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
