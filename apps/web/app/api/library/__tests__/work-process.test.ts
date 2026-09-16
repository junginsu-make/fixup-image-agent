import { describe, expect, it } from "vitest";
import {
  hasProcess,
  pdpProcessSource,
  redesignProcessSource,
  workProcessOf,
} from "../work-process";

/**
 * 상세페이지 작업의 **과정**을 무엇으로 남기나.
 *
 * 카드뉴스·포스터는 작업 표에 과정이 통째로 남는데 상세페이지는 제목·비율·
 * 표지만 남았다. 「과정 보기」를 눌러도 보여줄 것이 없었다.
 */
describe("workProcessOf", () => {
  const full = {
    blueprint: {
      executiveSummary: "전통 방식의 진정성으로 설득한다",
      sections: [
        { title: "히어로", role: "hook", copy: "첫 문장" },
        { title: "성분", role: "evidence", copy: "둘째 문장" },
      ],
    },
    review: { verdict: "ok" },
    aspectRatio: "4:5",
  };

  it("요약·섹션·심사·비율을 담는다", () => {
    const process = workProcessOf(full)!;

    expect(process.summary).toBe("전통 방식의 진정성으로 설득한다");
    expect(process.sections).toHaveLength(2);
    expect(process.sections![0]).toEqual({ title: "히어로", role: "hook", copy: "첫 문장" });
    expect(process.review).toEqual({ verdict: "ok" });
    expect(process.aspectRatio).toBe("4:5");
  });

  it("원본 사진은 담지 않는다", () => {
    /*
      `originalImage` 는 base64 라 한 장이 수 MB 고, 결과 그림은 이미
      `library_images` 에 따로 저장된다. 과정 칸에까지 넣으면 행 하나가
      통째로 무거워진다.
    */
    const process = workProcessOf({
      ...full,
      // @ts-expect-error — 실수로 흘러들어도 안 담기는지 본다
      originalImage: "data:image/png;base64,AAAA",
    })!;

    expect(process).not.toHaveProperty("originalImage");
    expect(JSON.stringify(process)).not.toContain("base64");
  });

  it("제목도 원고도 없는 섹션은 뺀다", () => {
    // 빈 줄이 서면 화면이 고장난 것처럼 보인다.
    const process = workProcessOf({
      blueprint: { executiveSummary: "요약", sections: [
        { title: "", role: "hook", copy: "" },
        { title: "성분", copy: "있다" },
      ] },
    })!;

    expect(process.sections).toHaveLength(1);
    expect(process.sections![0]!.title).toBe("성분");
  });

  it("빈 칸은 만들지 않는다", () => {
    const process = workProcessOf({ blueprint: { executiveSummary: "요약" } })!;

    expect(process).toEqual({ summary: "요약" });
    expect(process).not.toHaveProperty("sections");
    expect(process).not.toHaveProperty("review");
  });

  it("담을 것이 하나도 없으면 null 이다", () => {
    /*
      `{}` 로 남기면 화면이 「과정이 있다」고 읽고 빈 상자를 그린다. 그럴
      바에 없는 편이 낫다 — `hasProcess` 가 그 판단을 한 곳에서 한다.
    */
    expect(workProcessOf({})).toBeNull();
    expect(workProcessOf({ blueprint: null })).toBeNull();
    expect(workProcessOf({ blueprint: { sections: [] } })).toBeNull();
  });
});

describe("hasProcess", () => {
  it("칸이 하나라도 차 있으면 있다고 본다", () => {
    expect(hasProcess({ summary: "요약" })).toBe(true);
    expect(hasProcess({ sections: [{ title: "히어로" }] })).toBe(true);
    expect(hasProcess({ aspectRatio: "4:5" })).toBe(true);
  });

  it("옛 작업은 없다 — 소급되지 않는다", () => {
    /*
      남기기 전에 만든 작업은 영영 비어 있다. 화면은 「과정이 남아 있지
      않습니다」라고 **말해야** 한다 — 빈 화면만 내면 사라진 것으로 읽힌다
      (2026-09-16 포스터에서 실제로 그렇게 읽혔다).
    */
    expect(hasProcess(null)).toBe(false);
    expect(hasProcess(undefined)).toBe(false);
    expect(hasProcess({})).toBe(false);
    expect(hasProcess({ sections: [] })).toBe(false);
  });

  it("엉뚱한 값에도 안 넘어진다", () => {
    expect(hasProcess("문자열")).toBe(false);
    expect(hasProcess(42)).toBe(false);
  });
});

/**
 * **경계에서 한 번 더 거른다.**
 *
 * 과정은 화면이 보낸 것을 서버가 골라 담는다. 화면을 믿고 그대로 넣으면
 * base64 한 장이 섞여 들어오는 길이 열리고, 그때는 이미 표에 들어간 뒤다.
 * 그래서 `workProcessOf` 는 **아무 값이나 와도 넘어지지 않아야** 한다.
 */
describe("workProcessOf — 경계 방어", () => {
  const junk = (blueprint: unknown) =>
    workProcessOf({ blueprint } as Parameters<typeof workProcessOf>[0]);

  it("섹션이 배열이 아니면 없는 것으로 본다", () => {
    expect(junk({ executiveSummary: "요약", sections: "히어로,성분" })).toEqual({ summary: "요약" });
    expect(junk({ executiveSummary: "요약", sections: { title: "히어로" } })).toEqual({ summary: "요약" });
  });

  it("섹션 자리에 빈 값이 있어도 넘어지지 않는다", () => {
    const process = junk({ sections: [null, undefined, { title: "성분" }] })!;
    expect(process.sections).toEqual([{ title: "성분" }]);
  });

  it("기획안이 통째로 엉뚱해도 null 이다", () => {
    expect(junk("기획안")).toBeNull();
    expect(junk(42)).toBeNull();
    expect(junk([])).toBeNull();
  });

  it("요약·비율이 문자열이 아니면 담지 않는다", () => {
    // 객체가 그대로 들어가면 화면이 `[object Object]` 를 그린다.
    expect(junk({ executiveSummary: { ko: "요약" } })).toBeNull();
    expect(
      workProcessOf({ blueprint: { executiveSummary: "요약" }, aspectRatio: { w: 4 } as never }),
    ).toEqual({ summary: "요약" });
  });

  it("섹션 한 칸이 문자열이 아니면 그 칸만 버린다", () => {
    const process = junk({ sections: [{ title: "성분", role: { a: 1 }, copy: ["줄"] }] })!;
    expect(process.sections).toEqual([{ title: "성분" }]);
  });
});

/**
 * **모양 옮기기는 화면이 아니라 여기서 한다.**
 *
 * 상세페이지 구성안의 칸 이름은 `section_name`·`goal`·`headline` 이고,
 * 리디자인은 `name`·`purpose`·`prompt` 다. 화면마다 손으로 옮기면 이름이
 * 갈리고, 한쪽만 고쳐진 채로 남는다 — 이 저장소가 반복해서 당한 방식이다.
 *
 * 그리고 **둘 다 그림을 품고 있다**(`generatedImage`·`imageUrl`, base64 data
 * URL). 옮기기가 그것을 떨궈야 전송량이 수 MB 늘지 않는다. 서버가 한 번 더
 * 거르지만, 거기까지 가기 전에 회선을 태우는 것이 이미 손해다.
 */
describe("pdpProcessSource", () => {
  const result = {
    blueprint: {
      executiveSummary: "전통 방식의 진정성으로 설득한다",
      sections: [
        {
          section_name: "히어로",
          goal: "첫 3초에 붙잡는다",
          headline: "100년 항아리에서",
          generatedImage: "data:image/png;base64,AAAA",
        },
      ],
    },
    review: { items: [{ criterion: "hook", rating: "pass" }] },
  };

  it("구성안의 칸 이름을 과정의 이름으로 옮긴다", () => {
    const source = pdpProcessSource(result, "4:5");
    const process = workProcessOf(source)!;

    expect(process.summary).toBe("전통 방식의 진정성으로 설득한다");
    expect(process.sections).toEqual([
      { title: "히어로", role: "첫 3초에 붙잡는다", copy: "100년 항아리에서" },
    ]);
    expect(process.aspectRatio).toBe("4:5");
    expect(process.review).toEqual(result.review);
  });

  it("만들어진 그림은 회선에 태우지 않는다", () => {
    expect(JSON.stringify(pdpProcessSource(result, "4:5"))).not.toContain("base64");
  });

  it("구성안이 없어도 넘어지지 않는다", () => {
    expect(workProcessOf(pdpProcessSource({}, ""))).toBeNull();
    expect(workProcessOf(pdpProcessSource({ blueprint: { sections: [] } }, ""))).toBeNull();
  });
});

describe("redesignProcessSource", () => {
  const project = {
    request: "더 고급스럽게 바꿔 주세요",
    ratio: "3:4",
    sections: [
      {
        name: "성분",
        purpose: "믿게 한다",
        prompt: "성분표를 크게",
        imageUrl: "data:image/png;base64,BBBB",
      },
    ],
  };

  it("리디자인은 **요청한 말**이 요약이다", () => {
    /*
      리디자인에는 구성안이 없다. 사용자가 적어 낸 요청이 곧 「무엇을
      하려 했는가」라서, 그것을 요약 자리에 둔다.
    */
    const process = workProcessOf(redesignProcessSource(project))!;

    expect(process.summary).toBe("더 고급스럽게 바꿔 주세요");
    expect(process.sections).toEqual([
      { title: "성분", role: "믿게 한다", copy: "성분표를 크게" },
    ]);
    expect(process.aspectRatio).toBe("3:4");
  });

  it("섹션 그림은 회선에 태우지 않는다", () => {
    expect(JSON.stringify(redesignProcessSource(project))).not.toContain("base64");
  });

  it("빈 작업은 null 이다", () => {
    expect(workProcessOf(redesignProcessSource({}))).toBeNull();
  });
});
