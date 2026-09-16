import { reachableBeforeCreate } from "./steps";
import {
  adoptPosterReferences, posterSeed, type AdoptedReference, type PosterSeed,
} from "./rerun-seed";

/**
 * 지난 단계로 돌아왔을 때 **그 작업의 값을 불러와 씨앗을 만든다.**
 *
 * 화면 효과 안에 적혀 있던 것을 여기로 뺐다. 원문을 훑는 시험으로는 조건을
 * 뒤집거나 호출을 가지 밖으로 옮겨도 못 잡았다 — 독립 리뷰가 실증했다
 * (2026-09-16). 요청을 주입받으므로 **실제로 무엇이 어떤 차례로 불렸는지**를
 * 값으로 잰다(`__tests__/rerun-load.test.ts`).
 *
 * **`server-only` 를 붙이지 않는다.** 화면이 부르는 순수한 흐름이다.
 */

export interface RerunDeps {
  get(url: string): Promise<{ status: number; body: unknown }>;
  post(url: string): Promise<unknown>;
  /** 지금 내가 볼 수 있는 참고 이미지 id. **복사한 다음에** 부른다. */
  loadVisible(): Promise<Set<string>>;
}

export type PosterRerunResult = { ok: true; seed: PosterSeed } | { ok: false };

function okBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && (body as { ok?: unknown }).ok === true
    ? body as Record<string, unknown>
    : null;
}

/** 복사 응답에서 쓸 수 있는 것만 고른다. 망가져 있으면 빈 목록이다. */
function copiesOf(body: unknown): AdoptedReference[] {
  const copies = okBody(body)?.copies;
  if (!Array.isArray(copies)) return [];
  return copies.filter((copy): copy is AdoptedReference =>
    Boolean(copy) && typeof copy === "object"
    && typeof (copy as AdoptedReference).from === "string"
    && typeof (copy as AdoptedReference).id === "string");
}

export async function loadPosterRerun(from: string, deps: RerunDeps): Promise<PosterRerunResult> {
  const id = encodeURIComponent(from);

  const member = await deps.get(`/api/poster/projects/${id}`);
  let original = okBody(member.body)?.project as Record<string, unknown> | undefined;
  let adopted: AdoptedReference[] = [];

  /*
    **회원용 길이 404 일 때만** 관리자 통로로 간다. 500 같은 다른 오류는
    「남의 것」이 아니라 「고장」이다.
  */
  if (!original && member.status === 404) {
    const admin = okBody((await deps.get(`/api/admin/works/poster/${id}`)).body);
    original = admin?.work as Record<string, unknown> | undefined;
    /*
      **남의 작업을 읽었을 때만** 그림을 복사해 온다. 붙였던 그림이 그 회원
      것이라 관리자 목록에 없어서 02 가 통째로 비었다(2026-09-16 운영 데이터로
      확인). 관리자가 아니면 여기까지 못 온다 — 위에서 403 이다.
      실패해도 멈추지 않는다. 그 그림들은 빠진 수로 세어져 화면이 말한다.
    */
    if (original) {
      try {
        adopted = copiesOf(await deps.post(`/api/admin/works/poster/${id}/references`));
      } catch {
        adopted = [];
      }
    }
  }

  if (!original) return { ok: false };

  // **복사한 다음에** 목록을 읽는다. 먼저 읽으면 복사본이 없어 전부 빠진다.
  const visible = await deps.loadVisible();
  const data = (original.data ?? {}) as Parameters<typeof adoptPosterReferences>[0];
  const project = { ...original, data: adoptPosterReferences(data, adopted) };
  return { ok: true, seed: posterSeed(project as Parameters<typeof posterSeed>[0], visible) };
}

export type RerunJump = { kind: "step"; id: string } | { kind: "go"; href: string } | null;

/**
 * 새 작업 화면의 단계 막대에서 **이 단계를 누르면 어디로 가나.** `null` 이면 못 간다.
 *
 * 04·05 는 작업을 만든 뒤에 생긴다. 그런데 이미 만든 작업에서 넘어온 사람은 그
 * 작업의 기획·결과가 있어서, 막아 두니 돌아갈 길이 없었다(2026-09-16 사용자 보고).
 *
 * **값을 못 불러왔으면 열지 않는다.** 남의 id 를 주소에 친 회원에게 열면, 누르는
 * 순간 열 수 없는 작업으로 간다(2026-09-16 리뷰).
 */
export function posterRerunJump(
  id: string,
  context: { rerunFrom: string; seeded: boolean },
): RerunJump {
  if (reachableBeforeCreate(id)) return { kind: "step", id };
  if (!context.rerunFrom || !context.seeded) return null;

  const back = `/poster/${encodeURIComponent(context.rerunFrom)}`;
  if (id === "plan") return { kind: "go", href: `${back}?view=plan` };
  if (id === "result") return { kind: "go", href: back };
  return null;
}
