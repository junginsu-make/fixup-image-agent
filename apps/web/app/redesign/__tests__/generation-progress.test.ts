import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeRedesignProgress } from "../generation-progress";

/**
 * **리디자인 대기 화면이 사실만 말하는가**(2026-09-22 재검토).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 대기 화면이 **경과 시간만 보고 퍼센트를 지어냈다.**
 *
 * ```
 * const rawPercent = (elapsedSeconds / totalSeconds) * 100;
 * const percent = Math.min(96, Math.max(4, Math.round(rawPercent)));
 * ```
 *
 * 그 값으로 막대를 채우고, 남은 시간을 말하고, **단계 이름까지 골랐다**
 * (`generationPhase(percent, elapsed)`). 실제로 무슨 일이 일어나는지와 아무
 * 상관이 없다.
 *
 * 상세페이지 쪽은 같은 자리에서 **정반대 결정**을 적어 뒀다 — 「진행률을 알 수
 * 없는 작업이라 무한 왕복 막대를 쓴다(가짜 퍼센트 대신)」. 한 서비스 안에서
 * 두 도구가 갈렸다.
 *
 * ── 무엇으로 바꾸나 ────────────────────────────────────────
 *
 * **아는 것만 센다.** 전사는 배치 수를 실제로 안다(`d/t`). 그때는 진짜
 * 퍼센트를 쓴다. 이미지 생성은 업체가 진척을 안 알려 준다 — 그때는 왕복
 * 막대와 경과 시간만 둔다.
 */

describe("아는 구간은 진짜 퍼센트를 쓴다", () => {
  it("**전사는 배치 수를 안다**", () => {
    const 것 = describeRedesignProgress({ phase: "transcribe", done: 3, total: 12, elapsedSeconds: 40 });

    expect(것.kind).toBe("determinate");
    expect(것.percent).toBe(25);
  });

  it("**배치 수를 말해 준다** — 몇 구간 중 몇인지 보여야 기다릴 만하다", () => {
    const 것 = describeRedesignProgress({ phase: "transcribe", done: 3, total: 12, elapsedSeconds: 40 });

    expect(것.label).toContain("3/12");
  });

  it("**아직 한 배치도 안 끝났으면 0 이다** — 바닥을 띄우지 않는다", () => {
    const 것 = describeRedesignProgress({ phase: "transcribe", done: 0, total: 12, elapsedSeconds: 3 });

    expect(것.percent).toBe(0);
  });

  it("**배치 수를 모르면 아는 척하지 않는다**", () => {
    const 것 = describeRedesignProgress({ phase: "transcribe", elapsedSeconds: 3 });

    expect(것.kind).toBe("indeterminate");
    expect(것.percent).toBeUndefined();
  });
});

/**
 * **모르는 구간은 퍼센트를 안 만든다.**
 *
 * 이미지 생성은 업체가 진척을 안 준다. 경과 시간으로 막대를 채우면 늦어질 때
 * 96% 에 붙어 있고, 빨리 끝나면 40% 에서 갑자기 끝난다. 둘 다 거짓말이다.
 */
describe("모르는 구간", () => {
  it.each([
    ["convert", "원본을 PNG 로 바꾸는 중"],
    ["generate", "이미지 생성 중"],
  ])("**%s 은 퍼센트가 없다**", (phase) => {
    const 것 = describeRedesignProgress({ phase: phase as never, elapsedSeconds: 200 });

    expect(것.kind).toBe("indeterminate");
    expect(것.percent).toBeUndefined();
  });

  it("**무슨 일을 하고 있는지는 말한다**", () => {
    expect(describeRedesignProgress({ phase: "convert", elapsedSeconds: 5 }).label).toContain("PNG");
    expect(describeRedesignProgress({ phase: "generate", elapsedSeconds: 5 }).label).toContain("생성");
  });
});

/**
 * **예상은 예상이라고 말한다.**
 *
 * 전에는 `Math.max(5, 예상 - 경과)` 라, 예상을 넘기면 **영원히 「예상 5초
 * 남음」**이었다. 정밀형 한 장 예상이 89초인데 실제로는 2분이 넘게 걸린다 —
 * 대부분의 기다림이 그 거짓말 구간에 있었다.
 */
describe("남은 시간", () => {
  it("**예상 안이면 얼마쯤 남았는지 말한다**", () => {
    const 것 = describeRedesignProgress({ phase: "generate", elapsedSeconds: 30, estimateSeconds: 90 });

    expect(것.note).toContain("1분");
    expect(것.note).toContain("예상");
  });

  it("**예상을 넘기면 5초 남았다고 하지 않는다**", () => {
    const 것 = describeRedesignProgress({ phase: "generate", elapsedSeconds: 300, estimateSeconds: 90 });

    expect(것.note, "예상을 넘겼는데 아직 남은 시간을 말한다").not.toMatch(/남음/);
    expect(것.note).toContain("오래");
  });

  it("**예상 자체가 없으면 시간 이야기를 안 한다**", () => {
    const 것 = describeRedesignProgress({ phase: "generate", elapsedSeconds: 300 });

    expect(것.note).toBe("");
  });
});

/**
 * **화면 문구에는 줄표를 안 쓴다**(저장소 규칙).
 */
describe("문구 규칙", () => {
  it("**줄표가 없다**", () => {
    const 것들 = [
      describeRedesignProgress({ phase: "convert", elapsedSeconds: 1 }),
      describeRedesignProgress({ phase: "transcribe", done: 1, total: 4, elapsedSeconds: 1 }),
      describeRedesignProgress({ phase: "generate", elapsedSeconds: 1, estimateSeconds: 90 }),
      describeRedesignProgress({ phase: "generate", elapsedSeconds: 900, estimateSeconds: 90 }),
    ];

    for (const 것 of 것들) {
      expect(`${것.label} ${것.note}`).not.toContain("—");
    }
  });
});

/**
 * **글자가 배경과 같은 색이면 아무것도 안 보인다.**
 *
 * 단계 이름 칸이 `bg-primary` 위에 `text-primary` 였다. 분홍 위의 분홍이라
 * **그 칸은 통째로 빈 칸으로 보인다.** 저장소에서 이 짝을 쓰는 곳은 여기
 * 하나뿐이었다 — 다른 자리는 전부 `bg-primary text-primary-foreground` 다.
 */
describe("단계 이름이 실제로 보인다", () => {
  const 화면 = readFileSync(join(process.cwd(), "app/redesign/redesign-results.tsx"), "utf8");

  const 코드만 = 화면
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("**배경과 글자가 같은 색인 칸이 없다**", () => {
    const 겹친줄 = 코드만
      .split(/\r?\n/)
      /*
        `\b` 는 `text-primary-foreground` 도 잡는다 — 낱말 경계가 `y` 와 `-`
        사이에 선다. 고친 뒤에도 빨갰던 자리다. 뒤에 아무것도 안 붙은
        `text-primary` 만 본다.
      */
      .filter((line) => /\bbg-primary(?![-\w])/.test(line) && /\btext-primary(?![-\w])/.test(line))
      .map((line) => line.trim().slice(0, 100));

    expect(겹친줄, `배경과 글자가 같은 색: ${겹친줄.join(" | ")}`).toEqual([]);
  });
});
