import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **남의 것을 보는 중이라고 먼저 말한다.**
 *
 * 처음에는 「회원용 길이 404 였나」로 판단했다. 그런데 **같은 팀 사람의
 * 작업은 회원용 길이 성공한다**(`lib/teams/scope.ts` 의 팀 범위). 그래서
 * 팀원의 상세페이지를 열면 누구 것인지 아무 표시가 없었다 — 자기 것인 줄
 * 알고 고치려 하게 된다(2026-09-16 독립 리뷰).
 *
 * 서버는 이미 `work.mine` 을 실어 보낸다. 화면이 그것을 보면 된다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(web, path), "utf8");

const SCREENS = [
  { file: "app/library/works/[id]/detail-client.tsx", flag: "body.work.mine" },
  { file: "app/characters/[id]/detail-client.tsx", flag: "body.character.mine" },
];

describe("남의 것이면 읽기 전용이라고 말한다", () => {
  it.each(SCREENS)("$file 은 404 가 아니라 **주인**으로 판단한다", ({ file, flag }) => {
    const source = read(file);

    // 회원용 길이 성공했을 때의 `readOnly` 는 주인 여부에서 나와야 한다.
    expect(source).toContain(`readOnly: !${flag}`);
    // 무조건 `false` 로 두던 옛 판단이 남아 있으면 안 된다.
    expect(source).not.toContain("readOnly: false");
  });

  it.each(SCREENS)("$file 은 관리자 통로로 온 것을 늘 읽기 전용으로 본다", ({ file }) => {
    /*
      관리자 통로는 남의 것을 읽을 때만 쓴다. 자기 것이면 회원용 길에서 이미
      열렸다 — 그래서 여기서는 따질 것이 없다.
    */
    expect(read(file)).toContain("readOnly: true");
  });
});

/**
 * 카드가 **낱장으로 판단하지 않는다.**
 *
 * 계정 보관 작업의 낱장은 설계상 늘 빈 배열이다(열 때 받는다). 카드가
 * `work.images` 를 훑어 무언가를 정하면 그 작업만 조용히 다른 답을 낸다 —
 * 「첫 화면」 배지가 영영 안 뜬 것이 그 예다(2026-09-16 독립 리뷰).
 *
 * 규칙만 시험하면 **화면이 그 규칙을 쓰는지**는 아무도 안 본다. 그래서 센다.
 */
describe("카드는 낱장 배열로 판단하지 않는다", () => {
  const source = read("app/library/works-tab.tsx");

  it("첫 화면 배지는 작업 단위로 본다", () => {
    expect(source).toContain("isWorkShowcased(showcase, work.tool, work.id)");
    expect(source).not.toContain("work.images.some(");
  });

  it("카드가 `work.images.length` 로 갈리지 않는다", () => {
    // 뷰어를 열지 말지도, 몇 장 묶음인지도 `imageCount` 로 정한다.
    expect(source).not.toContain("work.images.length");
  });
});
