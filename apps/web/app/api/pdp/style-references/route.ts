import { authenticateApiMember } from "../../../../lib/membership/api";
import {
  deleteUserStyleReference,
  listUserStyleReferences,
  registerUserStyleReference,
} from "../../../../lib/user-style-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 이미지 분석(Gemini) 한 번이라 오래 걸리지 않는다.
export const maxDuration = 120;

/**
 * 스타일 레퍼런스 — 전부 사용자별이다.
 *
 * 공용 레퍼런스는 두지 않는다. 전역이면 A 셀러가 올린 디자인이 B 셀러의 생성
 * 결과에 씌워진다. 그래서 등록 권한도 관리자가 아니라 **회원**이다. 자기 것만
 * 만들고 지우므로 남에게 영향이 없다.
 *
 * 클라이언트가 보낸 userId 는 믿지 않는다. 세션에서 꺼낸 것만 쓴다.
 */

export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const references = await listUserStyleReferences(auth.member.userId);
    return Response.json({ ok: true, total: references.length, references });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      name?: string;
      source?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    const imageBase64 = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!imageBase64) {
      return Response.json({ ok: false, message: "이미지가 없습니다." }, { status: 400 });
    }

    const result = await registerUserStyleReference({
      userId: auth.member.userId,
      name: String(body.name || "레퍼런스"),
      source: body.source === "generated" ? "generated" : "upload",
      imageBase64,
      mimeType: String(body.mimeType || "image/png"),
    });

    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 등록하지 못했습니다." },
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

    const result = await deleteUserStyleReference(auth.member.userId, id);
    return Response.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
