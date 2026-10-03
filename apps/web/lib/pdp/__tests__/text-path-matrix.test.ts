import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * 회귀 검증(2026-10-02): 「텍스트로 시작」 경로의 첨부 조합 전체 + 「AI 가 장면을 뺀 기획」 축.
 *
 * ── 무슨 일이 있었나 ──────────────────────────────────────
 * 2026-10-02 운영에서 「이미지로 시작」 이미지 요청이 93바이트 400(`INVALID_REQUEST`, 서버 스키마 거절)으로
 * 계속 막혔다. 원인은 기획 AI 가 한 섹션의 영어 장면(`prompt_en`)을 비우면 서버 스키마가 그 섹션이 든
 * 요청을 통째로 거절한 것이다(`photo-path-analyze.test.ts` 머리말 참조). 「텍스트로 시작」도 같은 서버
 * 스키마(single·batch·keyVisual)를 쓰므로 같은 일이 있을 수 있는지, 첨부 조합 중 막히는 곳은 없는지
 * 확인해야 했다. 글 경로의 기획 정규화는 `prompt_en` 이 비면 한국어 장면·제목으로 메워 사진 경로보다
 * 덜 위험했지만, 셋이 다 비면 빈칸이 남았다.
 *
 * ── 무엇을 증명하나 ────────────────────────────────────────
 * 1. 제품 사진 5 x 디자인 레퍼런스 8 x 인물 7 = 280 조합마다 기획·대표 이미지·단건·일괄 요청이 서버
 *    스키마를 통과한다. 화면 코드와 같은 방식으로 요청을 짓는다.
 * 2. 같은 첨부일 때 글 경로와 사진 경로가 서버에서 모델로 넘기는 것(앵커 전송·역할·개념 시안·인물 사진·
 *    레퍼런스·제품 지시)을 나란히 적고, 화면의 「개념 시안」 표시가 모델까지 전달된다.
 * 3. [발견] 글 경로에서 레퍼런스가 있으면 승인한 대표 이미지(앵커)를 섹션에 안 보낸다. 버그가 아니라
 *    코드에 이유가 적힌 설계다(둘 다 보내면 모델이 절충한다).
 * 4. 맨 끝의 「AI 가 한 섹션의 장면을 뺀 기획」 축: 장면만 누락·빈칸·한국어 장면과 제목까지 누락·섹션
 *    이름까지 누락 -> 단건·일괄·대표 이미지 요청과 금지 문구 검사가 통과하고, 기획 결과에 빈 장면이
 *    남지 않는다. 앞의 280 조합 표는 장면이 다 있는 기획만 쓰므로 이 축이 없으면 장면 복구가 깨져도
 *    표가 초록이다.
 *
 * ── 못 한 것 ───────────────────────────────────────────────
 * - 실제 화면 클릭(`TextModeFlow`·`PdpEditor`)·모델 호출·크레딧 예약·저장은 거치지 않는다.
 * - 그림 값이 짧은 가짜라 요청 크기 상한은 여기서 못 본다(사진 경로의 `photo-path-matrix.test.ts` 는 운영
 *   크기에 가깝게 잰다).
 * - 2026-10-02 의 그 기획 응답에서 칸이 정말 비어 있었는지는 확정하지 못했다(모델 출력이 남지 않는다).
 */
vi.mock("server-only", () => ({}));
vi.mock("html2canvas", () => ({ default: async () => ({}) }));
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { id: "u1", status: "active" } } }),
}));

const { readPdpRequest } = await import("../request");
const {
  PRODUCT_KINDS, normalizeTextBlueprint, normalizeBrief, mergeArtDirection, chunkForModel, defaultPreserveProduct,
  pageInputsFromWire, buildSectionImageOptions, shouldSendAnchor, anchorRoleFor, conceptOnlyNotice, DEFAULT_SECTION_SCENE,
} = await import("@fixup/pdp-core");
const { buildPageWire } = await import("../../../app/create/page-wire");
const { stableSections } = await import("../../../app/create/document-state");
const { replaceBlueprintState } = await import("../../../app/create/text-plan-state");
const { jobRequestFields } = await import("../../../app/create/job-recovery");
const { normalizeImageOptions } = await import("../../../app/create/pdp-canvas-utils");
const { intentsOrUndefined, attachedSlotsOf } = await import("../../../app/create/attachment-intents");
const { rejectIfUnverified } = await import("../../evidence-gate");

type Kind = Parameters<typeof readPdpRequest>[1];
afterEach(() => vi.restoreAllMocks());

async function send(kind: Kind, body: unknown) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = await readPdpRequest(
    new Request("http://localhost/api/pdp/x", { method: "POST", body: JSON.stringify(body) }), kind);
  const issues = warn.mock.calls.map((c) => c.slice(1).map(String).join(" ")).join(" | ");
  warn.mockRestore();
  return result.ok ? "통과" : `거절 ${issues}`;
}

// ── 기획 결과(모델 응답 → TextModeFlow 상태) ──────────────────────
const rawSection = (i: number) => ({
  section_id: `S${i + 1}`, section_name: `섹션 ${i + 1}`, headline: `제목 ${i + 1}`, subheadline: "부제", bullets: ["하나"],
  layout_notes: "상단 텍스트", prompt_ko: "밝은 주방", prompt_en: "bright korean kitchen", style_guide: "warm",
  evidence: [
    { target: { slot: "headline" }, value: `제목 ${i + 1}`, kind: "rhetoric" },
    { target: { slot: "subheadline" }, value: "부제", kind: "rhetoric" },
    { target: { slot: "bullet", index: 0 }, value: "하나", kind: "rhetoric" },
    { target: { slot: "prompt_ko" }, value: "밝은 주방", kind: "rhetoric" },
  ],
});
const bp = normalizeTextBlueprint({ executiveSummary: "요약", sections: Array.from({ length: 6 }, (_, i) => rawSection(i)) });
const state = replaceBlueprintState({ ...bp, sections: stableSections(bp.sections) });
const sections = mergeArtDirection(state.originalBlueprint, state.blueprint).sections;
const briefFor = (productKind: string, offeringKind = "other") => ({
  ...normalizeBrief({ offeringName: "상품", offeringKind, oneLiner: "한 줄" }, "상품을 팝니다"),
  productKind, pageGoal: "purchase",
});

// ── 첨부 축 ──────────────────────────────────────────────────────
/** 제품 사진. 글 경로에는 올리는 칸이 없다 — 「있음」은 사진 모드에서 올리고 넘어온 경우뿐이다. */
const PRODUCTS = [
  ...PRODUCT_KINDS.map((kind) => ({ label: `없음/${kind}`, productKind: kind, preparedImage: null })),
  { label: "있음(사진 모드에서 남음)/physical", productKind: "physical",
    preparedImage: { base64: "/9j/4AAQ", mimeType: "image/jpeg", previewUrl: "data:image/jpeg;base64,/9j/4AAQ", fileName: "p.jpg" } },
] as const;

/** 디자인 레퍼런스. 화면이 실제로 채우는 값 그대로(StyleReferenceView). */
const ref = (patch: Record<string, unknown>) => ({ id: "r1", name: "레퍼런스", description: "", imageBase64: "iVBORw0KGgo=", mimeType: "image/png", reason: "", ...patch });
const STYLES = [
  { label: "없음", reference: undefined, enabled: true },
  // StyleReferenceAttach: 등록 응답의 description + 브라우저 file.type
  { label: "직접 업로드(png)", reference: ref({ description: "팔레트: 크림", mimeType: "image/png" }), enabled: true },
  { label: "직접 업로드(jpeg)", reference: ref({ description: "", mimeType: "image/jpeg" }), enabled: true },
  { label: "직접 업로드(webp)", reference: ref({ description: "팔레트: 크림", mimeType: "image/webp" }), enabled: true },
  // SavedImagePicker → 이미 등록된 것: blob.type(저장소 contentType). 라이브러리 참고 이미지는 등록을 다시 탄다.
  { label: "저장된 것에서 고름(레퍼런스)", reference: ref({ description: "팔레트: 크림", mimeType: "image/jpeg" }), enabled: true },
  { label: "저장된 것에서 고름(라이브러리)", reference: ref({ description: "라이브러리 참고 이미지", mimeType: "image/webp" }), enabled: true },
  // plan-from-text 응답의 result.styleReference
  { label: "서버 추천", reference: ref({ description: "팔레트: 크림\n서체: 굵은 산세리프", mimeType: "image/png", reason: "어울림" }), enabled: true },
  { label: "추천을 껐음", reference: ref({ description: "팔레트: 크림", reason: "어울림" }), enabled: false },
] as const;

const PERSON_PHOTO = { base64: "/9j/4AAQ", mimeType: "image/jpeg", previewUrl: "data:image/jpeg;base64,/9j/4AAQ", fileName: "m.jpg" };
/** 인물. 글 경로에서 사진은 사진 모드에서 남은 것만, 캐릭터는 시나리오 화면의 CharacterPicker. */
const PERSONS = [
  { label: "없음", modelImage: null, usage: null, characterId: undefined, angles: [], personSource: undefined },
  { label: "사진(첫 섹션만)", modelImage: PERSON_PHOTO, usage: "hero-only", characterId: undefined, angles: [], personSource: undefined },
  { label: "사진(전 섹션)", modelImage: PERSON_PHOTO, usage: "all-sections", characterId: undefined, angles: [], personSource: undefined },
  { label: "캐릭터(자동 각도)", modelImage: null, usage: null, characterId: "c1", angles: [], personSource: undefined },
  { label: "캐릭터(각도 고름)", modelImage: null, usage: null, characterId: "c1", angles: ["front", "side"], personSource: undefined },
  { label: "둘 다→사진", modelImage: PERSON_PHOTO, usage: "all-sections", characterId: "c1", angles: [], personSource: "uploaded" },
  { label: "둘 다→캐릭터", modelImage: PERSON_PHOTO, usage: "all-sections", characterId: "c1", angles: [], personSource: "character" },
] as const;

/** 각 자리에 적은 지시. 붙은 자리만 실린다(intentsOrUndefined). */
const INTENTS = { anchor: "라벨을 지켜 주세요", person: "안경을 씌워 주세요", style: "색만 가져와 주세요" };

type Combo = { product: { label: string; productKind: (typeof PRODUCTS)[number]["productKind"]; preparedImage: (typeof PRODUCTS)[number]["preparedImage"] }; style: (typeof STYLES)[number]; person: (typeof PERSONS)[number] };

/** PdpMakerClient → PdpEditor 가 넘기는 값으로 page 를 짓는다. mode 만 바꿔 사진 경로와 비교한다. */
function pageFor({ product, style, person }: Combo, mode: "text" | "image") {
  const styleReference = style.enabled ? style.reference : undefined;
  const attachmentIntents = intentsOrUndefined(INTENTS, attachedSlotsOf({
    preparedImage: product.preparedImage, modelImage: person.modelImage, characterId: person.characterId,
    styleReference, styleReferenceEnabled: style.enabled,
  }));
  const preserveProduct = mode === "text"
    ? defaultPreserveProduct({ startedFromImage: false, offeringKind: product.productKind === "service" ? "course" : "other" })
    : true;
  return buildPageWire({
    anchorKind: mode === "text" ? "key-visual" : "product-photo",
    productKind: mode === "text" ? product.productKind : undefined,
    imageModel: "gpt-image-2.5-flare", outputMode: "full-image", look: "photoreal", userInstruction: "",
    preserveProduct, styleReference, attachmentIntents, pageContext: "",
    referenceModel: person.modelImage, referenceModelUsage: person.usage, personSource: person.personSource,
  });
}

/** 서버가 섹션 0·1 에 실제로 넘기는 것(라우트와 같은 조립 순서). */
function effective(page: ReturnType<typeof buildPageWire>, combo: Combo) {
  const inputs = pageInputsFromWire(page);
  const fake = combo.person.characterId ? [{ base64: "x", mimeType: "image/png", angle: "front" }] : undefined;
  const at = (index: number) => buildSectionImageOptions(inputs, {
    section: sections[index]!, index,
    options: normalizeImageOptions(undefined, combo.person.usage === "all-sections" ? true : index === 0),
    characterReferences: fake as never,
  });
  const s0 = at(0); const s1 = at(1);
  const hasStyle = Boolean(s0.styleReferenceImages?.length);
  return {
    앵커전송: shouldSendAnchor({ anchorKind: s0.anchorKind, hasStyleReference: hasStyle }),
    앵커역할: anchorRoleFor({ anchorKind: s0.anchorKind, hasStyleReference: hasStyle, preserveProduct: s0.preserveProductImage ?? true }),
    개념시안_화면판단: Boolean(page.conceptOnly), 개념시안_모델도달: Boolean(s0.conceptOnly),
    인물사진: `${s0.referenceModelImageBase64 ? "S0" : "-"}/${s1.referenceModelImageBase64 ? "S1" : "-"}`,
    레퍼런스: hasStyle, 제품지시: s0.attachmentIntents?.anchor ? "실림" : "-",
  };
}

function batchBody(page: ReturnType<typeof buildPageWire>, combo: Combo) {
  return chunkForModel(sections.map((section, index) => ({ section, index })), "gpt-image-2.5-flare").map((chunk) => ({
    originalImageBase64: "/9j/4AAQ", ...jobRequestFields("6d1f7c0e-1c2b-4e0a-9a51-3c0f3f5d2b10", 0),
    sections: chunk.map((c) => c.section), sectionIndexes: chunk.map((c) => c.index), aspectRatio: "9:16",
    characterId: combo.person.characterId, characterAngles: combo.person.angles, page,
    optionsBySection: Object.fromEntries(chunk.map((c) => [c.section.section_id,
      normalizeImageOptions(undefined, combo.person.usage === "all-sections" ? true : c.index === 0)])),
    emphasisWordsList: chunk.map(() => []),
  }));
}

describe("텍스트 경로 첨부 조합 전체", () => {
  it("모든 조합의 모든 요청을 스키마에 넣는다", async () => {
    const rows: string[] = [];
    const rejected: string[] = [];
    for (const product of PRODUCTS) for (const style of STYLES) for (const person of PERSONS) {
      const combo = { product, style, person };
      const brief = briefFor(product.productKind);
      // 기획·대표 이미지 몸통에는 첨부가 하나도 안 실린다(TextModeFlow.handlePlan / requestKeyVisual).
      const plan = await send("plan", { text: "상품을 팝니다", productKind: product.productKind, pageGoal: "purchase",
        aspectRatio: "9:16", outputMode: "full-image", copyIntensity: "normal", gapPolicy: "ask" });
      const kv = await send("keyVisual", { brief, blueprint: state.blueprint, aspectRatio: "9:16", imageModel: "gpt-image-2.5-flare" });
      const page = pageFor(combo, "text");
      const single = await send("single", {
        originalImageBase64: "/9j/4AAQ", ...jobRequestFields("6d1f7c0e-1c2b-4e0a-9a51-3c0f3f5d2b10", 0),
        section: sections[0], aspectRatio: "9:16", sectionIndex: 0, page,
        options: { ...normalizeImageOptions(undefined, true), isRegeneration: false }, emphasisWords: [],
        characterId: person.characterId, characterAngles: person.angles,
      });
      const batches = await Promise.all(batchBody(page, combo).map((body) => send("batch", body)));
      const batch = batches.every((r) => r === "통과") ? "통과" : batches.find((r) => r !== "통과")!;
      const key = `${product.label} | ${style.label} | ${person.label}`;
      for (const [name, r] of [["plan", plan], ["keyVisual", kv], ["single", single], ["batch", batch]]) {
        if (r !== "통과") rejected.push(`${key} → ${name}: ${r}`);
      }
      rows.push(`${key} | plan ${plan} | kv ${kv} | single ${single} | batch ${batch}`);
    }
    expect(rows.length).toBe(PRODUCTS.length * STYLES.length * PERSONS.length);
    expect(rejected).toEqual([]);
  });

  it("같은 첨부, 글 경로 vs 사진 경로 — 서버가 모델에 넘기는 것", () => {
    const lines: string[] = [];
    for (const product of PRODUCTS) for (const style of [STYLES[0], STYLES[6], STYLES[7]]) for (const person of [PERSONS[0], PERSONS[1], PERSONS[3], PERSONS[6]]) {
      const combo = { product, style, person };
      const text = effective(pageFor(combo, "text"), combo);
      const image = effective(pageFor({ ...combo, product: { ...product, preparedImage: PRODUCTS[4].preparedImage } }, "image"), combo);
      expect(text.개념시안_모델도달).toBe(text.개념시안_화면판단);
      expect(image.개념시안_모델도달).toBe(image.개념시안_화면판단);
      lines.push(`${product.label} | ${style.label} | ${person.label}\n  글  ${JSON.stringify(text)}\n  사진 ${JSON.stringify(image)}`);
    }
    expect(lines.length).toBeGreaterThan(0);
  });

  it("화면의 개념 시안 표시가 모델까지 전달된다", () => {
    const combo = { product: PRODUCTS[0], style: STYLES[0], person: PERSONS[0] };
    expect(PRODUCTS[0].productKind).toBe("physical");
    expect(conceptOnlyNotice({ productKind: "physical", hasProductPhoto: false }).conceptOnly).toBe(true);
    const page = pageFor(combo, "text");
    expect(page.conceptOnly).toBe(true);                       // 화면은 보낸다
    expect(pageInputsFromWire(page).conceptOnly).toBe(true);
    expect(effective(page, combo).개념시안_모델도달).toBe(true);
  });

  it("[발견] 글 경로에서 레퍼런스가 있으면 대표 이미지(앵커)를 아예 안 보낸다 — 제품 보존 토글은 아무 효과가 없다", () => {
    for (const preserve of [true, false]) {
      expect(shouldSendAnchor({ anchorKind: "key-visual", hasStyleReference: true })).toBe(false);
      expect(anchorRoleFor({ anchorKind: "key-visual", hasStyleReference: true, preserveProduct: preserve })).toBe("mood-only");
      expect(anchorRoleFor({ anchorKind: "key-visual", hasStyleReference: false, preserveProduct: preserve })).toBe("mood-only");
    }
  });
});

/*
  ── 축: AI 가 한 섹션의 장면을 뺀 기획 ─────────────────────────────
  2026-10-02 93바이트 400 의 원인이 바로 이 축이었다. 위 조합 표는 「모든 섹션에 장면이 있는」
  기획만 쓰므로, 이 축이 없으면 장면 복구(G1: 코어 sectionScenePrompt)나 서버의 빈 장면 허용(G2:
  request.ts)을 되돌려도 표가 그대로 초록이다. 둘 다 아래에서 따로 잡는다.
    - G1 을 되돌리면: 기획 결과에 빈 prompt_en 이 남는 것을 「복구값 단언」이 잡는다
    - G2 를 되돌리면: 이미 저장된 빈 장면(옛 초안)을 그대로 보내는 마지막 줄이 400 으로 잡는다
*/
/** 모델 응답 한 섹션에서 칸을 뺀다. 값이 undefined 면 칸 자체가 없다(JSON 에 안 실린다). 뺀 칸의 근거도 함께 없다. */
function rawSectionWithout(i: number, patch: Record<string, unknown>) {
  const base: Record<string, unknown> = { ...rawSection(i), ...patch };
  const removed = Object.keys(patch).filter((key) => patch[key] === undefined);
  const slots: string[] = removed.filter((key) => key === "headline" || key === "prompt_ko");
  const evidence = (rawSection(i).evidence as Array<{ target: { slot: string } }>).filter((e) => !slots.includes(e.target.slot));
  for (const key of removed) delete base[key];
  return { ...base, evidence };
}

const LOST = undefined;
/** 한 섹션(S2)에서 모델이 장면을 빼는 방식과, 서버가 복구해야 하는 값(코어 sectionScenePrompt 의 대체 순서). */
const SCENE_OMISSIONS = [
  { label: "영어 장면(prompt_en)만 누락", patch: { prompt_en: LOST }, recovered: "밝은 주방" },
  { label: "영어 장면(prompt_en) 빈칸", patch: { prompt_en: "" }, recovered: "밝은 주방" },
  { label: "영어·한국어 장면과 제목까지 누락", patch: { prompt_en: LOST, prompt_ko: LOST, headline: LOST }, recovered: "섹션 2" },
  { label: "섹션 이름까지 전부 누락", patch: { prompt_en: LOST, prompt_ko: LOST, headline: LOST, section_name: LOST }, recovered: DEFAULT_SECTION_SCENE },
] as const;

/** 화면과 같은 순서: 기획 정규화 → stableSections → 「이대로 진행」(mergeArtDirection). */
function planWithOmission(patch: Record<string, unknown>) {
  const blueprint = normalizeTextBlueprint({
    executiveSummary: "요약", sections: Array.from({ length: 6 }, (_, i) => (i === 1 ? rawSectionWithout(i, patch) : rawSection(i))),
  });
  const planned = replaceBlueprintState({ ...blueprint, sections: stableSections(blueprint.sections) });
  return { blueprint: planned.blueprint, sections: mergeArtDirection(planned.originalBlueprint, planned.blueprint).sections };
}

/** 단건(S2)·일괄(S1~S3)·대표 이미지 요청을 서버 스키마에 넣고 결과를 한 줄로 돌려준다. */
async function sendSceneRequests(sent: ReturnType<typeof planWithOmission>) {
  const combo = { product: PRODUCTS[0], style: STYLES[0], person: PERSONS[0] };
  const page = pageFor(combo, "text");
  const fields = { originalImageBase64: "/9j/4AAQ", ...jobRequestFields("6d1f7c0e-1c2b-4e0a-9a51-3c0f3f5d2b10", 0) };
  const picked = sent.sections.slice(0, 3);
  return {
    단건: await send("single", { ...fields, section: sent.sections[1], aspectRatio: "9:16", sectionIndex: 1, page,
      options: { ...normalizeImageOptions(undefined, false), isRegeneration: false }, emphasisWords: [] }),
    일괄: await send("batch", { ...fields, sections: picked, sectionIndexes: [0, 1, 2], aspectRatio: "9:16", page, characterAngles: [],
      optionsBySection: Object.fromEntries(picked.map((s, i) => [s.section_id, normalizeImageOptions(undefined, i === 0)])),
      emphasisWordsList: picked.map(() => []) }),
    대표이미지: await send("keyVisual", { brief: briefFor("physical"), blueprint: sent.blueprint, aspectRatio: "9:16", imageModel: "gpt-image-2.5-flare" }),
  };
}

describe("텍스트 경로: AI 가 한 섹션의 장면을 뺀 기획", () => {
  it.each(SCENE_OMISSIONS)("$label → 장면이 복구되고 단건·일괄·대표 이미지 요청과 금지 문구 검사가 통과한다", async ({ patch, recovered }) => {
    const planned = planWithOmission(patch);

    // G1: 기획 결과에 빈 장면이 남지 않는다. 서버가 빈 장면을 받아 주게 된 뒤로는 요청만 봐서는 이 복구가 깨져도 모른다.
    expect(planned.sections[1]!.prompt_en).toBe(recovered);
    expect(planned.sections.every((section) => section.prompt_en.trim() !== "")).toBe(true);

    expect(await sendSceneRequests(planned)).toEqual({ 단건: "통과", 일괄: "통과", 대표이미지: "통과" });
    // 복구된 장면(한국어 장면·제목·섹션 이름)이 이미지에 실리므로 금지 문구 검사가 그 글을 본다. 멀쩡한 글이라 통과해야 한다.
    expect(rejectIfUnverified(planned.sections)).toBeNull();
  });

  it("옛 초안: 이미 저장돼 빈 장면이 그대로 남은 섹션도 요청이 통과한다(G2)", async () => {
    const planned = planWithOmission({});
    const stored = {
      blueprint: { ...planned.blueprint, sections: planned.blueprint.sections.map((s, i) => (i === 1 ? { ...s, prompt_en: "" } : s)) },
      sections: planned.sections.map((s, i) => (i === 1 ? { ...s, prompt_en: "" } : s)),
    };
    expect(stored.sections[1]!.prompt_en).toBe("");

    expect(await sendSceneRequests(stored)).toEqual({ 단건: "통과", 일괄: "통과", 대표이미지: "통과" });
    expect(rejectIfUnverified(stored.sections)).toBeNull();
  });
});
