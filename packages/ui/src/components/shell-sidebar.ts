/**
 * 사이드바를 접고 펴는 규칙.
 *
 * 컴포넌트에서 떼어 둔 이유는 하나다 — 이 저장소에는 jsdom 이 없어서 화면을
 * 그려 볼 수 없다. 판단이 들어가는 부분만 여기 모아 두면 시험할 수 있다.
 */

/** 브라우저에 접힘 여부를 적어 두는 열쇠. */
export const SIDEBAR_STORE_KEY = "mcs.shell.sidebar";

/**
 * **기본값은 펴진 상태다.**
 *
 * 처음 온 사람에게 메뉴가 안 보이면 무엇을 할 수 있는 도구인지 알 길이 없다.
 * 접는 것은 넓게 쓰고 싶은 사람이 고르는 일이지, 처음부터 그럴 일이 아니다.
 */
export const SIDEBAR_DEFAULT_COLLAPSED = false;

const COLLAPSED = "collapsed";
const EXPANDED = "expanded";

/**
 * 적어 둔 값을 읽는다.
 *
 * 적힌 게 없거나 알 수 없는 글자면 **기본값으로 돌아간다.** 브라우저 저장소는
 * 사용자가 지울 수도 있고 다른 버전이 다른 글자를 남겼을 수도 있다. 그때
 * 화면이 안 그려지는 것보다 메뉴가 보이는 쪽이 낫다.
 */
export function collapsedFromStore(raw: string | null | undefined): boolean {
  if (raw === COLLAPSED) return true;
  if (raw === EXPANDED) return false;
  return SIDEBAR_DEFAULT_COLLAPSED;
}

/** 저장소에 적을 글자. `true`/`false` 대신 뜻이 보이는 말을 쓴다. */
export function storeFromCollapsed(collapsed: boolean): string {
  return collapsed ? COLLAPSED : EXPANDED;
}

/**
 * 단추에 붙일 이름.
 *
 * **지금 상태가 아니라 누르면 벌어질 일을 말한다.** 접힌 상태에서 「접기」라고
 * 읽어 주면 화면 낭독기를 쓰는 사람은 누를 이유를 못 찾는다.
 */
export function sidebarToggleLabel(collapsed: boolean): string {
  return collapsed ? "사이드바 펴기" : "사이드바 접기";
}

/**
 * 사이드바가 차지할 너비.
 *
 * 접히면 0 이 되고, 그만큼 본문이 넓어진다 — 본문은 남는 자리를 모두 쓰는
 * `minmax(0,1fr)` 이라 따로 늘려 줄 필요가 없다.
 */
export function shellSideWidth(collapsed: boolean): string {
  return collapsed ? "[--shell-side:0px]" : "[--shell-side:clamp(236px,15vw,300px)]";
}
