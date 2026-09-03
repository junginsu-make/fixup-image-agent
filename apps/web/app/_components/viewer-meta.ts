/**
 * 모달에 그림과 함께 보여줄 설명.
 *
 * 어떻게 만든 것인지는 그림만 봐서는 모른다 — 어느 모델로, 어떤 비율로,
 * 무슨 지시로 만들었는지. 크게 봤을 때가 그걸 확인하기 제일 좋은 자리다.
 *
 * **그림에 붙여 둔다.** 모달은 화면 전체에서 하나뿐이고 아무 그림에서나
 * 열리므로, 화면마다 값을 넘겨받게 하면 어딘가는 반드시 빠진다.
 *
 *   <img data-zoomable data-viewer-meta='{"모델":"GPT Image 2","비율":"4:5"}' />
 *
 * 화면에서 읽는 값이라 언제든 깨질 수 있다. 깨졌다고 모달이 안 열리면 안 되므로
 * 이상하면 조용히 아무것도 안 보여준다.
 */

export type ViewerMeta = Array<[string, string]>;

/** 프롬프트는 몇 백 자가 넘는다. 그대로 두면 그림보다 글이 커진다. */
const MAX_VALUE = 800;

export function parseViewerMeta(raw: string | null | undefined): ViewerMeta {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  return Object.entries(parsed).flatMap(([name, value]) => {
    if (value === null || value === undefined || value === "") return [];
    const text = String(value);
    if (!text.trim()) return [];
    return [[name, text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text] as [string, string]];
  });
}
