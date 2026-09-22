import { pdpCreditSize } from "../../../../lib/membership/image-sizes";
import { creditImagePlan, markCreditStarted } from "../../../../lib/membership/credit-ledger";
import {
  DEFAULT_IMAGE_MODEL,
  generateSectionImage,
  resolveCharacterAngles,
  type CharacterImageReference,
  PdpServiceError,
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
type PdpImagesRequestBody = {
  originalImageBase64: string;
  section: SectionBlueprint;
  aspectRatio: AspectRatio;
  desiredTone?: string;
  /** 이 섹션이 페이지에서 몇 번째인지. 인물 사진을 「첫 섹션에만」 쓸 때 쓴다. */
  sectionIndex?: number;
  characterId?: string;
  /**
   * 사람이 고른 각도. 비어 있으면 섹션 설명대로 자동으로 한 장 고른다.
   *
   * 화면에서 고른 것을 그대로 싣는다 — 어느 각도가 맞는지 우리가 대신 판단하지
   * 않는다(`resolveCharacterAngles` 머리말).
   */
  characterAngles?: string[];
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
import { reserveAiUsage, settleAiUsage } from "../../../../lib/membership/api";
import { rejectIfUnverified } from "../../../../lib/evidence-gate";
import { teamIdOf } from "../../../../lib/teams/store";
import { readPdpRequest } from "../../../../lib/pdp/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const parsed = await readPdpRequest<PdpImagesRequestBody>(req, "single");
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const gateResponse = rejectIfUnverified(body.section ? [body.section] : []);
  if (gateResponse) return gateResponse;

  // 장은 실제 단가에서 뽑는다. 전에는 여기만 무조건 1 이었고 일괄 쪽만 제대로
  // 셌다 — 같은 그림 한 장이 어느 버튼으로 들어왔느냐에 따라 값이 달랐다.
  /*
    **모델은 페이지가 정한다.** 전에는 여기만 `options.imageModel` 도 봤는데,
    조립기(`buildSectionImageOptions`)는 어차피 `page.imageModel` 로 덮어쓴다 —
    그래서 섹션 옵션에 다른 모델을 실으면 **값은 그 모델로 매기고 그림은 페이지
    모델로 그렸다.** 배치 라우트는 처음부터 페이지만 봤다(2026-09-17 리뷰 D-9).

    크레딧 견적도 같은 모델을 봐야 한다 — 여기가 갈리면 예약과 그림이 또 어긋난다.
  */
  const model = body.page?.imageModel ?? DEFAULT_IMAGE_MODEL;
  const reservation = await reserveAiUsage(req, "pdp_image", imageCreditUnits(model, 1), creditImagePlan(1, pdpCreditSize(model, body.aspectRatio), "pdp:image"));
  if (!reservation.ok) return reservation.response;

  try {
    /*
     * 일괄과 같은 규칙으로 각도를 고른다. 없으면 한 장만 다시 만들었을 때
     * 그 섹션만 다른 사람이 된다.
     *
     * 사람이 고른 각도가 있으면 그것이 이긴다(`resolveCharacterAngles`). 안 고르면
     * 지금까지대로 섹션 설명대로 한 장이다.
     */
    const characterReferences: CharacterImageReference[] = [];
    if (body.characterId) {
      // 팀원이 만든 캐릭터도 쓴다. 목록에 보이는데 못 쓰는 것이 없게.
      const teamId = await teamIdOf(reservation.userId);
      for (const angle of resolveCharacterAngles(
        body.characterAngles ?? [],
        body.section?.layout_notes ?? "",
      )) {
        const view = await loadCharacterView(reservation.userId, body.characterId, angle, teamId);
        if (view) characterReferences.push(view);
      }
    }

    /*
      **못 불러온 캐릭터로 조용히 만들지 않는다**(A-14, 설계 §6.2).

      전에는 한 장도 못 불러오면 `undefined` 를 넘겨 **그 캐릭터 없이** 그림을
      만들고 값을 받았다. 사용자는 캐릭터를 골라 뒀으니 나올 줄 알고, 나온
      그림에는 다른 사람이 있다.

      화면도 같은 것을 알린다(`CharacterPicker` 의 「고른 캐릭터를 불러오지
      못했습니다」). 여기서 막는 것은 그 화면을 못 본 채 들어온 요청이다.
    */
    if (body.characterId && characterReferences.length === 0) {
      throw new PdpServiceError(
        "INVALID_REQUEST",
        "고른 캐릭터를 불러오지 못했습니다. 캐릭터를 다시 고르거나 빼고 만들어 주세요.",
        `character ${body.characterId} has no usable view`,
      );
    }

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
        characterReferences: characterReferences.length ? characterReferences : undefined,
      },
    );

    await markCreditStarted(reservation);
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
      billableImages: generatedImages, deliveredImages: 1, completionConfirmed: true,
    });
    return Response.json({ ok: true, imageBase64, mimeType, usage, qa });
  } catch (err) {
    const envelope = toPdpErrorResponse(err);
    await settleAiUsage(
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
