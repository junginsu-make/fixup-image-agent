import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@fixup/shared";
import { getAccountItemImages } from "../library";

/**
 * 계정 보관분의 그림 번호.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-e
 *
 * **서버가 준 번호를 버리면 안 된다.** 이 함수는 `url` 이 없는 줄을 걸러내는데
 * (서명에 실패하면 `null` 이 들어온다), 걸러낸 **뒤의 배열 번호**를 서버 키로
 * 쓰면 한 장만 실패해도 그 뒤가 전부 한 칸씩 밀린다. 그러면 광고 규격
 * 내보내기가 **미리보기와 다른 그림을 뽑는다.**
 *
 * **이 시험이 없으면 조용히 되돌아간다.** `libraryImagePicks` 의
 * `position ?? index` 가 없는 값을 배열 번호로 메워 주기 때문에, 아래 한 줄이
 * 사라져도 타입도 화면도 아무 말을 안 한다 — 폴백이 고장을 감추는 쪽으로
 * 붙어 있다. 실제로 `position` 을 싣는 줄을 지워도 851개가 전부 초록이었다.
 *
 * **거르는 곳과 번호를 싣는 곳을 한 시험이 함께 덮는다.** 둘이 갈라져 있으면
 * 한쪽만 고치는 사람이 다른 쪽을 안 본다.
 */

function respondWith(images: Array<{ position: number; url: string | null }>) {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ ok: true, images }), {
      headers: { "content-type": "application/json" },
    }));
}

const item = { id: "i1", title: "가을 사진전" } as LibraryItem;

afterEach(() => vi.unstubAllGlobals());

describe("계정 보관분의 그림 번호", () => {
  it("서버가 준 번호를 그대로 싣는다", async () => {
    respondWith([{ position: 0, url: "a" }, { position: 1, url: "b" }]);
    const result = await getAccountItemImages(item);
    expect(result!.images.map((image) => image.position)).toEqual([0, 1]);
  });

  /**
   * **여기가 핵심이다.** 서명에 실패한 줄을 걸러내면 배열 번호가 밀린다.
   * 번호를 안 실으면 2번 그림을 고르고 **1번을 뽑게 된다.**
   */
  it("중간이 걸러져도 실제 번호를 따라간다", async () => {
    respondWith([
      { position: 0, url: "a" },
      { position: 1, url: null },
      { position: 2, url: "c" },
    ]);
    const result = await getAccountItemImages(item);
    expect(result!.images.map((image) => image.image)).toEqual(["a", "c"]);
    expect(result!.images.map((image) => image.position), "배열 번호(0,1)가 아니다")
      .toEqual([0, 2]);
  });

  /** 번호가 연속이 아닌 경우도 같다 — 표의 값을 그대로 따른다. */
  it("번호가 띄엄띄엄해도 그대로 쓴다", async () => {
    respondWith([{ position: 3, url: "d" }, { position: 7, url: "h" }]);
    const result = await getAccountItemImages(item);
    expect(result!.images.map((image) => image.position)).toEqual([3, 7]);
  });

  it("쓸 수 있는 그림이 없으면 아무것도 주지 않는다", async () => {
    respondWith([{ position: 0, url: null }]);
    expect((await getAccountItemImages(item))!.images).toEqual([]);
  });
});
