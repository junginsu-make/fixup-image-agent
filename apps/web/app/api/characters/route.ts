import { z } from "zod";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../lib/membership/api";
import {
  DEFAULT_CANDIDATES,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  characterCreditCost,
  createCharacter,
  deleteCharacter,
  generateCandidates,
  listCharacters,
} from "../../../lib/characters";
import {
  CHARACTER_ANGLES, CHARACTER_SHEET, DEFAULT_EXTRA_ANGLES, IMAGE_MODELS, selectCharacterModel,
  type CharacterAngle,
} from "@fixup/pdp-core";
import { teamIdOf } from "../../../lib/teams/store";

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
const LOOKS = ["photoreal", "anime", "3d", "illustration"] as const;
const ASPECTS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

/** 입력은 전부 여기서 거른다. 아래 코드는 값이 맞다고 믿는다. */
const BodySchema = z.object({
  step: z.enum(["candidates", "create"]).default("create"),
  name: z.string().max(80).optional(),
  description: z.string().trim().min(1, "무엇을 만들지 적어 주세요."),
  aspectRatio: z.enum(ASPECTS).default("3:4"),
  kind: z.enum(KINDS).default("person"),
  look: z.enum(LOOKS).default("photoreal"),
  modelId: z.enum(IMAGE_MODELS.map((model) => model.id) as [string, ...string[]]).optional(),
  reference: z.object({
    role: z.enum(["style", "extract"]),
    base64: z.string().min(1),
    mimeType: z.string().min(1),
  }).optional(),
  chosenBase64: z.string().optional(),
  chosenMimeType: z.string().optional(),
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

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    return Response.json({
      ok: true,
      characters: await listCharacters(auth.member.userId, await teamIdOf(auth.member.userId)),
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
      // 화면이 모델을 고를 수 있어야 한다. 목록을 여기서 준다 —
      // 이미지 만들기와 같은 목록이다.
      models: IMAGE_MODELS.map((model) => ({
        id: model.id, label: model.label, description: model.description,
        // 아직 우리 쓰임에서 재 보지 않은 모델. 화면이 그렇게 표시한다.
        untested: Boolean(model.characterOnly),
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
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
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

  if (body.step === "candidates") {
    // 후보 단계는 후보만 만든다. 각도 몫까지 잡아 두면 크레딧이 모자랄 때
    // 만들 수 있는 것도 못 만든다.
    const reservation = await reserveAiUsage(
      req, "pdp_image",
      characterCreditCost(body.look, modelId, { candidates: body.candidates, extraAngles: 0 }),
    );
    if (!reservation.ok) return reservation.response;

    try {
      const result = await generateCandidates({
        description: body.description,
        aspectRatio: body.aspectRatio,
        kind: body.kind,
        look: body.look,
        modelId,
        reference,
        candidates: body.candidates,
      });
      // 실패한 장은 차감하지 않는다.
      const usage = await finalizeAiUsage(
        reservation,
        result.candidates.length > 0,
        result.candidates.length,
        result.candidates.length > 0 ? undefined : "candidates_failed",
        { model: result.model, billableImages: result.candidates.length },
      );
      return Response.json({
        ok: result.candidates.length > 0,
        candidates: result.candidates,
        requested: result.requested,
        usage,
        message: result.candidates.length ? undefined : "후보를 만들지 못했습니다.",
      });
    } catch (error) {
      await finalizeAiUsage(reservation, false, 0, "candidates_failed");
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

  const angles = (body.angles ?? DEFAULT_EXTRA_ANGLES).filter((angle) => angle !== "front");
  // 만드는 것은 고른 각도와 다각도 한 장뿐이다. 정면은 이미 있다.
  const extraImages = angles.length + (body.sheet ? 1 : 0);
  const reservation = await reserveAiUsage(
    req, "pdp_image",
    characterCreditCost(body.look, modelId, { candidates: 0, extraAngles: extraImages }),
  );
  if (!reservation.ok) return reservation.response;

  try {
    const result = await createCharacter({
      angles: angles as CharacterAngle[],
      sheet: body.sheet,
      userId: auth.member.userId,
      name: (body.name || body.description).slice(0, 80),
      description: body.description,
      aspectRatio: body.aspectRatio,
      kind: body.kind,
      look: body.look,
      modelId,
      chosenBase64,
      chosenMimeType: body.chosenMimeType || "image/png",
    });

    // 정면은 이미 만든 것이라 차감하지 않는다.
    const generated = result.ok ? Math.max(0, result.angleCount - 1) : 0;
    const usage = await finalizeAiUsage(
      reservation,
      result.ok,
      generated,
      result.ok ? undefined : "character_create_failed",
      { model: modelId, billableImages: generated },
    );

    return Response.json({ ...result, usage }, { status: result.ok ? 200 : 500 });
  } catch (error) {
    await finalizeAiUsage(reservation, false, 0, "character_create_failed");
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "캐릭터를 만들지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as { id?: string };
    const id = String(body.id || "");
    if (!id) return Response.json({ ok: false, message: "id 가 없습니다." }, { status: 400 });

    const result = await deleteCharacter(auth.member.userId, id);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
