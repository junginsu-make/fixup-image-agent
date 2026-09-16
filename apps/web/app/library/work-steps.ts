/**
 * 「과정 보기」 단추를 누구에게 내는가.
 *
 * 단추는 그 작업의 단계별 화면(`/sns/{id}`·`/poster/{id}`)으로 간다. 그 화면의
 * 데이터 경로는 RLS 를 타므로 **읽을 수 있는 사람에게만 내야 한다** — 못 읽는
 * 사람에게 내면 눌러서 「찾을 수 없습니다」를 보게 된다.
 *
 * 관리자가 남의 작업을 읽는 길은 2단계에서 열린다. 그때까지는 내 것만.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 시험에서 값으로 잰다 —
 * 이 저장소에는 jsdom 이 없어 컴포넌트를 렌더해서 잴 수 없다. `works-cover.ts`
 * 가 같은 이유로 갈라져 있다.
 */
export function canOpenSteps(work: { mine: boolean }, _isAdmin: boolean | null): boolean {
  return work.mine;
}
