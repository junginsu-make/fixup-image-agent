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
