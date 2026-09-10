/**
 * 이름 뒤에 붙는 **조사를 받침에 맞춰 고른다.**
 *
 * 모델 이름을 「Nano Banana」에서 「경제형」으로 바꾸면서 필요해졌다. 영문
 * 이름일 때는 어차피 다 어색해서 `은`·`로` 하나로 버텼는데, 한글 이름에서는
 * **틀린 것이 바로 눈에 띈다** — 「경제형 은 … 표준형 로 만듭니다」.
 *
 * 한글 음절은 유니코드에서 `가`(0xAC00)부터 28개씩 묶여 있고, 그 묶음 안의
 * 순서가 받침이다. 나머지가 0이면 받침이 없다.
 *
 * 한글이 아닌 글자(영문·숫자)로 끝나면 **받침이 있는 쪽**으로 본다. 「GPT Image 2 는」
 * 보다 「GPT Image 2 은」이 덜 어색해서가 아니라, 옛 이름이 남아 있는 자리에서
 * 지금까지의 문장과 같게 두기 위해서다.
 */

const 한글_시작 = 0xac00;
const 한글_끝 = 0xd7a3;
const 음절당_받침수 = 28;

/** 마지막 글자에 받침이 있는가. */
export function hasFinalConsonant(word: string): boolean {
  const 마지막 = word.trimEnd().slice(-1);
  if (!마지막) return true;

  const code = 마지막.charCodeAt(0);
  if (code < 한글_시작 || code > 한글_끝) return true;

  return (code - 한글_시작) % 음절당_받침수 !== 0;
}

/** `은/는`, `이/가`, `을/를`, `으로/로`, `과/와` 를 받침에 맞춰 고른다. */
export function withJosa(word: string, pair: "은는" | "이가" | "을를" | "으로로" | "과와"): string {
  const 받침 = hasFinalConsonant(word);
  const 표 = {
    은는: ["은", "는"],
    이가: ["이", "가"],
    을를: ["을", "를"],
    으로로: ["으로", "로"],
    과와: ["과", "와"],
  } as const;

  return `${word}${표[pair][받침 ? 0 : 1]}`;
}
