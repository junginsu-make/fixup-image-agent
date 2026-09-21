import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ auth: vi.fn(), repo: vi.fn(), sign: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({ authenticateApiMember: state.auth }));
vi.mock("../../../../lib/pdp/jobs", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/pdp/jobs")>("../../../../lib/pdp/jobs");
  return { ...actual, createPdpJobRepository: state.repo };
});
vi.mock("../../../../lib/pdp/jobs/artifact-urls", () => ({ signJobArtifacts: state.sign }));

const { GET } = await import("../jobs/[id]/route");
const { GET: 찾기 } = await import("../jobs/route");

const 작업 = (patch: Record<string, unknown> = {}) => ({
  id: "job-1", userId: "u1", teamId: null, documentId: "doc-1", revision: 1,
  operation: "pdp_image", sectionIds: ["s1"], reservationRequestId: "res-1",
  idempotencyKey: "k1", fingerprint: "f1",
  state: { generation: "completed", settlement: "settled", persistence: "stored", submission: "known" },
  leaseUntil: null, leaseOwner: null,
  items: [{ sectionId: "s1", attempt: 1, outputPath: "u1/pdp-jobs/job-1/s1-1.png" }],
  createdAt: "2026-09-17T10:00:00Z", updatedAt: "2026-09-17T10:05:00Z",
  ...patch,
});

const call = (id: string) =>
  GET(new Request(`http://local/api/pdp/jobs/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  state.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  state.sign.mockResolvedValue({ "u1/pdp-jobs/job-1/s1-1.png": "https://signed/s1" });
});

/**
 * **되찾는 자리.** 탭을 닫았다 돌아온 사용자가 여기서 결과를 찾는다.
 *
 * 조회 자체는 아무것도 만들지 않는다 — 돈이 안 든다(설계 §8.3).
 */
describe("내 작업만 본다", () => {
  it("결과 경로를 서명된 주소로 바꿔 돌려준다", async () => {
    state.repo.mockReturnValue({ get: async () => 작업() });

    const json = await (await call("job-1")).json();

    expect(json.ok).toBe(true);
    expect(json.job.outcome).toBe("done");
    expect(json.job.items[0].url).toBe("https://signed/s1");
  });

  it("**남의 작업은 404** — 있는지조차 알려 주지 않는다", async () => {
    state.repo.mockReturnValue({ get: async () => null });

    expect((await call("job-1")).status).toBe(404);
  });

  it("로그인하지 않으면 거절한다", async () => {
    state.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });

    expect((await call("job-1")).status).toBe(401);
  });

  it("**조회가 그림을 만들지 않는다** — 저장소를 읽기만 한다", async () => {
    const get = vi.fn(async () => 작업());
    state.repo.mockReturnValue({ get });

    await call("job-1");

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("**로그인한 사람의 id 로 찾는다** — 하드코딩하면 남의 것을 준다", async () => {
    const get = vi.fn(async () => 작업());
    state.repo.mockReturnValue({ get });
    state.auth.mockResolvedValue({ ok: true, member: { userId: "u-other" } });

    await call("job-1");

    expect(get).toHaveBeenCalledWith("job-1", "u-other");
  });
});

describe("아직 끝나지 않은 작업", () => {
  it("진행 중이면 그렇게 알린다", async () => {
    state.repo.mockReturnValue({
      get: async () => 작업({ state: { generation: "generating", settlement: "pending", persistence: "pending", submission: "known" } }),
    });

    const json = await (await call("job-1")).json();

    expect(json.job.outcome).toBe("running");
  });

  it("**저장 못 한 섹션은 주소가 없다** — 없는 자리를 가리키지 않는다", async () => {
    state.repo.mockReturnValue({
      get: async () => 작업({ items: [{ sectionId: "s1", attempt: 1, errorCode: "artifact_upload_failed" }] }),
    });

    const json = await (await call("job-1")).json();

    expect(json.job.items[0].url).toBeNull();
    expect(json.job.items[0].errorCode).toBe("artifact_upload_failed");
  });
});

/**
 * **초안 id 로 자기 작업을 찾는다**(K-04).
 *
 * 탭을 닫았다 돌아온 사용자는 **작업 번호를 모른다.** 번호는 생성 응답에
 * 실려 오는데, 닫고 나간 경우가 바로 그 응답을 못 받은 경우다. 그동안 서버는
 * 그림을 저장소에 올려 두었다.
 *
 * 이 문이 없으면 `GET /api/pdp/jobs/:id` 는 **아무 화면도 못 부르는 문**이고,
 * 사용자는 이미 값을 치른 그림을 다시 만들어 두 번 낸다.
 */
describe("초안으로 내 작업을 찾는다", () => {
  /**
   * 깃발을 켜고 부른다.
   *
   * **꺼져 있으면 이 문은 아무 일도 안 한다**(설계 §15) — 그 성질은 아래
   * 별도 묶음에서 잰다.
   */
  const 찾는다 = async (query: string) => {
    process.env.PDP_JOBS_ENABLED = "1";
    try {
      return await 찾기(new Request(`http://local/api/pdp/jobs?${query}`));
    } finally {
      delete process.env.PDP_JOBS_ENABLED;
    }
  };

  it("**찾으면 같은 모양으로 준다** — 화면이 두 벌을 읽지 않는다", async () => {
    state.repo.mockReturnValue({ findLatestForDocument: async () => 작업() });

    const json = await (await 찾는다("documentId=doc-1&revision=1")).json();

    expect(json.ok).toBe(true);
    expect(json.job.id).toBe("job-1");
    expect(json.job.items[0].url).toBe("https://signed/s1");
  });

  it("**로그인한 사람의 id 로 찾는다** — 초안 id 만 알아서는 남의 것을 못 본다", async () => {
    const find = vi.fn(async () => 작업());
    state.repo.mockReturnValue({ findLatestForDocument: find });
    state.auth.mockResolvedValue({ ok: true, member: { userId: "u-other" } });

    await 찾는다("documentId=doc-1&revision=1");

    expect(find).toHaveBeenCalledWith("u-other", "doc-1", 1);
  });

  it("**없으면 404** — 있는지조차 알려 주지 않는다", async () => {
    state.repo.mockReturnValue({ findLatestForDocument: async () => null });

    expect((await 찾는다("documentId=doc-1&revision=1")).status).toBe(404);
  });

  it("로그인하지 않으면 거절한다", async () => {
    state.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });
    const find = vi.fn();
    state.repo.mockReturnValue({ findLatestForDocument: find });

    expect((await 찾는다("documentId=doc-1&revision=1")).status).toBe(401);
    // 문을 지나기 전에 저장소를 읽으면 안 된다.
    expect(find).not.toHaveBeenCalled();
  });

  it("**초안 id 가 없으면 400** — 빈 값으로 훑지 않는다", async () => {
    const find = vi.fn();
    state.repo.mockReturnValue({ findLatestForDocument: find });

    expect((await 찾는다("revision=1")).status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  /**
   * **개정판을 안 보내면 0 이다.** 첫 개정판이 0 이라 그 값이 기본이어야
   * 하는데, `Number(null)` 도 0 이라 조용히 맞는 것처럼 보인다. 값으로 못 박는다.
   */
  it("**개정판을 안 보내면 0 으로 본다**", async () => {
    const find = vi.fn(async () => 작업());
    state.repo.mockReturnValue({ findLatestForDocument: find });

    await 찾는다("documentId=doc-1");

    expect(find).toHaveBeenCalledWith("u1", "doc-1", 0);
  });

  /**
   * **빈 값은 안 보낸 것과 같다.** `Number("")` 도 0 이라 조용히 통과하는데,
   * 그러면 「안 보냈다」와 「빈 값을 보냈다」의 뜻이 갈린 채로 같은 답을 준다.
   */
  it("**개정판이 빈 값이면 0 으로 본다**", async () => {
    const find = vi.fn(async () => 작업());
    state.repo.mockReturnValue({ findLatestForDocument: find });

    await 찾는다("documentId=doc-1&revision=");

    expect(find).toHaveBeenCalledWith("u1", "doc-1", 0);
  });

  /**
   * **음수는 못 찾는 것이 아니라 잘못 물은 것이다.**
   *
   * 표에 `check (revision >= 0)` 이 있어 저장될 수 없는 값이라 어차피 404 가
   * 되지만, 404 는 「그런 작업이 없다」는 뜻이다. 잘못 물었으면 그렇게 답해야
   * 화면이 무엇이 틀렸는지 안다.
   */
  it("**개정판이 음수면 400** — 못 찾은 것과 잘못 물은 것은 다르다", async () => {
    const find = vi.fn();
    state.repo.mockReturnValue({ findLatestForDocument: find });

    expect((await 찾는다("documentId=doc-1&revision=-1")).status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  it("**개정판이 숫자가 아니면 400** — 엉뚱한 개정판의 그림을 주지 않는다", async () => {
    const find = vi.fn();
    state.repo.mockReturnValue({ findLatestForDocument: find });

    expect((await 찾는다("documentId=doc-1&revision=어제")).status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });
});

/**
 * **꺼져 있으면 있는 줄도 몰라야 한다**(설계 §15).
 *
 * 작업 경로가 꺼져 있으면 서버는 작업을 아예 안 만든다. 그래도 화면은 빈
 * 섹션이 있는 초안을 열 때마다 여기로 물어 왔고, 답은 반드시 404 인데 그때마다
 * 로그인 확인과 표 조회가 왕복했다.
 */
describe("작업 경로가 꺼져 있을 때", () => {
  it("**저장소에 손도 안 댄다**", async () => {
    const find = vi.fn();
    state.repo.mockReturnValue({ findLatestForDocument: find });

    const response = await 찾기(new Request("http://local/api/pdp/jobs?documentId=doc-1&revision=0"));

    expect(response.status).toBe(404);
    expect(find).not.toHaveBeenCalled();
    // 로그인 확인조차 안 간다. 켜기 전까지는 있는 줄도 몰라야 한다.
    expect(state.auth).not.toHaveBeenCalled();
  });
});
