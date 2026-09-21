import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productReadingNoticeOf } from "../product-reading-notice";

/**
 * **제품을 못 읽었으면 그렇다고 말한다**(U-13).
 *
 * 판독 품질 함수는 있었지만 아무도 부르지 않았다. 사진이 흐릿하든 제품이 안
 * 보이든 결과는 똑같이 「완성」으로 나왔다.
 */
describe("판독 상태를 사용자에게 말한다", () => {
  it("**쓸 만하면 아무 말도 하지 않는다**", () => {
    // 멀쩡한 결과에 경고를 붙이면 모든 화면에 붙는 것과 같아지고, 그러면 정말
    // 위험한 화면에서도 사용자가 그 문구를 넘긴다.
    expect(productReadingNoticeOf({ status: "usable" })).toBeNull();
  });

  it("사진 경로가 아니면 아무 말도 하지 않는다", () => {
    // 글 경로에는 사진이 없다. 「사진에서 못 읽었다」는 말이 틀린 말이 된다.
    expect(productReadingNoticeOf({ status: undefined })).toBeNull();
  });

  it("부실하면 알리되 경고까지는 아니다", () => {
    const notice = productReadingNoticeOf({ status: "thin" });

    expect(notice?.tone).toBe("info");
    expect(notice?.body).toContain("직접 적어주신");
  });

  it("**근거가 아예 없으면 경고다**", () => {
    const notice = productReadingNoticeOf({ status: "unfounded" });

    expect(notice?.tone).toBe("warning");
    // 무엇을 하면 되는지 말한다. 「근거가 없습니다」만으로는 사용자가 할 것이 없다.
    expect(notice?.body).toContain("사진");
    expect(notice?.body).toContain("판매자 정보");
  });

  it("**두 상태는 다른 말을 한다**", () => {
    const thin = productReadingNoticeOf({ status: "thin" });
    const unfounded = productReadingNoticeOf({ status: "unfounded" });

    expect(thin?.title).not.toBe(unfounded?.title);
    expect(thin?.body).not.toBe(unfounded?.body);
  });
});

describe("한 일만 말한다", () => {
  const 결과 = (applied: "omit" | "ask" | "sample", cleared: number) =>
    ({ requested: "sample" as const, applied, cleared });

  it("**내렸고 실제로 비웠으면 몇 곳인지 말한다**", () => {
    const notice = productReadingNoticeOf({ status: "unfounded", gapOutcome: 결과("ask", 3) });

    expect(notice?.policyNote).toContain("3곳");
    expect(notice?.policyNote).toContain("비웠습니다");
  });

  it("**내렸지만 한 칸도 안 비웠으면 치웠다고 하지 않는다**", () => {
    // 정책을 아무리 엄하게 정해도, 모델이 근거 딱지를 안 붙인 섹션은 검사가
    // 통째로 건너뛴다. 그때 「치웠습니다」라고 하면 사용자는 위험한 문장이
    // 사라진 줄 알고 그대로 발행한다 — 원래 문제보다 나쁘다.
    expect(productReadingNoticeOf({ status: "unfounded", gapOutcome: 결과("ask", 0) })?.policyNote).toBeUndefined();
  });

  it("안 내렸으면 그 말을 하지 않는다", () => {
    // 고른 대로 했는데 「바꿨습니다」라고 하면 사용자가 헷갈린다.
    expect(
      productReadingNoticeOf({
        status: "unfounded",
        gapOutcome: { requested: "ask", applied: "ask", cleared: 2 },
      })?.policyNote,
    ).toBeUndefined();
  });

  it("**서버가 적은 것이 없으면 아무 말도 덧붙이지 않는다**", () => {
    // 옛 초안에는 이 값이 없다. 없는 것을 「안 내렸다」로도, 「내렸다」로도
    // 읽지 않는다.
    expect(productReadingNoticeOf({ status: "unfounded" })?.policyNote).toBeUndefined();
    // 경고 자체는 그대로 뜬다 — 근거가 없다는 사실은 변하지 않는다.
    expect(productReadingNoticeOf({ status: "unfounded" })?.tone).toBe("warning");
  });

  it("부실할 뿐이면 정책 이야기를 꺼내지 않는다", () => {
    expect(
      productReadingNoticeOf({ status: "thin", gapOutcome: 결과("ask", 3) })?.policyNote,
    ).toBeUndefined();
  });
});

describe("화면이 실제로 쓰는가", () => {
  const dir = new URL("../", import.meta.url);

  it("**그리기가 판단 함수를 쓴다** — 문구를 두 벌 두면 한쪽만 고치는 날이 온다", () => {
    const view = readFileSync(new URL("ProductReadingNotice.tsx", dir), "utf8");

    expect(view).toContain("productReadingNoticeOf");
    // 문구를 직접 들고 있으면 안 된다.
    expect(view).not.toContain("사진에서 제품을");
  });

  it("구성안 화면이 이 알림을 띄운다", () => {
    const scenario = readFileSync(new URL("ScenarioEditor.tsx", dir), "utf8");

    expect(scenario).toContain("<ProductReadingNotice");
    expect(scenario).toContain("productReadingStatus");
  });

  it("**사진 경로가 상태를 넘긴다** — 서버가 재도 화면에 안 오면 아무 일도 안 일어난다", () => {
    const client = readFileSync(new URL("PdpMakerClient.tsx", dir), "utf8");

    expect(client).toContain("productReadingStatus");
  });
});
