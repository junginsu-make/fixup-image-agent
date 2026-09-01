import "server-only";

// sharp 0.35.0 ships lib/index.d.ts but omits the `types` condition from package exports.
// @ts-expect-error Runtime export is valid; upstream package metadata hides its bundled declarations.
import sharp from "sharp";
import {
  averageEdgeColor,
  letterboxPlan,
  type CardGenerationDependencies,
  type GenerationRequestStore,
} from "@fixup/sns-core";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import type { ActualGenerationDependencies } from "./actual-flow";
import type { SnsProviders } from "./providers";

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

async function uploadResult(userId: string, projectId: string, cardIndex: number, bytes: Buffer, contentType: string) {
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

export async function createActualGenerationDependencies(input: {
  userId: string;
  project: SnsProjectRecord;
  requestStore: GenerationRequestStore;
  providers: Pick<SnsProviders, "sceneProvider" | "reviewPrimary" | "reviewBackup" | "falRunner">;
}): Promise<ActualGenerationDependencies> {
  const client = await createSupabaseServerClient();
  const target = input.project.data.flow?.cards.length
    ? input.project.data.flow.cards
    : [];
  const ratio = (await import("@fixup/sns-core")).CARD_RATIOS.find((entry) => entry.id === input.project.ratio)?.pixel;
  if (!ratio) throw new Error(`지원하지 않는 비율입니다: ${input.project.ratio}`);

  const generation: CardGenerationDependencies = {
    requestStore: input.requestStore,
    runner: input.providers.falRunner,
    cardStore: {
      async markDone(cardIndex, assetPath) {
        const result = await client.from("sns_cards").update({ asset_path: assetPath, status: "done", error: null }).eq("project_id", input.project.id).eq("index", cardIndex);
        if (result.error) throw new Error(result.error.message);
      },
      async markFailed(cardIndex, message) {
        const result = await client.from("sns_cards").update({ status: "failed", error: message }).eq("project_id", input.project.id).eq("index", cardIndex);
        if (result.error) throw new Error(result.error.message);
      },
    },
    async saveAsset(imageUrl, job) {
      const image = await fetchedImage(imageUrl);
      return uploadResult(input.userId, input.project.id, job.cardIndex, image.bytes, image.contentType);
    },
    async saveOriginal() {
      throw new Error("원본 카드는 실제 흐름의 비AI 저장 경로를 사용합니다.");
    },
  };

  return {
    sceneProvider: input.providers.sceneProvider,
    reviewPrimary: input.providers.reviewPrimary,
    reviewBackup: input.providers.reviewBackup,
    generation,
    getAssetUrl: signedUrl,
    async savePrompt(cardIndex, prompt) {
      const result = await client.from("sns_cards").update({ prompt }).eq("project_id", input.project.id).eq("index", cardIndex);
      if (result.error) throw new Error(result.error.message);
    },
    async saveReview(cardIndex, status, review, issues) {
      const result = await client.from("sns_cards").update({ status, review: { result: review, issues } }).eq("project_id", input.project.id).eq("index", cardIndex);
      if (result.error) throw new Error(result.error.message);
    },
    async saveOriginal(card) {
      const original = target.find((entry) => entry.index === card.index) ?? card;
      if (!original.assetUrl) throw new Error(`${card.index}번 사용자 원본 URL이 없습니다.`);
      const image = await fetchedImage(original.assetUrl);
      const rendered = await letterbox(image.bytes, ratio);
      const assetPath = await uploadResult(input.userId, input.project.id, card.index, rendered, "image/png");
      const result = await client.from("sns_cards").update({ asset_path: assetPath, status: "done", review: null, error: null }).eq("project_id", input.project.id).eq("index", card.index);
      if (result.error) throw new Error(result.error.message);
      return { assetPath, assetUrl: await signedUrl(assetPath) };
    },
  };
}
