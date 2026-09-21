import { describe, expect, it } from "vitest";
import { stepIdempotencyKey } from "../step-key";

/**
 * **단계마다 다른 요청 식별자** (2026-09-21 운영 409).
 *
 * Easy 는 포스터 라우트 셋을 대신 부르고, 그중 **둘이 각자 예약한다.** 예약은
 * 같은 식별자를 두 번 받으면 `duplicate_request` 로 거절하므로, 열쇠를 그대로
 * 물려주면 두 번째 단계가 **반드시** 막힌다.
 *
 * 로컬에서는 인증 우회가 예약보다 먼저 지나가 이 실패가 안 드러난다. 그래서
 * 화면을 열어 보는 것으로는 못 잡고, 여기서 값으로 잰다.
 */

/**
 * 서버가 받아 주는 꼴. `lib/membership/api.ts` 의 검사와 **같은 정규식**이다.
 *
 * 베껴 적는 것이 마음에 걸리지만, 저쪽은 함수 안의 지역 값이라 가져올 수 없다.
 * 대신 **틀리면 여기서 깨지게** 해 둔다 — 저쪽이 바뀌면 이 시험이 낡았다는
 * 신호다.
 */
const 서버가받는꼴 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const 바깥열쇠 = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("단계 열쇠", () => {
  it("서버가 받아 주는 꼴이다", () => {
    for (const step of ["project", "plan", "generate"]) {
      expect(stepIdempotencyKey(바깥열쇠, step)).toMatch(서버가받는꼴);
    }
  });

  /**
   * **이것이 409 를 막는 성질이다.** 기획과 생성이 같은 열쇠를 들면 둘째가
   * 거절당한다.
   */
  it("단계가 다르면 열쇠가 다르다", () => {
    const 열쇠들 = ["project", "plan", "generate"].map((step) => stepIdempotencyKey(바깥열쇠, step));

    expect(new Set(열쇠들).size).toBe(열쇠들.length);
    expect(열쇠들).not.toContain(바깥열쇠);
  });

  /**
   * **되보내기가 두 번 깎이지 않는다.** 난수로 뽑으면 같은 요청이 다시 들어와도
   * 안쪽 열쇠가 달라져 예약이 새 요청으로 보인다.
   */
  it("같은 요청 · 같은 단계면 늘 같은 열쇠다", () => {
    expect(stepIdempotencyKey(바깥열쇠, "plan")).toBe(stepIdempotencyKey(바깥열쇠, "plan"));
  });

  it("바깥 열쇠가 다르면 열쇠도 다르다", () => {
    const 다른요청 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

    expect(stepIdempotencyKey(바깥열쇠, "plan")).not.toBe(stepIdempotencyKey(다른요청, "plan"));
  });

  /**
   * 판·변형 자리를 손보지 않으면 **열여섯 번에 한 번쯤** 거절당한다. 그런
   * 실패는 재현이 안 돼서 원인을 못 찾는다 — 많이 돌려 본다.
   */
  it("어떤 입력이 와도 꼴이 안 깨진다", () => {
    for (let at = 0; at < 500; at += 1) {
      expect(stepIdempotencyKey(`${바깥열쇠}-${at}`, "generate")).toMatch(서버가받는꼴);
    }
  });
});
