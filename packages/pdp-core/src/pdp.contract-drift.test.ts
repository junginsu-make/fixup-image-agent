import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_CRITERIA, reviewCompleteness } from "./pdp.review";
import { PdpService } from "./pdp.service";
import type { PdpGenerateImageSuccessResponse } from "./types";

/**
 * **문서와 타입이 실제와 어긋난 자리**(D-11-e).
 *
 * 설계 §14.4: 「generatedImages 타입 누락·심사 6/7개 주석 | **실제 응답·검사
 * 계약과 타입/문서 일치**」.
 *
 * 둘 다 「틀려도 안 죽는」 종류다. 그래서 오래 남고, 다음 사람이 그것을 믿는다.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * **돈이 걸린 값이 공개 타입에 없었다.**
 *
 * `generatedImages` 는 fal 이 실제로 만든 장수다(재시도 포함). 라우트가 이
 * 값으로 과금한다 — `billableImages: generatedImages`.
 *
 * 그런데 공개 응답 타입(`PdpGenerateImageSuccessResponse`)에는 그 칸이 없었다.
 * 서비스 안의 **사설 타입**에만 있어서, 부르는 쪽은 계약에 없는 값을 믿고
 * 쓰고 있었다. 누가 그 칸을 빼도 타입 검사는 조용하다.
 */
describe("만든 장수는 계약에 있다", () => {
  it("**공개 타입이 그 칸을 갖는다**", () => {
    // 타입에 없으면 이 줄이 컴파일에서 막힌다.
    const 응답: PdpGenerateImageSuccessResponse = {
      ok: true,
      imageBase64: "AAA",
      mimeType: "image/png",
      generatedImages: 2,
    };

    expect(응답.generatedImages).toBe(2);
  });

  it("**실제 응답이 그 칸을 담는다** — 타입만 맞고 값이 없으면 과금이 0이 된다", async () => {
    let 그린횟수 = 0;
    const result = await new PdpService().generateSectionImage(
      {
        originalImageBase64: "iVBORw0KGgo=",
        section: { section_id: "S1", prompt_en: "a", headline: "제목" },
        aspectRatio: "3:4",
      } as never,
      {
        llm: { generate: async () => ({ text: "{}" }) },
        generateImage: async () => {
          그린횟수 += 1;
          return { base64: "AAA", mimeType: "image/png" };
        },
      } as never,
    );

    expect(result.generatedImages).toBe(그린횟수);
    expect(result.generatedImages).toBeGreaterThan(0);
  });
});

/**
 * **심사 항목 수를 주석이 틀리게 적고 있었다.**
 *
 * 한 파일 안에서 「여섯 가지」(24행)와 「일곱 항목」(224행)이 맞섰다. 실제는
 * 일곱이다. 주석이 틀리면 다음 사람이 항목을 하나 지우고도 「여섯이니 맞다」고
 * 읽는다.
 *
 * **수를 다시 적지 않는다.** 여기서 재는 것은 「주석이 몇이라 적었나」가 아니라
 * **판정이 실제 개수를 쓰는가**이다 — 그래야 항목이 늘어도 안 깨진다.
 */
describe("심사는 있는 항목을 다 본다", () => {
  const 채운심사 = (count: number) => ({
    items: REVIEW_CRITERIA.slice(0, count).map((criterion) => ({
      criterion: criterion.id,
      rating: "pass" as const,
      evidence: "",
      fix: "",
    })),
  });

  it("**다 오면 온전하다**", () => {
    expect(reviewCompleteness(채운심사(REVIEW_CRITERIA.length) as never)).toBe("complete");
  });

  it("**하나라도 빠지면 미달이다** — 안 본 항목이 있다는 뜻이다", () => {
    expect(reviewCompleteness(채운심사(REVIEW_CRITERIA.length - 1) as never)).toBe("incomplete");
  });

  /**
   * 수를 손으로 적은 주석이 남아 있으면 언젠가 실제와 갈린다. 「여섯」·「일곱」
   * 같은 수를 이 파일에서 쫓아낸다.
   */
  it("**항목 수를 글로 다시 적지 않는다**", () => {
    const source = readFileSync(path.join(here, "pdp.review.ts"), "utf8");
    const 수를적은말 = ["여섯 가지", "일곱 항목", "여섯 항목", "일곱 가지"].filter((말) =>
      source.includes(말),
    );

    expect(수를적은말, `주석이 항목 수를 박아 두었다: ${수를적은말.join(", ")}`).toEqual([]);
  });
});
