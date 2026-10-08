import type { CopyGapOutcome, LandingPageBlueprint, SectionBlueprint, BlueprintReview, PdpLlmExecution, ProductReadingStatus } from "@fixup/pdp-core";
import { DEFAULT_IMAGE_MODEL, PRODUCT_IDS, PRODUCT_LIMITS, type ProductId } from "@fixup/pdp-core";
import { randomId } from "../../lib/browser-safe";
import { pdpImageModelOrDefault } from "../../lib/pdp/image-models";
import type { PdpDraftInput, PdpEditorDraftState, PreparedImageDraft } from "./pdp-drafts";
import {
  clipProductName, normalizeProductSlots, primaryPhoto, productsFromLegacy, withFirstProduct, type PdpProductDraft,
} from "./products";

export interface PdpSection extends SectionBlueprint { id: string; sourceSectionId: string; generatedAssetId?: string }
type Settings = Pick<PdpDraftInput, "imageModel" | "copyIntensity" | "gapPolicy" | "desiredTone" | "look" |
  "userInstruction" | "planInstruction" | "aspectRatio" | "preserveProduct" | "personSource">;
type Asset = { id: string; base64: string; mimeType: string; fileName?: string; previewUrl?: string };
export interface PdpDocumentV3 {
  schemaVersion: 3;
  id: string;
  revision: number;
  savedRevision: number;
  sourceMode: "image" | "text" | "redesign";
  offeringType: "physical" | "service" | "digital" | "other";
  objective: "purchase" | "inquiry" | "promotion";
  stage: "input" | "planning" | "outline" | "evidence" | "key_visual" | "generating" | "review" | "editor";
  inputs: Pick<PdpDraftInput, "additionalInfo" | "sellerBrief" | "modelImageUsage" | "textDraft" | "attachmentIntents" | "styleReferenceEnabled">;
  settings: Settings;
  references: Array<{ role: "product" | "person" | "character" | "style"; assetId: string;
    enabled: boolean; instruction?: string; characterId?: string; angles?: string[];
    /** 제품 참조만: 사용자가 올린 원본. `assetId` 는 1024 사본(미리보기·분석)이다. */ originalAssetId?: string;
    /** 제품 참조만(설계 2026-10-08 §3.2): 어느 제품의 몇째 사진인가. 옛 문서에는 없다 — 그때는 제품 1, 참조 차례. */
    productId?: ProductId; productName?: string; photoIndex?: number }>;
  assets: Record<string, Asset>;
  originalAssetId?: string;
  /** 구성안을 만들 때 본 제품 목록의 열쇠(`GeneratedResult.analyzedProductsKey`). 화면이 붙인 값이다. */
  planningProductsKey?: string;
  /**
   * 제품 칸 목록(차례·이름). **사진 없는 칸도 여기 남는다** — 참조는 사진마다 하나라, 칸을 참조로만
   * 되살리면 이름만 적은 칸이 사라지고 제품 1 사진을 다 지운 작업은 제품 1 없이 열린다. 옛 문서에는 없다.
   */
  productSlots?: Array<{ id: ProductId; name: string }>;
  sections: PdpSection[];
  blueprint: Omit<LandingPageBlueprint, "sections">;
  analyzedBlueprint?: LandingPageBlueprint | null;
  planningReview?: BlueprintReview;
  /**
   * 사진에서 제품을 충분히 읽었는가, 그리고 빈자리 정책으로 실제로 무엇을 했는가.
   *
   * **여기 자리를 안 내주면 초안을 다시 열 때 사라진다.** 화면은 초안을 늘 이
   * 문서로 바꿨다가 되돌려 읽는다(`draft-repository`) — `pdp-drafts` 쪽에만
   * 넣어 두면 아무도 지나지 않는 길에 넣은 것이다.
   */
  planningReadingStatus?: ProductReadingStatus;
  planningGapOutcome?: CopyGapOutcome;
  planningExecutions?: PdpLlmExecution[];
  styleReference?: Omit<NonNullable<PdpDraftInput["styleReference"]>, "imageBase64" | "mimeType">;
  editor: Omit<PdpEditorDraftState, "sections" | "sectionKeys"> | null;
  approved?: { revision: number; approvedAt: string };
  previousRevision?: number;
  createdAt: string;
  updatedAt: string;
  title?: string;
  notice: string;
  snapshotOf?: string;
  recoveryNotes: string[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function stableSections(sections: readonly SectionBlueprint[]): PdpSection[] {
  const seen = new Set<string>();
  return sections.map((section) => {
    const candidate = section as Partial<PdpSection>;
    const prior = candidate.id ?? section.section_id;
    const id = uuid.test(prior) && !seen.has(prior) ? prior : randomId();
    seen.add(id);
    return { ...section, id, section_id: id, sourceSectionId: candidate.sourceSectionId ?? section.section_id };
  });
}

export function createPdpDocument(input: PdpDraftInput, previous?: PdpDocumentV3): PdpDocumentV3 {
  const assets: Record<string, Asset> = {};
  const addAsset = (image: Omit<Asset, "id">) => {
    const existing = [...Object.values(assets), ...Object.values(previous?.assets ?? {})]
      .find((asset) => asset.base64 === image.base64 && asset.mimeType === image.mimeType);
    const id = existing?.id ?? randomId(); assets[id] = { ...existing, ...image, id }; return id;
  };
  const products = input.products?.length ? input.products : productsFromLegacy(input.preparedImage);
  const references: PdpDocumentV3["references"] = productReferences(products, addAsset, input.attachmentIntents?.anchor);
  if (input.modelImage) references.push({ role: "person", assetId: addAsset(input.modelImage), enabled: true, instruction: input.attachmentIntents?.person });
  if (input.characterId) references.push({ role: "character", assetId: input.characterId, enabled: true,
    characterId: input.characterId, angles: input.characterAngles ?? [], instruction: input.attachmentIntents?.person });
  if (input.styleReference) references.push({ role: "style", assetId: addAsset({ base64: input.styleReference.imageBase64, mimeType: input.styleReference.mimeType }),
    enabled: input.styleReferenceEnabled ?? true, instruction: input.attachmentIntents?.style });
  const source = !previous && input.editorState?.sections.length ? input.editorState.sections
    : input.result?.blueprint.sections ?? input.textDraft?.blueprint?.sections ?? [];
  const sections = stableSections(source);
  for (const section of sections) {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(section.generatedImage ?? "");
    if (match) section.generatedAssetId = addAsset({ mimeType: match[1], base64: match[2] });
  }
  if (input.textDraft?.keyVisual) addAsset(input.textDraft.keyVisual);
  if (input.textDraft?.styleReference) addAsset({ base64: input.textDraft.styleReference.imageBase64, mimeType: input.textDraft.styleReference.mimeType });
  const keys = input.editorState?.sectionKeys ?? source.map((s) => s.section_id);
  const rekey = <T,>(record: Record<string, T>) => Object.fromEntries(sections.flatMap((section, i) => {
    const value = record[section.id] ?? record[keys[i]];
    return value === undefined ? [] : [[section.id, value]];
  }));
  let editor: PdpDocumentV3["editor"] = null;
  if (input.editorState) {
    const { sections: _sections, sectionKeys: _keys, ...rest } = input.editorState;
    editor = { ...rest, overlaysBySection: rekey(rest.overlaysBySection ?? {}), sectionOptions: rekey(rest.sectionOptions ?? {}) };
  }
  const bp = input.result?.blueprint ?? input.textDraft?.blueprint;
  const { sections: _sections, ...blueprint } = bp ?? { sections: [], executiveSummary: "", scorecard: [], blueprintList: [] };
  let stage: PdpDocumentV3["stage"] = input.appState === "processing" ? "planning" : input.appState === "scenario" ? "outline"
    : input.appState === "editor" && input.result ? "editor" : "input";
  if (!input.result && input.startMode === "text" && input.textDraft?.blueprint) {
    stage = input.textDraft.stage === "keyVisual" ? "key_visual" : input.textDraft.stage === "unverifiedReview" ? "evidence"
      : input.textDraft.stage === "scenario" ? "outline" : "input";
  }
  if (!input.result && !input.textDraft?.blueprint && stage !== "planning") stage = "input";
  const recoveryNotes = previous?.recoveryNotes ?? [];
  if (input.editorState?.sections.length && !previous) recoveryNotes.push("기존 편집본과 레이어를 우선 복구했습니다. 배치를 확인해 주세요.");
  const style = input.styleReference;
  return {
    schemaVersion: 3, id: input.id ?? previous?.id ?? randomId(), revision: previous ? previous.revision + 1 : 1,
    savedRevision: previous?.savedRevision ?? 0, sourceMode: input.startMode ?? "image",
    offeringType: previous?.offeringType ?? (input.startMode === "text" ? "other" : "physical"), objective: previous?.objective ?? "purchase",
    stage, inputs: { additionalInfo: input.additionalInfo, sellerBrief: input.sellerBrief,
      modelImageUsage: input.modelImageUsage, textDraft: input.textDraft, attachmentIntents: input.attachmentIntents,
      styleReferenceEnabled: input.styleReferenceEnabled },
    settings: { imageModel: input.imageModel ?? DEFAULT_IMAGE_MODEL, copyIntensity: input.copyIntensity ?? "normal", gapPolicy: input.gapPolicy ?? "ask",
      desiredTone: input.desiredTone, look: input.look ?? "photoreal", userInstruction: input.userInstruction ?? "", planInstruction: input.planInstruction, aspectRatio: input.aspectRatio,
      preserveProduct: input.preserveProduct ?? true, personSource: input.personSource },
    references, assets, originalAssetId: input.result ? addAsset({ base64: input.result.originalImage, mimeType: "image/jpeg" }) : undefined,
    planningProductsKey: input.result?.analyzedProductsKey,
    productSlots: products.length ? products.map(({ id, name }) => ({ id, name })) : undefined,
    sections, blueprint, analyzedBlueprint: input.analyzedBlueprint, planningReview: input.result?.review,
    planningReadingStatus: input.result?.productReadingStatus, planningGapOutcome: input.result?.copyGapOutcome,
    planningExecutions: input.result?.planningExecutions ?? input.textDraft?.planningExecutions,
    styleReference: style ? { id: style.id, name: style.name, description: style.description, reason: style.reason } : undefined,
    editor, previousRevision: previous?.revision, createdAt: input.createdAt ?? previous?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(), notice: input.notice, snapshotOf: input.snapshotOf, recoveryNotes: [...recoveryNotes],
  };
}

export function documentToDraft(doc: PdpDocumentV3): PdpDraftInput {
  const find = (role: PdpDocumentV3["references"][number]["role"]) => doc.references.find((ref) => ref.role === role);
  const person = find("person");
  const products = productsFromReferences(doc);
  const style = find("style"); const styleAsset = style && doc.assets[style.assetId];
  const blueprint = { ...doc.blueprint, sections: doc.sections };
  return {
    id: doc.id, createdAt: doc.createdAt, ...doc.settings,
    // 상세페이지에서 안 쓰는 모델로 저장된 문서는 기본 모델로 연다(2026-10-08). 안 고치면 그림 만들기가 계속 거절된다.
    imageModel: pdpImageModelOrDefault(doc.settings.imageModel),
    appState: doc.stage === "planning" ? "processing" : doc.stage === "editor" ? "editor"
      : doc.stage === "outline" && doc.originalAssetId ? "scenario" : "upload",
    // 대표 사진은 옛 코드가 읽는 한 장이라 제품 목록과 함께 돌려준다.
    preparedImage: primaryPhoto(products), products, modelImage: person ? preparedFromReference(doc, person) : null, modelImageUsage: doc.inputs.modelImageUsage,
    result: doc.originalAssetId ? { originalImage: doc.assets[doc.originalAssetId].base64, blueprint, review: doc.planningReview, planningExecutions: doc.planningExecutions,
      productReadingStatus: doc.planningReadingStatus, copyGapOutcome: doc.planningGapOutcome,
      ...(doc.planningProductsKey ? { analyzedProductsKey: doc.planningProductsKey } : {}) } : null,
    additionalInfo: doc.inputs.additionalInfo, sellerBrief: doc.inputs.sellerBrief, textDraft: doc.inputs.textDraft,
    startMode: doc.sourceMode === "text" ? "text" : "image", characterId: find("character")?.characterId,
    characterAngles: find("character")?.angles ?? [],
    attachmentIntents: doc.inputs.attachmentIntents,
    styleReference: styleAsset && doc.styleReference ? { ...doc.styleReference, imageBase64: styleAsset.base64, mimeType: styleAsset.mimeType } : undefined,
    styleReferenceEnabled: style?.enabled ?? doc.inputs.styleReferenceEnabled ?? true, analyzedBlueprint: doc.analyzedBlueprint,
    editorState: doc.editor ? { ...doc.editor, sections: doc.sections, sectionKeys: doc.sections.map((section) => section.id) } : null,
    notice: doc.notice, snapshotOf: doc.snapshotOf,
  };
}

type Reference = PdpDocumentV3["references"][number];
type AddAsset = (image: Omit<Asset, "id">) => string;

/**
 * 제품 사진마다 참조 하나(설계 2026-10-08 §3.2). 지시는 제품 1 첫 사진에만 둔다 — 첨부 지시 칸이
 * 제품 1 대표 사진에 붙은 것이라, 사진마다 복사하면 다시 열 때 어느 것이 진짜인지 모른다.
 */
function productReferences(products: readonly PdpProductDraft[], addAsset: AddAsset, instruction: string | undefined): Reference[] {
  return products.flatMap((product) => product.photos.map((photo, photoIndex): Reference => {
    const { original, base64, mimeType, fileName, previewUrl } = photo;
    return {
      role: "product",
      // 사본 그림에는 사본 칸만 넣는다. 통째로 넘기면 원본이 사본 안에 한 벌 더 담긴다.
      assetId: addAsset({ base64, mimeType, fileName, previewUrl }),
      // 원본은 따로 둔다. 1024 사본(미리보기·분석)과 원본(그림 모델)은 쓰임이 다르다.
      ...(original ? { originalAssetId: addAsset({ base64: original.base64, mimeType: original.mimeType }) } : {}),
      productId: product.id, productName: product.name, photoIndex,
      enabled: true,
      instruction: product.id === "p1" && photoIndex === 0 ? instruction : undefined,
    };
  }));
}

function preparedFromReference(doc: PdpDocumentV3, ref: Reference): PreparedImageDraft | null {
  const asset = doc.assets[ref.assetId];
  const originalAsset = ref.originalAssetId ? doc.assets[ref.originalAssetId] : undefined;
  return asset ? { base64: asset.base64, mimeType: asset.mimeType, fileName: asset.fileName ?? "image",
    previewUrl: asset.previewUrl ?? `data:${asset.mimeType};base64,${asset.base64}`,
    ...(originalAsset ? { original: { base64: originalAsset.base64, mimeType: originalAsset.mimeType } } : {}) } : null;
}

/**
 * 제품 칸을 되살린다. 칸(차례·이름)은 `productSlots` 에서, 사진은 참조에서 채운다.
 *
 * `productSlots` 가 없으면(옛 문서) 참조에 처음 나온 차례로 칸을 만든다. 참조의 `productId` 가
 * 없으면 제품 1, `photoIndex` 가 없으면 참조 차례. 모르는 id 는 버린다. 칸이 하나라도 있으면
 * 제품 1 을 맨 앞에 둔다(로컬 초안 길과 같다). 제품 사진이 아예 없던 문서는 빈 목록.
 */
function productsFromReferences(doc: PdpDocumentV3): PdpProductDraft[] {
  const photos = doc.references.flatMap((ref, order) => {
    const id = ref.productId ?? "p1";
    const photo = ref.role === "product" && PRODUCT_IDS.includes(id) ? preparedFromReference(doc, ref) : null;
    return photo ? [{ id, name: clipProductName(ref.productName), order: typeof ref.photoIndex === "number" ? ref.photoIndex : order, photo }] : [];
  });
  const saved = normalizeProductSlots(doc.productSlots);
  const slots = saved.length ? saved : photos
    .filter((entry, index) => photos.findIndex((other) => other.id === entry.id) === index)
    .map(({ id, name }) => ({ id, name }));
  if (slots.length === 0) return [];
  return withFirstProduct(slots.map((slot) => ({
    ...slot,
    photos: photos.filter((entry) => entry.id === slot.id).sort((a, b) => a.order - b.order)
      .map((entry) => entry.photo).slice(0, PRODUCT_LIMITS.photos),
  })));
}

export function updatePdpDocument(doc: PdpDocumentV3, action:
  | { type: "patchSection"; id: string; patch: Partial<SectionBlueprint> }
  | { type: "replaceDraft"; draft: PdpDraftInput },
): PdpDocumentV3 {
  if (action.type === "replaceDraft") return createPdpDocument(action.draft, doc);
  return { ...doc, revision: doc.revision + 1, approved: undefined, previousRevision: doc.revision,
    sections: doc.sections.map((section) => section.id === action.id ? { ...section, ...action.patch, id: section.id, section_id: section.id } : section) };
}
