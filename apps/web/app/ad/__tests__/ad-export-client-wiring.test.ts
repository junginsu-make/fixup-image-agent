import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 규칙과 화면을 잇는 줄들의 자물쇠.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-e
 *
 * **이 저장소에는 jsdom 이 없다.** `package.json` 을 건드리면 격리 계약이
 * 깨진다(§4.1). 그래서 판단은 `export-rules.ts` 로 뽑아 시험으로 잠그는데,
 * **그것을 부르는 줄은 계속 시험 밖에 남았다.** 실제로 아래 줄들을 지워도
 * 저장소 834개가 전부 초록이었다 — 그 줄들이 정확히 방금 고친 고장이 살던
 * 자리다.
 *
 * 문자열 대조라 리팩터링에 약하다. **그것이 이 시험의 값이다** — 이 줄을
 * 건드리면 사람이 한 번 멈춰 선다. 같은 방식이 `app/poster/__tests__/
 * new-client-wiring.test.ts` 와 `packages/sns-core/src/__tests__/
 * ad-isolation-lock.test.ts` 에 이미 있다.
 */

const client = readFileSync(new URL("../ad-export-client.tsx", import.meta.url), "utf8");
const fileRoute = readFileSync(
  new URL("../../api/poster/projects/[id]/images/[index]/file/route.ts", import.meta.url),
  "utf8",
);

describe("어디서 그림을 가져오는가", () => {
  /** 지우면 포스터 작업이 라이브러리 갈래로 가서 다시 「찾을 수 없습니다」가 된다. */
  it("어느 표를 읽을지 서버에 알린다", () => {
    expect(client).toContain("source: item.source");
  });

  it("포스터면 포스터 목록을 읽는다", () => {
    expect(client).toMatch(/next\.source === "poster"\s*\?\s*await posterItemImages\(next\.id\)/);
  });

  it("두 목록을 합쳐 보여 준다", () => {
    expect(client).toContain("adSourceItems(library, posters)");
  });
});

describe("어느 그림을 뽑는가", () => {
  /**
   * **배열 번호를 보내면 안 된다.** 서버는 그것을 `variantIndex` 로 읽는데
   * 그 번호는 배치마다 0 부터 다시 시작한다 — 사용자가 A 를 보고 골랐는데
   * ZIP 에는 B 가 담긴다.
   */
  it("고른 그림의 실제 번호를 보낸다", () => {
    expect(client).toContain("setPosition(image.position)");
    expect(client, "배열 번호로 되돌아가면 안 된다").not.toContain("setPosition(index)");
  });

  it("두 목록 다 순수 규칙이 번호를 정한다", () => {
    expect(client).toContain("posterImagePicks(projectId,");
    expect(client).toContain("libraryImagePicks(");
  });
});

describe("로컬에서 전체 조회를 안 쓴다", () => {
  /**
   * 지우면 로컬에서 포스터 그림이 한 장도 안 보인다(500) — 「사람 눈이 의도
   * 검증이다」가 통째로 없어진다. 순수 함수만 시험하면 이 줄이 안 잠긴다.
   *
   * **둘이 함께 있어야 한다.** 누가 전체를 보는가는 `access/core.ts` 가 정하고
   * (`hasFullScope`), 로컬 예외는 `usesAdminLookup` 이 더한다. 한쪽만 남으면
   * 목록과 상세가 어긋나거나(2026-09-04) 로컬이 500 이 된다.
   */
  it("등록부의 판단 위에 로컬 예외를 얹는다", () => {
    expect(fileRoute).toMatch(
      /usesAdminLookup\(\s*hasFullScope\(viewerFrom\(auth\.member\), "read"\),\s*isLocalStoreEnabled\(\),?\s*\)/,
    );
  });
});

describe("고른 그림이 없는 상태로 두지 않는다", () => {
  /**
   * `position` 이 서버 번호가 된 뒤로 `0` 은 **목록에 없을 수 있는 값**이다.
   * 라이브러리에서 첫 그림의 서명이 실패하면 목록이 1번부터 그려지고, 그때
   * 아무것도 선택돼 보이지 않는데 뽑으면 0번을 보낸다.
   */
  it("첫 장의 실제 번호로 시작한다", () => {
    expect(client).toContain("setPosition(loaded[0]?.position ?? 0)");
  });

  /**
   * `loadLibrary()` 가 거절하지 않는다는 사실은 **다른 파일에** 있다. 그
   * 가정이 깨지는 날 이 화면이 「불러오는 중…」에 영원히 멈추지 않게 한다.
   */
  it("목록 적재가 실패해도 멈추지 않는다", () => {
    expect(client).toMatch(/\.catch\(\(\) => setItems\(\[\]\)\)/);
  });
});

describe("너무 작아진 것을 화면이 알린다", () => {
  /**
   * `batch.ts` 가 `tooSmall` 을 실어 줘도 **화면이 안 그리면 뜻이 없다.**
   * 설계 §5.4② 가 「막지 않고 알린다」로 정한 자리다 — 규격 검증은 이것을
   * 통과시키므로 사람 눈이 유일한 관문이다.
   */
  it("경고를 그린다", () => {
    expect(client).toContain("entry.tooSmall");
    expect(client).toMatch(/너무 작게 들어갔습니다/);
  });
});

describe("투명 배너를 투명하게 보여 준다", () => {
  /**
   * 규칙이 있어도 **화면이 안 부르면 뜻이 없다.** 이 기능의 존재 이유가
   * 투명인데, 회색 판 위에 그리면 사람이 그것만 확인할 수 없다(설계 §6.3).
   */
  it("미리보기 바탕에 체크무늬를 건다", () => {
    expect(client).toContain("previewBackdrop(entry.format)");
  });
});
