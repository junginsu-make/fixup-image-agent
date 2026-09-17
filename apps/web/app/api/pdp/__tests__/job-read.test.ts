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
