import { describe, expect, it, vi } from "vitest";
import { copyText, randomId } from "../browser-safe";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("id 만들기", () => {
  it("있으면 브라우저 것을 쓴다", () => {
    const id = randomId({ randomUUID: () => "11111111-1111-4111-8111-111111111111" } as Crypto);
    expect(id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("없으면 직접 만든다", () => {
    // http 로 열면 randomUUID 가 아예 없다. getRandomValues 는 있다.
    const id = randomId({
      getRandomValues: (array: Uint8Array) => { array.fill(0xab); return array; },
    } as unknown as Crypto);
    expect(id).toMatch(UUID_V4);
  });

  it("직접 만든 것도 판(4)과 자리(8·9·a·b)를 지킨다", () => {
    const id = randomId({
      getRandomValues: (array: Uint8Array) => { array.fill(0xff); return array; },
    } as unknown as Crypto);
    expect(id[14]).toBe("4");
    expect("89ab").toContain(id[19]);
  });

  it("두 번 부르면 다른 값이 나온다", () => {
    let seed = 0;
    const crypto = {
      getRandomValues: (array: Uint8Array) => {
        for (let index = 0; index < array.length; index += 1) array[index] = (seed + index) % 256;
        seed += 1;
        return array;
      },
    } as unknown as Crypto;
    expect(randomId(crypto)).not.toBe(randomId(crypto));
  });

  it("아무것도 없으면 그때는 어쩔 수 없이 알린다", () => {
    // 조용히 엉성한 id 를 만들면 나중에 충돌로 드러난다. 그때는 원인을 못 찾는다.
    expect(() => randomId({} as Crypto)).toThrow();
  });
});

describe("복사하기", () => {
  it("있으면 브라우저 것을 쓴다", async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyText("여보세요", { clipboard: { writeText } } as never)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("여보세요");
  });

  it("없으면 옛 방식으로 넘어간다", async () => {
    // http 로 열면 navigator.clipboard 가 없다.
    const fallback = vi.fn(() => true);
    await expect(copyText("여보세요", {} as never, fallback)).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledWith("여보세요");
  });

  it("브라우저 것이 거부해도 옛 방식으로 넘어간다", async () => {
    // 권한이 없거나 창이 포커스를 잃으면 거부한다.
    const fallback = vi.fn(() => true);
    const clipboard = { writeText: async () => { throw new Error("거부"); } };
    await expect(copyText("여보세요", { clipboard } as never, fallback)).resolves.toBe(true);
    expect(fallback).toHaveBeenCalled();
  });

  it("둘 다 안 되면 false", async () => {
    await expect(copyText("여보세요", {} as never, () => false)).resolves.toBe(false);
  });
});
