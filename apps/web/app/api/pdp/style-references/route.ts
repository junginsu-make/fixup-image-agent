import { authenticateApiMember } from "../../../../lib/membership/api";
import { inspectUploadedImage } from "../../../../lib/pdp/image-gate";
import { BodyLimitError, readBoundedBody } from "../../../../lib/pdp/request";
import { STYLE_REFERENCE_JSON_LIMIT, STYLE_REFERENCE_MAX_MB } from "../../../../lib/pdp/reference-limits";
import {
  deleteUserStyleReference,
  listUserStyleReferences,
  ownerOfStyleReference,
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
 *
 * ── 문지기가 없었다 (C-7 · C-10-c) ──────────────────────────
 *
 * 이 라우트는 `await req.json()` 한 줄로 본문을 받았다. 용량 상한도, 그림인지
 * 보는 눈도 없었다. 삭제는 빈 본문·잘못된 id 에 500 을 돌려주고, 남의 것을
 * 지우라고 해도 성공이라고 답했다.
 *
 * 설계 §12: 「Content-Length 만 신뢰하지 않는다. 수신 스트림·파일 수·MIME
 * signature·이미지 픽셀을 제한한다.」
 * 설계 §14.3(C-10-c): 「형식 오류 400, 소유권 없는 자원 404; 이미 삭제된 정상
 * ID 는 멱등 삭제 정책 명시.」
 */

/** UUID 모양. 이것이 아니면 표에 물어볼 것도 없다 — 형식 오류다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}

/**
 * 본문을 상한까지만 읽어 JSON 으로 푼다.
 *
 * **못 읽은 것과 너무 큰 것을 가른다.** 둘 다 500 으로 뭉뚱그리면 사용자는
 * 「서버가 터졌다」고 읽고 같은 파일을 계속 다시 올린다.
 */
async function readBody(req: Request): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; response: Response }
> {
  try {
    const bytes = await readBoundedBody(req, STYLE_REFERENCE_JSON_LIMIT);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: fail(400, "요청 형식이 올바르지 않습니다.") };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch (error) {
    return error instanceof BodyLimitError
      ? { ok: false, response: fail(413, `이미지 용량이 너무 큽니다. ${STYLE_REFERENCE_MAX_MB}MB 이하로 올려 주세요.`) }
      : { ok: false, response: fail(400, "요청 형식이 올바르지 않습니다.") };
  }
}

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

  const read = await readBody(req);
  if (!read.ok) return read.response;
  const body = read.body as { name?: string; source?: string; imageBase64?: string };

  const imageBase64 = String(body.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!imageBase64) return fail(400, "이미지가 없습니다.");

  /*
    **딱지를 믿지 않고 바이트를 본다.**

    화면이 준 `mimeType` 은 확장자에서 온 값이다. 그대로 쓰면 `.png` 라는
    이름의 JPEG 이 `image/png` 로 저장돼 브라우저가 못 여는 파일이 된다.
    그리고 그림이 아닌 바이트는 여기서 끝난다 — 전에는 그냥 창고에 올라가
    목록에 깨진 칸으로 남았다.
  */
  const bytes = Buffer.from(imageBase64, "base64");
  const inspected = await inspectUploadedImage(bytes);
  if (!inspected.ok) {
    return fail(inspected.reason === "too_many_pixels" ? 413 : 400, inspected.message);
  }

  try {
    const result = await registerUserStyleReference({
      userId: auth.member.userId,
      name: String(body.name || "레퍼런스"),
      source: body.source === "generated" ? "generated" : "upload",
      imageBase64,
      // 화면이 준 딱지가 아니라 **실제 바이트로 정한 값**이다.
      mimeType: inspected.mimeType,
    });

    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "레퍼런스를 등록하지 못했습니다." },
      { status: 500 },
    );
  }
}

/**
 * **삭제는 세 가지를 갈라 답한다**(C-10-c).
 *
 *   - 형식 오류(빈 본문 · id 없음 · UUID 아님) → **400**. 표에 물어볼 것도 없다
 *   - 있지만 내 것이 아님 → **404**. 성공이라고 답하면 지운 줄 안다
 *   - 없음(한 번도 없었거나 이미 지움) → **200, `deleted: false`**
 *
 * 마지막이 **멱등 삭제 정책**이다. 사용자가 원한 상태(그것이 없는 상태)가 이미
 * 이루어져 있으므로 오류가 아니다. 두 번 눌러도 같은 답을 준다.
 */
export async function DELETE(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const read = await readBody(req);
  if (!read.ok) return read.response;

  const id = String(read.body.id || "");
  if (!id) return fail(400, "id 가 없습니다.");
  if (!UUID.test(id)) return fail(400, "id 형식이 올바르지 않습니다.");

  try {
    /*
      **먼저 내 범위에서 지운다.** 지워졌으면 그것으로 끝이다.

      주인을 먼저 묻던 판은 정상 경로에서도 왕복이 한 번 더 들었고, 무엇보다
      **모든 삭제가 남의 행 존재 여부를 묻는 길**을 열어 두었다. 이 순서면
      그 질문은 지울 것이 없었을 때만 나간다.
    */
    const result = await deleteUserStyleReference(auth.member.userId, id);
    if (!result.ok) {
      return Response.json({ ok: false, message: result.message ?? "삭제하지 못했습니다." }, { status: 500 });
    }
    if (result.deleted) return Response.json({ ok: true, deleted: true });

    // 지울 것이 없었다. 남의 것이어서인가, 원래 없어서인가.
    const owner = await ownerOfStyleReference(id);
    return owner
      ? fail(404, "레퍼런스를 찾지 못했습니다.")
      : Response.json({ ok: true, deleted: false });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
