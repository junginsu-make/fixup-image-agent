/**
 * 지난 단계 값 불러오기가 **실제로 서버에 묻는 부분.**
 *
 * 흐름(`poster/rerun-load.ts`·`sns/rerun-load.ts`)은 요청을 주입받아 값으로 잰다.
 * 그런데 화면 안에 요청 코드를 적어 두니 **그 부분은 아무도 안 봤다** —
 * `status` 를 200 으로 박거나 POST 응답을 버려도 초록이었다(2026-09-16 독립 리뷰).
 * 그래서 여기로 빼서 가짜 `fetch` 로 잰다(`__tests__/rerun-fetch.test.ts`).
 *
 * 이미지 만들기와 카드뉴스가 같이 쓴다 — 따로 적으면 한쪽만 고쳐진다.
 */

export interface RerunFetchDeps {
  get(url: string): Promise<{ status: number; body: unknown }>;
  post(url: string): Promise<unknown>;
}

export function fetchRerunDeps(fetchImpl: typeof fetch = (...args) => fetch(...args)): RerunFetchDeps {
  return {
    async get(url) {
      try {
        const response = await fetchImpl(url, { cache: "no-store" });
        /*
          **상태 번호를 그대로 넘긴다.** 404 가 「남의 작업일 수 있으니 관리자
          통로로 묻는다」의 열쇠다. 본문이 JSON 이 아니어도 상태는 살린다.
        */
        return { status: response.status, body: await response.json().catch(() => null) };
      } catch {
        // 끊겼으면 0 이다. 404 로 오해해서 관리자 통로로 넘어가지 않는다.
        return { status: 0, body: null };
      }
    },
    async post(url) {
      // 본문을 안 보낸다 — 복사할 그림은 서버가 작업 기록에서 정한다.
      const response = await fetchImpl(url, { method: "POST" });
      return response.json().catch(() => null);
    },
  };
}
