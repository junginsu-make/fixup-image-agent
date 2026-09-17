import { authenticateApiMember } from "../../../../../lib/membership/api";
import { createPdpJobRepository, outcomeOf } from "../../../../../lib/pdp/jobs";
import { signJobArtifacts } from "../../../../../lib/pdp/jobs/artifact-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 만들어 둔 작업 하나를 되찾는다.
 *
 * 탭을 닫았다 돌아온 사용자가 여기서 결과를 찾는다. **조회는 아무것도 만들지
 * 않는다** — 저장소를 읽고 그림 주소를 서명할 뿐이라 돈이 안 든다(설계 §8.3).
 *
 * 남의 것이면 **404** 다. 「권한 없음」으로 답하면 그 id 가 있다는 사실을
 * 알려 주는 셈이 된다.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const job = await createPdpJobRepository().get(id, auth.member.userId);
  if (!job) {
    return Response.json({ ok: false, code: "NOT_FOUND", message: "작업을 찾지 못했습니다." }, { status: 404 });
  }

  // 저장된 것만 주소를 만든다. 못 올린 섹션은 가리킬 자리가 없다.
  const paths = job.items.map((item) => item.outputPath).filter((path): path is string => Boolean(path));
  const signed = await signJobArtifacts(paths);

  return Response.json({
    ok: true,
    job: {
      id: job.id,
      documentId: job.documentId,
      revision: job.revision,
      operation: job.operation,
      /** 사용자에게 보여줄 한마디. 화면이 같은 말을 여러 곳에서 짓지 않게 한다. */
      outcome: outcomeOf(job.state),
      state: job.state,
      items: job.items.map((item) => ({
        sectionId: item.sectionId,
        attempt: item.attempt,
        // 못 올렸으면 `null` 이다. 없는 자리를 가리키지 않는다.
        url: item.outputPath ? (signed[item.outputPath] ?? null) : null,
        errorCode: item.errorCode ?? null,
      })),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
  });
}
