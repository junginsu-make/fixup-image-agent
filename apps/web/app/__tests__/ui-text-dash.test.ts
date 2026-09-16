import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **화면 문구에 줄표(—)를 쓰지 않는다.**
 *
 * 사용자가 읽기 어렵다고 했다(2026-09-16). 「A — B」 대신 「A. B」로 끊는다.
 *
 * ── 무엇은 세고 무엇은 안 세나 ─────────────────────────
 *
 * **주석은 안 센다.** 개발자가 읽는 글이고, 이 저장소는 주석에 줄표를 널리
 * 쓴다(270줄 넘는다). 사용자 요청은 화면 텍스트였다.
 *
 * **영문은 안 센다.** `packages/` 의 줄표는 대부분 **모델에 보내는 프롬프트**다
 * (「The polish of a major animation studio release — never a game-engine
 * screenshot」). 건드리면 그림이 달라진다. 화면 문구가 아니다.
 *
 * 그래서 **한글이 같은 줄에 있는 것만** 센다. 화면에 나가는 우리말이라는 뜻이다.
 *
 * **「값 없음」 표시도 안 센다.** 표의 빈 칸에 줄표 하나만 넣는 것은 이 저장소가
 * 여러 곳에서 쓰는 관례다(`CostPanel`·`inbox`·`credits`). 문장을 잇는 줄표와
 * 다른 용법이라 「A. B」로 바꿀 수가 없다 — 빈 칸에 마침표만 남는다.
 *
 * ── 왜 값으로 재 두나 ──────────────────────────────────
 *
 * 줄표는 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고 시험도 다 통과한다.
 * 그래서 다시 스며든다 — 값으로 재 두지 않으면.
 */

const WEB = join(__dirname, "..", "..");

/** 줄표를 쓰지 말아야 할 곳. `packages/` 는 프롬프트라 뺀다. */
const 훑을곳 = ["app", "lib"];

const 건너뛸곳 = new Set(["node_modules", ".next", ".next-local", ".next-build", "__tests__"]);

/**
 * **모델에 보내는 우리말 지시문.** 화면에 안 나간다.
 *
 * 영문 프롬프트는 「한글이 있는 줄만」으로 저절로 걸러지는데, 우리말로 쓴
 * 프롬프트는 그 그물에 안 걸린다. `turn.ts` 의 목록은 「이름 — 설명」이고
 * `## 제목 — 단서` 는 모델이 구역을 가르는 신호다. 마침표로 바꾸면 그 신호가
 * 흐려진다(2026-09-16 리뷰에서 걸렸다. 한 번 바꿨다가 되돌렸다).
 *
 * **면제가 파일 단위라 새는 곳이 있다.** `turn.ts` 에는 채팅 첫 화면에 그대로
 * 나가는 `OPENING_MESSAGE` 도 들어 있다(2026-09-16 재검토). 그 하나는 아래에서
 * 따로 잰다. 채팅 스튜디오를 화면에 붙이는 날 프롬프트 상수를 제 파일로 떼면
 * 이 예외가 필요 없어진다.
 */
const 프롬프트파일 = new Set(["lib/studio/turn.ts"]);

/**
 * 표의 빈 칸에 쓰는 「값 없음」 줄표. `"—"` 나 `>—<` 모양이다.
 *
 * 문장을 잇는 줄표와 **다른 용법**이라 가려낸다. 안 가리면 바꿀 수 없는 것을
 * 두고 시험이 영원히 빨갛다.
 */
const 값없음표시 = /(["'`])—\1|>—</g;

/**
 * 주석 자리를 빈 줄로 바꾼다. 줄 번호를 지키려고 길이를 안 줄인다.
 *
 * **코드 뒤에 붙은 주석도 뗀다.** 전에는 줄 맨 앞 주석만 뗐다. 그래서
 * `const x = 1; // 설명 — 어쩌고` 가 「화면 문구에 줄표가 남았다」로 걸렸다.
 * 주석은 개발자가 읽는 글이라 자리와 상관없이 안 센다. 이런 줄이 저장소에
 * 19개 있고 한글이 든 것도 있다(`_landing/landing-content.ts:249`).
 */
function 주석을뺀다(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => "\n".repeat((block.match(/\n/g) ?? []).length))
    .split("\n")
    .map(주석부터잘라낸다)
    .join("\n");
}

/**
 * 한 줄에서 주석이 시작되는 자리를 찾아 잘라낸다.
 *
 * **따옴표 안의 `//` 는 주석이 아니다.** 정규식 하나로 자르면
 * `startsWith("//")` 나 `"https://…"` 에서 **줄 뒷부분이 통째로 날아가**, 거기
 * 있던 줄표를 조용히 못 보게 된다(2026-09-16 재검토에서 걸렸다). 시험을 약하게
 * 만드는 쪽으로 틀리는 것이라 빨개지지 않아 눈에 안 띈다.
 *
 * 그래서 앞에서부터 읽으며 따옴표 안인지 밖인지를 센다.
 */
function 주석부터잘라낸다(line: string): string {
  let 따옴표: string | null = null;

  for (let i = 0; i < line.length; i += 1) {
    const 글자 = line[i]!;

    if (따옴표) {
      if (글자 === "\\") i += 1;
      else if (글자 === 따옴표) 따옴표 = null;
      continue;
    }
    if (글자 === '"' || 글자 === "'" || 글자 === "`") {
      따옴표 = 글자;
      continue;
    }
    if (글자 === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

interface 걸린줄 {
  파일: string;
  줄번호: number;
  내용: string;
}

function 훑기(dir: string, 결과: 걸린줄[] = []): 걸린줄[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (건너뛸곳.has(entry.name)) continue;
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      훑기(path, 결과);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    if (프롬프트파일.has(path.slice(WEB.length + 1).split(sep).join("/"))) continue;

    const text = readFileSync(path, "utf8");
    if (!text.includes("—")) continue;

    주석을뺀다(text).split("\n").forEach((rawLine, index) => {
      // 빈 칸 표시를 먼저 걷어낸다. 문장을 잇는 줄표만 남긴다.
      const line = rawLine.replace(값없음표시, "");
      // 한글이 같은 줄에 있어야 화면 문구다. 영문 프롬프트는 안 센다.
      if (line.includes("—") && /[가-힣]/.test(line)) {
        결과.push({ 파일: path.slice(WEB.length + 1), 줄번호: index + 1, 내용: rawLine.trim() });
      }
    });
  }
  return 결과;
}

describe("화면 문구의 줄표", () => {
  const 걸린것 = 훑을곳.flatMap((dir) => 훑기(join(WEB, dir)));

  /** 폴더를 못 읽으면 아래 검사가 조용히 통과한다. */
  it("훑을 파일이 있다", () => {
    const 파일수 = readdirSync(join(WEB, "app")).length;
    expect(파일수).toBeGreaterThan(5);
  });

  it("한 줄도 없다", () => {
    const 보고 = 걸린것
      .slice(0, 20)
      .map((entry) => `  ${entry.파일}:${entry.줄번호}\n    ${entry.내용.slice(0, 90)}`)
      .join("\n");

    expect(걸린것.length, `줄표가 남은 화면 문구 ${걸린것.length}줄\n${보고}`).toBe(0);
  });

  /**
   * **면제한 파일 안의 화면 문구는 따로 잰다.**
   *
   * `프롬프트파일` 이 파일 통째를 빼는데 `turn.ts` 에는 채팅 첫 화면에 그대로
   * 나가는 인사말도 들어 있다. 면제가 그것까지 덮어 버린다.
   */
  it("면제한 파일의 화면 문구에도 줄표가 없다", () => {
    const turn = readFileSync(join(WEB, "lib", "studio", "turn.ts"), "utf8");
    const 인사말 = turn.slice(
      turn.indexOf("export const OPENING_MESSAGE"),
      turn.indexOf("export const TURN_SCHEMA"),
    );

    expect(인사말.length, "OPENING_MESSAGE 를 못 찾았다").toBeGreaterThan(50);
    expect(인사말, "채팅 첫 인사에 줄표가 있다").not.toContain("—");
  });
});
