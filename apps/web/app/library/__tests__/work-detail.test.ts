import { describe, expect, it } from "vitest";
import { processRows, sectionRows } from "../work-detail";

/**
 * 「과정 보기」 화면이 **무엇을 어떤 이름으로** 보여주나.
 *
 * 카드뉴스·포스터는 단계 막대가 있지만 상세페이지는 한 번에 만들어져 단계가
 * 없다. 그래서 캐릭터 화면과 같은 모양을 쓴다 — 「무엇을 하려 했나 → 어떤
 * 섹션으로 짰나 → 만들어진 그림」.
 */
describe("processRows", () => {
  it("요약과 비율에 이름을 붙인다", () => {
    expect(processRows({ summary: "전통 방식의 진정성으로 설득한다", aspectRatio: "4:5" })).toEqual([
      { label: "무엇을 하려던 것인가", value: "전통 방식의 진정성으로 설득한다" },
      { label: "비율", value: "4:5" },
    ]);
  });

  it("빈 값은 줄을 만들지 않는다", () => {
    // 빈 줄이 서면 화면이 고장난 것처럼 보인다.
    expect(processRows({ summary: "", aspectRatio: "4:5" })).toEqual([
      { label: "비율", value: "4:5" },
    ]);
  });

  it("과정이 없으면 줄도 없다", () => {
    /*
      이 칸이 생기기 전 작업은 영영 비어 있다. 화면은 「과정이 남아 있지
      않습니다」라고 **말해야** 한다 — 빈 화면만 내면 사라진 것으로 읽힌다
      (2026-09-16 포스터에서 실제로 그렇게 읽혔다).
    */
    expect(processRows(null)).toEqual([]);
    expect(processRows({})).toEqual([]);
  });

  it("심사 결과는 항목 수로 요약한다", () => {
    /*
      심사는 항목마다 근거와 고칠 점이 붙어 길다. 여기서는 몇 개를 봤는지만
      말하고, 자세한 것은 섹션 아래에 편다.
    */
    const rows = processRows({ review: { items: [{ criterion: "hook" }, { criterion: "proof" }] } });
    expect(rows).toEqual([{ label: "구성안 심사", value: "2개 항목을 봤습니다" }]);
  });

  it("심사 모양이 달라도 넘어지지 않는다", () => {
    // 남의 작업에서 오는 값이라 모양을 믿지 않는다.
    expect(processRows({ review: "통과" })).toEqual([]);
    expect(processRows({ review: { items: "둘" } })).toEqual([]);
  });
});

describe("sectionRows", () => {
  it("번호를 붙여 차례로 편다", () => {
    const rows = sectionRows({
      sections: [
        { title: "히어로", role: "첫 3초에 붙잡는다", copy: "100년 항아리에서" },
        { title: "성분" },
      ],
    });

    expect(rows).toEqual([
      { no: 1, title: "히어로", role: "첫 3초에 붙잡는다", copy: "100년 항아리에서" },
      { no: 2, title: "성분", role: "", copy: "" },
    ]);
  });

  it("과정이 없으면 섹션도 없다", () => {
    expect(sectionRows(null)).toEqual([]);
    expect(sectionRows({ summary: "요약" })).toEqual([]);
  });

  it("섹션이 배열이 아니어도 넘어지지 않는다", () => {
    expect(sectionRows({ sections: "히어로,성분" } as never)).toEqual([]);
  });
});
