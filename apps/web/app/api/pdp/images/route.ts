import {
  DEFAULT_IMAGE_MODEL,
  generateSectionImage,
  pickAngleForSection,
  toPdpErrorResponse,
  mapPdpErrorCodeToStatus,
} from "@fixup/pdp-core";
import type { PdpGenerateImageRequest } from "@fixup/pdp-core";
import { loadCharacterView } from "../../../../lib/characters";
import { resolveGeminiKey } from "../../../../lib/server-keys";
import { finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { rejectIfUnverified } from "../../../../lib/evidence-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: PdpGenerateImageRequest & { characterId?: string };
  try {
    body = (await req.json()) as PdpGenerateImageRequest & { characterId?: string };
  } catch {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "요청을 해석하지 못했습니다." },
      { status: 400 },
    );
  }

  const gateResponse = rejectIfUnverified(body.section ? [body.section] : []);
  if (gateResponse) return gateResponse;

  const reservation = await reserveAiUsage(req, "pdp_image", 1);
  if (!reservation.ok) return reservation.response;
  // 실패해도 어떤 모델로 몇 장을 만들었는지 남겨야 비용이 사라지지 않는다.
  let model = DEFAULT_IMAGE_MODEL;
  try {
    model = body.options?.imageModel ?? DEFAULT_IMAGE_MODEL;

    // 배치와 같은 규칙으로 각도를 고른다. 없으면 한 장만 다시 만들었을 때
    // 그 섹션만 다른 사람이 된다.
    const characterReference = body.characterId
      ? await loadCharacterView(
          reservation.userId,
          body.characterId,
          pickAngleForSection(body.section?.layout_notes ?? ""),
        )
      : null;

    const request: PdpGenerateImageRequest = characterReference
      ? {
          ...body,
          options: { ...(body.options ?? {}), characterReference } as PdpGenerateImageRequest["options"],
        }
      : body;

    const { imageBase64, mimeType, generatedImages, qa } = await generateSectionImage(
      request,
      resolveGeminiKey(),
    );
    // 회원에게는 결과물 한 장만 차감하지만, 우리는 QA 재시도로 만든 장까지 낸다.
    const usage = await finalizeAiUsage(reservation, true, 1, undefined, {
      model,
      billableImages: generatedImages,
    });
    return Response.json({ ok: true, imageBase64, mimeType, usage, qa });
  } catch (err) {
    const envelope = toPdpErrorResponse(err);
    await finalizeAiUsage(
      reservation,
      false,
      0,
      String(envelope.code || "image_failed"),
      // 품질 미달로 버린 장도 이미 값을 치렀다. 0 이면 기록하지 않는다.
      { model, billableImages: envelope.billableImages ?? 0 },
    );
    return Response.json(envelope, { status: mapPdpErrorCodeToStatus(envelope.code) });
  }
}
