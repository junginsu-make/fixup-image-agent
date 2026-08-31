import { generateSections, humanizeProviderError, RedesignError, type GenerateInputFile } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  let reservation: Awaited<ReturnType<typeof reserveAiUsage>> | undefined;
  try {
    const form = await req.formData();
    const parsedCount = Number(form.get("count") || 1);
    const requestedCount = Number.isFinite(parsedCount) ? Math.max(1, Math.min(10, Math.trunc(parsedCount))) : 1;
    reservation = await reserveAiUsage(req, "redesign_generate", requestedCount);
    if (!reservation.ok) return reservation.response;
    const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
    const files: GenerateInputFile[] = await Promise.all(fileEntries.map(async (f) => ({ name: f.name, type: f.type, buffer: Buffer.from(await f.arrayBuffer()) })));
    const result = await generateSections({
      files,
      request: String(form.get("request") || ""),
      rolloutRequest: String(form.get("rolloutRequest") || ""),
      knowledgeText: String(form.get("knowledgeText") || ""),
      transcript: String(form.get("transcript") || ""),
      useKnowledge: String(form.get("useKnowledge") || "") === "true",
      knowledgeAccessAuthorized: true,
      model: String(form.get("model") || "openai"),
      channel: String(form.get("channel") || "스마트스토어"),
      ratio: String(form.get("ratio") || "9:16"),
      count: requestedCount,
      startSection: Number(form.get("startSection") || 1),
      openaiKey: resolveOpenaiKey(),
      googleKey: resolveGoogleKey(),
    });
    const consumed = Math.min(requestedCount, result.project.sections.length);
    // 어느 제공자로 만들었는지 남긴다. 안 남기면 나중에 비용으로 환산할 수 없다.
    const provider = String(form.get("model") || "openai") === "google" ? "redesign-google" : "redesign-openai";
    const usage = await finalizeAiUsage(
      reservation,
      consumed > 0,
      consumed,
      consumed > 0 ? undefined : "no_image_generated",
      { model: provider, billableImages: consumed },
    );
    return Response.json({ ...result, usage });
  } catch (err) {
    if (reservation?.ok) await finalizeAiUsage(reservation, false, 0, err instanceof RedesignError ? `redesign_${err.status}` : "redesign_failed");
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "이미지 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
