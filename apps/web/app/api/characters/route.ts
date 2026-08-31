import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../lib/membership/api";
import {
  CANDIDATE_COUNT,
  characterCreditCost,
  createCharacter,
  deleteCharacter,
  generateCandidates,
  listCharacters,
} from "../../../lib/characters";
import { selectCharacterModel, type AspectRatio } from "@fixup/pdp-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 후보 2장 또는 다각도 2장을 동시에 만든다. 서버리스 상한이 300초다.
export const maxDuration = 300;

/**
 * 캐릭터 — 전부 사용자별이다.
 *
 * 두 단계로 나뉜다. 후보를 만드는 것(step=candidates)과, 고른 후보로
 * 다각도를 만들어 저장하는 것(step=create). 나눈 이유는 사이에 사용자의
 * 선택이 들어가기 때문이다.
 *
 * 크레딧은 각 단계에서 실제로 만든 장수만 차감한다.
 */

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    return Response.json({
      ok: true,
      characters: await listCharacters(auth.member.userId),
      candidateCount: CANDIDATE_COUNT,
      creditCost: characterCreditCost(true),
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

  let body: {
    step?: string;
    name?: string;
    description?: string;
    aspectRatio?: AspectRatio;
    photoreal?: boolean;
    chosenBase64?: string;
    chosenMimeType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "요청을 해석하지 못했습니다." }, { status: 400 });
  }

  const description = String(body.description || "").trim();
  if (!description) {
    return Response.json({ ok: false, message: "인물 묘사를 입력해 주세요." }, { status: 400 });
  }

  const aspectRatio = (body.aspectRatio ?? "3:4") as AspectRatio;
  const photoreal = body.photoreal !== false;

  if (body.step === "candidates") {
    const reservation = await reserveAiUsage(req, "pdp_image", characterCreditCost(photoreal));
    if (!reservation.ok) return reservation.response;

    try {
      const result = await generateCandidates({ description, aspectRatio, photoreal });
      // 실패한 장은 차감하지 않는다.
      const usage = await finalizeAiUsage(
        reservation,
        result.candidates.length > 0,
        result.candidates.length,
        result.candidates.length > 0 ? undefined : "candidates_failed",
        { model: selectCharacterModel(photoreal), billableImages: result.candidates.length },
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

  const chosenBase64 = String(body.chosenBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!chosenBase64) {
    return Response.json({ ok: false, message: "고른 후보가 없습니다." }, { status: 400 });
  }

  // 정면은 고른 후보를 그대로 쓰므로 실제 생성은 나머지 각도뿐이다.
  const reservation = await reserveAiUsage(req, "pdp_image", characterCreditCost(photoreal));
  if (!reservation.ok) return reservation.response;

  try {
    const result = await createCharacter({
      userId: auth.member.userId,
      name: String(body.name || description).slice(0, 80),
      description,
      aspectRatio,
      photoreal,
      chosenBase64,
      chosenMimeType: String(body.chosenMimeType || "image/png"),
    });

    // 정면은 이미 만든 것이라 차감하지 않는다.
    const generated = result.ok ? Math.max(0, result.angleCount - 1) : 0;
    const usage = await finalizeAiUsage(
      reservation,
      result.ok,
      generated,
      result.ok ? undefined : "character_create_failed",
      { model: selectCharacterModel(photoreal), billableImages: generated },
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
