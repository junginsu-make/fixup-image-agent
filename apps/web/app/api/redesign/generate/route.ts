import { generateSections, humanizeProviderError, RedesignError, type GenerateInputFile } from "@fixup/redesign-core";
import { buildSceneWithCharacterDirective, pickAngleForSection } from "@fixup/pdp-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { imageCreditUnits } from "../../../../lib/credit-cost";
import { loadCharacterView } from "../../../../lib/characters";
import { teamIdOf } from "../../../../lib/teams/store";
import { readLlmMeter, recordLlmUsage, withLlmMeter } from "../../../../lib/llm/meter";
import { createRedesignImageGenerator } from "../../../../lib/redesign/image-generator";
import { durableRedesignGenerate } from "../../../../lib/redesign/generate-operation";
import { useDurableGeneration as durableGenerationEnabled } from "../../../../lib/generation/run-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (durableGenerationEnabled()) return durableRedesignGenerate(req);
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 리디자인은 업체를 직접 부르므로
  // 꾸러미가 토큰을 알려 주면 여기서 받아 적는다.
  return withLlmMeter(() => generate(req));
}

async function generate(req: Request) {
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

    /**
     * **다른 도구와 같은 길로 그린다.**
     *
     * 리디자인은 OpenAI 를 직접 불러 한 세대 이전 모델에 묶여 있었다. fal 을
     * 거치면 카드뉴스·포스터가 쓰는 gpt-image-2.5 를 `max` 품질로 쓴다 —
     * 더 나은 그림을 더 싸게 만든다.
     *
     * **키가 없으면 지금까지의 길로 떨어진다.** 이 하나 때문에 리디자인이
     * 통째로 멎으면 안 된다.
     */
    let generateImage;
    try {
      generateImage = createRedesignImageGenerator();
    } catch {
      generateImage = undefined;
    }
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
      generateImage,
      onUsage: (usage) => recordLlmUsage(usage.model, usage.inputTokens, usage.outputTokens),
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
      // 글값도 함께 남긴다. 그동안 리디자인의 분석 비용은 장부에 0원이었다.
      { model: provider, billableImages: consumed, llmUsd: readLlmMeter().usd },
    );
    return Response.json({ ...result, usage });
  } catch (err) {
    if (reservation?.ok) await finalizeAiUsage(reservation, false, 0, err instanceof RedesignError ? `redesign_${err.status}` : "redesign_failed");
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "이미지 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
