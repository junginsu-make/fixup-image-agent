import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// **전역에 대입하면 워커에 남는다.** vitest 는 워커를 파일 간에 재사용한다.
beforeEach(() => vi.stubEnv("AD_EXPORT", "1"));
afterEach(() => vi.unstubAllEnvs());
import { PosterProjectInputSchema } from "@fixup/poster-core";
import { createPosterService, PosterValidationError } from "../projects/poster-service";

const valid = {
  title: "가을 사진전",
  ratio: "2:3",
  modelId: "gpt-image-2",
  variants: 3,
  instruction: "필름 카메라 감성의 사진전 포스터",
  referenceIds: ["11111111-1111-4111-8111-111111111111"],
};

function fakeStore() {
  const created: unknown[] = [];
  return {
    created,
    store: {
      list: async () => [],
      get: async () => undefined,
      create: vi.fn(async (row: unknown) => {
        created.push(row);
        return { ...(row as object), id: "p1", createdAt: "t", updatedAt: "t" } as never;
      }),
      update: async () => ({}) as never,
      remove: async () => true,
    },
  };
}

describe("포스터 프로젝트 입력", () => {
  it("요청 본문의 user_id 를 받지 않는다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, userId: "attacker" }).success).toBe(false);
  });

  it("픽셀이나 해상도를 받지 않는다 — 비율에서 백엔드가 정한다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, width: 2400 }).success).toBe(false);
  });
});

describe("포스터 프로젝트 만들기", () => {
  it("만들 수 없는 조합은 fal 을 부르기 전에 막는다", async () => {
    const { store } = fakeStore();
    const service = createPosterService(store);
    await expect(service.create({
      ...PosterProjectInputSchema.parse({ ...valid, modelId: "nano-banana-pro", ratio: "a4-print" }),
    })).rejects.toBeInstanceOf(PosterValidationError);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("만들 수 있는 조합은 draft 로 저장한다", async () => {
    const { store, created } = fakeStore();
    const service = createPosterService(store);
    await service.create(PosterProjectInputSchema.parse(valid));
    expect((created[0] as { status: string }).status).toBe("draft");
  });

  it("슬롯이 없으면 빈 슬롯으로 시작한다 — 사람이 채울 수 있어야 한다", async () => {
    const { store, created } = fakeStore();
    await createPosterService(store).create(PosterProjectInputSchema.parse(valid));
    const data = (created[0] as { data: { slots: { headline: string } } }).data;
    expect(data.slots.headline).toBe("");
  });

  it("저장소에 userId 를 넘기지 않는다 — 세션에 묶인 저장소가 붙인다", async () => {
    const { store, created } = fakeStore();
    await createPosterService(store).create(PosterProjectInputSchema.parse(valid));
    expect(created[0]).not.toHaveProperty("userId");
  });
});

/**
 * 광고 마스터가 프로젝트에 실리는 길 (설계 §10 3-b).
 *
 * **픽셀을 밖에서 받지 않는다.** 마스터 id 만 받고 서버가 `AD_MASTERS` 에서
 * 픽셀로 바꾼다. 자유 픽셀을 받으면 `{ 3840, 3840 }` 이 8.29MP 를 만드는데
 * 장부에는 자리표시 1088×1088 값이 남는다 — 최대 두 배가 조용히 벌어진다.
 */
describe("광고 마스터", () => {
  const ad = { ...valid, ratio: "match-source", adMasterId: "ad-191x1" };

  it("스키마가 마스터 id 를 받는다", () => {
    expect(PosterProjectInputSchema.safeParse(ad).success).toBe(true);
  });

  it("긴 id 를 거절한다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...ad, adMasterId: "x".repeat(65) }).success).toBe(false);
  });

  it("픽셀은 여전히 안 받는다", () => {
    const withPixels = { ...valid, adMaster: { width: 3840, height: 3840 } };
    expect(PosterProjectInputSchema.safeParse(withPixels).success).toBe(false);
  });

  it("id 를 픽셀로 바꿔 싣는다", async () => {
    const { store, created } = fakeStore();
    await createPosterService(store).create(ad as never);
    expect((created[0] as { data: { adMaster?: unknown } }).data.adMaster)
      .toEqual({ width: 2048, height: 1072 });
  });

  /**
   * **조용히 버리면 안 된다.** 버리면 `adMaster` 없는 광고 프로젝트가 되고,
   * `match-source` 라 생성이 첨부 파일을 재서 **엉뚱한 크기**를 만든다. 화면은
   * 사용자가 고른 마스터에 맞춰 파생 계획을 세웠는데 나온 그림이 다르다 —
   * 파생이 실패하고 **그때는 이미 과금된 뒤다**(§4.4).
   */
  it("모르는 id 는 시끄럽게 거절한다 — 만들지 않는다", async () => {
    const { store, created } = fakeStore();
    await expect(createPosterService(store).create({ ...ad, adMasterId: "없는-마스터" } as never))
      .rejects.toBeInstanceOf(PosterValidationError);
    expect(created, "거절했으면 프로젝트가 생기면 안 된다").toEqual([]);
  });

  it("안 보내면 필드가 안 생긴다 — 지금까지의 작업과 같은 모양이다", async () => {
    const { store, created } = fakeStore();
    await createPosterService(store).create(valid as never);
    expect((created[0] as { data: object }).data).not.toHaveProperty("adMaster");
  });

  /**
   * 계약 5. **3단계는 돈이 나가는 단계라 끌 수 있어야 할 필요가 2단계보다 크다.**
   * 스위치가 꺼져 있으면 마스터가 안 실리고, 그러면 첨부를 재는 지금 경로로 떨어진다.
   */
  it("기능 스위치가 꺼져 있으면 안 싣는다", async () => {
    vi.stubEnv("AD_EXPORT", "0");
    const { store, created } = fakeStore();
    await createPosterService(store).create(ad as never);
    expect((created[0] as { data: { adMaster?: unknown } }).data.adMaster).toBeUndefined();
  });

  /**
   * **꺼져 있으면 모르는 id 도 조용히 버린다.** 그쪽에서 거절하면 기능이 꺼진
   * 상태에서 광고 필드에 반응하는 것이라 **스위치 상태가 새어 나간다.**
   */
  it("꺼져 있으면 모르는 id 에도 반응하지 않는다", async () => {
    vi.stubEnv("AD_EXPORT", "0");
    const { store } = fakeStore();
    await expect(createPosterService(store).create({ ...ad, adMasterId: "없는-마스터" } as never))
      .resolves.toBeDefined();
  });
});
