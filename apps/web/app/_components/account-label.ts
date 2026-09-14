/**
 * 로그인한 계정을 화면에 어떻게 적을지.
 *
 * 이메일이 배지의 마우스오버 설명에만 숨어 있었다. 마우스를 올려 봐야 알 수
 * 있으면 없는 것과 같고, 관리자 계정이 둘이 되면서 **지금 어느 쪽으로 들어와
 * 있는지 모르는 채로 남의 자료를 만질 위험**이 생겼다.
 *
 * 판단만 여기 둔다 — 이 저장소에는 jsdom 이 없어 화면을 그려 볼 수 없다.
 */

/**
 * 이메일의 앞부분(@ 앞).
 *
 * 좁은 화면에서는 주소 전체가 안 들어간다. 그때는 앞부분만 보여 준다 —
 * `ai.dev` 와 `9843ohs` 는 그것만으로도 갈린다.
 *
 * `@` 가 없거나 맨 앞에 있으면 **자르지 않고 그대로 돌려준다.** 빈 글자를
 * 내놓으면 화면에 아무것도 안 남아, 로그인을 안 한 것처럼 보인다.
 */
export function emailLocalPart(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;
  return trimmed.slice(0, at);
}

/**
 * 화면 낭독기에 읽어 줄 말.
 *
 * 주소만 덩그러니 읽어 주면 그것이 무엇인지 모른다. 무엇의 주소인지 붙인다.
 */
export function accountAriaLabel(email: string): string {
  return `현재 로그인한 계정: ${email}`;
}
