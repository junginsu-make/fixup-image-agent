import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDatabase, type LocalDatabase } from "../local-store";
import { createLocalPosterImageStore, createLocalPosterRequestStore } from "../poster/local-store";

vi.mock("server-only", () => ({}));

/**
 * 결과 목록이 **만든 차례**로 나오고, 고친 결과에 **무엇을 고쳤는지**가 붙는가.
 *
 * 2026-09-29 — 변형 3을 고친 결과가 목록 앞쪽에 「변형 1」로 붙었다. 목록을
 * 요청마다 0 부터 세는 `variantIndex` 로만 줄 세웠기 때문이다. 로컬과 운영이
 * 같은 규칙(`@fixup/poster-core` 의 `orderPosterImages`·`withEditLineage`)을 탄다.
 */

let root: string;
let database: LocalDatabase;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "poster-images-"));
  database = createLocalDatabase(root);
  /*
   * **시각을 손으로 정한다.** 로컬 저장소는 줄마다 밀리초 시각을 찍는다. 두 번의
   * 넣기가 같은 밀리초에 떨어지면 변형 번호로 줄 서서 이 시험이 가끔 깨진다 —
   * 빠른 CI 에서 그럴 수 있다(2026-09-29 리뷰). 실제로는 고치기가 몇 분 뒤다.
   * `Date` 만 가짜로 두어 파일 쓰기는 그대로 돈다.
   */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T08:00:00.000Z"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

const row = (generationRequestId: string, variantIndex: number) => ({
  projectId: "p1", generationRequestId, variantIndex,
  assetPath: `u1/poster/p1/${generationRequestId}/${variantIndex}.png`, thumbPath: null,
  width: 1024, height: 1536, review: null,
});

const request = (overrides: { parentImageId?: string | null; editInstruction?: string | null; requestedImages: number }) => ({
  projectId: "p1", parentImageId: null, editInstruction: null,
  modelId: "gpt-image-2", ratioId: "2:3", mode: "i2i" as const, size: {},
  unitCostUsd: 0.1, costApproximate: false,
  ...overrides,
});

async function 처음만들고고친다() {
  const requests = createLocalPosterRequestStore(database, "u1");
  const images = createLocalPosterImageStore(database, "u1");
  const first = await requests.create(request({ requestedImages: 3 }));
  const [, , 변형3] = await images.add([row(first.id, 0), row(first.id, 1), row(first.id, 2)]);
  // 고치기는 몇 분 뒤에 온다.
  vi.setSystemTime(new Date("2026-09-29T08:05:00.000Z"));
  const edit = await requests.create(request({
    requestedImages: 1, parentImageId: 변형3!.id, editInstruction: "배경을 밤으로 바꿔 주세요",
  }));
  const [고친것] = await images.add([row(edit.id, 0)]);
  return { images, 변형3: 변형3!, 고친것: 고친것! };
}

describe("로컬 결과 목록", () => {
  it("고친 결과가 맨 뒤에 온다 — 「변형 1」 옆에 끼지 않는다", async () => {
    const { images, 고친것 } = await 처음만들고고친다();
    const list = await images.byProject("p1");
    expect(list.map((image) => image.variantIndex)).toEqual([0, 1, 2, 0]);
    expect(list.at(-1)!.id).toBe(고친것.id);
  });

  it("고친 결과에 무엇을 무슨 말로 고쳤는지 붙는다", async () => {
    const { images, 변형3, 고친것 } = await 처음만들고고친다();
    const list = await images.byProject("p1");
    expect(list.find((image) => image.id === 고친것.id)!.edit)
      .toEqual({ parentImageId: 변형3.id, instruction: "배경을 밤으로 바꿔 주세요" });
    expect(list.find((image) => image.id === 변형3.id)!.edit).toBeNull();
  });

  it("남의 고치기 이력은 안 붙는다", async () => {
    const { 변형3 } = await 처음만들고고친다();
    const 남 = createLocalPosterRequestStore(database, "u2");
    const 남의요청 = await 남.create(request({ requestedImages: 1, parentImageId: 변형3.id, editInstruction: "남의 지시" }));
    // 같은 요청 id 로 내 그림이 있을 수는 없지만, 있어도 남의 장부는 읽지 않는다.
    const images = createLocalPosterImageStore(database, "u1");
    const [mine] = await images.add([row(남의요청.id, 0)]);
    const list = await images.byProject("p1");
    expect(list.find((image) => image.id === mine!.id)!.edit).toBeNull();
  });
});
