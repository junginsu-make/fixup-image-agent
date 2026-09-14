import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  defaultTemplateForRole,
  templateById,
  templateSummary,
  templatesForRole,
  validateTemplate,
} from "../template";
import type { CardTemplate, LayoutSlot, SlotBox } from "../index";

const STYLE = {
  family: "Pretendard",
  weight: 700 as const,
  sizeRatio: 0.3,
  lineHeight: 1.3,
  color: "#111111",
  align: "left" as const,
  valign: "top" as const,
};

/** 두 상자가 겹치는 넓이. 안 겹치면 0. */
function overlapArea(first: SlotBox, second: SlotBox): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height;
}

function template(slots: LayoutSlot[]): CardTemplate {
  return { id: "t", name: "시험용", role: "body", slots };
}

function errors(candidate: CardTemplate): string[] {
  return validateTemplate(candidate).filter((issue) => issue.severity === "error").map((issue) => issue.message);
}

function warnings(candidate: CardTemplate): string[] {
  return validateTemplate(candidate).filter((issue) => issue.severity === "warning").map((issue) => issue.message);
}

describe("validateTemplate", () => {
  it("칸이 하나도 없으면 오류다", () => {
    expect(errors(template([]))).toHaveLength(1);
  });

  it("카드 밖으로 나간 칸은 오류다", () => {
    const outside = template([{ kind: "image", box: { x: 0.5, y: 0, width: 0.8, height: 0.5 } }]);

    expect(errors(outside)).toHaveLength(1);
    expect(errors(outside)[0]).toContain("카드 밖");
  });

  it("넓이나 높이가 0인 칸은 오류다", () => {
    expect(errors(template([{ kind: "image", box: { x: 0, y: 0, width: 0, height: 0.5 } }]))).toHaveLength(1);
  });

  it("글 칸끼리 겹치면 경고한다", () => {
    const overlapping = template([
      { kind: "text", box: { x: 0, y: 0, width: 1, height: 0.5 }, source: { from: "copy", field: "headline" }, style: STYLE },
      { kind: "text", box: { x: 0, y: 0.3, width: 1, height: 0.5 }, source: { from: "copy", field: "body" }, style: STYLE },
    ]);

    expect(warnings(overlapping)).toHaveLength(1);
    expect(errors(overlapping)).toHaveLength(0);
  });

  /**
   * 그림 칸이 여럿이어도 막지 않는다 — 칸 하나가 fal 요청 하나라 셋이면 셋 다
   * 채워진다. 다만 그만큼 값이 드니 몇 번 부르는지는 말해 준다.
   */
  it("그림 칸이 여럿이면 몇 번 부르는지 알려 준다", () => {
    const twoImages = template([
      { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.5 } },
      { kind: "image", box: { x: 0, y: 0.5, width: 1, height: 0.5 } },
    ]);

    expect(warnings(twoImages).join(" ")).toContain("2번");
    expect(errors(twoImages)).toEqual([]);
  });

  it("그림 칸이 하나면 할 말이 없다", () => {
    expect(validateTemplate(template([{ kind: "image", box: { x: 0, y: 0, width: 1, height: 1 } }]))).toEqual([]);
  });

  it("배경 위에 글을 얹는 것은 경고가 아니다", () => {
    const layered = template([
      { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
      { kind: "text", box: { x: 0, y: 0, width: 1, height: 0.5 }, source: { from: "copy", field: "headline" }, style: STYLE },
    ]);

    expect(validateTemplate(layered)).toHaveLength(0);
  });

  it("맞닿기만 한 두 글 칸은 겹친 것이 아니다", () => {
    const touching = template([
      { kind: "text", box: { x: 0, y: 0, width: 1, height: 0.5 }, source: { from: "copy", field: "headline" }, style: STYLE },
      { kind: "text", box: { x: 0, y: 0.5, width: 1, height: 0.5 }, source: { from: "copy", field: "body" }, style: STYLE },
    ]);

    expect(validateTemplate(touching)).toHaveLength(0);
  });
});

describe("기본 템플릿", () => {
  it("막히는 것은 하나도 없다", () => {
    for (const candidate of DEFAULT_TEMPLATES) {
      expect({ id: candidate.id, errors: errors(candidate) }).toEqual({ id: candidate.id, errors: [] });
    }
  });

  /**
   * **로고 틀만 살펴보기가 붙는다.**
   *
   * 예전에는 「지적 사항 0개」를 못 박았는데, 그 가정이 빈 로고를 가려
   * 주고 있었다 — 「엔딩 · 문구와 로고」는 어느 그림을 놓을지 정하지 않은
   * 채로 출고된다(정할 수가 없다). 가려 두지 말고 **그 한 틀만 알린다**로
   * 바꾼다. 새 틀이 조용히 지적을 달고 들어오는 것은 여전히 막는다.
   */
  it("로고 틀 말고는 살펴볼 것도 없다", () => {
    for (const candidate of DEFAULT_TEMPLATES) {
      const expected = candidate.slots.some((slot) => slot.kind === "logo") ? 1 : 0;
      expect({ id: candidate.id, 살펴보기: warnings(candidate).length })
        .toEqual({ id: candidate.id, 살펴보기: expected });
    }
  });

  it("id 가 겹치지 않는다", () => {
    expect(new Set(DEFAULT_TEMPLATES.map((entry) => entry.id)).size).toBe(DEFAULT_TEMPLATES.length);
  });

  it("역할마다 고를 것이 있다", () => {
    for (const role of ["cover", "body", "ending"] as const) {
      expect(templatesForRole(role).length).toBeGreaterThan(0);
      expect(defaultTemplateForRole(role).role).toBe(role);
    }
  });

  it("모든 템플릿에 그림 칸이나 배경 칸이 있어 빈 카드가 되지 않는다", () => {
    for (const candidate of DEFAULT_TEMPLATES) {
      expect(candidate.slots.some((slot) => slot.kind === "image" || slot.kind === "background")).toBe(true);
    }
  });


  /**
   * 그림 칸을 불투명한 배경으로 크게 덮으면 두 가지가 어긋난다.
   *
   * 우리는 **칸 비율 그대로** 그림을 시킨다. 칸의 아래 38%를 띠로 덮으면
   * 모델은 세로 4:5 로 구도를 잡는데 사람이 보는 것은 가로 1.3:1 이다 —
   * 가운데에 놓인 주제가 띠에 걸린다. 그리고 못 보는 부분에도 값은 다 낸다.
   *
   * 띠를 얹고 싶으면 그림 칸을 띠가 시작하는 자리까지만 두면 된다.
   */
  it("그림 칸이 뒤에 오는 배경 칸에 크게 덮이지 않는다", () => {
    for (const candidate of DEFAULT_TEMPLATES) {
      candidate.slots.forEach((slot, offset) => {
        if (slot.kind !== "image") return;
        const covered = candidate.slots
          .slice(offset + 1)
          .filter((later) => later.kind === "background")
          .reduce((sum, later) => sum + overlapArea(slot.box, later.box), 0);
        const share = covered / (slot.box.width * slot.box.height);

        expect({ id: candidate.id, 덮인비율: Math.round(share * 100) })
          .toEqual({ id: candidate.id, 덮인비율: expect.closeTo(0, -1) });
      });
    }
  });

  it("모르는 id 를 물으면 undefined 를 돌려준다", () => {
    expect(templateById("없는-뼈대")).toBeUndefined();
    expect(templateById(DEFAULT_TEMPLATES[0]!.id)?.id).toBe(DEFAULT_TEMPLATES[0]!.id);
  });
});

/**
 * 로고 칸은 어느 그림을 놓을지 사람이 골라야 한다.
 *
 * 기본 틀 「엔딩 · 문구와 로고」도, 레퍼런스에서 읽어낸 로고 칸도 빈 id 로
 * 나온다 — 모델이 그림을 고를 수는 없기 때문이다. 그대로 만들면 이름은
 * 「문구와 로고」인데 로고 자리가 빈 채로 카드가 나온다. 만들기 전에 말한다.
 */
describe("빈 로고 칸", () => {
  const logo = (referenceImageId: string): LayoutSlot => ({
    kind: "logo",
    box: { x: 0.35, y: 0.7, width: 0.3, height: 0.12 },
    referenceImageId,
    fit: "contain",
  });

  it("그림을 안 고른 로고 칸은 살펴보기로 알린다", () => {
    expect(warnings(template([logo("")]))).toEqual([
      "1번 로고 칸에 그림을 안 골랐습니다. 그대로 만들면 그 자리가 빕니다.",
    ]);
  });

  it("공백만 적힌 것도 안 고른 것으로 본다", () => {
    expect(warnings(template([logo("   ")]))).toHaveLength(1);
  });

  it("고른 로고 칸은 알리지 않는다", () => {
    expect(warnings(template([logo("ref-1")]))).toEqual([]);
  });

  it("막지는 않는다 — 나중에 고르면 되는 일이다", () => {
    expect(errors(template([logo("")]))).toEqual([]);
  });
})

/**
 * 틀을 고르는 사람에게 필요한 것은 「무엇이 몇 개인가」다.
 *
 * 이름만 보고 고르면 그림 칸이 둘이라 값이 두 배인 것도, 로고를 안 골라
 * 그 자리가 빌 것도 모른 채 고른다. 그리는 일은 화면이 하고, 세는 일은
 * 여기서 한다 — 세는 규칙은 폰트도 브라우저도 없이 시험할 수 있어야 한다.
 */
describe("templateSummary", () => {
  const box = { x: 0, y: 0, width: 0.5, height: 0.5 };

  it("칸 종류별로 센다", () => {
    expect(templateSummary([
      { kind: "background", box, fill: "#FFFFFF" },
      { kind: "image", box },
      { kind: "image", box },
      { kind: "text", box, source: { from: "copy", field: "headline" }, style: STYLE },
      { kind: "logo", box, referenceImageId: "ref", fit: "contain" },
    ])).toEqual({ images: 2, texts: 1, logos: 1, emptyLogos: 0 });
  });

  it("그림을 안 고른 로고를 따로 센다", () => {
    expect(templateSummary([
      { kind: "logo", box, referenceImageId: "", fit: "contain" },
      { kind: "logo", box, referenceImageId: "  ", fit: "contain" },
      { kind: "logo", box, referenceImageId: "ref", fit: "contain" },
    ])).toEqual({ images: 0, texts: 0, logos: 3, emptyLogos: 2 });
  });

  it("빈 틀은 전부 0 이다", () => {
    expect(templateSummary([])).toEqual({ images: 0, texts: 0, logos: 0, emptyLogos: 0 });
  });
});
