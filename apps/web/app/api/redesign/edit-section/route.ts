import { editSection, humanizeEditError, RedesignError, type EditSectionInput } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { createRedesignImageGenerator, redesignFalModelFor } from "../../../../lib/redesign/image-generator";
import { imageCreditUnits } from "../../../../lib/credit-cost";
import { settleAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { readPdpRequest } from "../../../../lib/pdp/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  /**
   * **몸을 먼저 읽는다.** 어느 제공자로 고칠지에 따라 값이 다르다
   * ($0.19 vs $0.13). 전에는 무엇이든 1장이었다.
   */
  const parsed = await readPdpRequest<EditSectionInput>(req, "redesignEdit");
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const provider = String((body as { model?: string }).model || "openai") === "google"
    ? "redesign-google"
    : "redesign-openai";
  // **예약과 차감이 같은 값에서 나온다.** 전에는 예약만 단가에서 뽑고 차감은
  // 손으로 적은 1 이었다 — 사용량은 1장 줄고 장부에는 4장이 남았다.
  // 고친 그림도 새로 만든 그림과 같은 모델로 그린다. 한 페이지 안에서 섹션마다
  // 다른 모델이 그리면 이어 붙였을 때 결이 갈린다.
  const falModel = redesignFalModelFor(String((body as { model?: string }).model || "openai"));
  let generateImage;
  try {
    generateImage = createRedesignImageGenerator(process.env, falModel);
  } catch {
    generateImage = undefined;
  }
  const billedModel = generateImage ? falModel : provider;
  const units = imageCreditUnits(billedModel, 1);
  const reservation = await reserveAiUsage(req, "redesign_edit", units);
  if (!reservation.ok) return reservation.response;
  try {
    /*
      새로 만들 때와 같은 길(fal)로 고친다. 키가 없을 때만 지금까지의 직접
      호출로 떨어진다 — 그 길 하나 때문에 수정이 통째로 멎으면 안 된다.
    */
    const result = await editSection({
      ...body,
      openaiKey: resolveOpenaiKey(),
      googleKey: resolveGoogleKey(),
      generateImage,
    });
    const usage = await settleAiUsage(reservation, true, units, undefined, {
      model: billedModel,
      billableImages: 1,
    });
    return Response.json({ ...result, usage });
  } catch (err) {
    await settleAiUsage(reservation, false, 0, err instanceof RedesignError ? `edit_${err.status}` : "edit_failed");
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeEditError(err.message) : "섹션 수정 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
