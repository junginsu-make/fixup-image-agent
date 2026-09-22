import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPlanStage,
  isPlanProgressId,
  markPlanStage,
  readPlanStage,
  resetPlanProgressForTest,
} from "../plan-progress";

/**
 * **기획이 어디쯤인지 잠깐 들고 있는 자리**(2026-09-22 사용자 요청).
 *
 * 기획은 4분 가까이 걸린다. 화면이 3초마다 물어보므로, 서버는 코어가 알려 준
 * 단계를 그 사이 들고 있어야 한다.
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 값을 넣고 꺼내는 것보다 **안 알려 주는 쪽**이 중요하다. 남의 진행 상황,
 * 아무 글자, 오래된 것.
 */

beforeEach(() => {
  resetPlanProgressForTest();
  vi.useRealTimers();
});

describe("번호를 가린다", () => {
  it("**멀쩡한 번호는 받는다**", () => {
    expect(isPlanProgressId("abc12345")).toBe(true);
    expect(isPlanProgressId("a-b_c-1234567890")).toBe(true);
  });

  it.each([
    ["빈 것", ""],
    ["너무 짧은 것", "abc"],
    ["빗금", "../../etc/passwd"],
    ["공백", "abc 12345"],
    ["숫자", 12345678],
    ["없는 것", undefined],
  ])("**%s 은 안 받는다**", (_이름, value) => {
    expect(isPlanProgressId(value)).toBe(false);
  });

  it("**너무 긴 것은 안 받는다** — 장부를 부풀릴 수 있다", () => {
    expect(isPlanProgressId("a".repeat(65))).toBe(false);
  });
});

describe("넣고 꺼낸다", () => {
  it("**넣은 단계가 그대로 나온다**", () => {
    markPlanStage("run-00000001", "member-1", "review");

    expect(readPlanStage("run-00000001", "member-1")).toBe("review");
  });

  it("**나중 것이 앞의 것을 덮는다** — 지금 어디인지만 알면 된다", () => {
    markPlanStage("run-00000001", "member-1", "blueprint");
    markPlanStage("run-00000001", "member-1", "review");

    expect(readPlanStage("run-00000001", "member-1")).toBe("review");
  });

  it("**없는 번호는 모른다고 한다**", () => {
    expect(readPlanStage("run-00000002", "member-1")).toBeNull();
  });

  it("**끝나면 지운다**", () => {
    markPlanStage("run-00000001", "member-1", "finish");
    clearPlanStage("run-00000001");

    expect(readPlanStage("run-00000001", "member-1")).toBeNull();
  });
});

/**
 * **남의 기획 상황을 알려 주지 않는다.**
 *
 * 단계 하나가 큰 비밀은 아니다. 그래도 번호를 찍어 맞히면 **남이 지금 상세
 * 페이지를 만들고 있다**는 것을 알게 된다. 막는 값이 한 줄이라 막는다.
 */
describe("남의 것은 안 알려 준다", () => {
  it("**다른 사람이 물으면 모른다고 한다**", () => {
    markPlanStage("run-00000001", "member-1", "review");

    expect(readPlanStage("run-00000001", "member-2")).toBeNull();
  });

  it("**누구인지 모르면 안 알려 준다**", () => {
    markPlanStage("run-00000001", "member-1", "review");

    expect(readPlanStage("run-00000001", "")).toBeNull();
  });

  it("**주인 없이 넣으면 안 들어간다**", () => {
    markPlanStage("run-00000001", "", "review");

    expect(readPlanStage("run-00000001", "member-1")).toBeNull();
  });
});

describe("이상한 값은 안 들어간다", () => {
  it("**모르는 단계 이름은 안 받는다**", () => {
    markPlanStage("run-00000001", "member-1", "검수중" as never);

    expect(readPlanStage("run-00000001", "member-1")).toBeNull();
  });

  it("**번호 규격을 벗어나면 안 받는다**", () => {
    markPlanStage("../x", "member-1", "review");

    expect(readPlanStage("../x", "member-1")).toBeNull();
  });
});

/**
 * **오래된 것은 없는 것이다.**
 *
 * 브라우저를 닫고 간 사람의 기록이 남으면 장부가 계속 자란다. 그리고 한참
 * 뒤에 같은 번호로 물으면 **지난 번 기획의 단계**를 답하게 된다.
 */
describe("오래되면 사라진다", () => {
  it("**10분이 지나면 모른다고 한다**", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00Z"));
    markPlanStage("run-00000001", "member-1", "review");

    vi.setSystemTime(new Date("2026-09-22T00:09:00Z"));
    expect(readPlanStage("run-00000001", "member-1"), "9분은 아직 산다").toBe("review");

    vi.setSystemTime(new Date("2026-09-22T00:11:00Z"));
    expect(readPlanStage("run-00000001", "member-1"), "11분은 죽는다").toBeNull();
  });

  /**
   * **끝없이 자라지 않는다.** 탭을 닫고 간 사람들의 기록이 쌓이면 메모리가
   * 는다. 넣을 때마다 낡은 것을 쓸고, 그래도 넘치면 오래된 것부터 버린다.
   */
  it("**너무 많이 쌓이면 오래된 것부터 버린다**", () => {
    for (let i = 0; i < 600; i += 1) {
      markPlanStage(`run-${String(i).padStart(8, "0")}`, "member-1", "review");
    }

    expect(readPlanStage("run-00000000", "member-1"), "제일 오래된 것이 남아 있다").toBeNull();
    expect(readPlanStage("run-00000599", "member-1"), "방금 넣은 것이 사라졌다").toBe("review");
  });
});
