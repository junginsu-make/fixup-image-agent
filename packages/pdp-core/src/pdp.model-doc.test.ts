import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "./types";

/**
 * **소개 문서가 실제와 달랐다**(X-06).
 *
 * 설계 §14.6: 「모델·해상도 소개 문서 불일치 | **실제 기본값·출력 규격으로
 * 문서 수정** | 실제 config/output 대조」.
 *
 * `README.md` 의 이미지 모델 표가 이랬다.
 *
 * | GPT Image 2 (기본) | 4 | … |
 * | Nano Banana Pro    | 3 | … |
 * | Nano Banana        | 1 | … |
 *
 * 실제 목록은 **일곱**이고, **기본 모델(`gpt-image-2.5-flare`)이 표에 아예
 * 없었다.** 「기본」이라고 적힌 것은 기본이 아니고, 가중치도 한 줄 틀렸다
 * (`nano-banana-2` 는 2인데 「Nano Banana … 1」로 적혀 있었다).
 *
 * `docs/landing.md` 가 「모델 가중치는 README 를 보라」고 가리키므로, 이 표가
 * **유일한 출처**다. 틀린 채로 두면 값을 묻는 사람마다 틀린 답을 얻는다.
 *
 * ── 왜 시험으로 잠그나 ──────────────────────────────────────
 *
 * 모델은 앞으로도 늘고 준다. **사람이 표를 손으로 맞추는 한 또 갈린다.**
 * 문서가 목록과 어긋나면 여기가 빨개진다.
 */

const readme = readFileSync(
  fileURLToPath(new URL("../../../README.md", import.meta.url)),
  "utf8",
);

/** 이미지 모델 표만 잘라 낸다. 다른 곳의 같은 낱말에 속지 않는다. */
const 모델표 = (() => {
  const 시작 = readme.indexOf("### 이미지 모델");
  expect(시작, "README 에 이미지 모델 절이 없다").toBeGreaterThan(-1);
  const 끝 = readme.indexOf("###", 시작 + 3);
  return readme.slice(시작, 끝 > -1 ? 끝 : undefined);
})();

describe("소개 문서가 실제 목록과 같다", () => {
  it.each(IMAGE_MODELS.map((model) => [model.label, model.id]))(
    "**%s 가 표에 있다**",
    (label) => {
      expect(모델표, `${label} 이 README 표에 없다`).toContain(label);
    },
  );

  it("**표에 없는 모델을 적지 않는다**", () => {
    const 실제이름 = new Set(IMAGE_MODELS.map((model) => model.label));
    const 표의줄 = 모델표
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("모델 |"));
    const 적힌이름 = 표의줄.map((line) => line.split("|")[1]?.trim() ?? "");

    for (const 이름 of 적힌이름) {
      expect(실제이름.has(이름.replace(" (기본)", "")), `${이름} 은 실제 목록에 없다`).toBe(true);
    }
  });

  /**
   * **가중치는 돈이다.** 틀리게 적으면 값을 묻는 사람마다 틀린 답을 얻는다.
   */
  it.each(IMAGE_MODELS.map((model) => [model.label, model.creditWeight]))(
    "**%s 의 가중치가 %s 로 적혀 있다**",
    (label, weight) => {
      const 줄 = 모델표.split("\n").find((line) => line.includes(String(label)));
      expect(줄, `${label} 줄을 못 찾았다`).toBeTruthy();

      const 칸 = 줄!.split("|").map((cell) => cell.trim());
      expect(칸).toContain(String(weight));
    },
  );

  /**
   * **어느 것이 기본인지 문서가 말해야 한다.** 그것이 안 고른 사람이 실제로
   * 쓰게 되는 모델이다.
   */
  it("**기본 모델이 기본이라고 적혀 있다**", () => {
    const 기본 = IMAGE_MODELS.find((model) => model.id === DEFAULT_IMAGE_MODEL);
    expect(기본, "기본 모델이 목록에 없다").toBeTruthy();

    const 줄 = 모델표.split("\n").find((line) => line.includes(기본!.label));
    expect(줄).toContain("기본");
  });

  it("**기본이라고 적힌 줄이 하나뿐이다**", () => {
    const 기본표시 = 모델표
      .split("\n")
      .filter((line) => line.startsWith("|") && line.includes("(기본)"));

    expect(기본표시).toHaveLength(1);
  });
});
