/**
 * 법률 문서를 **화면에 걸 조각으로 나눈다.**
 *
 * 원문은 마크다운에 가까운 글이다(`#` 제목, `|` 표, `-` 목록). 마크다운
 * 라이브러리를 새로 들이지 않는다 — 여기서 쓰는 문법은 넷뿐이고, 라이브러리는
 * 이 넷 말고도 링크·이미지·HTML 을 함께 들여온다. 남이 쓴 글이 아니라 우리가
 * 쓴 법률 문서지만, 열어 둘 이유가 없는 문은 안 여는 편이 낫다.
 *
 * **화면 밖에서 나눈다.** 컴포넌트 안에서 문자열을 자르면 「표가 목록으로
 * 읽힌다」 같은 어긋남을 값으로 잴 수 없다.
 */

export type LegalBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

/** `| a | b |` 한 줄을 칸으로. 양끝의 빈 칸은 버린다. */
function cells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** `|---|---|` 처럼 구분선인가. 표의 머리와 몸통을 가르는 줄이다. */
function isDivider(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

export function parseLegal(body: string): LegalBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: LegalBlock[] = [];

  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push({ kind: "list", items: list });
    list = [];
  };

  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      continue;
    }

    if (isTableRow(trimmed)) {
      flush();
      const head = cells(trimmed);
      const rows: string[][] = [];
      let cursor = index + 1;

      // 구분선은 건너뛴다. 없으면 머리 없는 표로 본다.
      if (cursor < lines.length && isDivider(lines[cursor] ?? "")) cursor += 1;

      while (cursor < lines.length && isTableRow(lines[cursor] ?? "")) {
        rows.push(cells(lines[cursor] ?? ""));
        cursor += 1;
      }

      blocks.push({ kind: "table", head, rows });
      index = cursor - 1;
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]!.trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flush();
  return blocks;
}
