import { describe, expect, it } from "vitest";
import { requestIdentityOf, type RequestIdentityInput } from "../redesign-request";

/**
 * **같은 요청인가, 다른 요청인가.**
 *
 * 서버는 멱등 키로 중복을 막는다. 이 값이 틀리면 둘 중 하나가 된다 —
 * 설정을 바꿔도 「이미 처리된 요청」으로 막히거나, 다시 누를 때마다 **돈이 두 번
 * 나간다.** 화면은 어느 쪽이든 멀쩡히 돌아간다.
 *
 * 한 번 실제로 틀렸었다. `look`(그림의 결)이 빠져 있어서, 실패 후 결만 바꿔
 * 다시 누르면 같은 키로 나갔다.
 */

const 기본: RequestIdentityInput = {
  model: "openai",
  startSection: 1,
  count: 1,
  baseProject: null,
  channel: "스마트스토어",
  ratio: "9:16",
  look: "auto",
  request: "전환율 중심으로",
  rolloutRequest: "",
  files: [{ name: "원본.png", size: 1024 }],
};

/** 한 칸만 바꿔서 값이 달라지는지 본다. */
function 바꾸면(조각: Partial<RequestIdentityInput>) {
  return requestIdentityOf({ ...기본, ...조각 });
}

describe("같은 입력이면 같은 키", () => {
  it("아무것도 안 바꾸면 같다", () => {
    expect(requestIdentityOf(기본)).toBe(requestIdentityOf({ ...기본 }));
  });
});

describe("무엇이 바뀌면 다른 요청인가", () => {
  const 달라져야_하는_것: Array<[string, Partial<RequestIdentityInput>]> = [
    ["모델", { model: "google" }],
    ["시작 섹션", { startSection: 2 }],
    ["장수", { count: 3 }],
    ["이어 만드는 작업", { baseProject: { id: "proj-1" } }],
    ["채널", { channel: "쿠팡" }],
    ["비율", { ratio: "1:1" }],
    // 이게 빠져 있어서 실제로 막혔던 자리다.
    ["그림의 결", { look: "anime" }],
    ["요청 문구", { request: "다르게 써 주세요" }],
    ["히어로 검토 후 요청", { rolloutRequest: "더 크게" }],
    ["파일 이름", { files: [{ name: "다른이름.png", size: 1024 }] }],
    ["파일 크기", { files: [{ name: "원본.png", size: 2048 }] }],
    ["파일 장수", { files: [{ name: "원본.png", size: 1024 }, { name: "둘째.png", size: 10 }] }],
  ];

  for (const [이름, 조각] of 달라져야_하는_것) {
    it(`${이름}를 바꾸면 다른 키다`, () => {
      expect(바꾸면(조각)).not.toBe(requestIdentityOf(기본));
    });
  }
});

describe("섞이지 않는다", () => {
  /**
   * 칸을 이어 붙이므로, 한 칸의 끝과 다음 칸의 시작이 붙어 **다른 조합이 같은
   * 글자가 되는** 일이 없어야 한다.
   */
  it("칸 경계가 흐려지지 않는다", () => {
    const 가 = 바꾸면({ channel: "가", ratio: "나" });
    const 나 = 바꾸면({ channel: "가나", ratio: "" });
    expect(가).not.toBe(나);
  });

  it("파일이 없어도 값이 나온다", () => {
    expect(바꾸면({ files: [] })).toContain("generate");
  });
});
