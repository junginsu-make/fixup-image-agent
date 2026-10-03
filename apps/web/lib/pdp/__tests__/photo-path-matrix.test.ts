import { describe, expect, it, vi } from "vitest";
import type { AttachmentIntents, LandingPageBlueprint, ReferenceModelUsage, SectionBlueprint } from "@fixup/pdp-core";
import { applyUserEdit, mergeArtDirection } from "@fixup/pdp-core";

/**
 * 사진 경로 첨부 조합 전체 회귀 시험 (2026-10-02 93바이트 400 사고).
 *
 * ── 무슨 일이 있었나 ──────────────────────────────────────
 * 2026-10-02 운영에서 「이미지로 시작」 이미지 요청이 93바이트 400(`INVALID_REQUEST`, 서버 스키마 거절)으로
 * 계속 막혔다. 처음에는 원인을 몰라 첨부(디자인 레퍼런스·인물·제품 사진·첨부 지시)가 의심됐다.
 * 원인은 첨부가 아니라, 기획 AI 가 한 섹션의 영어 장면(`prompt_en`)을 비운 것이었다
 * (`photo-path-analyze.test.ts` 머리말 참조).
 *
 * ── 무엇을 증명하나 ────────────────────────────────────────
 * 디자인 레퍼런스 5 x 인물 6 x 첨부 지시 2 x 시나리오 편집 9 = 540 조합 전부에서 기획·단건·일괄 요청이
 * 서버 형식 검사를 통과한다. 진단 때는 400 이 「`prompt_en` 누락 + 그 섹션의 장면을 안 고침」 60 조합
 * (5 x 6 x 2 x 1)에서만 났고 나머지 480 조합은 통과했다 — 첨부 조합은 원인이 아니라는 증거였다.
 * 지금은 그 60 조합까지 540 전부가 통과해야 한다(진단용 시험의 「400 이 난다」 기대를 뒤집어 옮겼다).
 *
 * 축: 디자인 레퍼런스 x 인물 x 첨부 지시 x 시나리오 편집.
 * 몸통은 화면 함수(`buildAnalyzeRequest`·`buildPageWire`·`normalizeImageOptions`·
 * `keepWordsPresentIn`·`stableSections`·`mergeArtDirection`·`applyUserEdit`·
 * `updateScenarioBullets`·`createSectionFor`·`intentsOrUndefined`)로 PdpEditor 와 같은 순서로 짓는다.
 *
 * ── 못 한 것 ───────────────────────────────────────────────
 * - 실제 화면 클릭·모델 호출·크레딧 예약·저장은 거치지 않는다. 화면이 몸통을 짓는 함수까지만 같다.
 * - 그림 크기는 운영과 비슷하게 맞췄을 뿐(제품 약 0.2MB·인물 약 0.15MB·레퍼런스 약 2.8MB) 운영 데이터
 *   그대로가 아니다.
 * - 2026-10-02 의 그 기획 응답에서 칸이 정말 비어 있었는지는 확정하지 못했다(모델 출력이 남지 않는다).
 */
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { id: "u1", status: "active" } } }),
}));

const { readPdpRequest } = await import("../request");
const { buildPageWire } = await import("../../../app/create/page-wire");
const { buildAnalyzeRequest } = await import("../../../app/create/analyze-request");
const { normalizeImageOptions } = await import("../../../app/create/pdp-canvas-utils");
const { keepWordsPresentIn } = await import("../../../app/create/emphasis-words");
const { stableSections } = await import("../../../app/create/document-state");
const { intentsOrUndefined, attachedSlotsOf } = await import("../../../app/create/attachment-intents");
const { updateScenarioBullets } = await import("../../../app/create/scenario-evidence");
const { createSectionFor } = await import("../../../app/create/scenario-sections");

type Kind = "single" | "batch" | "analyze";
async function check(kind: Kind, body: unknown): Promise<string> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await readPdpRequest(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), kind);
  const issues = warn.mock.calls.map((call) => String(call[1] ?? call[0])).join(" ");
  warn.mockRestore();
  return result.ok ? "통과" : `400 ${issues}`;
}

const PRODUCT = { base64: "A".repeat(200_000), mimeType: "image/jpeg", fileName: "p.jpg", previewUrl: "" };
const PERSON = { base64: "P".repeat(150_000), mimeType: "image/jpeg", fileName: "person.jpg", previewUrl: "" }; // pdp-utils 가 늘 jpeg 로 만든다
const STYLE_B64 = "B".repeat(2_780_000);

// ── 축 1: 디자인 레퍼런스 ────────────────────────────────────────
type StyleView = { id: string; name: string; description: string; imageBase64: string; mimeType: string; reason: string };
const STYLES: Record<string, { ref?: StyleView; enabled: boolean }> = {
  "없음": { enabled: true },
  // StyleReferenceAttach: 새 파일 → POST 등록 → description 은 서버 분석 결과, mimeType 은 file.type
  "새로 올림": { enabled: true, ref: { id: "r1", name: "ref", description: "베이지 톤 큰 고딕 제목".repeat(20), imageBase64: STYLE_B64, mimeType: "image/jpeg", reason: "직접 첨부하신 이미지입니다." } },
  // 라이브러리(existing.origin === "reference"): 등록 생략, description 은 목록 값(없으면 ""), mimeType 은 blob.type
  "라이브러리 레퍼런스": { enabled: true, ref: { id: "r2", name: "ref", description: "", imageBase64: STYLE_B64, mimeType: "image/png", reason: "직접 고르신 레퍼런스입니다." } },
  // /api/reference-images 의 공용 참고 이미지: referenceId 가 없어 등록 경로를 탄다
  "공용 참고 이미지": { enabled: true, ref: { id: "r3", name: "참고 이미지", description: "서술", imageBase64: STYLE_B64, mimeType: "image/webp", reason: "직접 첨부하신 이미지입니다." } },
  "붙이고 끔": { enabled: false, ref: { id: "r1", name: "ref", description: "서술", imageBase64: STYLE_B64, mimeType: "image/jpeg", reason: "직접 첨부하신 이미지입니다." } },
};

// ── 축 2: 인물 ───────────────────────────────────────────────────
interface Person { modelImage: typeof PERSON | null; usage: ReferenceModelUsage | null; characterId?: string; angles: string[]; personSource?: "uploaded" | "character" }
const PERSONS: Record<string, Person> = {
  "없음": { modelImage: null, usage: null, angles: [] },
  "인물 사진·히어로만": { modelImage: PERSON, usage: "hero-only", angles: [] },
  "인물 사진·전체": { modelImage: PERSON, usage: "all-sections", angles: [] },
  "저장 캐릭터·각도": { modelImage: null, usage: null, characterId: "char-uuid-1", angles: ["front", "left_45"] },
  "둘 다·사진 우선": { modelImage: PERSON, usage: "hero-only", characterId: "char-uuid-1", angles: ["front"], personSource: "uploaded" },
  "둘 다·캐릭터 우선": { modelImage: PERSON, usage: "all-sections", characterId: "char-uuid-1", angles: [], personSource: "character" },
};

// ── 축 3: 첨부 지시 ──────────────────────────────────────────────
const INTENTS: Record<string, AttachmentIntents> = {
  "지시 없음": {},
  "지시 적음": { anchor: "라벨 그대로", person: "얼굴 유지", style: "색만 가져와" },
};

// ── 축 4: 시나리오 편집(기획 응답 → 편집 → 「이대로 진행」) ─────────
function photoSection(i: number, patch: Partial<SectionBlueprint> = {}): SectionBlueprint {
  const n = i + 1;
  return {
    section_id: `S${n}`, section_name: `섹션 ${n}`, goal: "목표", headline: `편안한 하루 ${n}`, headline_en: "", subheadline: "부드러움",
    subheadline_en: "", bullets: ["가벼움", "통기성"], bullets_en: [], trust_or_objection_line: "", trust_or_objection_line_en: "",
    CTA: "", CTA_en: "", layout_notes: "중앙", compliance_notes: "", image_id: `IMG_S${n}`, purpose: "",
    prompt_ko: "밝은 스튜디오 제품 정면", prompt_en: "product front, bright studio", negative_prompt: "",
    style_guide: "공용 디자인", reference_usage: "라벨 유지", ...patch,
  };
}
const bp = (sections: SectionBlueprint[]): LandingPageBlueprint => ({ executiveSummary: "요약", scorecard: [], blueprintList: [], sections });

type Edit = { planned: (i: number) => Partial<SectionBlueprint>; edit: (b: LandingPageBlueprint) => LandingPageBlueprint; target: (b: LandingPageBlueprint) => number };
const first = () => 0;
const EDITS: Record<string, Edit> = {
  "편집 안 함": { planned: () => ({}), edit: (b) => b, target: first },
  "제목 고침": { planned: () => ({}), edit: (b) => applyUserEdit(b, b.sections[0]!.section_id, { slot: "headline" }, "새 제목"), target: first },
  "장면 고침": { planned: () => ({}), edit: (b) => applyUserEdit(b, b.sections[0]!.section_id, { slot: "prompt_ko" }, "야외 장면"), target: first },
  "불릿 추가·고침": {
    planned: () => ({}),
    edit: (b) => { const added = updateScenarioBullets(b, 0, [...b.sections[0]!.bullets, ""]); return updateScenarioBullets(added, 0, [...b.sections[0]!.bullets, "새 불릿"]); },
    target: first,
  },
  "빈 불릿 남김": { planned: () => ({}), edit: (b) => updateScenarioBullets(b, 0, [...b.sections[0]!.bullets, ""]), target: first },
  "섹션 추가": { planned: () => ({}), edit: (b) => ({ ...b, sections: [...b.sections, createSectionFor(b.sections)] }), target: (b) => b.sections.length - 1 },
  "섹션 삭제·순서 바꿈": { planned: () => ({}), edit: (b) => ({ ...b, sections: [b.sections[2]!, b.sections[0]!, ...b.sections.slice(3)] }), target: first },
  "모델이 prompt_en 누락·편집 안 함": { planned: (i) => (i === 0 ? { prompt_en: "" } : {}), edit: (b) => b, target: first },
  "모델이 prompt_en 누락·장면 고침": {
    planned: (i) => (i === 0 ? { prompt_en: "" } : {}),
    edit: (b) => applyUserEdit(b, b.sections[0]!.section_id, { slot: "prompt_ko" }, "야외 장면"), target: first,
  },
};

function bodies(styleKey: string, personKey: string, intentKey: string, editKey: string) {
  const style = STYLES[styleKey]!; const person = PERSONS[personKey]!; const intents = INTENTS[intentKey]!; const edit = EDITS[editKey]!;
  const analyzed = bp(stableSections([0, 1, 2, 3, 4, 5].map((i) => photoSection(i, edit.planned(i)))));
  const edited = edit.edit(analyzed);
  const sections = mergeArtDirection(analyzed, edited).sections; // onConfirm
  const pageStyle = style.enabled ? style.ref : undefined; // PdpMakerClient 1248
  const attached = attachedSlotsOf({ preparedImage: PRODUCT, modelImage: person.modelImage, characterId: person.characterId, styleReference: style.ref, styleReferenceEnabled: style.enabled });
  const page = buildPageWire({
    anchorKind: "product-photo", imageModel: "gpt-image-2.5-flare", outputMode: "full-image", look: style.ref && style.enabled ? "auto" : "photoreal",
    userInstruction: "", preserveProduct: true, personSource: person.personSource, styleReference: pageStyle,
    attachmentIntents: intentsOrUndefined(intents, attached), pageContext: "",
    referenceModel: person.modelImage, referenceModelUsage: person.usage,
  });
  const opts = (index: number) => normalizeImageOptions(undefined, person.usage === "all-sections" ? true : index === 0);
  const t = edit.target(edited);
  const section = sections[t]!;
  const library = { documentId: "doc-uuid", revision: 0, pageSectionIds: sections.map((s) => s.section_id), libraryTitle: "요약", libraryProcess: {} };
  const single = {
    originalImageBase64: PRODUCT.base64, ...library, section, aspectRatio: "9:16", desiredTone: undefined, sectionIndex: t, page,
    options: { ...opts(t), isRegeneration: false }, emphasisWords: keepWordsPresentIn(section.headline ?? "", []),
    characterId: person.characterId, characterAngles: person.angles,
  };
  const start = Math.max(0, Math.min(t, sections.length - 3));
  const chunk = sections.slice(start, start + 3).map((s, k) => ({ section: s, index: start + k }));
  const batch = {
    originalImageBase64: PRODUCT.base64, ...library, sections: chunk.map((c) => c.section), sectionIndexes: chunk.map((c) => c.index),
    aspectRatio: "9:16", desiredTone: undefined, characterId: person.characterId, characterAngles: person.angles, page,
    optionsBySection: Object.fromEntries(chunk.map((c) => [c.section.section_id, opts(c.index)])),
    emphasisWordsList: chunk.map((c) => keepWordsPresentIn(c.section.headline ?? "", [])),
  };
  const analyze = buildAnalyzeRequest({
    preparedImage: PRODUCT, modelImage: person.modelImage, additionalInfo: "", sellerBrief: {}, copyIntensity: "normal", gapPolicy: "ask",
    desiredTone: "", aspectRatio: "9:16", outputMode: "full-image", styleReference: style.ref, styleReferenceEnabled: style.enabled,
    attachmentIntents: intents, look: style.ref && style.enabled ? "auto" : "photoreal",
  });
  return { single, batch, analyze };
}

describe("사진 경로 첨부 조합 × 편집", () => {
  it("모든 조합을 돌려 표로 남긴다", async () => {
    const rows: string[] = [];
    const failures: string[] = [];
    for (const s of Object.keys(STYLES)) for (const p of Object.keys(PERSONS)) for (const i of Object.keys(INTENTS)) for (const e of Object.keys(EDITS)) {
      const b = bodies(s, p, i, e);
      const [analyze, single, batch] = [await check("analyze", b.analyze), await check("single", b.single), await check("batch", b.batch)];
      const row = `${s} | ${p} | ${i} | ${e} | 기획 ${analyze} | 단건 ${single} | 일괄 ${batch}`;
      rows.push(row);
      const 예상실패 = false;
      if (analyze !== "통과" || (single === "통과") === 예상실패 || (batch === "통과") === 예상실패) failures.push(row);
    }
    // 누락된 장면을 포함한 모든 요청이 통과해야 한다.
    expect(rows).toHaveLength(540);
    expect(failures).toEqual([]);
  }, 120_000);
});
