"use client";

import type {
  AspectRatio,
  CopyIntensity,
  GapPolicy,
  SellerBrief,
  GeneratedResult,
  ImageGenOptions,
  PdpCopyLanguage,
  ReferenceModelUsage,
  SectionBlueprint,
  AttachmentIntents,
} from "@fixup/pdp-core";
import { IMAGE_LOOKS, type ImageLook } from "@fixup/shared";

import { selectExpiredDraftIds } from "./draft-retention";
import { randomId } from "../../lib/browser-safe";

const PDP_DRAFT_DB = "hanirum-pdp-maker";
const PDP_DRAFT_STORE = "drafts";
const PDP_DRAFT_VERSION = 2;

export type PdpAppState = "upload" | "processing" | "scenario" | "editor";
export type OverlayTextAlign = "left" | "center" | "right";
export type WorkbenchTab = "image" | "layer" | "copy" | "guide";
export type CanvasLayerKind = "text" | "shape";

interface CanvasLayerBase {
  id: string;
  kind: CanvasLayerKind;
  x: number;
  y: number;
  width: number | string;
  height: number | string;
}

export interface TextOverlay extends CanvasLayerBase {
  kind: "text";
  text: string;
  language: PdpCopyLanguage;
  translations: Record<PdpCopyLanguage, string>;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundEnabled: boolean;
  backgroundOpacity: number;
  backgroundRadius: number;
  fontFamily: string;
  fontWeight: string;
  textAlign: OverlayTextAlign;
  lineHeight: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetY: number;
}

export interface ShapeLayer extends CanvasLayerBase {
  kind: "shape";
  fillColor: string;
  fillOpacity: number;
  borderRadius: number;
}

export type CanvasLayer = TextOverlay | ShapeLayer;

export interface FloatingWorkbenchState {
  x: number;
  y: number;
  width: number;
  height: number;
  isOpen: boolean;
}

export interface PdpEditorDraftState {
  currentSectionIndex: number;
  sections: SectionBlueprint[];
  /** 섹션과 1:1 로 대응하는 고유 키. 순서를 바꿔도 레이어가 따라오게 하는 기준. */
  sectionKeys: string[];
  sectionOptions: Record<string, ImageGenOptions>;
  overlaysBySection: Record<string, CanvasLayer[]>;
  defaultCopyLanguage: PdpCopyLanguage;
  notice: string;
  workbenchTab: WorkbenchTab;
  workbenchState: FloatingWorkbenchState;
}

/**
 * 초안에 담는 디자인 레퍼런스.
 *
 * 화면의 `StyleReferenceView` 를 그대로 참조하지 않는다 — 초안 파일이 화면
 * 컴포넌트에 매달리면 화면을 고칠 때마다 저장 형식이 흔들린다.
 */
export interface StyleReferenceDraft {
  id: string;
  name: string;
  imageBase64: string;
  mimeType: string;
  description: string;
  /** 왜 이것을 골랐는지. 자동 추천일 때만 채워진다. */
  reason: string;
}

export interface PreparedImageDraft {
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
}

export interface PdpDraftRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  appState: PdpAppState;
  preparedImage: PreparedImageDraft | null;
  modelImage: PreparedImageDraft | null;
  modelImageUsage: ReferenceModelUsage | null;
  result: GeneratedResult | null;
  additionalInfo: string;
  /** 파는 사람이 적은 것. 예전 초안에는 없다. */
  sellerBrief?: SellerBrief;
  copyIntensity?: CopyIntensity;
  gapPolicy?: GapPolicy;
  desiredTone: string;
  /** 그림의 결과 사용자가 직접 친 지시. 예전 초안에는 없다. */
  look?: ImageLook;
  userInstruction?: string;
  /**
   * 첨부 자리마다 적은 「이 그림을 어떻게 쓸까요」. 예전 초안에는 없다.
   *
   * **초안을 따라다녀야 한다.** 안 담으면 다른 작업을 불러왔을 때 앞 제품에
   * 대해 적은 말이 새 제품에 그대로 붙는다 — 편집기 화면에는 그 칸이 없어서
   * 사용자는 무엇이 반영되는지 볼 수도 없다.
   */
  attachmentIntents?: AttachmentIntents;
  /**
   * 디자인 레퍼런스와 그 토글. 예전 초안에는 없다.
   *
   * 지시(`attachmentIntents.style`)만 담고 그림을 안 담으면 되돌렸을 때 짝이
   * 어긋난다 — 앞 레퍼런스에 대해 적은 말이 새로 붙인 그림에 붙는다.
   */
  styleReference?: StyleReferenceDraft;
  styleReferenceEnabled?: boolean;
  aspectRatio: AspectRatio;
  notice: string;
  editorState: PdpEditorDraftState | null;
}

export interface PdpDraftSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  aspectRatio: AspectRatio;
  sectionCount: number;
  stageLabel: string;
  thumbnailUrl: string | null;
}

export type PdpDraftInput = Omit<PdpDraftRecord, "id" | "title" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
};

/**
 * 섹션마다 고유 키를 만든다.
 *
 * section_id 는 AI 응답값이라 중복될 수 있어 그대로 쓰지 않는다.
 * 중복되면 두 섹션의 레이어가 한 곳에 합쳐진다.
 */
export function buildSectionKeys(sections: Array<{ section_id?: string }>): string[] {
  const seen = new Map<string, number>();
  return sections.map((section, index) => {
    const base = (section.section_id || `S${index + 1}`).trim() || `S${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}~${count}`;
  });
}

/**
 * 예전 저장분(순서 번호 키)을 고유 키 기준으로 옮긴다.
 *
 * 판단 근거는 sectionKeys 의 유무다. 값이 숫자처럼 보이는지로 추측하지 않는다
 * (섹션 키 자체가 숫자일 수도 있다).
 */
export function migrateBySectionKey<T>(
  record: Record<string, T> | undefined,
  sectionKeys: string[],
  hadSectionKeys: boolean
): Record<string, T> {
  if (!record) {
    return {};
  }
  if (hadSectionKeys) {
    return { ...record };
  }
  const migrated: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const index = Number(key);
    const nextKey = Number.isInteger(index) && sectionKeys[index] !== undefined ? sectionKeys[index] : key;
    migrated[nextKey] = value;
  }
  return migrated;
}

export async function listPdpDrafts(): Promise<PdpDraftSummary[]> {
  const records = await withStore("readonly", (store) => requestAsPromise<PdpDraftRecord[]>(store.getAll()));
  return records
    .map((record) => normalizeDraftRecord(record))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((record) => ({
      id: record.id,
      title: record.title,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      aspectRatio: record.aspectRatio,
      sectionCount: record.editorState?.sections.length ?? record.result?.blueprint.sections.length ?? 0,
      stageLabel: record.result ? "편집 중" : "설정 초안",
      thumbnailUrl:
        record.editorState?.sections[0]?.generatedImage ??
        record.result?.blueprint.sections[0]?.generatedImage ??
        record.preparedImage?.previewUrl ??
        toImageSrc(record.result?.originalImage) ??
        null,
    }));
}

export async function getPdpDraft(id: string): Promise<PdpDraftRecord | null> {
  return withStore("readonly", (store) =>
    requestAsPromise<PdpDraftRecord | undefined>(store.get(id)).then((record) =>
      record ? normalizeDraftRecord(record) : null
    )
  );
}

export async function savePdpDraft(input: PdpDraftInput): Promise<PdpDraftRecord> {
  const now = new Date().toISOString();
  const nextRecord: PdpDraftRecord = {
    id: input.id ?? randomId(),
    title: buildDraftTitle(input),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    appState: input.appState,
    preparedImage: input.preparedImage,
    modelImage: input.modelImage,
    modelImageUsage: input.modelImageUsage,
    result: input.result,
    additionalInfo: input.additionalInfo,
    sellerBrief: input.sellerBrief,
    copyIntensity: input.copyIntensity,
    gapPolicy: input.gapPolicy,
    desiredTone: input.desiredTone,
    look: input.look,
    userInstruction: input.userInstruction,
    aspectRatio: input.aspectRatio,
    notice: input.notice,
    editorState: input.editorState,
  };

  const normalizedRecord = normalizeDraftRecord(nextRecord);

  await withStore("readwrite", (store) => requestAsPromise(store.put(normalizedRecord)));
  return normalizedRecord;
}

export async function deletePdpDraft(id: string): Promise<void> {
  await withStore("readwrite", (store) => requestAsPromise(store.delete(id)));
}

/**
 * 저장된 작업을 모두 지운다.
 *
 * 목록이 길어졌을 때 하나씩 지우게 하면 손이 너무 많이 간다. 되돌릴 수 없으므로
 * 부르는 쪽에서 반드시 확인을 받는다.
 */
export async function deleteAllPdpDrafts(): Promise<number> {
  const ids = await withStore("readonly", (store) =>
    requestAsPromise<string[]>(store.getAllKeys() as IDBRequest<string[]>),
  );
  if (ids.length === 0) return 0;

  await withStore("readwrite", async (store) => {
    for (const id of ids) {
      await requestAsPromise(store.delete(id));
    }
    return undefined;
  });
  return ids.length;
}

/**
 * 보관 기간이 지난 초안을 지운다. 지운 개수를 돌려준다.
 *
 * 시작 화면에서 목록을 읽을 때 함께 부른다 — 따로 도는 청소 작업을 두면 언제
 * 도는지 알 수 없고, 브라우저를 안 열면 영영 안 돈다.
 *
 * **실패해도 조용히 넘어간다.** 청소는 곁다리다. 이것 때문에 목록이 안 뜨면
 * 본말이 뒤집힌다.
 */
export async function purgeExpiredPdpDrafts(now: Date = new Date()): Promise<number> {
  try {
    const records = await withStore("readonly", (store) =>
      requestAsPromise<PdpDraftRecord[]>(store.getAll()),
    );
    const expired = selectExpiredDraftIds(records, now);
    if (expired.length === 0) return 0;

    await withStore("readwrite", async (store) => {
      for (const id of expired) {
        await requestAsPromise(store.delete(id));
      }
      return undefined;
    });
    return expired.length;
  } catch {
    return 0;
  }
}

function buildDraftTitle(input: PdpDraftInput) {
  const rawFileName = input.preparedImage?.fileName ?? "";
  const cleanedFileName = rawFileName.replace(/\.[^.]+$/, "").trim();
  const fallbackSection =
    input.editorState?.sections[0]?.section_name ??
    input.result?.blueprint.sections[0]?.section_name ??
    "상세페이지 초안";
  return cleanedFileName || fallbackSection;
}

function normalizeDraftRecord(record: PdpDraftRecord): PdpDraftRecord {
  const preparedImage = normalizePreparedImage(record.preparedImage);
  const modelImage = normalizePreparedImage(record.modelImage);
  const result = normalizeGeneratedResult(record.result, preparedImage, record.editorState);
  const normalizedSections = Array.isArray(result?.blueprint.sections)
    ? result.blueprint.sections
    : Array.isArray(record.editorState?.sections)
      ? record.editorState.sections
      : [];

  return {
    id: record.id,
    title: record.title?.trim() || buildFallbackDraftTitle(preparedImage, normalizedSections),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
    appState: record.appState === "processing" || record.appState === "editor" ? record.appState : "upload",
    preparedImage,
    modelImage,
    modelImageUsage:
      record.modelImageUsage === "all-sections" || record.modelImageUsage === "hero-only"
        ? record.modelImageUsage
        : null,
    result,
    additionalInfo: record.additionalInfo ?? "",
    sellerBrief: record.sellerBrief ?? {},
    copyIntensity: record.copyIntensity ?? "normal",
    gapPolicy: record.gapPolicy ?? "ask",
    desiredTone: record.desiredTone ?? "",
    // 결을 안 적어 둔 옛 초안은 photoreal 로 읽는다 — 그때의 동작이 사진이었다.
    look: (IMAGE_LOOKS as readonly string[]).includes(String(record.look ?? ""))
      ? (record.look as ImageLook)
      : "photoreal",
    userInstruction: record.userInstruction ?? "",
    aspectRatio: normalizeAspectRatio(record.aspectRatio),
    notice: record.notice ?? "저장된 작업을 불러왔습니다.",
    editorState: normalizeEditorState(record.editorState, result),
  };
}

function normalizePreparedImage(image: PreparedImageDraft | null | undefined) {
  if (!image?.base64 || !image.mimeType) {
    return null;
  }

  const previewUrl = image.previewUrl || `data:${image.mimeType};base64,${image.base64}`;

  return {
    base64: image.base64,
    mimeType: image.mimeType,
    previewUrl,
    fileName: image.fileName || "image",
  };
}

function normalizeGeneratedResult(
  result: GeneratedResult | null | undefined,
  preparedImage: PreparedImageDraft | null,
  editorState: PdpEditorDraftState | null | undefined
): GeneratedResult | null {
  if (result?.blueprint?.sections?.length) {
    return {
      originalImage: result.originalImage || preparedImage?.previewUrl || toDataUrl(preparedImage),
      blueprint: {
        executiveSummary: result.blueprint.executiveSummary ?? "",
        scorecard: Array.isArray(result.blueprint.scorecard) ? result.blueprint.scorecard : [],
        blueprintList: Array.isArray(result.blueprint.blueprintList) ? result.blueprint.blueprintList : [],
        sections: result.blueprint.sections,
      },
    };
  }

  if (preparedImage && editorState?.sections?.length) {
    return {
      originalImage: preparedImage.previewUrl || toDataUrl(preparedImage),
      blueprint: {
        executiveSummary: "",
        scorecard: [],
        blueprintList: [],
        sections: editorState.sections,
      },
    };
  }

  return null;
}

function normalizeEditorState(
  editorState: PdpEditorDraftState | null | undefined,
  result: GeneratedResult | null
): PdpEditorDraftState | null {
  const sections =
    Array.isArray(editorState?.sections) && editorState.sections.length
      ? editorState.sections
      : result?.blueprint.sections?.length
        ? result.blueprint.sections
        : [];
  const sectionOptions =
    editorState?.sectionOptions &&
    typeof editorState.sectionOptions === "object" &&
    !Array.isArray(editorState.sectionOptions)
      ? editorState.sectionOptions
      : {};
  const overlaysBySection =
    editorState?.overlaysBySection &&
    typeof editorState.overlaysBySection === "object" &&
    !Array.isArray(editorState.overlaysBySection)
      ? editorState.overlaysBySection
      : {};

  // sectionKeys 가 없으면 순서 번호로 저장된 예전 초안이다. 순서대로 옮긴다.
  const hadSectionKeys =
    Array.isArray(editorState?.sectionKeys) && editorState.sectionKeys.length === sections.length;
  const sectionKeys = hadSectionKeys ? editorState!.sectionKeys : buildSectionKeys(sections);

  if (!sections.length && !editorState) {
    return null;
  }

  return {
    currentSectionIndex:
      typeof editorState?.currentSectionIndex === "number"
        ? Math.max(0, Math.min(editorState.currentSectionIndex, Math.max(0, sections.length - 1)))
        : 0,
    sections,
    sectionKeys,
    sectionOptions: migrateBySectionKey(sectionOptions, sectionKeys, hadSectionKeys),
    overlaysBySection: migrateBySectionKey(overlaysBySection, sectionKeys, hadSectionKeys),
    defaultCopyLanguage: editorState?.defaultCopyLanguage === "en" ? "en" : "ko",
    notice: editorState?.notice ?? "저장된 작업을 이어서 편집할 수 있습니다.",
    workbenchTab:
      editorState?.workbenchTab === "copy" ||
      editorState?.workbenchTab === "guide" ||
      editorState?.workbenchTab === "layer" ||
      editorState?.workbenchTab === "image"
        ? editorState.workbenchTab
        : "image",
    workbenchState: {
      x: editorState?.workbenchState?.x ?? 756,
      y: editorState?.workbenchState?.y ?? 24,
      width: editorState?.workbenchState?.width ?? 332,
      height: editorState?.workbenchState?.height ?? 500,
      isOpen: editorState?.workbenchState?.isOpen ?? true,
    },
  };
}

function buildFallbackDraftTitle(
  preparedImage: PreparedImageDraft | null,
  sections: SectionBlueprint[]
) {
  const cleanedFileName = preparedImage?.fileName?.replace(/\.[^.]+$/, "").trim();
  return cleanedFileName || sections[0]?.section_name || "상세페이지 초안";
}

function normalizeAspectRatio(value: AspectRatio | string | undefined): AspectRatio {
  if (value === "1:1" || value === "3:4" || value === "4:3" || value === "9:16" || value === "16:9") {
    return value;
  }

  return "9:16";
}

/**
 * 썸네일 <img src> 로 쓸 수 있는 값을 돌려준다.
 *
 * GeneratedResult.originalImage 는 접두사 없는 순수 base64 다(서버가
 * sanitizeBase64Payload 로 그렇게 만든다). 그대로 src 에 넣으면 브라우저가
 * 상대 경로로 해석해 "GET /9j/4AAQ..." 요청을 보내고 431 로 실패한다.
 * mimeType 이 함께 저장돼 있지 않아 매직 바이트로 판별한다.
 */
function toImageSrc(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith("data:")) {
    return value;
  }

  const mimeType = value.startsWith("iVBOR") ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${value}`;
}

function toDataUrl(image: PreparedImageDraft | null) {
  if (!image) {
    return "";
  }

  return `data:${image.mimeType};base64,${image.base64}`;
}

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저에서는 로컬 저장 기능을 사용할 수 없습니다."));
      return;
    }

    const request = indexedDB.open(PDP_DRAFT_DB, PDP_DRAFT_VERSION);

    request.onerror = () => reject(request.error ?? new Error("저장소를 열지 못했습니다."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PDP_DRAFT_STORE)) {
        database.createObjectStore(PDP_DRAFT_STORE, { keyPath: "id" });
      }
    };
  });
}

function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>) {
  return openDraftDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(PDP_DRAFT_STORE, mode);
        const store = transaction.objectStore(PDP_DRAFT_STORE);
        let resultValue: T;

        transaction.oncomplete = () => {
          database.close();
          resolve(resultValue);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("저장소 작업에 실패했습니다."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("저장소 작업이 중단되었습니다."));
        };

        handler(store)
          .then((result) => {
            resultValue = result;
          })
          .catch((error: unknown) => {
            database.close();
            reject(error);
          });
      })
  );
}

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB 요청에 실패했습니다."));
  });
}
