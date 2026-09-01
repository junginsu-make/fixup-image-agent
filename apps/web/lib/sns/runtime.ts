import "server-only";

// sharp 0.35.0 ships lib/index.d.ts but omits the `types` condition from package exports.
// @ts-expect-error Runtime export is valid; upstream package metadata hides its bundled declarations.
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
  writeLocalSnsResultFile,
} from "../local-store";
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
  const client = await createSupabaseServerClient();
  const result = await client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (result.error || !result.data?.signedUrl) throw new Error(result.error?.message ?? "결과 이미지 URL을 만들지 못했습니다.");
  return result.data.signedUrl;
}

function localResultUrl(storagePath: string): string {
  const parts = storagePath.split("/");
  if (parts.length !== 4 || parts[1] !== "sns") throw new Error("SNS 결과 경로가 올바르지 않습니다.");
  const projectId = encodeURIComponent(parts[2]!);
  const cardIndex = encodeURIComponent(parts[3]!.replace(/\.png$/i, ""));
  return `/api/sns/projects/${projectId}/cards/${cardIndex}/file`;
}

async function localResultDataUrl(storagePath: string): Promise<string> {
  const bytes = await readLocalSnsResultFile(localStoreRoot(), storagePath);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function resultUrl(path: string): Promise<string> {
  return isLocalStoreEnabled() ? localResultUrl(path) : signedUrl(path);
}

async function uploadResult(userId: string, projectId: string, cardIndex: number, bytes: Buffer, contentType: string) {
  if (isLocalStoreEnabled()) {
    const png = await sharp(bytes).png().toBuffer();
    return writeLocalSnsResultFile(localStoreRoot(), userId, projectId, cardIndex, png);
  }
  const path = `${userId}/sns/${projectId}/${cardIndex}.${extensionFor(contentType)}`;
  const result = await createSupabaseAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (result.error) throw new Error(result.error.message);
  return path;
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
      })),
    } : undefined;
    return { ...project, data: { ...project.data, attachments, flow } };
  }
  const paths = new Set<string>();
  project.data.attachments.forEach((attachment) => paths.add(attachment.assetPath));
  project.data.flow?.cards.forEach((card) => { if (card.assetPath) paths.add(card.assetPath); });
  if (!paths.size) return project;
  const client = await createSupabaseServerClient();
  const result = await client.storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
  if (result.error) throw new Error(result.error.message);
  const urls = new Map((result.data ?? []).flatMap((entry) => entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []));
  const attachments = project.data.attachments.map((attachment) => ({ ...attachment, url: urls.get(attachment.assetPath) ?? attachment.url }));
  const attachmentUrl = new Map(attachments.map((attachment) => [attachment.id, attachment.url]));
  const flow = project.data.flow ? {
    ...project.data.flow,
    cards: project.data.flow.cards.map((card) => ({
      ...card,
      assetUrl: card.kind === "generated"
        ? card.assetPath ? urls.get(card.assetPath) ?? card.assetUrl : card.assetUrl
        : card.attachmentId ? attachmentUrl.get(card.attachmentId) ?? card.assetUrl : card.assetUrl,
    })),
  } : undefined;
  return { ...project, data: { ...project.data, attachments, flow } };
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
  providers: Pick<SnsProviders, "sceneProvider" | "reviewPrimary" | "reviewBackup" | "falQueue">;
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
    uploadReference: (attachment) => input.providers.falQueue.uploadReference(attachment),
    queue: input.providers.falQueue,
    requestStore: input.requestStore,
    savePrompt: (cardIndex, prompt) => updateCard(cardIndex, { prompt }),
    saveSubmitted: (cardIndex) => updateCard(cardIndex, { status: "generating", error: null }),
    saveFailed: (cardIndex, message) => updateCard(cardIndex, { status: "failed", error: message }),
    async saveAsset(imageUrl, card) {
      const image = await fetchedImage(imageUrl);
      const assetPath = await uploadResult(input.userId, input.project.id, card.index, image.bytes, image.contentType);
      await updateCard(card.index, { assetPath, status: "done", error: null });
      return {
        assetPath,
        assetUrl: await resultUrl(assetPath),
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
      const assetPath = await uploadResult(input.userId, input.project.id, card.index, rendered, "image/png");
      await updateCard(card.index, { assetPath, status: "done", review: null, error: null });
      return { assetPath, assetUrl: await resultUrl(assetPath) };
    },
  };
}
