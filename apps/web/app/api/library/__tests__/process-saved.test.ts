import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const web = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(web, path), "utf8");

/**
 * 작업을 저장할 때 **과정을 빠뜨리지 않는지** 원본을 보고 센다.
 *
 * 이런 것은 값으로 재기 어렵다. 저장은 브라우저에서 일어나고 Supabase 를
 * 거치는데, 로컬에는 Supabase 가 없다(`CLAUDE.md`). 그래서 원본을 센다.
 *
 * **「있는지」가 아니라 「몇 군데인지」를 센다.** 한 곳만 걸어 두고 통과시키면,
 * 나중에 저장하는 자리가 하나 더 생겨도 가늠자는 조용히 초록으로 남는다.
 * 실제로 이 저장소에서 `LibraryPicker` 를 셀 때 `| head` 로 잘라 보는 바람에
 * 부르는 곳 하나를 놓친 적이 있다(2026-09-16).
 */
describe("작업을 저장할 때 과정도 함께 보낸다", () => {
  /**
   * `/api/library` 에 **그림을 올리는** 호출이 몇 군데인가.
   *
   * 목록을 읽거나(`GET`) 지우는(`DELETE`) 호출은 세지 않는다 — `images:` 를
   * 함께 보내는 것만이 「작업을 저장하는 자리」다.
   */
  const savers = [
    { file: "app/create/PdpEditor.tsx", maker: "pdpProcessSource", calls: 1 },
    { file: "app/redesign/redesign-wizard.tsx", maker: "redesignProcessSource", calls: 2 },
  ];

  it.each(savers)("$file 의 저장 $calls 군데가 모두 과정을 보낸다", ({ file, maker, calls }) => {
    const source = read(file);

    // 그림을 올리는 호출 = 본문에 `images` 를 담아 보내는 자리
    const uploads = source.match(/\n\s+images(,|:)/g) ?? [];
    expect(uploads.length, `${file} 의 저장 자리 수가 변했다 — 가늠자를 고쳐라`).toBe(calls);

    /*
      과정을 짓는 호출 수. 펼쳐 넣든(`...maker(`) 도우미에 넘기든(`process:
      maker(`, 리디자인의 한 장씩 올리기 — `library-upload.ts`) 저장 자리마다
      한 번이다. 가져오는 줄(`import { maker }`)에는 괄호가 없어 안 센다.
    */
    const spreads = source.split(`${maker}(`).length - 1;
    expect(spreads, `${file} 에서 과정을 안 보내는 저장이 있다`).toBe(calls);
  });

  it("서버가 화면이 보낸 것을 그대로 담지 않는다", () => {
    /*
      화면을 믿고 그대로 넣으면 base64 한 장이 섞여 드는 길이 열린다. 반드시
      `workProcessOf` 를 거쳐야 한다 — 서버가 마지막 문지기다.
    */
    const route = read("app/api/library/route.ts");

    expect(route).toContain("workProcessOf(");
    expect(route.match(/process:\s*workProcessOf\(/g)?.length).toBe(1);
    // 몸통의 값을 과정 칸에 바로 넣는 길이 없어야 한다.
    expect(route).not.toMatch(/process:\s*body\./);
  });

  it("표에 담는 자리는 한 곳뿐이다", () => {
    const store = read("lib/server-library.ts");

    expect(store.match(/data:\s*input\.process/g)?.length).toBe(1);
    /*
      이어 붙일 때는 과정을 덮지 않는다. 덮으면 마지막 섹션이 보던 것이
      작업 전체의 과정이 되어 버린다.

      **기준점을 못 찾으면 먼저 실패한다.** 처음에는 `\n` 을 넣어 찾았는데,
      이 저장소는 CRLF 로 체크아웃되어(673줄) 그 문자열이 절대 안 잡혔다.
      `indexOf` 가 -1 을 주고 `slice(-1)` 이 마지막 한 글자만 넘기니 **무엇을
      넣어도 통과하는** 가드였다 — 2026-09-16 독립 리뷰가 실증했다.
    */
    const at = store.search(/appendTo\r?\n\s*\? \{ image_count/);
    expect(at, "이어 붙이는 자리를 못 찾았다 — 가늠자를 고쳐라").toBeGreaterThan(-1);
    expect(store.slice(at, at + 400)).not.toContain("data:");
  });
});
