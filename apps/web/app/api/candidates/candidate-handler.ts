import { errorLogText } from "../../../lib/easy/log-text";
import type { CandidateStatus } from "./schema";
import { CandidatePatchSchema } from "./schema";

interface CandidatePatchService {
  updateStatus(id: string, status: CandidateStatus): Promise<unknown>;
}

export async function handleCandidatePatch(
  request: Request,
  id: string,
  service: CandidatePatchService,
) {
  const parsed = CandidatePatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: "후보 상태를 확인해 주세요.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const candidate = await service.updateStatus(id, parsed.data.status);
    return Response.json({ ok: true, candidate });
  } catch (error) {
    // 데이터베이스 원문은 서버 기록에만 남긴다(2026-10-07).
    console.error("[candidates] 상태 바꾸기 실패", errorLogText(error));
    return Response.json({ ok: false, message: "후보 상태를 바꾸지 못했습니다." }, { status: 500 });
  }
}
