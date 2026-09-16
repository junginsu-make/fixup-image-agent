import { describe, expect, it } from "vitest";
import { fetchRerunDeps } from "../rerun-fetch";

/**
 * 지난 단계 값 불러오기가 **실제로 서버에 묻는 부분.**
 *
 * 흐름(`loadPosterRerun`·`loadSnsRerun`)은 가짜 요청으로 쟀지만, 가짜를 넣으니
 * **진짜 요청을 만드는 부분은 아무도 안 봤다.** 독립 리뷰가 두 가지를 실증했다
 * (2026-09-16).
 *
 * - `status: response.status` 를 `status: 200` 으로 바꿔도 초록 — 그러면 회원용
 *   404 가 관리자 통로로 절대 안 넘어가 남의 작업이 전부 「불러오지 못했습니다」
 * - POST 응답을 버리고 `null` 을 돌려줘도 초록 — 복사본이 늘 비어 02 빈칸이 돌아옴
 */
function 가짜fetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("get", () => {
  it("**상태 번호를 그대로 넘긴다** — 404 가 관리자 통로로 가는 열쇠다", async () => {
    const { fetchImpl } = 가짜fetch(() => json(404, { ok: false }));

    expect(await fetchRerunDeps(fetchImpl).get("/x")).toEqual({ status: 404, body: { ok: false } });
  });

  it("본문을 그대로 넘긴다", async () => {
    const { fetchImpl } = 가짜fetch(() => json(200, { ok: true, project: { title: "가을" } }));

    expect((await fetchRerunDeps(fetchImpl).get("/x")).body).toEqual({ ok: true, project: { title: "가을" } });
  });

  it("캐시를 쓰지 않는다 — 방금 고친 작업의 옛 값이 오면 안 된다", async () => {
    const { fetchImpl, calls } = 가짜fetch(() => json(200, {}));

    await fetchRerunDeps(fetchImpl).get("/x");

    expect(calls[0]!.init).toMatchObject({ cache: "no-store" });
  });

  it("본문이 JSON 이 아니면 본문만 비우고 상태는 넘긴다", async () => {
    const { fetchImpl } = 가짜fetch(() => new Response("<html>", { status: 502 }));

    expect(await fetchRerunDeps(fetchImpl).get("/x")).toEqual({ status: 502, body: null });
  });

  it("네트워크가 끊기면 상태 0 — 404 로 오해하지 않는다", async () => {
    const { fetchImpl } = 가짜fetch(() => { throw new Error("끊김"); });

    expect(await fetchRerunDeps(fetchImpl).get("/x")).toEqual({ status: 0, body: null });
  });
});

describe("post", () => {
  it("**POST 로 보내고 본문을 그대로 돌려준다**", async () => {
    const { fetchImpl, calls } = 가짜fetch(() => json(200, { ok: true, copies: [{ from: "a", id: "b" }] }));

    const body = await fetchRerunDeps(fetchImpl).post("/copy");

    expect(calls[0]!.init).toMatchObject({ method: "POST" });
    expect(body).toEqual({ ok: true, copies: [{ from: "a", id: "b" }] });
  });

  it("**본문을 안 보낸다** — 복사할 그림은 서버가 작업 기록에서 정한다", async () => {
    const { fetchImpl, calls } = 가짜fetch(() => json(200, {}));

    await fetchRerunDeps(fetchImpl).post("/copy");

    expect(calls[0]!.init?.body).toBeUndefined();
  });

  it("본문이 JSON 이 아니면 null", async () => {
    const { fetchImpl } = 가짜fetch(() => new Response("oops", { status: 500 }));

    expect(await fetchRerunDeps(fetchImpl).post("/copy")).toBeNull();
  });
});
