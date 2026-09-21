import { authenticateApiMember } from "../../../../lib/membership/api";
import { createPdpJobRepository, isPdpJobsEnabled } from "../../../../lib/pdp/jobs";
import { jobNotFound, jobView } from "./view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **초안 id 로 자기 작업을 찾는다**(K-04, 설계 §8.1·§8.3).
 *
 * ── 왜 이 문이 필요한가 ────────────────────────────────────
 *
 * 탭을 닫았다 돌아온 사용자는 **작업 번호를 모른다.** 번호는 생성 응답에
 * 실려 오는데, **닫고 나간 경우가 바로 그 응답을 못 받은 경우다.** 그동안
 * 서버는 그림을 저장소에 올려 두었다.
 *
 * 이 문이 없으면 `GET /api/pdp/jobs/:id` 는 아무 화면도 못 부르는 문이고,
 * 사용자는 이미 값을 치른 그림을 다시 만들어 두 번 낸다 — 설계 §8 이 고치려는
 * 바로 그 손실이다.
 *
 * ── 조심할 것 ──────────────────────────────────────────────
 *
 * 들고 들어오는 것이 **자기 초안 id** 뿐이라, 사용자 대조를 저장소에 맡긴다.
 * 남의 문서면 `null` 이고 여기서는 404 다.
 *
 * 조회는 아무것도 만들지 않는다. 돈이 안 든다.
 */
export async function GET(req: Request) {
  /*
    **꺼져 있으면 있는 줄도 몰라야 한다**(설계 §15).

    작업 경로가 꺼져 있으면 서버는 작업을 아예 안 만든다 — 그래도 화면은
    빈 섹션이 있는 초안을 열 때마다 여기로 물어 왔고, 답은 **반드시 404**
    인데 그때마다 로그인 확인과 표 조회가 왕복했다.

    문을 지나기 전에 막는다. 켜기 전까지는 저장소에 손이 안 간다.
  */
  if (!isPdpJobsEnabled()) return jobNotFound();

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const query = new URL(req.url).searchParams;
  const documentId = (query.get("documentId") ?? "").trim();
  // 빈 값으로 훑지 않는다. 무엇을 찾는지 모르는 질의다.
  if (!documentId) {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "어느 작업인지 알 수 없습니다." },
      { status: 400 },
    );
  }

  /*
    **개정판을 안 보내면 0 이다.** 첫 개정판이 0 이라 그것이 기본이어야 한다.
    그런데 `Number(null)` 도 `Number("")` 도 0 이라, 안 보낸 것과 엉뚱한 글자를
    보낸 것이 같은 0 이 된다 — 그러면 구성을 다시 짠 뒤에 **옛 개정판의
    그림**이 온다. 그래서 값이 있을 때만 숫자로 읽고, 숫자가 아니면 거절한다.

    음수도 거절한다. 표에 `check (revision >= 0)` 이 있어 저장될 수 없는
    값이라 지금은 못 찾을 뿐이지만, 못 찾는 것과 **잘못 물은 것**은 다른
    일이다 — 400 으로 답해야 화면이 무엇이 틀렸는지 안다.
  */
  const raw = query.get("revision");
  // `Number("")` 도 0 이라 빈 값은 안 보낸 것과 같이 다뤄진다. 따로 안 막는다.
  const revision = raw === null ? 0 : Number(raw);
  if (!Number.isInteger(revision) || revision < 0) {
    return Response.json(
      { ok: false, code: "INVALID_REQUEST", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const job = await createPdpJobRepository().findLatestForDocument(auth.member.userId, documentId, revision);
  if (!job) return jobNotFound();

  return Response.json({ ok: true, job: await jobView(job) });
}
