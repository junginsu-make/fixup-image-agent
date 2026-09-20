/**
 * **모델이 준 글에서 JSON 을 꺼낸다.**
 *
 * ── 무엇이 문제였나 (D-5) ────────────────────────────────────
 *
 * 모델은 JSON 만 달라고 해도 앞뒤에 말을 붙이거나, 답을 끝까지 못 쓰고 잘린
 * 채로 준다. 그래서 「그럴듯한 조각」을 찾아 주는 함수가 필요하다.
 *
 * 그런데 쓰던 판은 **끝에서부터 한 글자씩 줄여 가며 매번 `JSON.parse` 를 다시
 * 돌렸다.** 길이의 제곱이다. 멀쩡한 답은 첫 시도에 통과하니 아무도 몰랐고,
 * **잘린 답에서만** 터진다 — 하필 가장 급할 때다.
 *
 * 실측(2026-09-20, 닫히지 않은 설계도):
 *
 *   10KB   125ms · 25KB 627ms · 50KB 2,274ms · **100KB 12,100ms**
 *
 * 기획 응답 상한이 32,768토큰이라 100KB 짜리 잘린 답은 드물지 않다. 그 12초는
 * **아무것도 못 찾고** 끝나고, 그동안 Node 는 한 요청에 묶인다.
 *
 * 설계 §14.4(D-5): 「동일 입력 계측, **선형 parser 로** 수정」.
 *
 * ── 지금 판 ──────────────────────────────────────────────────
 *
 * 한 번만 훑는다. 괄호 깊이를 세다가 0 으로 돌아오는 자리가 **첫 번째 온전한
 * 값의 끝**이다. 거기서 한 번만 `JSON.parse` 한다.
 *
 * **글자 안은 세지 않는다.** `{"a":"}"}` 의 닫는 괄호는 값이 아니라 글자다.
 * 깊이만 세는 판은 여기서 한 글자 일찍 끝내고 못 읽는다.
 */
export function extractJsonCandidate(input: string): string | null {
  if (!input) return null;

  const objectStart = input.indexOf("{");
  const arrayStart = input.indexOf("[");
  const starts = [objectStart, arrayStart].filter((value) => value >= 0);
  if (!starts.length) return null;

  const start = Math.min(...starts);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index]!;

    if (inString) {
      // 역슬래시 다음 한 글자는 무슨 글자든 값이 아니다.
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth > 0) continue;
      /*
        닫혔다. **여기서 딱 한 번 읽어 본다.**

        괄호 균형만 보고 돌려주면 `{그냥 글자}` 같은 것이 통과해 부르는 쪽이
        `JSON.parse` 에서 터진다. 이 함수의 약속은 「읽히는 조각」이다.
      */
      const candidate = input.slice(start, index + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        return null;
      }
    }
  }

  // 끝까지 안 닫혔다. 잘린 답이다.
  return null;
}
