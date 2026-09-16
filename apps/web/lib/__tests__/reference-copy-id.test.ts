import { describe, expect, it } from "vitest";
import { adoptedReferenceId, isAdoptedReferenceId, isOrdinaryReferenceId } from "../reference-copy-id";

/**
 * **복사본은 id 만 보고 가려낸다.**
 *
 * 관리자가 다른 회원의 그림을 복사해 오면, 그 복사본은 관리자 소유이면서
 * **원본의 팀 범위**를 따른다. 그런데 팀 배정·해제·이동은 `user_id` 로 그 사람
 * 그림의 팀을 통째로 바꾼다 — 관리자가 팀에서 빠지는 순간 복사본이 전 회원
 * 공개(`team_id = null`)가 된다(2026-09-16 독립 리뷰. 운영에 팀에 든 관리자가
 * 실제로 있다).
 *
 * 표에 칸을 더하는 대신 **id 형식**으로 가른다. 복사본은 uuid 5, 나머지는 전부
 * uuid 4 다(운영 74장 전부 4 확인). 올리기 주소는 4 만 받도록 좁혀서, 5 는
 * 복사본만 쓰는 표시가 된다.
 */
describe("adoptedReferenceId", () => {
  it("같은 그림을 같은 사람이 복사하면 늘 같다", () => {
    expect(adoptedReferenceId("원래", "관리자")).toBe(adoptedReferenceId("원래", "관리자"));
  });

  it("uuid 5 모양이다", () => {
    expect(adoptedReferenceId("원래", "관리자"))
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("isAdoptedReferenceId", () => {
  it("복사본 id 를 알아본다", () => {
    expect(isAdoptedReferenceId(adoptedReferenceId("원래", "관리자"))).toBe(true);
  });

  it("보통 그림 id(uuid 4)는 복사본이 아니다", () => {
    expect(isAdoptedReferenceId("61d9bb82-d1e8-4f11-96c5-eac6766348f0")).toBe(false);
    expect(isAdoptedReferenceId(crypto.randomUUID())).toBe(false);
  });

  it("대문자로 와도 알아본다", () => {
    expect(isAdoptedReferenceId(adoptedReferenceId("원래", "관리자").toUpperCase())).toBe(true);
  });

  it("uuid 가 아니면 복사본이 아니다", () => {
    expect(isAdoptedReferenceId("")).toBe(false);
    expect(isAdoptedReferenceId("abc")).toBe(false);
    expect(isAdoptedReferenceId("00000000-0000-5000-8000")).toBe(false);
  });
});

describe("isOrdinaryReferenceId — 올리기가 받는 id", () => {
  it("uuid 4 만 받는다", () => {
    expect(isOrdinaryReferenceId(crypto.randomUUID())).toBe(true);
  });

  it("**uuid 5 는 거절한다** — 복사본 표시를 흉내 내지 못하게", () => {
    // 5 를 받으면 누구나 자기 그림을 「복사본」으로 꾸며 팀 이동을 비껴갈 수 있다.
    expect(isOrdinaryReferenceId(adoptedReferenceId("원래", "관리자"))).toBe(false);
  });

  it("다른 형식도 거절한다", () => {
    expect(isOrdinaryReferenceId("61d9bb82-d1e8-1f11-96c5-eac6766348f0")).toBe(false);
    expect(isOrdinaryReferenceId("not-a-uuid")).toBe(false);
  });
});
