import { creditImagePlan, markCreditStarted } from "../../../../lib/membership/credit-ledger";
import { generateSections, humanizeProviderError, RedesignError, sizeForRatio, type GenerateInputFile } from "@fixup/redesign-core";
import { buildSceneWithCharacterDirective, resolveCharacterAngles } from "@fixup/pdp-core";
import { resolveOpenaiKey, resolveGoogleKey } from "../../../../lib/server-keys";
import { authenticateApiMember, settleAiUsage, reserveAiUsage } from "../../../../lib/membership/api";
import { readRedesignForm } from "../../../../lib/pdp/request";
import { chunkCreditUnits } from "../../../../lib/redesign/chunk-billing";
import { inspectUploadedImage } from "../../../../lib/pdp/image-gate";
import { loadCharacterView } from "../../../../lib/characters";
import { teamIdOf } from "../../../../lib/teams/store";
import { readLlmMeter, recordLlmUsage, withLlmMeter } from "../../../../lib/llm/meter";
import { createRedesignImageGenerator, pixelSizeOf, redesignFalModelFor } from "../../../../lib/redesign/image-generator";
import { exactOutputSize, fitDataUrlToSize } from "../../../../lib/redesign/exact-size";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 리디자인은 업체를 직접 부르므로
  // 꾸러미가 토큰을 알려 주면 여기서 받아 적는다.
  return withLlmMeter(() => generate(req));
}

async function generate(req: Request) {
  const parsed = await readRedesignForm(req);
  if (!parsed.ok) return parsed.response;
  let reservation: Awaited<ReturnType<typeof reserveAiUsage>> | undefined;
  // 실패 경로에서도 「무엇으로 그리려 했는지」를 장부에 남겨야 한다.
  let billedModel = "redesign-openai";
  try {
    const form = parsed.form;
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
    /*
      **고른 것으로 그린다.** 화면의 선택이 값에만 쓰이고 그림은 늘 한 모델이
      그리던 것을 고쳤다(2026-09-17 리뷰 F-7-4).
    */
    const falModel = redesignFalModelFor(String(form.get("model") || "openai"));
    let generateImage;
    try {
      generateImage = createRedesignImageGenerator(process.env, falModel);
    } catch {
      generateImage = undefined;
    }
    /*
      **값은 실제로 그리는 모델에서 뽑는다.** fal 로 그리면 그 모델의 단가,
      키가 없어 옛 직접 호출로 떨어지면 그쪽 단가다.
    */
    billedModel = generateImage ? falModel : provider;

    /*
      **쪼갠 것은 우리 사정인데 값은 사용자가 냈다**(F-7-7).

      화면의 「나머지 섹션 생성」은 자기 자신을 한 장씩 다시 부른다. 그래서
      여덟 장 채우기는 요청 여덟 번이고, 요청마다 `creditUnits` 가 따로
      올림했다.

        한 장   $0.165 → ceil(3.3)  = 4장   ← 여덟 번이면 32장
        여덟 장 $1.32  → ceil(26.4) = 27장

      열 장이면 21% 를 더 낸다.

      설계 §7.2: 「한 번의 '전체 생성'은 **논리 작업 단위**로 예상 금액을
      계산한다. 내부 청크/섹션 분할 때문에 **올림이 반복되지 않는다.**」

      그래서 청크마다 **논리 작업의 누적 금액에서 앞서 청구한 만큼을 뺀 것**을
      받는다. 합치면 올림이 딱 한 번 일어난 것과 같고, 중간에 멈춰도 그때까지의
      논리 금액만 낸다 — 개별 생성 resume 이 이 성질 위에 선다.
    */
    const 청구 = chunkCreditUnits({
      modelId: billedModel,
      jobIndex: Number(form.get("jobIndex") ?? 0),
      chunkCount: requestedCount,
    });
    /*
      **문지기를 먼저 지난다**(F-7-1, C-9 와 같은 판단).

      상세페이지는 낯선 바이트를 받는 문에 문지기가 있는데(`lib/pdp/image-gate.ts`)
      리디자인에는 없었다. 코어의 `prepareReferenceImages` 는
      `file.type || guessMimeType(이름)` 으로 **딱지를 믿는다** — `.png` 라는
      이름의 글자가 참조로 모델에 가고, 16383×16383 단색 PNG(수백 KB)가 통과해
      펼치면 1GB 가 넘는다.

      같은 회사의 같은 위험인데 한쪽 문만 잠겨 있었다. **도메인을 합치는 것이
      아니라 문지기 계약을 함께 쓴다.**

      예약보다 앞이다. 깨진 입력은 모델을 부르기 전에 끝나므로, 예약을 먼저
      하면 값싼 실패로 한도를 태운다.
    */
    const fileEntries = form.getAll("files").filter((f): f is File => f instanceof File);
    const inspected = await inspectRedesignReferences(fileEntries);
    if (!inspected.ok) return inspected.response;
    const files: GenerateInputFile[] = inspected.files;

    /*
      **몇 장·어떤 크기인지 함께 알린다**(2026-09-23 운영 로그).

      크레딧 장부로 옮긴 회원은 이것이 있어야 값을 잡는다. 빠져 있어서 그
      회원들은 리디자인을 누를 때마다 「이 생성 경로의 크레딧 설정을 확인해야
      합니다」로 거절됐다. 크기는 코어가 실제로 그리는 크기다(`sizeForRatio`).
    */
    const creditPlan = creditImagePlan(
      requestedCount,
      pixelSizeOf(sizeForRatio(String(form.get("ratio") || "9:16"))),
      "redesign:generate",
    );
    reservation = await reserveAiUsage(req, "redesign_generate", 청구(requestedCount), creditPlan);
    if (!reservation.ok) return reservation.response;

    /*
     * 등장인물을 고르면 섹션마다 같은 사람이 나온다.
     *
     * 안 고르면 지금까지대로 돈다 — 이 블록 전체가 빈 배열로 떨어진다.
     *
     * **각도를 사람이 고른다.** 여기는 섹션이 만들어지기 전에 캐릭터를 정하므로
     * 각도 자동 선택에 넘길 섹션 설명이 없다. 그래서 `pickAngleForSection("")` 이
     * 늘 좌측 45도로 굳었고, 정면을 만들어 둬도 리디자인은 안 집어 갔다
     * (2026-09-15 사용자 보고). 고른 것이 없으면 그 자동이 그대로 기본이다.
     *
     * 여러 장일 때 모델이 절충해 제3의 인물을 만드는 것(2026-07-30 실측)은
     * `buildAttachmentRoleDirective` 가 말로 막는다. 첨부 상한 때문에 고른 것보다
     * 적게 붙을 수 있고, 그 자름은 `characterSlots` 한 곳에서만 한다.
     */
    const characterId = String(form.get("characterId") || "");
    const characters: NonNullable<Parameters<typeof generateSections>[0]["characters"]> = [];
    if (characterId) {
      const auth = await authenticateApiMember();
      if (!auth.ok) return auth.response;
      const teamId = await teamIdOf(auth.member.userId);
      const picked = form.getAll("characterAngles").map((value) => String(value));

      for (const angle of resolveCharacterAngles(picked, "")) {
        const view = await loadCharacterView(auth.member.userId, characterId, angle, teamId);
        if (!view) continue;
        characters.push({
          name: `character-${angle}.png`,
          mimeType: view.mimeType,
          buffer: Buffer.from(view.base64, "base64"),
          directive: buildSceneWithCharacterDirective({
            identityPrompt: view.identityPrompt,
            // 원본 상세페이지가 늘 함께 간다. 그것이 색·구성을 정한다.
            hasStyleReference: files.length > 0,
          }),
        });
      }
    }

    await markCreditStarted(reservation);
    const result = await generateSections({
      files,
      characters,
      request: String(form.get("request") || ""),
      rolloutRequest: String(form.get("rolloutRequest") || ""),
      knowledgeText: String(form.get("knowledgeText") || ""),
      transcript: String(form.get("transcript") || ""),
      /*
        **이미 한 기획을 도로 준다**(F-7-7). 청크마다 다시 분석하면 글 모델
        값이 청크 수만큼 늘고, 무엇보다 **청크마다 다른 계획**이 나온다.

        화면이 준 것이라 믿지 않는다 — 코어가 `isUsableAnalysis` 로 다시 보고,
        쓸 만하지 않으면 제가 분석한다. 여기서는 **모양만** 본다.
      */
      analysis: readReusableAnalysis(form.get("analysis")),
      /*
        **페이지가 몇 장짜리인가.** `count` 는 화면이 장마다 따로 부르므로 늘
        1이다. 그 수를 「N장을 이어 붙였을 때」에 쓰면 모든 요청이 「1장」이
        된다. 값이 이상하면 안 보낸다 — 코어가 숫자 없이 말한다.
      */
      pageTotal: readPageTotal(form.get("pageTotal")),
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
    /*
      **「1080×1920」을 고르면 정말 그 크기로 준다**(2026-09-23 사용자 결정).
      모델은 픽셀 크기를 정확히 안 지키므로 다 만든 뒤 맞춘다. 「9:16」은 그대로.
    */
    const exact = exactOutputSize(String(form.get("ratio") || ""));
    // 한 장씩 차례로 맞춘다(서버 메모리). 받은 목록은 고쳐 쓰지 않고 새로 짓는다.
    const sizedSections = [];
    for (const section of result.project.sections) {
      sizedSections.push(exact && section.imageUrl ? { ...section, imageUrl: await fitDataUrlToSize(section.imageUrl, exact) } : section);
    }
    const sized = { ...result, project: { ...result.project, sections: sizedSections } };
    const consumed = Math.min(requestedCount, sized.project.sections.length);
    const usage = await settleAiUsage(
      reservation,
      consumed > 0,
      // 만든 만큼만 받는다. 단가는 **실제로 그린 모델**에서 뽑는다 — 예약과
      // 같은 값이어야 한다. 전에는 예약만 실행 모델이고 차감은 옛 이름이었다.
      청구(consumed),
      consumed > 0 ? undefined : "no_image_generated",
      // 글값도 함께 남긴다. 그동안 리디자인의 분석 비용은 장부에 0원이었다.
      { model: billedModel, billableImages: consumed, deliveredImages: consumed, completionConfirmed: true, llmUsd: readLlmMeter().usd },
    );
    return Response.json({ ...sized, usage });
  } catch (err) {
    if (reservation?.ok) {
      /*
        **실패해도 글값은 이미 나갔다.** 분석은 끝났는데 첫 그림이 실패한 경우가
        그렇다. 여기서 안 남기면 그 요청은 장부에서 0원으로 보인다.
      */
      await settleAiUsage(
        reservation,
        false,
        0,
        err instanceof RedesignError ? `redesign_${err.status}` : "redesign_failed",
        { model: billedModel, billableImages: 0, llmUsd: readLlmMeter().usd },
      );
    }
    if (err instanceof RedesignError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? humanizeProviderError(err.message) : "이미지 생성 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * 화면이 돌려준 기획을 읽는다.
 *
 * **깨졌거나 너무 크면 그냥 안 싣는다.** 생성이 멎는 쪽이 더 나쁘다 — 안
 * 실으면 코어가 전과 같이 제가 분석한다.
 *
 * 분석은 몇 KB 짜리 요약이다. 그보다 크면 화면이 보낸 것이 분석이 아니다.
 */
const REUSABLE_ANALYSIS_MAX_CHARS = 60_000;

function readReusableAnalysis(raw: FormDataEntryValue | null): unknown {
  const text = typeof raw === "string" ? raw : "";
  if (!text || text.length > REUSABLE_ANALYSIS_MAX_CHARS) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 올린 원본이 정말 그림인가.
 *
 * **한 장이라도 나쁘면 막는다.** 남은 것으로 조용히 진행하면 사용자는 자기가
 * 올린 것 중 하나가 빠진 줄 모른 채 값을 낸다.
 *
 * 바이트로 정한 종류를 그대로 넘긴다 — 딱지가 틀렸으면 고쳐서 넘겨야 모델이
 * 받는 `data:` 앞머리가 실제와 맞는다.
 */
async function inspectRedesignReferences(
  entries: File[],
): Promise<{ ok: true; files: GenerateInputFile[] } | { ok: false; response: Response }> {
  const files: GenerateInputFile[] = [];
  for (const entry of entries) {
    const buffer = Buffer.from(await entry.arrayBuffer());
    const gate = await inspectUploadedImage(buffer);
    if (!gate.ok) {
      return {
        ok: false,
        response: Response.json(
          { error: `${entry.name}: ${gate.message}` },
          { status: gate.reason === "too_many_pixels" ? 413 : 400 },
        ),
      };
    }
    files.push({ name: entry.name, type: gate.mimeType, buffer });
  }
  return { ok: true, files };
}

/** 한 페이지의 최대 장수. 섹션 상한과 같다. */
const MAX_PAGE_SECTIONS = 10;

/**
 * 화면이 말한 페이지 장수. **값에 쓰이지 않는다** — 프롬프트 문구에만 쓴다.
 *
 * 그래도 말이 안 되는 수가 박히면 모델이 없는 장을 가정한다. 범위 밖이면
 * 안 보낸다.
 */
function readPageTotal(raw: FormDataEntryValue | null): number | undefined {
  const value = Number(String(raw ?? "").trim() || "x");
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SECTIONS) return undefined;
  return value;
}
