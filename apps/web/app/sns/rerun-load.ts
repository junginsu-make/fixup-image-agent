import { snsSeed, type AdoptedAttachment, type SnsSeed } from "./rerun-seed";

/**
 * 카드뉴스를 지난 단계로 돌아왔을 때 **그 작업의 값을 불러와 씨앗을 만든다.**
 *
 * 화면 효과 안에 적혀 있던 것을 여기로 뺐다 — 원문을 훑는 시험으로는 조건을
 * 뒤집어도 못 잡았다(2026-09-16 독립 리뷰가 실증). 요청을 주입받아 **실제로
 * 무엇이 불렸는지**를 값으로 잰다(`__tests__/rerun-load.test.ts`).
 */

export interface SnsRerunDeps {
  get(url: string): Promise<{ status: number; body: unknown }>;
  post(url: string): Promise<unknown>;
}

export type SnsRerunResult = { ok: true; seed: SnsSeed } | { ok: false };

function okBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && (body as { ok?: unknown }).ok === true
    ? body as Record<string, unknown>
    : null;
}

/** 복사 응답에서 쓸 수 있는 것만 고른다. 망가져 있으면 빈 목록이다. */
function copiesOf(body: unknown): AdoptedAttachment[] {
  const copies = okBody(body)?.copies;
  if (!Array.isArray(copies)) return [];
  return copies.filter((copy): copy is AdoptedAttachment =>
    Boolean(copy) && typeof copy === "object"
    && typeof (copy as AdoptedAttachment).from === "string"
    && typeof (copy as AdoptedAttachment).id === "string"
    && typeof (copy as AdoptedAttachment).storagePath === "string");
}

export async function loadSnsRerun(from: string, deps: SnsRerunDeps): Promise<SnsRerunResult> {
  const id = encodeURIComponent(from);

  /*
    **작업 한 건은 `/plan` 이 준다.** `/api/sns/projects/{id}` 에는 GET 이 없다
    (DELETE 뿐이다) — 그리로 보내면 405 가 오고, 404 가 아니라서 관리자 통로로
    넘어가지도 못한다.
  */
  const member = await deps.get(`/api/sns/projects/${id}/plan`);
  let project = okBody(member.body)?.project as Record<string, unknown> | undefined;
  let mine = true;
  let adopted: AdoptedAttachment[] = [];

  if (!project && member.status === 404) {
    project = okBody((await deps.get(`/api/admin/works/sns/${id}`)).body)?.work as
      Record<string, unknown> | undefined;
    // 관리자 통로로 온 것은 늘 남의 것이다. 내 것이면 회원용 길에서 열렸다.
    mine = false;
    /*
      **남의 작업을 읽었을 때만** 첨부를 관리자 라이브러리로 복사해 온다. 그대로는
      못 싣고(경로 첫 칸이 그 회원 id 다), 빼기만 하면 02 가 통째로 빈다.
    */
    if (project) {
      try {
        adopted = copiesOf(await deps.post(`/api/admin/works/sns/${id}/references`));
      } catch {
        adopted = [];
      }
    }
  }

  if (!project) return { ok: false };
  return { ok: true, seed: snsSeed(project as Parameters<typeof snsSeed>[0], mine, adopted) };
}

const BEFORE_CREATE = new Set(["content", "images", "spec"]);

export type SnsRerunJump = { kind: "step"; id: string } | { kind: "go"; href: string } | null;

/**
 * 새 카드뉴스 화면의 단계 막대에서 **이 단계를 누르면 어디로 가나.** `null` 이면 못 간다.
 *
 * 04·05 는 전에 그냥 눌려 없는 단계로 바뀌고 화면이 비었다. 돌아온 길이고 값을
 * 불러왔을 때만 원래 작업으로 보낸다 — 그 작업의 원고와 결과가 거기 있다.
 */
export function snsRerunJump(
  id: string,
  context: { rerunFrom: string; seeded: boolean },
): SnsRerunJump {
  if (BEFORE_CREATE.has(id)) return { kind: "step", id };
  if (!context.rerunFrom || !context.seeded) return null;
  if (id === "copy" || id === "result") {
    return { kind: "go", href: `/sns/${encodeURIComponent(context.rerunFrom)}` };
  }
  return null;
}
