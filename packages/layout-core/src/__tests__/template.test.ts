import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  defaultTemplateForRole,
  templateById,
  templatesForRole,
  validateTemplate,
} from "../template";
import type { CardTemplate, LayoutSlot } from "../index";

const STYLE = {
  family: "Pretendard",
  weight: 700 as const,
  sizeRatio: 0.3,
  lineHeight: 1.3,
  color: "#111111",
  align: "left" as const,
  valign: "top" as const,
};

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
  it("모두 검사를 통과한다", () => {
    for (const candidate of DEFAULT_TEMPLATES) {
      expect({ id: candidate.id, issues: validateTemplate(candidate) }).toEqual({ id: candidate.id, issues: [] });
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

  it("모르는 id 를 물으면 undefined 를 돌려준다", () => {
    expect(templateById("없는-뼈대")).toBeUndefined();
    expect(templateById(DEFAULT_TEMPLATES[0]!.id)?.id).toBe(DEFAULT_TEMPLATES[0]!.id);
  });
});
