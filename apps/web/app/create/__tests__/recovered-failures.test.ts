import { describe, expect, it } from "vitest";
import { recoveredFailureLines } from "../recovered-failures";

/**
 * **어느 장이 왜 안 만들어졌는지 상세페이지 화면이 말한다**(F-7-8).
 *
 * 설계 §14.6: 「failedSections 미표시·토스트만 존재 | **영구 상태·섹션별
 * 실패/미시도 이유 표시** | W4 / T-JOB」.
 *
 * 묶음 생성은 성공한 섹션만 적었다. 그래서 되찾을 때 서버가 아는 것은
 * 「만들어진 것」뿐이고 **왜 빠졌는지는 아무 데도 안 남았다.** 탭을 닫았다
 * 돌아오면 그때 스쳐 간 알림도 없다.
 */

const 섹션 = (id: string, name: string, image?: string) =>
  ({ section_id: id, section_name: name, generatedImage: image }) as never;

const 실패 = (sectionId: string, errorCode: string) => ({ sectionId, url: null, errorCode });

describe("안 만들어진 장을 줄로 만든다", () => {
  it("**어느 장이 왜 빠졌는지 함께 말한다**", () => {
    const 줄 = recoveredFailureLines([실패("s3", "AI_QUOTA_EXCEEDED")], [섹션("s3", "베네핏 3개")]);

    expect(줄).toHaveLength(1);
    expect(줄[0]!.label).toBe("베네핏 3개");
    expect(줄[0]!.reason).toContain("한도");
  });

  /**
   * **다시 눌러 볼 값어치가 있는지 가른다.** 한도를 다 썼으면 눌러도 같은
   * 답이 온다 — 그때 「다시 만들어 보세요」라고 하면 헛걸음을 시킨다.
   */
  it("**다시 해 볼 것과 아닌 것을 가른다**", () => {
    const 한도 = recoveredFailureLines([실패("s1", "AI_QUOTA_EXCEEDED")], [섹션("s1", "히어로")]);
    const 장애 = recoveredFailureLines([실패("s1", "AI_PROVIDER_UNAVAILABLE")], [섹션("s1", "히어로")]);

    expect(한도[0]!.retryable).toBe(false);
    expect(장애[0]!.retryable).toBe(true);
  });

  /**
   * **모르는 코드를 안다고 하지 않는다.** 그래도 다시 해 볼 수는 있다고
   * 알린다 — 대부분의 일시적 실패가 여기로 온다.
   */
  it("**모르는 까닭이면 그렇게 말한다**", () => {
    const 줄 = recoveredFailureLines([실패("s1", "NEVER_SEEN_BEFORE")], [섹션("s1", "히어로")]);

    expect(줄[0]!.reason).toContain("알 수 없");
    expect(줄[0]!.retryable).toBe(true);
  });

  it("**까닭이 아예 없어도 빈 줄을 안 남긴다**", () => {
    const 줄 = recoveredFailureLines([{ sectionId: "s1", url: null }], [섹션("s1", "히어로")]);

    expect(줄[0]!.reason).toBeTruthy();
  });

  /**
   * **보관에 실패한 것은 그림 생성 실패와 다르다.** 그림은 나왔다. 다시
   * 만들면 나올 가능성이 높다.
   */
  it("**보관에 실패한 것도 말한다**", () => {
    const 줄 = recoveredFailureLines([실패("s1", "artifact_upload_failed")], [섹션("s1", "히어로")]);

    expect(줄[0]!.reason).toContain("보관하지 못했");
    expect(줄[0]!.retryable).toBe(true);
  });
});

/**
 * **다 만들고도 「실패 1장」이 남으면 안 된다.**
 *
 * 리디자인 쪽이 이미 겪은 일이다(`redesign/failed-sections.ts` 의
 * `mergeFailedSections`). 서버의 기록은 **그때**의 것이고, 그 뒤 사용자가 그
 * 섹션만 다시 만들어 성공했을 수 있다.
 */
describe("그 뒤에 만들어진 것은 실패로 안 남는다", () => {
  it("**화면에 그림이 있으면 그 줄은 없앤다**", () => {
    const 줄 = recoveredFailureLines(
      [실패("s1", "AI_PROVIDER_UNAVAILABLE")],
      [섹션("s1", "히어로", "data:image/png;base64,AAA")],
    );

    expect(줄).toEqual([]);
  });

  it("**지금 구성안에 없는 섹션은 안 그린다** — 가리킬 자리가 없다", () => {
    const 줄 = recoveredFailureLines([실패("옛섹션", "AI_QUOTA_EXCEEDED")], [섹션("s1", "히어로")]);

    expect(줄).toEqual([]);
  });

  it("**그림이 있는 항목은 실패가 아니다**", () => {
    const 줄 = recoveredFailureLines(
      [{ sectionId: "s1", url: "https://signed/s1", errorCode: null }],
      [섹션("s1", "히어로")],
    );

    expect(줄).toEqual([]);
  });
});

describe("모양이 아닌 것이 섞여 와도", () => {
  it("**안 터진다**", () => {
    const 줄 = recoveredFailureLines(
      [null, 실패("s1", "AI_QUOTA_EXCEEDED"), undefined] as never,
      [섹션("s1", "히어로")],
    );

    expect(줄).toHaveLength(1);
  });

  it("**빈 목록이면 아무 줄도 안 만든다**", () => {
    expect(recoveredFailureLines([], [섹션("s1", "히어로")])).toEqual([]);
    expect(recoveredFailureLines(undefined, [섹션("s1", "히어로")])).toEqual([]);
    expect(recoveredFailureLines([실패("s1", "X")], undefined)).toEqual([]);
  });

  it("**이름도 번호도 없으면 버린다** — 사용자가 가리킬 것이 없다", () => {
    const 줄 = recoveredFailureLines(
      [{ sectionId: "", url: null, errorCode: "X" }],
      [{ section_id: "", section_name: "" } as never],
    );

    expect(줄).toEqual([]);
  });

  it("**이름이 없으면 번호로 가리킨다**", () => {
    const 줄 = recoveredFailureLines([실패("S5", "X")], [{ section_id: "S5", section_name: "" } as never]);

    expect(줄[0]!.label).toBe("S5");
  });
});

describe("사용자에게 보이는 말", () => {
  it("**줄표를 안 쓴다**", () => {
    const 코드 = [
      "AI_QUOTA_EXCEEDED", "AI_PROVIDER_UNAVAILABLE", "AI_KEY_MISSING", "AI_KEY_INVALID",
      "AI_MODEL_ACCESS_DENIED", "PDP_IMAGE_QA_REJECTED", "INVALID_IMAGE_PAYLOAD",
      "artifact_upload_failed", "unknown_error", "NEVER_SEEN_BEFORE",
    ];

    for (const code of 코드) {
      const 줄 = recoveredFailureLines([실패("s1", code)], [섹션("s1", "히어로")]);
      expect(줄[0]!.reason, code).not.toContain("—");
    }
  });

  it("**무엇을 하면 되는지 말한다** — 까닭만 말하면 사용자는 멈춘다", () => {
    const 코드 = [
      "AI_QUOTA_EXCEEDED", "AI_PROVIDER_UNAVAILABLE", "AI_KEY_MISSING", "AI_KEY_INVALID",
      "AI_MODEL_ACCESS_DENIED", "PDP_IMAGE_QA_REJECTED", "INVALID_IMAGE_PAYLOAD",
      "artifact_upload_failed", "unknown_error", "NEVER_SEEN_BEFORE",
    ];

    for (const code of 코드) {
      const 줄 = recoveredFailureLines([실패("s1", code)], [섹션("s1", "히어로")]);
      // 「다시 만들어 주세요」든 「다시 만들어 보세요」든, 할 일을 말한다.
      expect(줄[0]!.reason, code).toMatch(/주세요|보세요/);
    }
  });
});
