import { describe, expect, it } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";
import {
  COPY_SLOTS,
  UNPLACEABLE_SLOTS,
  overlayStyleFor,
  type CopyOverlayType,
} from "../copy-slots";

/**
 * **화면에는 있는데 눌러도 안 되는 카피**를 막는다.
 *
 * 두 번 같은 사고가 났다. 신뢰문구와 CTA 가 편집기 화면에 보이는데 `onClick` 이 없어
 * 눌러도 아무 일이 없었다. 사용자에게는 "있는데 못 쓰는 카피"였고 화면만 봐서는
 * 구분되지 않았다.
 *
 * 클릭까지 검사하려면 `PdpEditor`(2784줄, html2canvas·JSZip 을 최상단에서 불러온다)를
 * 렌더해야 해서 jsdom 환경을 새로 들여야 한다. 그 대신 **카피 자리를 목록으로 두고,
 * 목록에 없는 자리가 생기면 여기서 막는다.** 얹는 길 없는 카피 자리를 만들 수 없다.
 */

/** 카피 자리 이름은 pdp-core 의 `CopyTarget` 이 정한다. 여기가 그 거울이다. */
const COPY_TARGET_SLOTS = [
  "headline",
  "subheadline",
  "trust_or_objection_line",
  "CTA",
  "prompt_ko",
  "bullet",
] as const;

function makeSection(): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "핵심 장점",
    goal: "",
    headline: "하루 한 번, 속부터 촉촉하게",
    headline_en: "Once a day",
    subheadline: "겉만 덮지 않습니다",
    subheadline_en: "Not just a surface layer",
    bullets: ["가볍게 스며듭니다"],
    bullets_en: ["absorbs lightly"],
    trust_or_objection_line: "민감한 피부도 부담 없이 씁니다",
    trust_or_objection_line_en: "Gentle on sensitive skin",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "",
    prompt_ko: "제품 클로즈업",
    prompt_en: "product close-up",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
  };
}

describe("얹을 수 있는 카피 자리", () => {
  it("모든 카피 자리는 얹히거나, 안 얹히는 이유가 적혀 있다", () => {
    // 새 카피 필드를 더하고 얹는 길을 안 만들면 여기서 막힌다.
    // 목록에서 직접 읽는다 — 손으로 적으면 목록과 갈라져 가드가 죽는다.
    const placeable = new Set<string>(COPY_SLOTS.map((slot) => slot.slot));

    for (const slot of COPY_TARGET_SLOTS) {
      const covered = placeable.has(slot) || slot in UNPLACEABLE_SLOTS;
      expect(covered, `카피 자리 "${slot}" 에 얹는 길도, 안 얹는 이유도 없다`).toBe(true);
    }
  });

  it("얹히는 자리는 목록에 다 들어 있다", () => {
    expect(COPY_SLOTS.map((slot) => slot.overlayType)).toEqual([
      "headline",
      "subheadline",
      "trust",
    ]);
  });

  it("모든 자리가 서식 종류를 갖는다", () => {
    // 목록의 항목은 overlayType 을 반드시 갖는다 — onClick 을 빼먹을 수 없는 이유다.
    for (const slot of COPY_SLOTS) {
      expect(slot.overlayType).toBeTruthy();
      expect(slot.label.trim()).not.toBe("");
    }
  });

  it("각 자리가 섹션에서 문구를 꺼낸다", () => {
    const section = makeSection();
    for (const slot of COPY_SLOTS) {
      const copy = slot.read(section);
      expect(copy.ko.trim(), `${slot.label} 의 한국어가 비었다`).not.toBe("");
      expect(copy.en.trim(), `${slot.label} 의 영어가 비었다`).not.toBe("");
    }
  });

  it("CTA 는 만들지 않는 이유가 적혀 있다", () => {
    expect(UNPLACEABLE_SLOTS.CTA).toContain("만들지 않는다");
  });
});

describe("자리별 오버레이 서식", () => {
  it("신뢰문구는 불릿보다 작고 조용하다", () => {
    // 크게 넣으면 제목과 주인 자리를 다툰다.
    const trust = overlayStyleFor("trust");
    const keypoint = overlayStyleFor("keypoint");
    expect(trust.fontSize).toBeLessThan(keypoint.fontSize);
    expect(trust.fontWeight).toBe("500");
  });

  it("제목이 가장 크다", () => {
    const sizes: Record<CopyOverlayType, number> = {
      headline: overlayStyleFor("headline").fontSize,
      subheadline: overlayStyleFor("subheadline").fontSize,
      keypoint: overlayStyleFor("keypoint").fontSize,
      trust: overlayStyleFor("trust").fontSize,
    };
    expect(sizes.headline).toBeGreaterThan(sizes.subheadline);
    expect(sizes.subheadline).toBeGreaterThan(sizes.keypoint);
  });

  it("모든 서식 종류에 값이 있다", () => {
    for (const type of ["headline", "subheadline", "keypoint", "trust"] as const) {
      const style = overlayStyleFor(type);
      expect(style.fontSize).toBeGreaterThan(0);
      expect(style.maxWidth).toBeGreaterThan(0);
    }
  });
});
