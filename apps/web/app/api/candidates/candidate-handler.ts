import type { CandidatePatchStatus } from "./schema";
import { CandidatePatchSchema } from "./schema";

interface CandidatePatchService {
  updateStatus(id: string, status: CandidatePatchStatus): Promise<unknown>;
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
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "후보 상태를 바꾸지 못했습니다." },
      { status: 500 },
    );
  }
}
