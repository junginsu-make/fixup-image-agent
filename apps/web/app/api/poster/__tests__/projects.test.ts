import { describe, expect, it, vi } from "vitest";

process.env.AD_EXPORT = "1";
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
      remove: async () => {},
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

  /** 모르는 id 를 실으면 크기 없이 생성을 부르게 된다. */
  it("모르는 id 는 안 싣는다", async () => {
    const { store, created } = fakeStore();
    await createPosterService(store).create({ ...ad, adMasterId: "없는-마스터" } as never);
    expect((created[0] as { data: { adMaster?: unknown } }).data.adMaster).toBeUndefined();
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
    const previous = process.env.AD_EXPORT;
    process.env.AD_EXPORT = "0";
    try {
      const { store, created } = fakeStore();
      await createPosterService(store).create(ad as never);
      expect((created[0] as { data: { adMaster?: unknown } }).data.adMaster).toBeUndefined();
    } finally {
      process.env.AD_EXPORT = previous;
    }
  });
});
