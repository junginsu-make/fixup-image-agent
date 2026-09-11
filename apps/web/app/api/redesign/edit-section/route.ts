import { editSection, humanizeEditError, RedesignError, type EditSectionInput } from "@fixup/redesign-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { imageCreditUnits } from "../../../../lib/credit-cost";
import { finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { durableRedesignEdit } from "../../../../lib/redesign/edit-operation";
import { isDurableGenerationEnabled as durableGenerationEnabled } from "../../../../lib/generation/run-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (durableGenerationEnabled()) return durableRedesignEdit(req);
  /**
   * **몸을 먼저 읽는다.** 어느 제공자로 고칠지에 따라 값이 다르다
   * ($0.19 vs $0.13). 전에는 무엇이든 1장이었다.
   */
  const body = (await req.json()) as EditSectionInput;
  const provider = String((body as { model?: string }).model || "openai") === "google"
    ? "redesign-google"
    : "redesign-openai";
  const reservation = await reserveAiUsage(req, "redesign_edit", imageCreditUnits(provider, 1));
  if (!reservation.ok) return reservation.response;
  try {
    const result = await editSection({ ...body, openaiKey: resolveOpenaiKey(), googleKey: resolveGoogleKey() });
    const provider =
      String((body as { model?: string }).model || "openai") === "google"
        ? "redesign-google"
        : "redesign-openai";
    const usage = await finalizeAiUsage(reservation, true, 1, undefined, {
      model: provider,
      billableImages: 1,
    });
    return Response.json({ ...result, usage });
  } catch (err) {
    await finalizeAiUsage(reservation, false, 0, err instanceof RedesignError ? `edit_${err.status}` : "edit_failed");
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeEditError(err.message) : "섹션 수정 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
