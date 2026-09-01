import { describe, expect, it, vi } from "vitest";
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
