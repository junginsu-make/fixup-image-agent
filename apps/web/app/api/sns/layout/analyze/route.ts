import { freeCreditPlan } from "../../../../../lib/membership/credit-ledger";
import { z } from "zod";
import { normalizeAnalysis } from "@fixup/layout-core";
import { creditUnits, withIssueFallback } from "@fixup/shared";
import { finalizeAiUsage, reserveAiUsage, settleAiUsage } from "../../../../../lib/membership/api";
import { readLlmMeter, withLlmMeter } from "../../../../../lib/llm/meter";
import {
  LayoutAnalysisConfigurationError,
  createLayoutAnalysisProviders,
} from "../../../../../lib/layout/analyze-provider";
import { referenceImageBytes, toDataUrl } from "../../../../../lib/layout/library-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({ referenceImageId: z.string().trim().min(1).max(200) });

/**
 * 「이 레퍼런스처럼 칸을 잡아 줘」.
 *
 * 돌려주는 것은 **초안**이다. 그대로 쓰지 않는다 — 화면에서 드래그로 고친 뒤
 * 「이대로 쓰기」를 누르는 것이 이 기능의 전부다. 그래서 실패해도 오류가
 * 아니라 「직접 만드세요」라는 안내로 끝난다.
 */
export async function POST(request: Request) {
  /**
   * **부르기 전에 자리를 잡는다.**
   *
   * 이 길은 fal 을 안 부르지만 비전 모델은 부른다. 지금까지 예약도 계량도
   * 없어서, 만들기를 한 번도 안 눌러도 값이 나가고 그 사실을 아무도 몰랐다.
   *
   * `operation` 은 **새로 만들지 않고** 카드뉴스 칸(`sns_image`)에 넣는다.
   * 새 값을 쓰려면 표의 check 제약과 `reserve_generation` 안의 목록을 둘 다
   * 넓혀야 하는데, 한쪽만 넓히면 202609090001 과 똑같이 운영이 멈춘다.
   * 이 값은 실제로 카드뉴스를 만들려고 쓴 값이므로 그 칸이 제자리이기도 하다.
   *
   * 잡는 장수는 0 이다 — 얼마가 나갈지는 부르고 나서야 안다. 한도는 확정할
   * 때 실제로 쓴 값으로 깎는다(`pdp_analyze` 와 같은 방식).
   */
  const reserved = await reserveAiUsage(request, "sns_image", 0, freeCreditPlan("sns:layout-analysis"));
  if (!reserved.ok) return reserved.response;
  const reservation = { userId: reserved.userId, requestId: reserved.requestId };

  const parsed = InputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    await finalizeAiUsage(reservation, false, 0, "invalid_request");
    return Response.json({ ok: false, message: "레퍼런스를 골라 주세요." }, { status: 400 });
  }

  const image = await referenceImageBytes(reserved.userId, parsed.data.referenceImageId);
  if (!image) {
    await finalizeAiUsage(reservation, false, 0, "reference_missing");
    return Response.json({ ok: false, message: "레퍼런스 그림을 찾지 못했습니다." }, { status: 404 });
  }

  let providers: ReturnType<typeof createLayoutAnalysisProviders>;
  try {
    providers = createLayoutAnalysisProviders();
  } catch (error) {
    if (error instanceof LayoutAnalysisConfigurationError) {
      // 부른 것이 없으니 나간 값도 없다. 묶어 둔 자리를 그대로 돌려준다.
      await finalizeAiUsage(reservation, false, 0, "layout_analysis_unconfigured");
      return Response.json({ ok: false, message: error.message }, { status: error.status });
    }
    await finalizeAiUsage(reservation, false, 0, "layout_analysis_unavailable");
    throw error;
  }

  const url = toDataUrl(image);
  /**
   * **계량기 안에서 부른다.**
   *
   * 제공자는 이미 `recordFrom` 으로 토큰을 적고 있었지만, 감싸는 계량기가
   * 없으면 그 기록은 갈 곳이 없어 조용히 버려진다(`lib/llm/meter.ts`).
   * 예비까지 두 번 부르면 두 번 다 여기 쌓인다.
   */
  const result = await withLlmMeter(() => withIssueFallback(
    () => providers.primary.analyze(url),
    providers.backup ? () => providers.backup!.analyze(url) : undefined,
    {
      primaryFailure: "주 모델 칸 읽기 실패",
      backupMissing: "예비 제공자가 없어 한 번만 시도했습니다.",
      backupFailure: "OpenAI 예비로도 칸을 읽지 못했습니다",
      backupSuccess: "주 모델이 실패해 OpenAI 예비로 칸을 읽었습니다",
    },
  ));
  const meter = readLlmMeter();
  const spent = { model: "", billableImages: 0, llmUsd: meter.usd };

  if (result.value === undefined) {
    /**
     * **못 읽어도 확정한다.** 이 길은 실패를 200 으로 돌려준다 — 읽기 실패는
     * 오류가 아니라 「직접 만드세요」라는 안내이기 때문이다. 그래서 여기서
     * 확정하지 않으면 예약이 만료까지 자리를 묶고, 이미 나간 값은 장부 밖에
     * 남는다. 부른 적이 있으면 성공으로 확정한다 — 값은 실제로 나갔다.
     */
    await settleAiUsage(reservation, meter.calls > 0, creditUnits(meter.usd), "layout_analysis_empty", spent);
    return Response.json({
      ok: true,
      slots: [],
      issues: [...result.issues, "레퍼런스에서 칸을 읽어내지 못했습니다. 직접 만들어 주세요."],
    });
  }

  const analyzed = normalizeAnalysis(result.value);
  const usage = await settleAiUsage(reservation, true, creditUnits(meter.usd), undefined, spent);
  return Response.json({ ok: true, slots: analyzed.slots, issues: [...result.issues, ...analyzed.issues], usage });
}
