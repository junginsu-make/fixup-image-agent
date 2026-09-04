import { authenticateApiAdmin } from "../../../../lib/membership/api";
import {
  ShowcaseCreateSchema,
  ShowcaseDeleteSchema,
  ShowcasePatchSchema,
} from "../core";
import {
  addShowcaseItem,
  listShowcaseForAdmin,
  patchShowcaseItem,
  removeShowcaseItem,
} from "../store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 원본을 내려받아 복사본을 뜬다. 큰 그림이면 몇 초 걸린다.
export const maxDuration = 60;

/**
 * 첫 화면 갤러리를 관리한다. **관리자만.**
 *
 * 공개 목록(`/api/showcase`)과 주소를 나눈 이유는 하나다. 한 주소에서
 * 물음표 하나로 "전부"와 "공개된 것"이 갈리면, 언젠가 그 조건이 어긋나
 * 꺼 놓은 것이 공개된다. 아예 다른 문으로 둔다.
 */

function failed(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

/** 꺼 놓은 것까지 전부. 다시 켜려면 보여야 한다. */
export async function GET() {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    return Response.json({ ok: true, items: await listShowcaseForAdmin() });
  } catch (error) {
    return failed(messageOf(error), 500);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    const input = ShowcaseCreateSchema.parse(await request.json());
    const result = await addShowcaseItem(input, auth.member.userId);
    return result.ok ? Response.json(result) : failed(result.message);
  } catch (error) {
    return failed(messageOf(error));
  }
}

/** 켜고 끄기·설명·차례를 고친다. 보낸 칸만 바뀐다. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    const input = ShowcasePatchSchema.parse(await request.json());
    const result = await patchShowcaseItem(input);
    return result.ok ? Response.json(result) : failed(result.message, 500);
  } catch (error) {
    return failed(messageOf(error));
  }
}

/** 갤러리에서 완전히 내린다. 복사본 파일도 함께 사라진다. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiAdmin();
  if (!auth.ok) return auth.response;
  try {
    const { id } = ShowcaseDeleteSchema.parse(await request.json());
    const result = await removeShowcaseItem(id);
    return result.ok ? Response.json(result) : failed(result.message, 404);
  } catch (error) {
    return failed(messageOf(error));
  }
}
