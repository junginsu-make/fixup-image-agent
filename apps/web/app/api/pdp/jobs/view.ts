import { outcomeOf } from "../../../../lib/pdp/jobs";
import type { JobRecord } from "../../../../lib/pdp/jobs";
import { signJobArtifacts } from "../../../../lib/pdp/jobs/artifact-urls";

/**
 * 작업 하나를 화면이 읽을 모양으로 바꾼다.
 *
 * **두 문이 같은 모양을 준다.** 번호로 찾는 문(`[id]`)과 초안으로 찾는 문
 * (`?documentId=`)이 각자 조립하면, 한쪽에 칸을 더할 때 다른 쪽이 조용히
 * 뒤처진다 — 화면은 어느 문으로 들어왔는지에 따라 다른 것을 본다.
 */
export async function jobView(job: JobRecord) {
  // 저장된 것만 주소를 만든다. 못 올린 섹션은 가리킬 자리가 없다.
  const paths = job.items.map((item) => item.outputPath).filter((path): path is string => Boolean(path));
  const signed = await signJobArtifacts(paths);

  return {
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
  };
}

/** 없을 때의 답. 「권한 없음」으로 답하면 그 id 가 있다는 사실을 알려 주는 셈이다. */
export function jobNotFound(): Response {
  return Response.json({ ok: false, code: "NOT_FOUND", message: "작업을 찾지 못했습니다." }, { status: 404 });
}
