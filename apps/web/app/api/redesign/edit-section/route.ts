import { creditImagePlan, markCreditStarted } from "../../../../lib/membership/credit-ledger";
import { editSection, humanizeEditError, RedesignError, type EditSectionInput } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { imageCreditUnits } from "../../../../lib/credit-cost";
import { finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  /**
   * **몸을 먼저 읽는다.** 어느 제공자로 고칠지에 따라 값이 다르다
   * ($0.19 vs $0.13). 전에는 무엇이든 1장이었다.
   */
  const body = (await req.json()) as EditSectionInput;
  const provider = String((body as { model?: string }).model || "openai") === "google"
    ? "redesign-google"
    : "redesign-openai";
  const reservation = await reserveAiUsage(req, "redesign_edit", imageCreditUnits(provider, 1), creditImagePlan(1, { width: 1152, height: 2048 }, "redesign:edit"));
  if (!reservation.ok) return reservation.response;
  try {
    await markCreditStarted(reservation);
    const result = await editSection({ ...body, openaiKey: resolveOpenaiKey(), googleKey: resolveGoogleKey() });
    const provider =
      String((body as { model?: string }).model || "openai") === "google"
        ? "redesign-google"
        : "redesign-openai";
    /*
      **장수가 아니라 환산한 값이다.** 예약은 `imageCreditUnits(provider, 1)`
      로 잡는데(리디자인 OpenAI 는 4) 확정은 언제나 `1` 이었다 — 성공해도 4분의
      1만 깎였다(2026-09-22 발견). 형제 라우트 `redesign/generate` 는 처음부터
      같은 함수로 다시 환산하고 있었다.
    */
    const usage = await finalizeAiUsage(reservation, true, imageCreditUnits(provider, 1), undefined, {
      model: provider,
      billableImages: 1, deliveredImages: 1, completionConfirmed: true,
    });
    return Response.json({ ...result, usage });
  } catch (err) {
    await finalizeAiUsage(reservation, false, 0, err instanceof RedesignError ? `edit_${err.status}` : "edit_failed");
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeEditError(err.message) : "섹션 수정 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
