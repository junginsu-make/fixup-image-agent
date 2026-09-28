/**
 * **그려진 설명서를 글로 뽑는다**(2026-09-23, 설계 §3).
 *
 * ── 왜 소스를 안 긁나 ──────────────────────────────────────
 *
 * 설명서의 **숫자가 본문에 없다.** `guide/credits/page.tsx` 는 손으로 적은
 * 숫자가 틀려 있던 사고(2026-09-21) 뒤로 **쓰는 그 함수로 그 자리에서
 * 셈한다.**
 *
 * ```tsx
 * function 한장당(model) { return creditUnits(unitPrice(model, "t2i", 기준크기)); }
 * ```
 *
 * 소스를 긁어 색인하면 봇은 「5장」이 아니라 `creditUnits(...)` 를 읽고
 * 그것을 사용자에게 옮긴다. 그래서 **그려진 것**을 긁는다.
 *
 * ── 왜 본문만인가 ──────────────────────────────────────────
 *
 * 화면에는 사이드바·머리말·꼬리말이 함께 그려진다. 통째로 넣으면 **모든
 * 조각에 메뉴 목록이 붙어** 어느 조각을 꺼내도 비슷해 보인다. 설명서
 * 레이아웃이 본문에 `data-guide-body` 를 달아 두었다.
 *
 * ── 여기는 순수하다 ────────────────────────────────────────
 *
 * 받아 오는 일은 스크립트가 한다. 이 파일은 **글 다듬기**만 해서 값으로
 * 잴 수 있게 둔다.
 */

/** 본문을 가리키는 표식. `app/guide/layout.tsx` 와 짝이다. */
const 표식 = "data-guide-body";

/** 글이 아닌 것. 통째로 버린다. */
const 버릴것 = ["script", "style", "svg", "noscript", "template"];

/** 줄을 바꿔야 읽히는 것. 여기서 줄바꿈을 넣는다. */
const 줄바꿈 = ["p", "div", "li", "tr", "br", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6"];

/**
 * 표식이 달린 칸의 안쪽만 잘라 낸다.
 *
 * **같은 이름의 태그가 겹쳐 있다.** 깊이를 세지 않으면 첫 번째 닫는 태그에서
 * 끊겨 본문의 앞부분만 가져온다.
 */
export function sliceGuideBody(html: string): string {
  const 자리 = html.indexOf(표식);
  if (자리 < 0) return "";

  const 여는곳 = html.lastIndexOf("<", 자리);
  if (여는곳 < 0) return "";

  const 이름 = /^<([a-zA-Z][\w-]*)/.exec(html.slice(여는곳))?.[1];
  if (!이름) return "";

  const 여는끝 = html.indexOf(">", 자리);
  if (여는끝 < 0) return "";

  const 여는태그 = new RegExp(`<${이름}[\\s>]`, "gi");
  const 닫는태그 = new RegExp(`</${이름}\\s*>`, "gi");
  let 깊이 = 1;
  let 자리표 = 여는끝 + 1;

  while (깊이 > 0 && 자리표 < html.length) {
    여는태그.lastIndex = 자리표;
    닫는태그.lastIndex = 자리표;
    const 연것 = 여는태그.exec(html);
    const 닫은것 = 닫는태그.exec(html);
    if (!닫은것) return html.slice(여는끝 + 1);

    if (연것 && 연것.index < 닫은것.index) {
      깊이 += 1;
      자리표 = 연것.index + 연것[0].length;
    } else {
      깊이 -= 1;
      if (깊이 === 0) return html.slice(여는끝 + 1, 닫은것.index);
      자리표 = 닫은것.index + 닫은것[0].length;
    }
  }
  return "";
}

const 실체 = (text: string) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** 태그를 걷고 글만 남긴다. */
export function htmlToText(html: string): string {
  let out = html;

  for (const tag of 버릴것) {
    out = out.replace(new RegExp(`<${tag}[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
    // 짝이 없는 것(`<br/>` 류)도 있다.
    out = out.replace(new RegExp(`<${tag}[^>]*/?>`, "gi"), " ");
  }

  /*
    **제목을 제목인 채로 남긴다.** 글만 뽑으면 「크레딧과 모델」과 그 아래
    문단이 한 줄로 붙어, 조각을 꺼냈을 때 무엇에 대한 글인지 알 수 없다.
  */
  out = out.replace(/<h([1-6])[^>]*>/gi, (_m, level: string) => `\n\n${"#".repeat(Number(level))} `);
  out = out.replace(/<\/h[1-6]\s*>/gi, "\n");

  // 표는 칸을 가른다. 안 가르면 숫자가 줄줄이 붙는다.
  out = out.replace(/<\/t[dh]\s*>/gi, " · ");

  for (const tag of 줄바꿈) {
    out = out.replace(new RegExp(`</?${tag}[^>]*>`, "gi"), "\n");
  }

  out = out.replace(/<[^>]+>/g, " ");
  out = 실체(out);

  return out
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").replace(/ · $/, "").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export interface GuideDocument {
  /** 조각마다 붙는 이름. 사용자에게 출처로 보여 준다. */
  name: string;
  /** 어디로 가면 되나. 답 아래 링크가 된다. */
  href: string;
  text: string;
}

/**
 * 한 쪽을 지식 한 덩이로.
 *
 * **빈 쪽은 안 만든다.** 못 긁었는데 껍데기만 넣으면, 검색에 걸려도 아무
 * 쓸모가 없는 조각이 지식 행세를 한다.
 */
export function guideDocumentFrom(input: { href: string; label: string; html: string }): GuideDocument | null {
  const text = htmlToText(sliceGuideBody(input.html));
  if (text.length < 40) return null;

  return {
    name: `이용 안내 · ${input.label}`,
    href: input.href,
    // 어느 쪽 글인지 첫 줄에 박아 둔다. 조각이 잘려도 출처를 잃지 않는다.
    text: `[이용 안내 · ${input.label}] (${input.href})\n${text}`,
  };
}
