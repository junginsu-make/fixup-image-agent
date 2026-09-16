/**
 * 「과정 보기」 단추를 누구에게 내는가.
 *
 * 단추는 그 작업의 단계별 화면(`/sns/{id}`·`/poster/{id}`)으로 간다. 그 화면의
 * 데이터 경로는 RLS 를 타므로 **읽을 수 있는 사람에게만 내야 한다** — 못 읽는
 * 사람에게 내면 눌러서 「찾을 수 없습니다」를 보게 된다.
 *
 * 관리자는 서비스 키로 읽는 **별도 통로**가 있다
 * (`api/admin/works/[kind]/[id]`). 그래서 남의 작업에도 낸다.
 *
 * `isAdmin` 은 관리 목록을 받아 봐야 정해지므로 그 전에는 `null` 이다. 모를
 * 때는 **안 내는 쪽**으로 틀린다 — 잘못 내면 눌러서 오류를 보지만, 안 내면
 * 잠깐 뒤에 나타날 뿐이다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 규칙이라 시험에서 값으로 잰다 —
 * 이 저장소에는 jsdom 이 없어 컴포넌트를 렌더해서 잴 수 없다. `works-cover.ts`
 * 가 같은 이유로 갈라져 있다.
 */
export function canOpenSteps(work: { mine: boolean }, isAdmin: boolean | null): boolean {
  return work.mine || isAdmin === true;
}
