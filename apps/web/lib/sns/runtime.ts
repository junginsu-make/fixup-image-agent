import "server-only";
import { signPath, signPaths } from "../storage/signing";
import { inOwnerFolder } from "../storage/owner-folder";

import sharp from "sharp";
import {
  CARD_RATIOS,
  averageEdgeColor,
  letterboxPlan,
} from "@fixup/sns-core";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import {
  getLocalDatabase,
  isLocalStoreEnabled,
  localStoreRoot,
  readLocalReferenceFile,
  readLocalSnsResultFile,
  replaceLocalSnsCards,
  updateLocalSnsCard,
  writeLocalSnsPreviewFile,
  writeLocalSnsResultFile,
} from "../local-store";
import { collectCardPaths, withCardUrls } from "./list-urls";
import { makeSnsPreview, snsPreviewPath } from "./thumbnail";
import { markAsAi } from "../watermark";
import { composeLayoutCard } from "../layout/card-composer";
import type { SnsProviders } from "./providers";
import type { QueuedGenerationDependencies, SubmittedGenerationRequestStore } from "./queued-flow";

const BUCKET = "library";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const FETCH_TIMEOUT_MS = 30_000;

function extensionFor(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

async function fetchedImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`이미지를 내려받지 못했습니다: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!contentType.startsWith("image/")) throw new Error(`이미지 응답이 아닙니다: ${contentType}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

async function signedUrl(path: string): Promise<string> {
  // 경로는 방금 이 회원 id 로 만들어 올린 것이다. 서명을 서버 권한으로 하는
  // 이유는 `lib/storage/signing.ts` 에 적어 두었다.
  return signPath(BUCKET, path, SIGNED_URL_TTL_SECONDS);
}

/**
 * 로컬에서 읽을 주소.
 *
 * 미리보기(`{n}.thumb.webp`)도 이 길로 온다. 파일 이름에서 번호만 떼어 내고
 * **미리보기면 `?size=thumb` 를 붙인다** — 이름을 통째로 번호로 넘기면
 * `Number("1.thumb.webp")` 가 `NaN` 이 되어 404 가 난다.
 */
export function localResultUrlForTest(storagePath: string): string {
  return localResultUrl(storagePath);
}

function localResultUrl(storagePath: string): string {
  const parts = storagePath.split("/");
  if (parts.length !== 4 || parts[1] !== "sns") throw new Error("SNS 결과 경로가 올바르지 않습니다.");
  const projectId = encodeURIComponent(parts[2]!);
  const fileName = parts[3]!;
  const thumb = fileName.includes(".thumb.");
  const cardIndex = encodeURIComponent(fileName.replace(/\.thumb\.webp$/i, "").replace(/\.[a-z0-9]+$/i, ""));
  return `/api/sns/projects/${projectId}/cards/${cardIndex}/file${thumb ? "?size=thumb" : ""}`;
}

async function localResultDataUrl(storagePath: string): Promise<string> {
  const bytes = await readLocalSnsResultFile(localStoreRoot(), storagePath);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function resultUrl(path: string): Promise<string> {
  return isLocalStoreEnabled() ? localResultUrl(path) : signedUrl(path);
}

async function uploadResult(
  userId: string, projectId: string, cardIndex: number, bytes: Buffer, contentType: string,
): Promise<{ assetPath: string; thumbPath: string | null }> {
  if (isLocalStoreEnabled()) {
    // `keepMetadata()` 가 없으면 AI 생성 표시가 여기서 지워진다. 로컬 저장으로
    // 확인할 때만 표시가 없어 보여서, 기능이 멀쩡한데도 고장으로 읽힌다.
    const png = await sharp(bytes).keepMetadata().png().toBuffer();
    const assetPath = await writeLocalSnsResultFile(localStoreRoot(), userId, projectId, cardIndex, png);
    const preview = await makeSnsPreview(png);
    if (!preview) return { assetPath, thumbPath: null };
    const thumbPath = await writeLocalSnsPreviewFile(localStoreRoot(), userId, projectId, cardIndex, preview);
    return { assetPath, thumbPath };
  }

  const path = `${userId}/sns/${projectId}/${cardIndex}.${extensionFor(contentType)}`;
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  const result = await storage.upload(path, bytes, { contentType, upsert: true });
  if (result.error) throw new Error(result.error.message);

  /**
   * 결과판에 걸 미리보기.
   *
   * 카드 열 장을 한꺼번에 깔면서 원본을 그대로 받는다 — 작업 하나를 여는 데
   * 20~40MB 가 오간다. **못 만들어도 저장을 막지 않는다.** 없으면 화면이
   * 원본으로 떨어진다.
   */
  const thumbPath = snsPreviewPath(userId, projectId, cardIndex);

  /**
   * 못 만들거나 못 올리면 **같은 자리의 옛 파일을 지운다.**
   *
   * 다시 만들기로 카드를 갱신했는데 미리보기만 실패하면 자리를 `null` 로
   * 비우는데, 그러면 이전 미리보기를 가리키는 것이 아무것도 없어진다 —
   * 지울 때도 안 지워져 영영 남는다. 없는 파일을 지우는 것은 조용히 지나가므로
   * 처음 만드는 카드에도 안전하다.
   */
  const dropStale = async () => {
    await storage.remove([thumbPath]);
    return { assetPath: path, thumbPath: null };
  };

  const preview = await makeSnsPreview(bytes);
  if (!preview) return dropStale();

  const previewResult = await storage.upload(thumbPath, preview, {
    contentType: "image/webp", upsert: true,
  });
  if (previewResult.error) {
    console.error(`[sns] 미리보기를 올리지 못했습니다: ${previewResult.error.message}`);
    return dropStale();
  }
  return { assetPath: path, thumbPath };
}

function edgeSamples(data: Buffer, width: number, height: number, channels: number) {
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const push = (x: number, y: number) => {
    const offset = (y * width + x) * channels;
    samples.push({ r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! });
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); if (height > 1) push(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { push(0, y); if (width > 1) push(width - 1, y); }
  return samples;
}

async function letterbox(bytes: Buffer, target: { width: number; height: number }) {
  const normalized = await sharp(bytes).rotate().toBuffer();
  const metadata = await sharp(normalized).metadata();
  if (!metadata.width || !metadata.height) throw new Error("원본 이미지 크기를 읽지 못했습니다.");
  const plan = letterboxPlan({ width: metadata.width, height: metadata.height }, target);
  const resized = await sharp(normalized).resize(plan.drawWidth, plan.drawHeight, { fit: "fill" }).toBuffer();
  const raw = await sharp(resized).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const fill = averageEdgeColor(edgeSamples(raw.data, raw.info.width, raw.info.height, raw.info.channels));
  return sharp({ create: { width: target.width, height: target.height, channels: 4, background: fill } })
    .composite([{ input: resized, left: plan.offsetX, top: plan.offsetY }])
    .png()
    .toBuffer();
}

/**
 * 칸별 그림을 한꺼번에 내려받는다.
 *
 * 못 받은 칸은 조용히 뺀다 — 그 자리는 회색으로 남고 카드는 나온다.
 * 한 칸을 못 받았다고 열 장을 못 만들면 안 된다.
 */
async function fetchSlotImages(
  images: string | Record<number, string>,
  cardIndex: number,
): Promise<Record<number, Buffer>> {
  if (typeof images === "string") throw new Error(`${cardIndex}번 카드에 칸별 그림이 아니라 통짜 주소가 왔습니다.`);
  const loaded: Record<number, Buffer> = {};
  for (const [slot, url] of Object.entries(images)) {
    try {
      loaded[Number(slot)] = (await fetchedImage(url)).bytes;
    } catch {
      // 그 칸만 비운다.
    }
  }
  return loaded;
}

export async function refreshProjectAssetUrls(project: SnsProjectRecord): Promise<SnsProjectRecord> {
  if (isLocalStoreEnabled()) {
    const attachments = await Promise.all(project.data.attachments.map(async (attachment) => {
      const bytes = await readLocalReferenceFile(localStoreRoot(), attachment.assetPath);
      const extension = attachment.assetPath.slice(attachment.assetPath.lastIndexOf(".")).toLowerCase();
      const contentType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : "image/png";
      return { ...attachment, url: `data:${contentType};base64,${bytes.toString("base64")}` };
    }));
    const attachmentUrl = new Map(attachments.map((attachment) => [attachment.id, attachment.url]));
    const flow = project.data.flow ? {
      ...project.data.flow,
      cards: project.data.flow.cards.map((card) => ({
        ...card,
        assetUrl: card.kind === "generated"
          ? card.assetPath ? localResultUrl(card.assetPath) : card.assetUrl
          : card.attachmentId ? attachmentUrl.get(card.attachmentId) ?? card.assetUrl : card.assetUrl,
        ...previewUrlOf(card, (path) => localResultUrl(path)),
      })),
    } : undefined;
    return { ...project, data: { ...project.data, attachments, flow } };
  }
  const paths = new Set<string>();
  /*
    **첨부는 작업 주인 폴더 것만 서명한다**(2026-09-28). 첨부 경로는 화면이 보낸
    값이라, 서버 권한으로 그대로 서명하면 경로만 알면 남의 파일이 열렸다. 만들 때도
    막지만(`project-service.ts`), 그 전에 저장된 작업이 있어도 여기서 새지 않는다.
    서명을 못 한 첨부는 빈 주소가 된다 — 화면이 보낸 옛 주소로 되돌아가면 생성할 때
    서버가 그 주소로 그림을 받으러 간다(`uploadReference`).
  */
  // 앞머리만 보면 `%2e%2e`·탭으로 빠져나간다 — 주인 폴더 검사로 본다(2026-10-03).
  const ownFolder = (path: string | null | undefined): path is string => inOwnerFolder(path, project.userId);
  project.data.attachments.forEach((attachment) => {
    if (ownFolder(attachment.assetPath)) paths.add(attachment.assetPath);
  });
  project.data.flow?.cards.forEach((card) => {
    // 카드 경로도 같다 — 「그대로 넣기」 카드는 기획 때 첨부 경로를 그대로 받는다.
    if (ownFolder(card.assetPath)) paths.add(card.assetPath);
    // **결과판이 이 함수를 지난다.** 여기서 안 모으면 카드 열 장을 원본으로
    // 받는 상태가 그대로다 — 이 변경의 목적이 바로 그것이었다.
    if (ownFolder(card.thumbPath)) paths.add(card.thumbPath);
  });
  // 서명할 것이 없어도 끝까지 간다 — 일찍 돌아가면 남의 폴더 첨부가 옛 주소를 그대로 들고 나간다.
  if (!paths.size && !project.data.attachments.length) return project;
  // 경로는 RLS 를 지나 읽어 온 작업 행에서 꺼낸 것이다.
  const urls = paths.size ? await signPaths(BUCKET, [...paths], SIGNED_URL_TTL_SECONDS) : new Map<string, string>();
  const attachments = project.data.attachments.map((attachment) => ({
    ...attachment,
    url: ownFolder(attachment.assetPath) ? urls.get(attachment.assetPath) ?? "" : "",
  }));
  const attachmentUrl = new Map(attachments.map((attachment) => [attachment.id, attachment.url]));
  const flow = project.data.flow ? {
    ...project.data.flow,
    cards: project.data.flow.cards.map((card) => ({
      ...card,
      assetUrl: card.kind === "generated"
        ? card.assetPath ? urls.get(card.assetPath) ?? card.assetUrl : card.assetUrl
        // 첨부 주소가 비면(내 폴더 밖이라 서명 못 함) 내 폴더의 카드 그림으로 보여 준다 —
        // 관리자 복사본은 카드 그림만 관리자 폴더로 옮겨져 있다(2026-09-28 독립 리뷰).
        : card.attachmentId
          ? attachmentUrl.get(card.attachmentId) || (card.assetPath ? urls.get(card.assetPath) : undefined) || card.assetUrl
          : card.assetUrl,
      ...previewUrlOf(card, (path) => urls.get(path)),
    })),
  } : undefined;
  return { ...project, data: { ...project.data, attachments, flow } };
}

/**
 * **쓸 수 없는 첨부가 있나** — 만들기 전에 본다(2026-09-28 독립 리뷰).
 *
 * `refreshProjectAssetUrls` 는 작업 주인 폴더 첨부만 서명하고 나머지는 빈 주소로
 * 둔다(관리자 복사본에 남은 회원 폴더 첨부 등). 그대로 만들면 크레딧을 예약한 뒤
 * 첨부 올리기에서 영어 원문 오류로 넘어진다. 예약 전에 막고 우리말로 알린다.
 */
export function hasUnusableAttachment(project: SnsProjectRecord): boolean {
  return project.data.attachments.some((attachment) => !attachment.url);
}

export const UNUSABLE_ATTACHMENT_MESSAGE =
  "쓸 수 없는 첨부 이미지가 있습니다. 「지난 단계로」에서 첨부를 다시 골라 주세요.";

/**
 * 목록에 나올 작업들의 그림 주소를 한 번에 만든다.
 *
 * 작업마다 `refreshProjectAssetUrls` 를 부르면 왕복이 작업 수만큼 늘어난다.
 * 경로를 통째로 모아 한 번 서명하고 다시 나눠 붙인다.
 */
export async function refreshProjectListAssetUrls(
  projects: SnsProjectRecord[],
): Promise<SnsProjectRecord[]> {
  const paths = collectCardPaths(projects);
  if (!paths.length) return projects;

  if (isLocalStoreEnabled()) {
    // 경로 모양이 어긋난 것 하나 때문에 목록 전체가 500 이 되면 안 된다.
    return withCardUrls(projects, new Map(paths.flatMap((path) => {
      try { return [[path, localResultUrl(path)] as const]; } catch { return []; }
    })));
  }

  // 경로는 RLS 를 지나 읽어 온 목록에서 꺼낸 것이다.
  return withCardUrls(projects, await signPaths(BUCKET, paths, SIGNED_URL_TTL_SECONDS));
}

/**
 * 이 카드에 붙일 미리보기 주소.
 *
 * **`generated` 카드에만 붙인다.** 사용자가 넣은 카드(`place_as_is` 등)의
 * `assetUrl` 은 letterbox 결과가 아니라 **첨부 원본**을 가리킨다. 거기에
 * letterbox 결과의 미리보기를 짝지으면 화면에 뜨는 그림과 확대·내려받기가
 * 서로 다른 그림이 된다.
 */
function previewUrlOf(
  card: { kind: string; thumbPath?: string | null },
  toUrl: (path: string) => string | undefined,
): { thumbUrl?: string } {
  if (card.kind !== "generated" || !card.thumbPath) return {};
  const url = toUrl(card.thumbPath);
  return url ? { thumbUrl: url } : {};
}

/** 틀 없는 카드는 fal 이 그린 그림 하나가 반드시 있어야 한다. */
function requireWholeImage(images: string | Record<number, string>, cardIndex: number): string {
  if (typeof images !== "string") throw new Error(`${cardIndex}번 카드의 이미지 주소가 없습니다.`);
  return images;
}

export async function replaceSnsCardRows(userId: string, projectId: string, flow: SnsFlowState) {
  if (isLocalStoreEnabled()) {
    return replaceLocalSnsCards(getLocalDatabase(), userId, projectId, flow);
  }
  const client = await createSupabaseServerClient();
  const removed = await client.from("sns_cards").delete().eq("project_id", projectId);
  if (removed.error) throw new Error(removed.error.message);
  if (!flow.cards.length) return;
  const inserted = await client.from("sns_cards").insert(flow.cards.map((card) => ({
    user_id: userId,
    project_id: projectId,
    index: card.index,
    kind: card.kind,
    role: card.role,
    copy: card.copy,
    prompt: null,
  })));
  if (inserted.error) throw new Error(inserted.error.message);
}

export async function createQueuedGenerationDependencies(input: {
  userId: string;
  project: SnsProjectRecord;
  requestStore: SubmittedGenerationRequestStore;
  providers: Pick<SnsProviders, "sceneProvider" | "reviewPrimary" | "reviewBackup" | "falQueue" | "falUploader">;
}): Promise<QueuedGenerationDependencies> {
  const local = isLocalStoreEnabled();
  const client = local ? undefined : await createSupabaseServerClient();
  const ratio = CARD_RATIOS.find((entry) => entry.id === input.project.ratio)?.pixel;
  if (!ratio) throw new Error(`지원하지 않는 비율입니다: ${input.project.ratio}`);

  async function updateCard(cardIndex: number, patch: Parameters<typeof updateLocalSnsCard>[4]) {
    if (local) {
      await updateLocalSnsCard(getLocalDatabase(), input.userId, input.project.id, cardIndex, patch);
      return;
    }
    const result = await client!.from("sns_cards").update({
      ...(patch.assetPath !== undefined ? { asset_path: patch.assetPath } : {}),
      ...(patch.thumbPath !== undefined ? { thumb_path: patch.thumbPath } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
      ...(patch.review !== undefined ? { review: patch.review } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
      ...(patch.copy !== undefined ? { copy: patch.copy } : {}),
    }).eq("project_id", input.project.id).eq("index", cardIndex);
    if (result.error) throw new Error(result.error.message);
  }

  return {
    sceneProvider: input.providers.sceneProvider,
    reviewPrimary: input.providers.reviewPrimary,
    reviewBackup: input.providers.reviewBackup,
    async uploadReference(attachment) {
      const image = await fetchedImage(attachment.url);
      return input.providers.falUploader.uploadReference(image.bytes, image.contentType);
    },
    queue: input.providers.falQueue,
    requestStore: input.requestStore,
    savePrompt: (cardIndex, prompt) => updateCard(cardIndex, { prompt }),
    saveSubmitted: (cardIndex) => updateCard(cardIndex, { status: "generating", error: null }),
    saveFailed: (cardIndex, message) => updateCard(cardIndex, { status: "failed", error: message }),
    async saveAsset(images, card) {
      // AI 가 그린 카드에만 표기한다. 사용자가 넣은 원본은 saveOriginal 로 가고
      // 거기에는 붙이지 않는다 — 남의 사진에 "AI 이미지" 라고 적으면 거짓말이다.
      const marked = card.layout
        // 레이아웃 카드는 받은 그림을 칸마다 넣고 글까지 우리가 그려 완성한다.
        // 표기는 composeLayoutCard 안에서 붙인다.
        ? (await composeLayoutCard({
            userId: input.userId,
            size: ratio,
            slots: card.layout.slots,
            copy: card.copy,
            slotImages: await fetchSlotImages(images, card.index),
          })).png
        : await markAsAi((await fetchedImage(requireWholeImage(images, card.index))).bytes);
      const saved = await uploadResult(input.userId, input.project.id, card.index, marked, "image/png");
      const { assetPath, thumbPath } = saved;
      await updateCard(card.index, { assetPath, thumbPath, status: "done", error: null });
      return {
        assetPath,
        thumbPath,
        assetUrl: await resultUrl(assetPath),
        // 검수는 원본을 본다. 미리보기로 검수하면 압축 자국을 그림의 흠으로
        // 읽게 된다.
        reviewUrl: local ? await localResultDataUrl(assetPath) : await signedUrl(assetPath),
      };
    },
    async saveReview(cardIndex, status, review, issues) {
      await updateCard(cardIndex, { status, review: { result: review, issues }, error: null });
    },
    async saveOriginal(card) {
      if (!card.assetUrl) throw new Error(`${card.index}번 사용자 원본 URL이 없습니다.`);
      const image = await fetchedImage(card.assetUrl);
      const rendered = await letterbox(image.bytes, ratio);
      const saved = await uploadResult(input.userId, input.project.id, card.index, rendered, "image/png");
      await updateCard(card.index, {
        assetPath: saved.assetPath, thumbPath: saved.thumbPath, status: "done", review: null, error: null,
      });
      return {
        assetPath: saved.assetPath,
        thumbPath: saved.thumbPath,
        assetUrl: await resultUrl(saved.assetPath),
      };
    },
  };
}
