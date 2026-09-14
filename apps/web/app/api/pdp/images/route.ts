import {
  DEFAULT_IMAGE_MODEL,
  generateSectionImage,
  pickAngleForSection,
  toPdpErrorResponse,
  mapPdpErrorCodeToStatus,
  buildSectionImageOptions,
  pageInputsFromWire,
} from "@fixup/pdp-core";
import type {
  AspectRatio,
  ImageGenOptionsInput,
  PageImageWire,
  SectionBlueprint,
} from "@fixup/pdp-core";

/**
 * 섹션 한 장을 만든다. 처음 만들 때도, 다시 만들 때도 여기로 온다.
 *
 * **몸통이 일괄 라우트와 같은 모양이다.** 페이지가 정하는 것은 `page`, 섹션이
 * 정하는 것은 `options` 다. 전에는 화면이 옵션을 다 지어서 보냈고, 일괄 쪽은
 * 라우트가 따로 지었다 — 그래서 인물 사진이 한쪽에만 실렸다.
 */
export type PdpImagesRequestBody = {
  originalImageBase64: string;
  section: SectionBlueprint;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  /** 이 섹션이 페이지에서 몇 번째인지. 인물 사진을 「첫 섹션에만」 쓸 때 쓴다. */
  sectionIndex?: number;
  characterId?: string;
  /** 페이지 전체가 공유하는 값. 일괄 라우트와 같은 모양이다. */
  page?: PageImageWire;
  /** 사용자가 이 섹션에 대해 고른 값. 빠진 칸은 조립기가 채운다. */
  options?: ImageGenOptionsInput;
  emphasisWords?: string[];
};
import { loadCharacterView } from "../../../../lib/characters";
import { createPdpProviders } from "../../../../lib/pdp/providers";
import { withSlicedStyleReference } from "../../../../lib/pdp/slice-image";
import { imageCreditUnits } from "../../../../lib/credit-cost";
import { finalizeAiUsage, reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { rejectIfUnverified } from "../../../../lib/evidence-gate";
import { teamIdOf } from "../../../../lib/teams/store";
import { durablePdpSections } from "../../../../lib/pdp/image-operation";
import { isDurableGenerationEnabled as durableGenerationEnabled } from "../../../../lib/generation/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (durableGenerationEnabled()) return durablePdpSections(req, "single");
  let body: PdpImagesRequestBody;
  try {
    body = (await req.json()) as PdpImagesRequestBody;
  } catch {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "요청을 해석하지 못했습니다." },
      { status: 400 },
    );
  }

  const gateResponse = rejectIfUnverified(body.section ? [body.section] : []);
  if (gateResponse) return gateResponse;

  // 장은 실제 단가에서 뽑는다. 전에는 여기만 무조건 1 이었고 일괄 쪽만 제대로
  // 셌다 — 같은 그림 한 장이 어느 버튼으로 들어왔느냐에 따라 값이 달랐다.
  const model = body.page?.imageModel ?? body.options?.imageModel ?? DEFAULT_IMAGE_MODEL;
  const reservation = await reserveAiUsage(req, "pdp_image", imageCreditUnits(model, 1));
  if (!reservation.ok) return reservation.response;

  try {
    // 일괄과 같은 규칙으로 각도를 고른다. 없으면 한 장만 다시 만들었을 때
    // 그 섹션만 다른 사람이 된다.
    const characterReference = body.characterId
      ? await loadCharacterView(
          reservation.userId,
          body.characterId,
          pickAngleForSection(body.section?.layout_notes ?? ""),
          // 팀원이 만든 캐릭터도 쓴다. 목록에 보이는데 못 쓰는 것이 없게.
          await teamIdOf(reservation.userId),
        )
      : null;

    // 긴 레퍼런스를 조각으로 나눈다. 일괄 라우트와 같아야 한다 — 한쪽만
    // 조각을 보내면 한 장만 다시 만들었을 때 디자인이 달라진다.
    const page = await withSlicedStyleReference({ ...body.page, imageModel: model });

    const options = buildSectionImageOptions(
      pageInputsFromWire(page),
      {
        section: body.section,
        index: body.sectionIndex ?? 0,
        options: body.options,
        emphasisWords: body.emphasisWords ?? body.options?.emphasisWords,
        characterReference: characterReference ?? undefined,
      },
    );

    const { imageBase64, mimeType, generatedImages, qa } = await generateSectionImage(
      {
        originalImageBase64: body.originalImageBase64,
        section: body.section,
        aspectRatio: body.aspectRatio,
        desiredTone: body.desiredTone,
        options,
      },
      createPdpProviders(),
    );
    // 회원에게는 나온 한 장만 셈하지만, 우리는 QA 재시도로 만든 장까지 낸다.
    // 장부가 안 닫혀도 그림은 돌려준다. 여기서 던지면 아래 catch 가 이미 만든
    // 그림을 「생성 실패」로 바꾼다 — 돈은 나갔고 사용자는 결과를 못 본다.
    const usage = await settleAiUsage(reservation, true, imageCreditUnits(model, 1), undefined, {
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
