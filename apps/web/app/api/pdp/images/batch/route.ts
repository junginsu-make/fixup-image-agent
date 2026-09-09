import {
  pickAngleForSection,
  generateSectionImage,
  maxBatchSizeFor,
  toPdpErrorResponse,
  buildSectionImageOptions,
  pageInputsFromWire,
  DEFAULT_IMAGE_MODEL,
} from "@fixup/pdp-core";
import type {
  AspectRatio,
  ImageGenOptionsInput,
  PageImageWire,
  SectionBlueprint,
} from "@fixup/pdp-core";
import { resolveGeminiKey } from "../../../../../lib/server-keys";
import { loadCharacterView } from "../../../../../lib/characters";
import { finalizeAiUsage, reserveAiUsage } from "../../../../../lib/membership/api";
import { imageCreditUnits } from "../../../../../lib/credit-cost";
import { rejectIfUnverified } from "../../../../../lib/evidence-gate";
import { teamIdOf } from "../../../../../lib/teams/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 서버리스 함수 상한. 이보다 크게 두면 배포 자체가 거부된다.
// 한 묶음이 이 안에 들어오도록 모델별 maxBatchSize 로 장수를 제한한다.
export const maxDuration = 300;

type BatchRequest = {
  originalImageBase64: string;
  sections: SectionBlueprint[];
  /**
   * 각 섹션이 **페이지에서** 몇 번째인지. 묶음 안 순서가 아니다.
   *
   * 인물 사진을 「첫 섹션에만」 쓸 때 이 값이 있어야 판단할 수 있다. 없으면
   * 묶음 안 순서로 떨어지는데, 두 번째 묶음에서는 그것이 히어로가 아니다.
   */
  sectionIndexes?: number[];
  aspectRatio: AspectRatio;
  desiredTone?: string;
  characterId?: string;
  /** 페이지 전체가 공유하는 값. **단건 라우트와 같은 모양이다.** */
  page?: PageImageWire;
  /** 사용자가 섹션마다 고른 값. 열쇠는 `section_id`. */
  optionsBySection?: Record<string, ImageGenOptionsInput>;
  emphasisWordsBySection?: Record<string, string[]>;
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

  const model = body.page?.imageModel ?? DEFAULT_IMAGE_MODEL;

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
  /**
   * **장을 실제 단가에서 뽑는다**(2026-09-08 사용자 결정).
   *
   * 전에는 모델마다 손으로 매긴 정수 가중치였다. 같은 「1장」이 $0.039~$0.060 로
   * 갈려 싼 모델을 쓰는 사람이 손해를 봤고, 크기 차이는 담을 자리조차 없었다.
   */
  const reservation = await reserveAiUsage(req, "pdp_image", imageCreditUnits(model, sections.length));
  if (!reservation.ok) return reservation.response;

  const apiKey = resolveGeminiKey();

  // 캐릭터가 있으면 섹션마다 어울리는 각도를 하나씩 고른다. 3종을 다 보내면
  // 참조가 늘어 서로를 희석시킨다 — 앵커와 스타일만으로도 절충이 일어난다.
  const characterByAngle = new Map<string, Awaited<ReturnType<typeof loadCharacterView>>>();
  if (body.characterId) {
    // 팀은 한 번만 묻는다. 각도마다 물으면 같은 질문이 세 번 간다.
    const teamId = await teamIdOf(reservation.userId);
    for (const angle of new Set(sections.map((s) => pickAngleForSection(s.layout_notes ?? "")))) {
      characterByAngle.set(
        angle,
        await loadCharacterView(reservation.userId, body.characterId, angle, teamId),
      );
    }
  }

  // **조립은 한 곳에서만 한다.** 전에는 여기서 손으로 지었고, 그래서 인물 사진을
  // 받는 자리조차 없었다. 단건 라우트와 같은 함수를 쓴다.
  const page = pageInputsFromWire({ ...body.page, imageModel: model });

  const settled = await Promise.allSettled(
    sections.map((section, position) => {
      const options = buildSectionImageOptions(page, {
        section,
        index: body.sectionIndexes?.[position] ?? position,
        options: body.optionsBySection?.[section.section_id],
        emphasisWords: body.emphasisWordsBySection?.[section.section_id],
        characterReference:
          characterByAngle.get(pickAngleForSection(section.layout_notes ?? "")) ?? undefined,
      });

      return generateSectionImage(
        {
          originalImageBase64: body.originalImageBase64,
          section,
          aspectRatio: body.aspectRatio,
          desiredTone: body.desiredTone,
          options,
        },
        apiKey,
      );
    }),
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
    imageCreditUnits(model, succeeded),
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
