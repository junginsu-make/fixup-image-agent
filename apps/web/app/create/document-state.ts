import type { CopyGapOutcome, LandingPageBlueprint, SectionBlueprint, BlueprintReview, PdpLlmExecution, ProductReadingStatus } from "@fixup/pdp-core";
import { DEFAULT_IMAGE_MODEL } from "@fixup/pdp-core";
import { randomId } from "../../lib/browser-safe";
import type { PdpDraftInput, PdpEditorDraftState, PreparedImageDraft } from "./pdp-drafts";

export interface PdpSection extends SectionBlueprint { id: string; sourceSectionId: string; generatedAssetId?: string }
type Settings = Pick<PdpDraftInput, "imageModel" | "copyIntensity" | "gapPolicy" | "desiredTone" | "look" |
  "userInstruction" | "aspectRatio" | "preserveProduct">;
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
    enabled: boolean; instruction?: string; characterId?: string; angles?: string[] }>;
  assets: Record<string, Asset>;
  originalAssetId?: string;
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
  const references: PdpDocumentV3["references"] = [];
  if (input.preparedImage) references.push({ role: "product", assetId: addAsset(input.preparedImage), enabled: true, instruction: input.attachmentIntents?.anchor });
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
      desiredTone: input.desiredTone, look: input.look ?? "photoreal", userInstruction: input.userInstruction ?? "", aspectRatio: input.aspectRatio,
      preserveProduct: input.preserveProduct ?? true },
    references, assets, originalAssetId: input.result ? addAsset({ base64: input.result.originalImage, mimeType: "image/jpeg" }) : undefined,
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
  const prepared = (role: "product" | "person"): PreparedImageDraft | null => {
    const ref = find(role); const asset = ref && doc.assets[ref.assetId];
    return asset ? { base64: asset.base64, mimeType: asset.mimeType, fileName: asset.fileName ?? "image",
      previewUrl: asset.previewUrl ?? `data:${asset.mimeType};base64,${asset.base64}` } : null;
  };
  const style = find("style"); const styleAsset = style && doc.assets[style.assetId];
  const blueprint = { ...doc.blueprint, sections: doc.sections };
  return {
    id: doc.id, createdAt: doc.createdAt, ...doc.settings,
    appState: doc.stage === "planning" ? "processing" : doc.stage === "editor" ? "editor"
      : doc.stage === "outline" && doc.originalAssetId ? "scenario" : "upload",
    preparedImage: prepared("product"), modelImage: prepared("person"), modelImageUsage: doc.inputs.modelImageUsage,
    result: doc.originalAssetId ? { originalImage: doc.assets[doc.originalAssetId].base64, blueprint, review: doc.planningReview, planningExecutions: doc.planningExecutions,
      productReadingStatus: doc.planningReadingStatus, copyGapOutcome: doc.planningGapOutcome } : null,
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

export function updatePdpDocument(doc: PdpDocumentV3, action:
  | { type: "patchSection"; id: string; patch: Partial<SectionBlueprint> }
  | { type: "replaceDraft"; draft: PdpDraftInput },
): PdpDocumentV3 {
  if (action.type === "replaceDraft") return createPdpDocument(action.draft, doc);
  return { ...doc, revision: doc.revision + 1, approved: undefined, previousRevision: doc.revision,
    sections: doc.sections.map((section) => section.id === action.id ? { ...section, ...action.patch, id: section.id, section_id: section.id } : section) };
}
