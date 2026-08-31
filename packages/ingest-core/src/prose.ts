/**
 * 수집한 글을 사람이 읽는 산문으로 바꾸고, 문단을 지키며 나눈다.
 *
 * 조사 AI 는 마크다운으로 답한다(`## 소제목`, `**강조**`, `---`). 그 기호가 그대로 남으면
 * 두 곳에서 문제가 된다. 화면에서는 사용자가 기호를 읽어야 하고, 기획 단계에서는 기호가
 * 카드 문구에 섞여 들어간다. 그래서 저장 전에 한 번 걷어낸다.
 *
 * 의존성이 없는 순수 문자열 모듈이다. 서버(수집)와 화면(모달) 양쪽에서 같은 함수를 쓴다.
 */

/** 문단 사이는 빈 줄 하나로 통일한다. */
const PARAGRAPH_BREAK = "\n\n";

/**
 * 조각 하나의 최대 길이. 조각은 기획 AI 가 주장에 출처를 붙이는 단위이기도 해서, 한 조각이
 * 지나치게 길면 출처가 뭉뚱그려진다. 문단 경계를 지키느라 이 값보다 짧게 끊길 수 있다.
 */
export const MAX_SEGMENT_LENGTH = 1000;

/**
 * 이미 줄바꿈이 사라진 글에서도 문단을 되살린다.
 *
 * 예전에 수집한 자료는 `\s+ -> " "` 로 뭉개져 저장돼 있어 `--- ## 카드 2.` 처럼 표제 기호가
 * 문장 한가운데 박혀 있다. 기호 앞에서 줄을 끊어 주면 그 자료도 문단으로 읽힌다.
 * 표제 문구가 어디서 끝나는지는 줄바꿈이 사라진 뒤에는 알 수 없으므로 추측하지 않는다.
 */
function restoreBlockBreaks(text: string): string {
  return text
    .replace(/[ \t]+(#{1,6}[ \t])/g, "\n$1")
    .replace(/[ \t]+(-{3,})(?=[ \t]|$)/gm, "\n$1\n");
}

/** `**강조**` 처럼 읽는 데 방해만 되는 기호를 없앤다. 한국어 산문에 `**` 가 뜻을 갖는 경우는 없다. */
function stripEmphasis(text: string): string {
  return text.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/\*\*/g, "");
}

export function toReadableProse(text: string): string {
  const lines: string[] = [];

  for (const raw of restoreBlockBreaks(text.replace(/\r\n?/g, "\n")).split("\n")) {
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line)) {
      lines.push("");
      continue;
    }

    const heading = line.match(/^#{1,6}[ \t]+(.*)$/);
    if (heading) {
      // 소제목은 앞뒤로 한 줄씩 띄워야 본문과 구별된다.
      lines.push("", heading[1]!.trim(), "");
      continue;
    }

    const bullet = line.match(/^[-*•][ \t]+(.*)$/);
    lines.push(bullet ? `· ${bullet[1]!.trim()}` : line);
  }

  return stripEmphasis(lines.join("\n"))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, PARAGRAPH_BREAK)
    .trim();
}

/** 문장 끝에서만 자른다. 문장 하나가 상한보다 길면 그때만 글자 수로 자른다. */
function splitParagraph(paragraph: string, maxLength: number): string[] {
  if (paragraph.length <= maxLength) return [paragraph];

  const pieces: string[] = [];
  let current = "";

  for (const sentence of paragraph.split(/(?<=[.!?…])\s+/)) {
    if (sentence.length > maxLength) {
      if (current) pieces.push(current);
      current = "";
      for (let start = 0; start < sentence.length; start += maxLength) {
        pieces.push(sentence.slice(start, start + maxLength));
      }
      continue;
    }
    if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= maxLength) current = `${current} ${sentence}`;
    else {
      pieces.push(current);
      current = sentence;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

/**
 * 문단 경계를 지키며 나눈다.
 *
 * 예전에는 800자마다 기계적으로 잘라서 조각이 문장 한가운데서 끊겼다. 화면에서 읽기 어려울
 * 뿐 아니라, 기획 AI 도 반쪽짜리 주장을 받게 된다.
 */
export function splitIntoReadableChunks(text: string, maxLength: number): string[] {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    for (const piece of splitParagraph(paragraph, maxLength)) {
      if (!current) current = piece;
      else if (current.length + PARAGRAPH_BREAK.length + piece.length <= maxLength) {
        current = `${current}${PARAGRAPH_BREAK}${piece}`;
      } else {
        chunks.push(current);
        current = piece;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
