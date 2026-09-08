import { describe, expect, it, vi } from "vitest";
import { removeBackground, BACKGROUND_REMOVAL_ENDPOINT, assertCutoutSize, MAX_CUTOUT_BYTES } from "../ad/background";

/**
 * 배경을 지워 오브젝트만 남긴다.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §2.3 · §3.1
 *
 * **기존 fal 큐 클라이언트로는 결과를 못 읽는다.** `lib/fal/queue.ts:33` 의
 * `jobResult` 는 `data.images` 를 보는데 birefnet 은 **`image`(단수)** 로
 * 돌려준다. 그래서 그 클라이언트는 **예외 없이 빈 배열**을 준다 — 던지지도
 * 않아서 「배경 제거가 조용히 아무것도 안 돌려주는」 고장이 된다.
 *
 * 그 클라이언트를 고치면 카드뉴스·포스터가 함께 영향받으므로(계약 밖) 여기서
 * 자기 몫만 읽는다.
 */

function falStub(data: unknown, onCall?: (endpoint: string, input: unknown) => void) {
  return {
    subscribe: async (endpoint: string, options: { input: unknown }) => {
      onCall?.(endpoint, options.input);
      return { data };
    },
  };
}

const ok = { image: { url: "https://fal/cut.png" } };

describe("배경 제거", () => {
  it("오브젝트 URL 을 돌려준다", async () => {
    const result = await removeBackground("https://fal/master.png", falStub(ok) as never);
    expect(result).toBe("https://fal/cut.png");
  });

  it("설계가 정한 엔드포인트를 부른다", async () => {
    const seen: string[] = [];
    await removeBackground("https://fal/m.png", falStub(ok, (e) => seen.push(e)) as never);
    expect(seen).toEqual([BACKGROUND_REMOVAL_ENDPOINT]);
    expect(BACKGROUND_REMOVAL_ENDPOINT).toBe("fal-ai/birefnet/v2");
  });

  it("올린 그림의 주소를 그대로 넘긴다", async () => {
    const inputs: unknown[] = [];
    await removeBackground("https://fal/m.png", falStub(ok, (_e, i) => inputs.push(i)) as never);
    expect(inputs).toEqual([{ image_url: "https://fal/m.png" }]);
  });

  /**
   * **`images`(복수)를 보면 안 된다.** 그것이 이 모듈이 존재하는 이유다.
   * 기존 클라이언트를 그냥 쓰면 여기서 조용히 빈 값이 나온다.
   */
  it("복수형 키에 속지 않는다", async () => {
    const wrong = { images: [{ url: "https://fal/wrong.png" }] };
    await expect(removeBackground("https://fal/m.png", falStub(wrong) as never))
      .rejects.toThrow();
  });

  it("응답에 주소가 없으면 던진다 — 조용히 빈 값을 주지 않는다", async () => {
    await expect(removeBackground("https://fal/m.png", falStub({ image: {} }) as never))
      .rejects.toThrow();
    await expect(removeBackground("https://fal/m.png", falStub(null) as never))
      .rejects.toThrow();
  });

  /**
   * **시한이 없으면 회원의 슬롯이 영구히 잠긴다**(설계 §9.2).
   * `withRenderSlot` 은 회원당 1 이라 본인도 재시도를 못 한다.
   */
  it("시한을 넘기면 던진다", async () => {
    const slow = {
      subscribe: () => new Promise(() => {}),
    };
    await expect(removeBackground("https://fal/m.png", slow as never, { timeoutMs: 30 }))
      .rejects.toThrow(/오래/);
  });

  it("시한 안에 끝나면 그대로 준다", async () => {
    const result = await removeBackground("https://fal/m.png", falStub(ok) as never, { timeoutMs: 5_000 });
    expect(result).toBe("https://fal/cut.png");
  });
});

/**
 * **시한이 지나도 fal 은 계속 돈다.**
 *
 * `Promise.race` 는 **기다리기를 그만둘 뿐** 폴링을 멈추지 않는다. 우리 쪽은
 * 60초 뒤 슬롯을 놓지만 fal 클라이언트는 그 뒤로도 상태를 물으며, 그 요청은
 * 서버가 살아 있는 한 계속 나간다. 원래는 주석으로만 적어 두었다 —
 * `@fal-ai/client` 의 `RunOptions` 에 `abortSignal` 이 있으므로 실제로 끊는다.
 */
describe("시한이 지나면 폴링도 끊는다", () => {
  it("시한을 넘기면 넘긴 신호가 abort 된다", async () => {
    let seen: AbortSignal | undefined;
    const never = {
      subscribe: (_endpoint: string, options: { abortSignal?: AbortSignal }) => {
        seen = options.abortSignal;
        return new Promise(() => {});
      },
    };
    await expect(removeBackground("https://fal/m.png", never as never, { timeoutMs: 30 }))
      .rejects.toThrow(/오래/);
    expect(seen).toBeDefined();
    expect(seen!.aborted).toBe(true);
  });

  /** 제때 끝났으면 안 끊는다 — 끊으면 다음 호출이 죽은 신호를 받는다. */
  it("제때 끝나면 abort 하지 않는다", async () => {
    let seen: AbortSignal | undefined;
    const quick = {
      subscribe: (_endpoint: string, options: { abortSignal?: AbortSignal }) => {
        seen = options.abortSignal;
        return Promise.resolve({ data: { image: { url: "https://fal/cut.png" } } });
      },
    };
    await removeBackground("https://fal/m.png", quick as never, { timeoutMs: 5_000 });
    expect(seen!.aborted).toBe(false);
  });
});

describe("내려받는 크기 상한", () => {
  it("상한 안이면 통과한다", () => {
    expect(() => assertCutoutSize(10, 100)).not.toThrow();
    expect(() => assertCutoutSize(100, 100)).not.toThrow();
  });

  it("상한을 넘으면 던진다", () => {
    expect(() => assertCutoutSize(101, 100)).toThrow(/너무 큽니다/);
  });

  /** 기본값이 실측(3MB 안쪽)보다 넉넉하되 무한은 아니다. */
  it("기본 상한이 32MB 다", () => {
    expect(MAX_CUTOUT_BYTES).toBe(32 * 1024 * 1024);
    expect(() => assertCutoutSize(MAX_CUTOUT_BYTES + 1)).toThrow();
  });
});
