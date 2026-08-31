import {
  creditUnitsFor,
  pickAngleForSection,
  generateSectionImage,
  maxBatchSizeFor,
  toPdpErrorResponse,
  DEFAULT_IMAGE_MODEL,
} from "@fixup/pdp-core";
import type { AspectRatio, ImageModelId, PdpOutputMode, SectionBlueprint } from "@fixup/pdp-core";
import { resolveGeminiKey } from "../../../../../lib/server-keys";
import { loadCharacterView } from "../../../../../lib/characters";
import { finalizeAiUsage, reserveAiUsage } from "../../../../../lib/membership/api";
import { rejectIfUnverified } from "../../../../../lib/evidence-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 서버리스 함수 상한. 이보다 크게 두면 배포 자체가 거부된다.
// 한 묶음이 이 안에 들어오도록 모델별 maxBatchSize 로 장수를 제한한다.
export const maxDuration = 300;

type BatchRequest = {
  originalImageBase64: string;
  sections: SectionBlueprint[];
  aspectRatio: AspectRatio;
  desiredTone?: string;
  outputMode?: PdpOutputMode;
  imageModel?: ImageModelId;
  emphasisWordsBySection?: Record<string, string[]>;
  styleReference?: { imageBase64: string; mimeType: string; description?: string };
  preserveProduct?: boolean;
  characterId?: string;
};

export async function POST(req: Request) {
  let body: BatchRequest;
  try {
    body = (await req.json()) as BatchRequest;
  } catch {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "요청을 해석하지 못했습니다." },
      { status: 400 },
    );
  }

  const model = body.imageModel ?? DEFAULT_IMAGE_MODEL;

  // 클라이언트가 이미 나눠 보내지만, 여기서도 자른다. 넘겨받은 장수를 그대로
  // 믿으면 함수가 300초에 걸려 죽고, 예약한 크레딧이 finalize 되지 못한다.
  const sections = (body.sections ?? []).slice(0, maxBatchSizeFor(model));
  if (sections.length === 0) {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "생성할 섹션이 없습니다." },
      { status: 400 },
    );
  }

  const gateResponse = rejectIfUnverified(sections);
  if (gateResponse) return gateResponse;

  // 섹션마다 따로 예약하면 concurrent_limit(1건)에 막힌다.
  // 배치 전체를 한 번에 예약해 예약 건수를 1로 유지한다.
  const reservation = await reserveAiUsage(req, "pdp_image", creditUnitsFor(model, sections.length));
  if (!reservation.ok) return reservation.response;

  const apiKey = resolveGeminiKey();

  // 캐릭터가 있으면 섹션마다 어울리는 각도를 하나씩 고른다. 3종을 다 보내면
  // 참조가 늘어 서로를 희석시킨다 — 앵커와 스타일만으로도 절충이 일어난다.
  const characterByAngle = new Map<string, Awaited<ReturnType<typeof loadCharacterView>>>();
  if (body.characterId) {
    for (const angle of new Set(sections.map((s) => pickAngleForSection(s.layout_notes ?? "")))) {
      characterByAngle.set(angle, await loadCharacterView(reservation.userId, body.characterId, angle));
    }
  }

  const settled = await Promise.allSettled(
    sections.map((section) =>
      generateSectionImage(
        {
          originalImageBase64: body.originalImageBase64,
          section,
          aspectRatio: body.aspectRatio,
          desiredTone: body.desiredTone,
          options: {
            style: "lifestyle",
            withModel: false,
            outputMode: body.outputMode ?? "full-image",
            imageModel: model,
            headline: section.headline,
            subheadline: section.subheadline,
            emphasisWords: body.emphasisWordsBySection?.[section.section_id],
            // 페이지당 한 장. 모든 섹션이 같은 것을 써야 통일이 유지된다.
            styleReferenceImages: body.styleReference
              ? [
                  {
                    base64: body.styleReference.imageBase64,
                    mimeType: body.styleReference.mimeType,
                    description: body.styleReference.description,
                  },
                ]
              : undefined,
            preserveProductImage: body.preserveProduct ?? true,
            characterReference:
              characterByAngle.get(pickAngleForSection(section.layout_notes ?? "")) ?? undefined,
          },
        },
        apiKey,
      ),
    ),
  );

  const results = settled.map((outcome, index) => {
    const section = sections[index];
    if (outcome.status === "fulfilled") {
      return {
        sectionId: section.section_id,
        ok: true as const,
        imageBase64: outcome.value.imageBase64,
        mimeType: outcome.value.mimeType,
        generatedImages: outcome.value.generatedImages,
        qa: outcome.value.qa,
      };
    }
    const envelope = toPdpErrorResponse(outcome.reason);
    return {
      sectionId: section.section_id,
      ok: false as const,
      code: envelope.code,
      message: envelope.message,
      // 실패한 섹션도 QA 재시도로 이미 만든 장이 있을 수 있다.
      generatedImages: envelope.billableImages ?? 0,
    };
  });

  // 실패한 장은 차감하지 않는다. finalizeAiUsage 가 consumedUnits 를 인자로 받아
  // 부분 성공이 그대로 처리된다.
  const succeeded = results.filter((r) => r.ok).length;
  // 우리가 낸 돈은 성공 건수가 아니라 fal 이 만든 장수다. 재시도한 섹션과
  // 품질 미달로 버린 섹션까지 합쳐야 실제 청구액에 가까워진다.
  const billableImages = results.reduce((sum, r) => sum + r.generatedImages, 0);
  const usage = await finalizeAiUsage(
    reservation,
    succeeded > 0,
    creditUnitsFor(model, succeeded),
    succeeded > 0 ? undefined : "batch_all_failed",
    { model, billableImages },
  );

  return Response.json({
    ok: true,
    model,
    requested: sections.length,
    succeeded,
    results,
    usage,
  });
}
