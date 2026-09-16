import { describe, expect, it } from "vitest";
import {
  JOB_GIVE_UP_MS,
  jobDone,
  jobId,
  parseJobs,
  pruneJobs,
  removeJob,
  upsertJob,
  type RunningJob,
} from "../running-jobs";

const job = (over: Partial<RunningJob> = {}): RunningJob => ({
  id: "sns:abc",
  tool: "sns",
  title: "월세 계약",
  href: "/sns/abc",
  startedAt: 1_000,
  poll: { url: "/api/sns/projects/abc/status" },
  ...over,
});

describe("일감 이름표", () => {
  it("도구와 프로젝트를 함께 쓴다", () => {
    // 카드뉴스와 포스터가 같은 id 를 쓸 수 있다.
    expect(jobId("sns", "abc")).toBe("sns:abc");
    expect(jobId("poster", "abc")).toBe("poster:abc");
  });
});

describe("목록에 넣고 빼기", () => {
  it("새 일감을 뒤에 붙인다", () => {
    const list = upsertJob([job()], job({ id: "poster:xyz", tool: "poster" }));
    expect(list.map((entry) => entry.id)).toEqual(["sns:abc", "poster:xyz"]);
  });

  it("같은 일감을 두 번 넣어도 하나다", () => {
    // 같은 프로젝트에서 다시 만들기를 누르면 또 등록된다.
    const list = upsertJob([job()], job({ title: "고친 제목" }));
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("고친 제목");
  });

  it("원래 목록을 건드리지 않는다", () => {
    const before = [job()];
    upsertJob(before, job({ id: "poster:xyz", tool: "poster" }));
    expect(before).toHaveLength(1);
  });

  it("빼면 그것만 빠진다", () => {
    const list = removeJob([job(), job({ id: "poster:xyz", tool: "poster" })], "sns:abc");
    expect(list.map((entry) => entry.id)).toEqual(["poster:xyz"]);
  });
});

describe("오래된 일감 버리기", () => {
  it("제한 시간을 넘긴 것은 버린다", () => {
    // 탭을 닫아 버려서 끝났는지 알 수 없는 일감이 영원히 남으면 안 된다.
    const list = pruneJobs([job({ startedAt: 0 })], JOB_GIVE_UP_MS + 1);
    expect(list).toEqual([]);
  });

  it("아직 시간이 남았으면 둔다", () => {
    expect(pruneJobs([job({ startedAt: 0 })], JOB_GIVE_UP_MS - 1)).toHaveLength(1);
  });

  it("버릴 것이 없으면 받은 배열을 그대로 돌려준다", () => {
    // 목록은 앱 전체를 감싸는 자리에 있다. 10초마다 새 배열을 만들면
    // 아무 일이 없어도 모든 화면이 다시 그려진다.
    const before = [job({ startedAt: 0 })];
    expect(pruneJobs(before, 1)).toBe(before);
  });

  it("없는 것을 빼도 그대로 돌려준다", () => {
    const before = [job()];
    expect(removeJob(before, "poster:없음")).toBe(before);
  });
});

describe("끝났는지 판단", () => {
  it("포스터는 done 으로 알려 준다", () => {
    expect(jobDone({ ok: true, done: true })).toBe(true);
    expect(jobDone({ ok: true, done: false })).toBe(false);
  });

  it("카드뉴스는 active 로 알려 준다", () => {
    expect(jobDone({ ok: true, active: false })).toBe(true);
    expect(jobDone({ ok: true, active: true })).toBe(false);
  });

  it("모르겠으면 계속 물어본다", () => {
    // 대답이 이상하다고 일감을 지우면, 아직 그리고 있는 것을 놓친다.
    expect(jobDone({ ok: false, message: "잠깐 끊김" })).toBe(false);
    expect(jobDone(null)).toBe(false);
  });
});

describe("저장해 둔 것 읽기", () => {
  it("모양이 맞는 것만 살린다", () => {
    // localStorage 는 사용자가 직접 고칠 수 있고, 옛 버전이 남아 있을 수도 있다.
    const parsed = parseJobs([job(), { id: "깨진 것" }, null]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.id).toBe("sns:abc");
  });

  it("배열이 아니면 빈 목록", () => {
    expect(parseJobs("무엇인가")).toEqual([]);
    expect(parseJobs(null)).toEqual([]);
  });

  it("보내는 몸통이 있는 일감도 살린다", () => {
    const withBody = job({ id: "poster:xyz", tool: "poster", poll: { url: "/x", body: { falRequestId: "r1" } } });
    expect(parseJobs([withBody])[0]!.poll.body).toEqual({ falRequestId: "r1" });
  });
});

/**
 * **끝난 것에는 「거절당해 끝난 것」도 들어간다.**
 *
 * 2026-09-16 실측: fal 이 `422`(content checker)로 거절했는데 셸의 「만드는 중」
 * 목록에서 그 작업이 안 사라졌다. `done === true` 만 봤기 때문이다 — 거절은
 * `done` 을 영영 안 준다. `JOB_GIVE_UP_MS` 가 4시간이라 그동안 돌고 있는 것처럼
 * 보였다.
 *
 * 서버는 이제 거절을 4xx 와 `ok:false` 로 알린다(`lib/fal/failure.ts`).
 * **더 물어볼 이유가 없는 답**은 끝난 것으로 본다.
 */
describe("거절도 끝난 것이다", () => {
  it("무엇 때문인지 밝힌 실패는 끝이다 — 더 물어봐도 같다", () => {
    expect(jobDone({ ok: false, kind: "rejected", message: "거절됐습니다" })).toBe(true);
  });

  /**
   * **까닭을 안 밝힌 `ok:false` 는 안 끝낸다.** 잠깐 끊긴 것일 수 있고, 그때
   * 지우면 아직 그리고 있는 것을 놓친다. 이 저장소가 이미 내린 판단이다.
   */
  it("까닭을 안 밝혔으면 계속 물어본다", () => {
    expect(jobDone({ ok: false, message: "잠깐 끊김" })).toBe(false);
  });

  it("제공자 고장·혼잡도 끝으로 본다", () => {
    expect(jobDone({ ok: false, kind: "provider_fault" })).toBe(true);
    expect(jobDone({ ok: false, kind: "busy" })).toBe(true);
  });

  /**
   * **아직 도는 것은 그대로 둔다.** `done:false` 는 「아직」이라는 뜻이지
   * 실패가 아니다. 여기서 끝내면 만들어 둔 그림을 못 본다.
   */
  it("아직 도는 것은 안 끝낸다", () => {
    expect(jobDone({ ok: true, done: false })).toBe(false);
  });

  it("끝난 것은 그대로 끝이다", () => {
    expect(jobDone({ ok: true, done: true })).toBe(true);
    expect(jobDone({ active: false })).toBe(true);
  });

  /** 답이 이상하면 계속 물어본다 — 섣불리 지우면 만든 그림을 못 본다. */
  it("모르는 모양이면 안 끝낸다", () => {
    expect(jobDone(null)).toBe(false);
    expect(jobDone({})).toBe(false);
    expect(jobDone("문자열")).toBe(false);
  });
});
