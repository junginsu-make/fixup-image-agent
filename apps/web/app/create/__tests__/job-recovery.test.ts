import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recoverableSections, jobRequestFields, shouldAskForRecovery, bakeRecoveredImages, shouldRecoverAfter } from "../job-recovery";

/**
 * **돌아온 사용자가 무엇을 되찾는가.**
 *
 * 탭을 닫았다 다시 들어오면, 서버에 적힌 작업에서 **아직 화면에 없는 그림만**
 * 가져온다. 이미 있는 것을 덮으면 사용자가 그 뒤에 한 편집이 날아간다.
 */
const 작업 = (items: Array<{ sectionId: string; url: string | null; errorCode?: string | null }>) => ({
  id: "job-1",
  outcome: "done" as const,
  items: items.map((item) => ({ attempt: 1, errorCode: null, ...item })),
});

describe("되찾을 것 고르기", () => {
  it("화면에 없는 섹션의 그림을 가져온다", () => {
    const 되찾을것 = recoverableSections(작업([{ sectionId: "s1", url: "https://x/s1" }]), [
      { section_id: "s1", generatedImage: undefined },
    ] as never);

    expect(되찾을것).toEqual([{ sectionId: "s1", url: "https://x/s1" }]);
  });

  it("**이미 있는 그림을 덮지 않는다** — 그 뒤에 한 편집이 날아간다", () => {
    const 되찾을것 = recoverableSections(작업([{ sectionId: "s1", url: "https://x/s1" }]), [
      { section_id: "s1", generatedImage: "data:image/png;base64,AAA" },
    ] as never);

    expect(되찾을것).toEqual([]);
  });

  it("저장 못 한 섹션은 가져올 것이 없다", () => {
    const 되찾을것 = recoverableSections(
      작업([{ sectionId: "s1", url: null, errorCode: "artifact_upload_failed" }]),
      [{ section_id: "s1", generatedImage: undefined }] as never,
    );

    expect(되찾을것).toEqual([]);
  });

  it("**화면에 없는 섹션은 건너뛴다** — 구성안을 바꿨을 수 있다", () => {
    const 되찾을것 = recoverableSections(작업([{ sectionId: "지운섹션", url: "https://x/s9" }]), [
      { section_id: "s1", generatedImage: undefined },
    ] as never);

    expect(되찾을것).toEqual([]);
  });

  it("여러 장 중 되찾을 것만 고른다", () => {
    const 되찾을것 = recoverableSections(
      작업([
        { sectionId: "s1", url: "https://x/s1" },
        { sectionId: "s2", url: "https://x/s2" },
        { sectionId: "s3", url: null },
      ]),
      [
        { section_id: "s1", generatedImage: "data:image/png;base64,AAA" },
        { section_id: "s2", generatedImage: undefined },
        { section_id: "s3", generatedImage: undefined },
      ] as never,
    );

    expect(되찾을것).toEqual([{ sectionId: "s2", url: "https://x/s2" }]);
  });
});

describe("요청에 싣는 문서 표시", () => {
  it("초안 id 가 있으면 그것으로 묶는다", () => {
    expect(jobRequestFields("draft-1", 3)).toEqual({ documentId: "draft-1", revision: 3 });
  });

  it("**아직 저장 안 한 작업은 아무것도 안 싣는다** — 서버가 알아서 대신한다", () => {
    expect(jobRequestFields(null, 0)).toEqual({});
  });
});

/**
 * **배선이 실제로 닿았는가.**
 *
 * `jobRequestFields` 가 맞아도 화면이 그 값을 안 실으면 아무 일도 안 일어난다.
 * 그 한 줄은 지워도 위 시험이 전부 통과한다 — 이 저장소가 겪은 그 구멍이다
 * (`page-wire.ts` 머리말). 그래서 실제 파일에서 배선을 확인한다.
 */
describe("화면이 실제로 싣는가", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");

  it("일괄 생성 요청에 문서 표시를 싣는다", () => {
    expect(editor).toContain("...jobRequestFields(draftId, 0)");
  });

  it("부모가 초안 id 를 넘긴다", () => {
    expect(client).toContain("draftId={activeDraftId}");
  });
});

/**
 * **언제 물어볼 것인가**(K-04).
 *
 * 되찾기는 화면이 먼저 물어봐야 일어난다. 그런데 **아무 때나 물어보면 안
 * 된다** — 초안을 열 때마다 서버에 질의가 하나씩 더 간다.
 *
 * 물어볼 값어치가 있는 때는 하나다: **이 초안에 그림이 빠진 섹션이 있을 때.**
 * 다 채워져 있으면 되찾아 올 것이 없다.
 */
describe("언제 되찾기를 물어보나", () => {
  const 섹션 = (id: string, image?: string) => ({ section_id: id, generatedImage: image }) as never;

  it("**빈 섹션이 있으면 물어본다**", () => {
    expect(shouldAskForRecovery("draft-1", [섹션("s1"), 섹션("s2", "data:x")])).toBe(true);
  });

  it("**다 채워져 있으면 안 물어본다** — 되찾을 것이 없다", () => {
    expect(shouldAskForRecovery("draft-1", [섹션("s1", "data:x")])).toBe(false);
  });

  /**
   * **저장 안 한 작업은 찾을 열쇠가 없다.** 서버는 그때 예약 식별자로 작업을
   * 묶었고, 화면은 그 값을 모른다. 없는 것으로 물어보면 늘 404 다.
   */
  it("**저장 안 한 작업은 안 물어본다**", () => {
    expect(shouldAskForRecovery(null, [섹션("s1")])).toBe(false);
  });

  it("**섹션이 아예 없으면 안 물어본다**", () => {
    expect(shouldAskForRecovery("draft-1", [])).toBe(false);
  });
});

/**
 * **되찾은 그림을 그 자리에서 굽는다**(K-04 리뷰 HIGH).
 *
 * 서버가 주는 것은 한 시간짜리 서명 주소다. 그대로 넣으면 자동 저장이 그것을
 * 초안에 적고, **한 시간 뒤 그 초안은 깨진 그림으로 열린다** — 그때는 칸이
 * 차 있어 되찾을 수도 없다.
 */
describe("되찾은 그림을 구워 들인다", () => {
  const 응답 = (bytes: number[], type = "image/png", ok = true) =>
    ({ ok, blob: async () => ({ type, arrayBuffer: async () => Uint8Array.from(bytes).buffer }) }) as never;

  it("**서명 주소를 data URL 로 바꾼다** — 그래야 저장해도 안 죽는다", async () => {
    const 구운것 = await bakeRecoveredImages(
      [{ sectionId: "s1", url: "https://signed/s1" }],
      (async () => 응답([1, 2, 3])) as never,
    );

    expect(구운것).toHaveLength(1);
    expect(구운것[0]!.url.startsWith("data:image/png;base64,")).toBe(true);
    expect(구운것[0]!.sectionId).toBe("s1");
  });

  it("**서버가 말한 형식을 지킨다** — jpeg 을 png 로 적으면 내보내기가 어긋난다", async () => {
    const 구운것 = await bakeRecoveredImages(
      [{ sectionId: "s1", url: "https://signed/s1" }],
      (async () => 응답([1], "image/jpeg")) as never,
    );

    expect(구운것[0]!.url.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("**못 받은 장은 안 준다** — 부르는 쪽이 세지도 넣지도 않게", async () => {
    const 구운것 = await bakeRecoveredImages(
      [{ sectionId: "s1", url: "https://signed/s1" }],
      (async () => 응답([1], "image/png", false)) as never,
    );

    expect(구운것).toEqual([]);
  });

  it("**한 장이 터져도 나머지는 살린다**", async () => {
    const 구운것 = await bakeRecoveredImages(
      [{ sectionId: "s1", url: "https://x/1" }, { sectionId: "s2", url: "https://x/2" }],
      (async (url: string) => {
        if (String(url).endsWith("1")) throw new Error("끊겼다");
        return 응답([9]);
      }) as never,
    );

    expect(구운것.map((image) => image.sectionId)).toEqual(["s2"]);
  });

  /**
   * **큰 그림에서 안 터진다.** `String.fromCharCode(...bytes)` 에 수 MB 를
   * 한 번에 넘기면 인자 수 한도에 걸린다 — 그림은 늘 그 크기다.
   */
  it("**큰 그림도 굽는다**", async () => {
    const 큰것 = Array.from({ length: 300_000 }, (_value, index) => index % 256);

    const 구운것 = await bakeRecoveredImages(
      [{ sectionId: "s1", url: "https://x/big" }],
      (async () => 응답(큰것)) as never,
    );

    expect(구운것).toHaveLength(1);
    const base64 = 구운것[0]!.url.split(",")[1]!;
    expect(Buffer.from(base64, "base64")).toHaveLength(큰것.length);
  });

  it("**빈 바이트는 안 준다** — 빈 그림을 넣으면 그 칸은 영영 안 채워진다", async () => {
    const 구운것 = await bakeRecoveredImages(
      [{ sectionId: "s1", url: "https://x/1" }],
      (async () => 응답([])) as never,
    );

    expect(구운것).toEqual([]);
  });
});

/**
 * **같은 요청이 막히면 만들어 둔 것을 되찾는다**(K-05).
 *
 * 설계 §14.5(E-6-2-b): 처리는 「header 만 아닌 **동일 결과 회수**」.
 */
describe("어떤 오류에 되찾으러 가나", () => {
  it("**중복으로 막히면 간다** — 그 식별자의 그림이 서버에 있을 수 있다", () => {
    expect(shouldRecoverAfter("duplicate_request")).toBe(true);
  });

  it.each([
    ["quota_exceeded", "한도를 다 썼다"],
    ["team_quota_exceeded", "팀 한도를 다 썼다"],
    ["concurrent_limit", "동시에 너무 많이 돈다"],
    ["unauthenticated", "로그인이 안 돼 있다"],
    ["AI_PROVIDER_UNAVAILABLE", "제공자가 죽었다"],
  ])("**%s 에는 안 간다** — %s", (code) => {
    // 만들어진 것이 없다. 되찾으러 가면 값 없는 질의만 는다.
    expect(shouldRecoverAfter(code)).toBe(false);
  });

  it("**코드가 없어도 안 터진다**", () => {
    expect(shouldRecoverAfter(undefined)).toBe(false);
    expect(shouldRecoverAfter(null)).toBe(false);
    expect(shouldRecoverAfter("")).toBe(false);
  });
});

/*
  **편집기가 그 판단을 쓰는지는 여기서 안 잰다.**

  한때 소스 문자열로 쟀다 — 편집기가 2,800줄이라 못 띄운다고 보았다. 그
  판단이 틀렸다. 그리고 그 시험으로는 **배선을 통째로 끊어도 636건이 전부
  초록**이었다(조건 뒤집기, 성공 가지로 옮기기, 엉뚱한 값 넘기기도 마찬가지).

  `duplicate-recovery-live.test.tsx` 가 진짜 편집기를 띄워 단추를 누르고 잰다.
*/
