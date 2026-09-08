import { generateSections, humanizeProviderError, RedesignError, type GenerateInputFile } from "@fixup/redesign-core";
import { buildSceneWithCharacterDirective, pickAngleForSection } from "@fixup/pdp-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { imageCreditUnits } from "../../../../lib/credit-cost";
import { loadCharacterView } from "../../../../lib/characters";
import { teamIdOf } from "../../../../lib/teams/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  let reservation: Awaited<ReturnType<typeof reserveAiUsage>> | undefined;
  try {
    const form = await req.formData();
    const parsedCount = Number(form.get("count") || 1);
    const requestedCount = Number.isFinite(parsedCount) ? Math.max(1, Math.min(10, Math.trunc(parsedCount))) : 1;
    /**
     * **장을 실제 단가에서 뽑는다**(2026-09-08 사용자 결정).
     *
     * 전에는 「요청한 장수」가 곧 장수였다 — $0.19 짜리 OpenAI 한 장이 1장이라
     * **4배 덜 받고 있었다.** Google($0.13)은 3배였다.
     */
    const provider = String(form.get("model") || "openai") === "google" ? "redesign-google" : "redesign-openai";
    reservation = await reserveAiUsage(req, "redesign_generate", imageCreditUnits(provider, requestedCount));
    if (!reservation.ok) return reservation.response;
    const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
    const files: GenerateInputFile[] = await Promise.all(fileEntries.map(async (f) => ({ name: f.name, type: f.type, buffer: Buffer.from(await f.arrayBuffer()) })));

    /*
     * 등장인물을 고르면 섹션마다 같은 사람이 나온다.
     *
     * 안 고르면 지금까지대로 돈다 — 이 블록 전체가 undefined 로 떨어진다.
     * 여러 각도를 함께 보내지 않는다. 참조가 늘면 모델이 절충해 제3의 인물을
     * 만든다(2026-07-30 실측). 상세페이지 섹션은 사용 장면이 많으므로
     * 좌측 45도를 고른다 — 두 눈이 보여 얼굴이 남는다.
     */
    const characterId = String(form.get("characterId") || "");
    let character: NonNullable<Parameters<typeof generateSections>[0]["character"]> | undefined;
    if (characterId) {
      const auth = await authenticateApiMember();
      if (!auth.ok) return auth.response;
      const view = await loadCharacterView(
        auth.member.userId,
        characterId,
        pickAngleForSection(""),
        await teamIdOf(auth.member.userId),
      );
      if (view) {
        character = {
          name: "character.png",
          mimeType: view.mimeType,
          buffer: Buffer.from(view.base64, "base64"),
          directive: buildSceneWithCharacterDirective({
            identityPrompt: view.identityPrompt,
            // 원본 상세페이지가 늘 함께 간다. 그것이 색·구성을 정한다.
            hasStyleReference: files.length > 0,
          }),
        };
      }
    }

    const result = await generateSections({
      files,
      character,
      request: String(form.get("request") || ""),
      rolloutRequest: String(form.get("rolloutRequest") || ""),
      knowledgeText: String(form.get("knowledgeText") || ""),
      transcript: String(form.get("transcript") || ""),
      useKnowledge: String(form.get("useKnowledge") || "") === "true",
      knowledgeAccessAuthorized: true,
      model: String(form.get("model") || "openai"),
      channel: String(form.get("channel") || "스마트스토어"),
      ratio: String(form.get("ratio") || "9:16"),
      // 아는 값인지는 generateSections 가 확인한다. 모르면 원본을 따라가는 auto.
      look: String(form.get("look") || "auto"),
      count: requestedCount,
      startSection: Number(form.get("startSection") || 1),
      openaiKey: resolveOpenaiKey(),
      googleKey: resolveGoogleKey(),
    });
    const consumed = Math.min(requestedCount, result.project.sections.length);
    const usage = await finalizeAiUsage(
      reservation,
      consumed > 0,
      // 만든 만큼만 받는다. 단가는 위에서 정한 제공자를 그대로 쓴다.
      imageCreditUnits(provider, consumed),
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
