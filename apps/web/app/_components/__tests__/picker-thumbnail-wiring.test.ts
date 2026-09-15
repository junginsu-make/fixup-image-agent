import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 불러오기·첨부 창이 **사본을 쓰고 있는가.**
 *
 * `grid-src.ts` 를 아무리 잘 만들어도 화면이 안 부르면 소용이 없다. 실제로
 * 그랬다 — 사본 주소를 받아 놓고도 격자에 원본을 걸어, 창 하나에 수십 MB 가
 * 오갔다(2026-09-15: 사본 68KB · 원본 2,199KB, 32배).
 *
 * **화면은 멀쩡히 뜬다.** 느리기만 해서 아무도 못 찾는다. 그래서 글자로
 * 지킨다 — 이 저장소가 같은 자리에서 여러 번 깨진 방식이다.
 *
 * 세는 것이지 찾는 것이 아니다. 처음엔 "`gridSrc` 라는 글자가 있나"만 봤는데,
 * 한 자리를 `src={image.url}` 로 되돌려도 다른 자리에 글자가 남아 여덟 개가
 * 전부 초록이었다(뮤테이션으로 확인). 자리 수를 박아 두면 하나만 빠져도 빨개진다.
 */

const ROOT = join(__dirname, "..", "..");

/**
 * 격자를 그리는 화면과 **그 안의 사본 자리 수.**
 *
 * 자리를 새로 늘리거나 줄이면 이 숫자도 같이 고친다. 숫자를 고치는 순간
 * "여기 격자가 하나 늘었다"를 의식하게 되는 것이 이 시험의 목적이다.
 */
const GRIDS: Record<string, number> = {
  "_components/library-picker.tsx": 3,
  "_components/character-picker.tsx": 2,
  "poster/_components/reference-picker.tsx": 1,
  "library/set-editor.tsx": 1,
  "create/SavedImagePicker.tsx": 1,
  "sns/layout/library-picker.tsx": 1,
};

const FILES = Object.keys(GRIDS);

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("불러오기 창 — 사본 배선", () => {
  it.each(FILES)("%s 는 격자에 맨 img 를 쓰지 않는다", (file) => {
    // `<img` 로만 찾는다. `<ImagePlus`(아이콘) 같은 것에 걸리지 않게
    // 바로 뒤에 공백이나 `>` 가 오는 것만 센다.
    expect(sourceOf(file)).not.toMatch(/<img[\s>]/);
  });

  it.each(FILES)("%s 의 격자가 모두 사본 규칙을 지난다", (file) => {
    // **여는 태그와 src 를 한 덩어리로 본다.** `ThumbImage` 를 쓰면서
    // 원본을 먹이는 편집이 가장 잦은 실수다 — 그건 위 시험에 안 걸린다.
    const wired = sourceOf(file).match(/<ThumbImage[^>]*\ssrc=\{gridSrc\(/g) ?? [];
    expect(wired.length).toBe(GRIDS[file]);
  });

  it("라이브러리 목록도 같은 규칙을 쓴다", () => {
    // 규칙이 두 군데 따로 적혀 있으면 한쪽만 고쳐진 채 끝난다.
    expect(sourceOf("library/works-cover.ts")).toContain("gridSrc");
  });

  it("확대는 원본으로 연다", () => {
    // 격자만 작은 것으로 바꾼다. 확대까지 사본이 되면 화질이 나빠진다.
    expect(sourceOf("_components/library-picker.tsx"))
      .toContain("openImageViewer(image.url");
  });

  it("불러오기 창을 쓰는 화면은 모두 사본 주소를 넘긴다", () => {
    /*
      `LibraryPickImage.thumbUrl` 을 물음표 없는 칸으로 둔 덕에 이건 타입
      검사가 먼저 잡는다. 그래도 세어 두는 이유는, 누군가 급할 때 물음표를
      되붙이면 그 순간 넷 중 하나가 조용히 빠지기 때문이다 — 실제로 그렇게
      카드뉴스 첨부 창이 안 고쳐진 채로 남았다(2026-09-15).
    */
    const callers = [
      "ad/ad-export-client.tsx",
      "characters/CharacterStudio.tsx",
      "poster/_components/reference-picker.tsx",
      "sns/_components/attachment-picker.tsx",
    ];
    for (const caller of callers) {
      expect(sourceOf(caller), `${caller} 가 thumbUrl 을 안 넘긴다`).toContain("thumbUrl:");
    }
  });

  it("저장된 이미지 창은 세 출처 모두 사본 주소를 넘긴다", () => {
    /*
      이 창은 **셋을 한 격자에 섞는다** — 디자인 레퍼런스 · 라이브러리 참고
      이미지 · 작업물. 하나만 원본이어도 격자 전체가 그만큼 무거워지는데,
      화면은 똑같이 뜨므로 어느 출처가 무거운지 눈으로는 못 가린다.

      실제로 디자인 레퍼런스만 `thumbUrl: null` 로 박혀 있었다. 표에 사본
      칸이 없던 시절의 주석이 그대로 남아 있었기 때문이다(2026-09-15).
    */
    const source = sourceOf("create/SavedImagePicker.tsx");
    expect(source).not.toContain("thumbUrl: null");
    expect(source).toContain("thumbUrl: item.thumbUrl ?? null");
  });
});
