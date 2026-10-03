import { describe, expect, it, vi } from "vitest";
import { PdpService, mergeArtDirection } from "@fixup/pdp-core";

/**
 * 사진 경로 「기획 -> 이미지 요청」 회귀 시험 (2026-10-02 93바이트 400 사고).
 *
 * ── 무슨 일이 있었나 ──────────────────────────────────────
 * 2026-10-02 운영에서 「이미지로 시작」으로 기획을 마친 뒤 섹션 이미지를 만들면 계속 400 이 났다
 * (15:54·16:26 일괄, 16:27·16:29 단건). 응답은 93바이트
 * `{"ok":false,"code":"INVALID_REQUEST","message":"요청 형식이 올바르지 않습니다."}` 로, 서버 스키마
 * 검사(`lib/pdp/request.ts`)가 낸 것이다. 크레딧 예약 전이라 차감은 없었다. 2026-09-23 09:53 에도 같은
 * 400 이 한 번 있었고, 사용자가 기획을 다시 돌리자 풀렸다.
 *
 * 원인: 기획 AI 가 섹션 하나에서 영어 장면(`prompt_en`) 칸을 빼먹으면, 사진 경로는 그 빈칸을 그대로
 * 두었고(글 경로는 한국어 장면·제목으로 메웠다 — 두 경로가 갈려 있었다), 서버 스키마는 `prompt_en` 이
 * 비면 그 섹션이 든 요청을 통째로 거절했다(`prompt_en: text.trim().min(1)`). 사진 기획 응답 스키마에는
 * 필수 표시가 없어 모델이 칸을 건너뛸 수 있다.
 *
 * ── 무엇을 증명하나 ────────────────────────────────────────
 * 실제 `PdpService.analyzeProduct` 에 S1 의 `prompt_en` 칸이 아예 없는 (가짜) 모델 응답을 넣어도
 *  1. 기획은 성공하고, S1 의 장면이 한국어 장면으로 복구되어 있다(빈칸이 화면까지 살아 가지 않는다).
 *  2. 화면과 같은 순서(stableSections -> mergeArtDirection -> buildPageWire -> readPdpRequest)로 지은
 *     단건·일괄 이미지 요청이 둘 다 통과한다. 칸이 다 있는 기획도 같은 흐름이 통과한다.
 * 사고를 재현하던 진단용 시험은 반대로 「누락이면 단건·일괄 모두 400(`section.prompt_en:too_small`)」을
 * 기대했다. 그 기대를 뒤집어 옮긴 것이 이 시험이다.
 *
 * ── 못 한 것 ───────────────────────────────────────────────
 * - 2026-10-02 의 그 기획 응답에서 칸이 정말 비어 있었는지는 확정하지 못했다(모델 출력이 남지 않는다).
 *   다음 거절 때는 서버 로그 `[pdp] 요청 형식 거절` 에 걸린 칸 이름이 찍힌다.
 * - 모델 호출은 가짜이고 크레딧 예약·저장·실제 화면 클릭은 거치지 않는다. 화면이 몸통을 짓는 함수와
 *   서버 스키마까지만 잇는다. 유료 호출은 하지 않는다.
 */

vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { id: "u1", status: "active" } } }),
}));

const { readPdpRequest } = await import("../request");
const { buildPageWire } = await import("../../../app/create/page-wire");
const { normalizeImageOptions } = await import("../../../app/create/pdp-canvas-utils");
const { stableSections } = await import("../../../app/create/document-state");

const section = (n: number, withPromptEn: boolean) => ({
  section_id: `S${n}`, section_name: `섹션 ${n}`, goal: "관심", headline: `제목 ${n}`, subheadline: "부제",
  bullets: ["가벼움"], prompt_ko: "밝은 스튜디오 제품 정면", layout_notes: "", style_guide: "", reference_usage: "",
  ...(withPromptEn ? { prompt_en: "a clean product photo" } : {}), // 누락은 「칸 자체가 없음」
});

async function planWith(omitFirst: boolean) {
  const blueprint = JSON.stringify({
    executiveSummary: "요약", scorecard: [], blueprintList: [],
    sections: [1, 2, 3, 4].map((n) => section(n, !(omitFirst && n === 1))),
  });
  const llm = { generate: async () => ({ text: blueprint }) };
  return new PdpService().analyzeProduct(
    {
      imageBase64: "iVBORw0KGgo=", mimeType: "image/png", aspectRatio: "9:16",
      styleReference: { imageBase64: "REF", mimeType: "image/jpeg", description: "베이지 톤" },
    },
    { llm, generateImage: async () => ({ base64: "IMG", mimeType: "image/jpeg" }) } as never,
    { skipFirstImage: true },
  );
}

async function imageRequest(result: Awaited<ReturnType<typeof planWith>>, kind: "single" | "batch") {
  // PdpMakerClient: setResult(stableSections) → 「이대로 진행」(mergeArtDirection, 편집 없음)
  const planned = { ...result.blueprint, sections: stableSections(result.blueprint.sections) };
  const sections = mergeArtDirection(planned, planned).sections;
  const page = buildPageWire({
    anchorKind: "product-photo", imageModel: "gpt-image-2.5-flare", outputMode: "full-image", look: "auto",
    userInstruction: "", preserveProduct: true,
    styleReference: { imageBase64: "REF", mimeType: "image/jpeg", description: "베이지 톤" },
  });
  const common = { originalImageBase64: result.originalImage, aspectRatio: "9:16", page, characterAngles: [] };
  const body = kind === "single"
    ? { ...common, section: sections[0], sectionIndex: 0, options: normalizeImageOptions(undefined, true), emphasisWords: [] }
    : { ...common, sections: sections.slice(0, 3), sectionIndexes: [0, 1, 2],
        optionsBySection: Object.fromEntries(sections.slice(0, 3).map((s, i) => [s.section_id, normalizeImageOptions(undefined, i === 0)])) };
  const raw = JSON.stringify(body);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const parsed = await readPdpRequest(new Request("http://localhost/x", { method: "POST", body: raw }), kind);
  const issues = warn.mock.calls.map((call) => String(call[1] ?? "")).join(" ");
  warn.mockRestore();
  const bytes = parsed.ok ? 0 : Buffer.byteLength(await parsed.response.text());
  return { ok: parsed.ok, status: parsed.ok ? 200 : parsed.response.status, bytes, issues, firstPromptEn: sections[0]!.prompt_en };
}

describe("사진 기획에서 영어 장면이 빠져도 생성된다", () => {
  it.each([true, false])("누락=%s 기획부터 단건·일괄 요청까지 이어진다", async (missing) => {
    const result = await planWith(missing);
    expect(result.blueprint.sections[0].prompt_en).toBe(missing ? "밝은 스튜디오 제품 정면" : "a clean product photo");
    for (const kind of ["single", "batch"] as const) {
      expect(await imageRequest(result, kind)).toMatchObject({ ok: true, status: 200, issues: "" });
    }
  });
});
