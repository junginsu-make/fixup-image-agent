import { pdpCreditSize } from "../../../lib/membership/image-sizes";
import { creditImagePlan, markCreditStarted } from "../../../lib/membership/credit-ledger";
import { z } from "zod";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../lib/membership/api";
import { llmSettleCost, withLlmMeter } from "../../../lib/llm/meter";
import { prepareCharacterBrief } from "../../../lib/character-brief";
import { imageCreditUnits } from "../../../lib/credit-cost";
import {
  DEFAULT_CANDIDATES,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  characterCreditCost,
  characterOwnerOf,
  countRecentCharacters,
  createCharacter,
  deleteCharacter,
  generateCandidates,
  listCharacters,
} from "../../../lib/characters";
import {
  CHARACTER_ANGLES, CHARACTER_SHEET, DEFAULT_EXTRA_ANGLES, IMAGE_MODELS, OWN_WITH_EXTRACT_MESSAGE, VISIBLE_PDP_MODELS, selectCharacterModel,
  type CharacterAngle,
} from "@fixup/pdp-core";
import { IMAGE_LOOKS } from "@fixup/shared";
import { teamIdOf } from "../../../lib/teams/store";
import { hasFullScope, viewerFrom } from "../../../lib/access/core";
import { softDeleteCharacter } from "../../../lib/character-soft-delete";
import { isLocalStoreEnabled } from "../../../lib/local-store";
import { sniffImageMime } from "../../../lib/image-encoding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 고른 각도를 동시에 만든다. 서버리스 상한이 300초다.
export const maxDuration = 300;

/**
 * 캐릭터 — 전부 사용자별이다.
 *
 * 두 단계로 나뉜다. 정면 후보를 만드는 것(step=candidates)과, 고른 정면으로
 * 각도를 만들어 저장하는 것(step=create). 나눈 이유는 사이에 사용자의
 * 선택이 들어가기 때문이다.
 *
 * **「다각도」는 이제 딴 뜻이다.** 여섯 각도를 한 그림에 담은 한 장
 * (`sheet`)을 가리킨다. 여러 각도를 만드는 일은 「각도」라고만 부른다.
 *
 * 크레딧은 각 단계에서 실제로 만든 장수만 차감한다.
 */

const KINDS = ["person", "animal", "character", "object"] as const;
/*
 * **결 목록을 여기 베껴 적지 않는다.**
 *
 * 네 개를 적어 뒀더니 공용 목록에 「레퍼런스 스타일」이 들어간 뒤에도 이 라우트만
 * 그것을 몰라, 화면이 보내는 값을 **타입 단계에서 거부**했다(2026-09-17 대조).
 */
const LOOKS = IMAGE_LOOKS;
const ASPECTS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

/** 입력은 전부 여기서 거른다. 아래 코드는 값이 맞다고 믿는다. */
const BodySchema = z.object({
  step: z.enum(["candidates", "create"]).default("create"),
  name: z.string().max(80).optional(),
  description: z.string().trim().min(1, "무엇을 만들지 적어 주세요.").max(2000, "묘사는 2000자 이내로 적어 주세요."),
  aspectRatio: z.enum(ASPECTS).default("3:4"),
  kind: z.enum(KINDS).default("person"),
  look: z.enum(LOOKS).default("photoreal"),
  modelId: z.enum(IMAGE_MODELS.map((model) => model.id) as [string, ...string[]]).optional(),
  reference: z.object({
    role: z.enum(["style", "extract"]),
    base64: z.string().min(1),
    mimeType: z.string().min(1),
  }).optional(),
  /** 「내 캐릭터」 칸. 생김새를 지킬 대상이다. 참고할 그림과 함께면 그 그림은 레퍼런스 스타일이어야 한다. */
  ownCharacter: z.object({
    base64: z.string().min(1),
    mimeType: z.string().min(1),
  }).optional(),
  chosenBase64: z.string().optional(),
  chosenMimeType: z.string().optional(),
  /**
   * 정면을 만들 때 LLM 이 정리한 정체성. 화면이 받아 두었다가 저장 때 돌려준다.
   * 없으면(옛 화면·「과정 보기」로 연 캐릭터) 저장 단계가 직접 정리한다.
   * 길면 거절하지 않고 자른다 — 정면은 이미 돈을 냈으니 저장이 막히면 안 된다.
   */
  identityPrompt: z.string().trim().transform((value) => value.slice(0, 2000)).optional(),
  candidates: z.number().int().min(MIN_CANDIDATES).max(MAX_CANDIDATES).optional(),
  /** 정면 말고 더 만들 각도. 빈 배열이면 정면 한 장짜리가 된다. */
  angles: z.array(z.enum(CHARACTER_ANGLES.map((angle) => angle.id) as [string, ...string[]])).optional(),
  /**
   * 여섯 각도를 한 그림에 담은 한 장도 같이 만들까.
   *
   * **각도와 더하기다.** 각도를 하나도 안 고르고 이것만 켤 수도 있다 —
   * 한눈에 보려는 쓰임에는 낱장 여섯보다 한 장이 싸다.
   */
  sheet: z.boolean().optional(),
});

type Body = z.infer<typeof BodySchema>;

/** data: 접두사를 떼어 낸다. 화면이 붙여 보내는 일이 잦다. */
function rawBase64(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, "");
}

/**
 * `?scope=all` — **최고 관리자는 모든 회원의 캐릭터를 본다**(2026-10-08, 사용자가 여러 번 말함).
 *
 * 라이브러리의 작업물 목록(캐릭터 카드)만 이것을 보낸다. 만들기 화면·불러오기 창은 안 보낸다 — 관리자도 거기서는
 * 자기 것만 봐야 남의 캐릭터를 잘못 불러 쓰지 않는다. 회원이 보내면 무시한다.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  const wantsAll = new URL(req.url).searchParams.get("scope") === "all";
  const allMembers = wantsAll && hasFullScope(viewerFrom(auth.member), "read");

  try {
    return Response.json({
      ok: true,
      characters: await listCharacters(
        auth.member.userId,
        await teamIdOf(auth.member.userId),
        allMembers ? { allMembers: true } : {},
      ),
      candidateCount: DEFAULT_CANDIDATES,
      minCandidates: MIN_CANDIDATES,
      maxCandidates: MAX_CANDIDATES,
      /**
       * **정면 한 장 값이다.**
       *
       * 전에는 「후보 2 + 각도 3」 짜리 한 벌 값이었다. 화면이 이제 각도를
       * 하나씩 골라 셈하므로, 한 벌 값을 「1개당」이라 적으면 실제로 드는 것과
       * 몇 배씩 어긋난다. 여기서는 가장 작은 단위만 준다.
       */
      creditCost: characterCreditCost("photoreal", undefined, { candidates: 1, extraAngles: 0 }),
      // 화면이 체크상자를 그리려면 목록과 기본값이 필요하다.
      angles: CHARACTER_ANGLES.map((angle) => ({ id: angle.id, label: angle.label })),
      // 각도가 아니라 일곱 번째 항목이다. 이름표를 화면에 박아 두면 여기서
      // 바뀔 때 화면만 옛말이 된다.
      sheet: { id: CHARACTER_SHEET.id, label: CHARACTER_SHEET.label },
      /**
       * **더 만들 각도의 기본값은 이제 비었다**(2026-09-11 사용자 결정).
       *
       * 켜 둔 것을 못 보고 단추를 눌러 원치 않는 장을 만들고 돈을 내는 일이
       * 있었다. 고르는 것은 사용자 몫이다. 서버가 안 받았을 때 쓰는 기본값
       * (`DEFAULT_EXTRA_ANGLES`)은 옛 호출을 위해 그대로 둔다.
       */
      defaultAngles: [],
      // 화면이 모델을 고를 수 있어야 한다. 이미지 만들기와 같은 보이는 셋만 준다.
      // 숨긴 모델은 옛 캐릭터 각도를 다시 만들 때만 서버가 받는다(POST 검증은 전체 목록).
      models: VISIBLE_PDP_MODELS.map((model) => ({
        id: model.id, label: model.label, description: model.description,
      })),
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "캐릭터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return withLlmMeter(() => handlePost(req));
}

async function handlePost(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  // 읽지 못하면 `{}` 로 검증하지 않는다 — 그림이 너무 커 본문이 잘린 경우에 엉뚱한 안내가 떴다.
  const raw: unknown = await req.json().catch(() => undefined);
  if (raw === undefined) {
    return Response.json(
      { ok: false, message: "요청을 읽지 못했습니다. 붙인 그림이 너무 크면 줄여서 다시 올려 주세요." },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "요청을 해석하지 못했습니다." },
      { status: 400 },
    );
  }
  const body: Body = parsed.data;
  const modelId = (body.modelId ?? selectCharacterModel(body.look)) as never;
  const reference = body.reference
    ? { ...body.reference, base64: rawBase64(body.reference.base64) }
    : undefined;
  const ownCharacter = body.ownCharacter
    ? { ...body.ownCharacter, base64: rawBase64(body.ownCharacter.base64) }
    : undefined;
  // 지킬 대상이 둘이 되면 서로 부딪힌다. 화면이 막지만 화면을 안 거치는 길도 있다.
  if (ownCharacter && reference?.role === "extract") {
    return Response.json({ ok: false, message: OWN_WITH_EXTRACT_MESSAGE }, { status: 400 });
  }

  if (body.step === "candidates") {
    // 후보 단계는 후보만 만든다. 각도 몫까지 잡아 두면 크레딧이 모자랄 때
    // 만들 수 있는 것도 못 만든다.
    const reservation = await reserveAiUsage(
      req, "pdp_image",
      characterCreditCost(body.look, modelId, { candidates: body.candidates, extraAngles: 0 }),
      creditImagePlan(body.candidates ?? DEFAULT_CANDIDATES, pdpCreditSize(modelId, body.aspectRatio), "character:candidates"),
    );
    if (!reservation.ok) return reservation.response;

    try {
      await markCreditStarted(reservation);
      // 사용자가 친 말을 이미지 모델이 오해하지 않게 정리한다. 실패하면 원문이다.
      const brief = await prepareCharacterBrief({
        description: body.description,
        kind: body.kind,
        look: body.look,
        referenceRole: reference?.role,
        hasOwnCharacter: Boolean(ownCharacter),
      });
      const result = await generateCandidates({
        description: brief.prompt,
        aspectRatio: body.aspectRatio,
        kind: body.kind,
        look: body.look,
        modelId,
        reference,
        ownCharacter,
        candidates: body.candidates,
      });
      /*
        실패한 장은 차감하지 않는다.

        **장수가 아니라 환산한 값을 넘긴다.** 예약은 `characterCreditCost` 로
        단가를 거치는데 확정만 장수를 그대로 넘기고 있었다 — 비싼 모델일수록
        덜 깎였다(2026-09-22 발견). 형제 라우트 `characters/views` 는 처음부터
        `imageCreditUnits` 로 다시 환산하고 있었다.
      */
      const usage = await finalizeAiUsage(
        reservation,
        result.candidates.length > 0,
        imageCreditUnits(result.model, result.candidates.length),
        result.candidates.length > 0 ? undefined : "candidates_failed",
        { model: result.model, billableImages: result.candidates.length, deliveredImages: result.candidates.length, completionConfirmed: true, llmUsd: llmSettleCost().llmUsd },
      );
      const front = result.candidates[0];
      const saved = front
        ? await saveFront({
          userId: auth.member.userId, body, modelId, identityPrompt: brief.identity, front,
        })
        : undefined;
      return Response.json({
        ok: result.candidates.length > 0,
        candidates: result.candidates,
        requested: result.requested,
        usage,
        brief: { identity: brief.identity, refined: brief.refined },
        ...(saved ?? {}),
        message: result.candidates.length ? undefined : "후보를 만들지 못했습니다.",
      });
    } catch (error) {
      await finalizeAiUsage(reservation, false, 0, "candidates_failed", { model: "", billableImages: 0, llmUsd: llmSettleCost().llmUsd });
      return Response.json(
        { ok: false, message: error instanceof Error ? error.message : "후보를 만들지 못했습니다." },
        { status: 500 },
      );
    }
  }

  const chosenBase64 = rawBase64(body.chosenBase64 ?? "");
  if (!chosenBase64) {
    return Response.json({ ok: false, message: "고른 후보가 없습니다." }, { status: 400 });
  }

  /*
    **그림만 받는다**(2026-10-08 보안 리뷰). 이 정면은 화면이 보낸 바이트다 — 딱지(`chosenMimeType`)를
    믿지 않고 바이트를 본다. 그림이 아닌 것이 캐릭터·관리자 라이브러리에 쌓이면 안 된다.
  */
  const chosenMimeType = sniffImageMime(Buffer.from(chosenBase64, "base64"), "");
  if (!FRONT_FORMATS.has(chosenMimeType)) {
    return Response.json({ ok: false, message: "PNG, JPG, WEBP 그림만 저장할 수 있습니다." }, { status: 400 });
  }

  const angles = (body.angles ?? DEFAULT_EXTRA_ANGLES).filter((angle) => angle !== "front");
  // 만드는 것은 고른 각도와 다각도 한 장뿐이다. 정면은 이미 있다.
  const extraImages = angles.length + (body.sheet ? 1 : 0);
  /*
    **각도 없는 저장은 공짜다**(0장 예약). 지금은 자동 저장이 실패했을 때의 「다시 저장하기」뿐이라
    시간당 상한을 건다. 못 세면 저장하지 않는다. 각도를 함께 만들면 그 값을 장부가 막는다.
  */
  if (extraImages === 0) {
    // 못 세면 저장하지 않는다. 그때 「상한」을 말하면 사실이 아니라 다른 말을 한다.
    const recent = await countRecentCharacters(auth.member.userId, new Date(Date.now() - 3_600_000)).catch((error: unknown) => {
      console.error("[characters:create] 저장 수를 세지 못했습니다", error instanceof Error ? error.message : error);
      return null;
    });
    if (recent === null) {
      return Response.json({ ok: false, message: "지금은 저장할 수 없습니다. 잠시 뒤 다시 눌러 주세요." }, { status: 503 });
    }
    if (recent >= FREE_SAVES_PER_HOUR) {
      return Response.json(
        { ok: false, message: `캐릭터는 한 시간에 ${FREE_SAVES_PER_HOUR}개까지 이렇게 저장할 수 있습니다. 잠시 뒤 다시 눌러 주세요.` },
        { status: 429 },
      );
    }
  }
  const reservation = await reserveAiUsage(
    req, "pdp_image",
    characterCreditCost(body.look, modelId, { candidates: 0, extraAngles: extraImages }),
    creditImagePlan(extraImages, pdpCreditSize(modelId, body.aspectRatio), "character:angles"),
  );
  if (!reservation.ok) return reservation.response;

  try {
    await markCreditStarted(reservation);
    // 정면 때 정리한 정체성을 받는다. 없으면 여기서 정리한다 — 각도가 원문으로 그려지면
    // 정면과 다른 해석이 된다.
    const identityPrompt = body.identityPrompt || (await prepareCharacterBrief({
      description: body.description,
      kind: body.kind,
      look: body.look,
      hasOwnCharacter: false,
    })).identity;
    const result = await createCharacter({
      angles: angles as CharacterAngle[],
      sheet: body.sheet,
      userId: auth.member.userId,
      // 빈칸뿐인 이름은 없는 것과 같다. 그대로 두면 이름 없는 캐릭터가 된다.
      name: (body.name?.trim() || body.description).slice(0, 80),
      description: body.description,
      identityPrompt,
      aspectRatio: body.aspectRatio,
      kind: body.kind,
      look: body.look,
      modelId,
      chosenBase64,
      // 바이트로 판정한 형식이다. 화면이 보낸 딱지는 믿지 않는다(재리뷰).
      chosenMimeType,
    });

    // 정면은 이미 만든 것이라 차감하지 않는다.
    const generated = result.ok ? Math.max(0, result.angleCount - 1) : 0;
    // 위 후보 생성과 같은 이유로 장수가 아니라 환산한 값을 넘긴다.
    const usage = await finalizeAiUsage(
      reservation,
      result.ok,
      imageCreditUnits(modelId, generated),
      result.ok ? undefined : "character_create_failed",
      { model: modelId, billableImages: generated, deliveredImages: generated, completionConfirmed: true, llmUsd: llmSettleCost().llmUsd },
    );

    return Response.json({ ...result, usage }, { status: result.ok ? 200 : 500 });
  } catch (error) {
    await finalizeAiUsage(reservation, false, 0, "character_create_failed", { model: "", billableImages: 0, llmUsd: llmSettleCost().llmUsd });
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "캐릭터를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}

/** 옛 저장 단계가 받는 정면 형식(바이트로 판정). */
const FRONT_FORMATS = new Set(["image/png", "image/jpeg", "image/webp"]);
/** 각도 없는(0크레딧) 저장의 회원당 시간당 상한. 자동 저장이 실패했을 때만 쓰는 길이라 넉넉하다. */
const FREE_SAVES_PER_HOUR = 30;

/** 저장이 실패했을 때 화면에 보이는 말. 저장소 원문(주소·표 이름)은 서버 기록에만 남긴다. */
const FRONT_SAVE_FAILED = "정면은 만들었지만 저장하지 못했습니다. 「다시 저장하기」를 눌러 주세요.";

/**
 * **정면이 나오면 그 자리에서 캐릭터로 저장한다**(2026-10-08 사용자 요청).
 *
 * 전에는 정면이 화면에만 있다가 「캐릭터 저장하기」를 눌러야 저장됐다. 정면에도 크레딧이 나가는데
 * 누르지 않고 나가면 그림이 어디에도 안 남았다(운영 10-06 실제로 그랬다). 다른 기능처럼 만들어지는
 * 순간 저장한다. 다시 뽑으면 뽑을 때마다 새 캐릭터가 된다(사용자 결정).
 *
 * 화면이 다시 보낸 그림이 아니라 **서버가 방금 만든 그 바이트**로 저장한다. **던지지 않는다** —
 * 저장이 실패해도 돈을 낸 정면은 돌려주고, 화면이 「다시 저장하기」(옛 `create` 단계)로 살린다.
 */
async function saveFront(input: {
  userId: string;
  body: z.infer<typeof BodySchema>;
  modelId: Parameters<typeof createCharacter>[0]["modelId"];
  identityPrompt: string;
  front: { base64: string; mimeType: string };
}): Promise<{ character: { id: string; name: string }; referenceIssue?: string } | { saveError: string }> {
  const { body } = input;
  // 빈칸뿐인 이름은 없는 것과 같다. 저장 단계(`create`)와 같은 규칙이다.
  const name = (body.name?.trim() || body.description).slice(0, 80);
  try {
    const result = await createCharacter({
      angles: [],
      sheet: false,
      userId: input.userId,
      name,
      description: body.description,
      identityPrompt: input.identityPrompt,
      aspectRatio: body.aspectRatio,
      kind: body.kind,
      look: body.look,
      modelId: input.modelId,
      chosenBase64: input.front.base64,
      chosenMimeType: input.front.mimeType || "image/png",
    });
    // 참고 이미지 창고에 못 넣었으면 조용히 넘어가지 않는다 — 옛 저장 단계가 그랬듯 화면이 알린다.
    if (result.ok && result.id) {
      return {
        character: { id: result.id, name: result.name ?? name },
        ...(result.referenceIssue ? { referenceIssue: result.referenceIssue } : {}),
      };
    }
    console.error("[characters:auto-save]", result.ok ? "id 없음" : result.message);
  } catch (error) {
    console.error("[characters:auto-save]", error instanceof Error ? error.message : error);
  }
  return { saveError: FRONT_SAVE_FAILED };
}

export async function DELETE(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as { id?: string };
    const id = String(body.id || "");
    if (!id) return Response.json({ ok: false, message: "id 가 없습니다." }, { status: 400 });

    /*
      **관리자는 남의 캐릭터도 지운다**(2026-10-09 사용자). 지우기는 주인 줄·주인 폴더를 기준으로 하므로, 관리자 id 로
      부르면 한 줄도 못 지운다. 주인은 서버가 찾는다 — 화면이 보낸 값을 믿지 않는다.
    */
    // 형식이 틀린 id 는 DB 가 오류로 답한다(500) — 먼저 거른다.
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ ok: false, message: "캐릭터를 찾지 못했습니다." }, { status: 400 });
    }
    const admin = hasFullScope(viewerFrom(auth.member), "delete");

    /*
      **회원이 지우면 보관한다**(2026-10-08 사용자 결정 — 계획 2단계). 줄·각도·파일·라이브러리 사본은 남고 지운
      때만 적힌다. 회원 화면과 만들기 재료에서는 사라지고, 관리자가 「회원이 삭제한 자료」에서 확인한다(6개월 뒤
      파기). 로컬 파일 저장소는 개발용이라 지금처럼 지운다.
    */
    if (!admin && !isLocalStoreEnabled()) {
      const kept = await softDeleteCharacter(auth.member.userId, id);
      if (kept.ok) return Response.json(kept);
      return Response.json({ ok: false, message: kept.message }, { status: kept.notFound ? 404 : 500 });
    }

    const owner = admin ? await characterOwnerOf(id, auth.member.userId) : auth.member.userId;
    if (!owner) return Response.json({ ok: false, message: "캐릭터를 찾지 못했습니다." }, { status: 404 });

    const result = await deleteCharacter(owner, id);
    if (!result.ok) {
      // DB 원문(표·칸 이름)은 화면에 보내지 않는다.
      console.error("[characters:delete]", result.message);
      return Response.json({ ok: false, message: "삭제하지 못했습니다." }, { status: 500 });
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
