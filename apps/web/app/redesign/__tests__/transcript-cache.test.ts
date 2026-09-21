import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * **잘린 전사가 캐시에 박히면 안 된다.**
 *
 * `runTranscription` 은 중단 시 예외를 던지지 않고 이미 끝난 배치까지만
 * 이어붙여 **정상으로 돌아온다.** 그래서 부르는 쪽이 보기에는 성공과 구별되지
 * 않았고, 그 값을 성공한 것과 같은 열쇠로 캐시에 넣었다. 5배치짜리를 2/5 에서
 * 취소하고 설정만 바꿔 다시 만들면, 전사 단계를 건너뛰고 앞 2/5 텍스트만으로
 * 생성됐다 — 하단의 수치·인증번호·후기가 통째로 빠진 결과가 새로고침 전까지
 * 계속 나왔다.
 *
 * ── 글자 대조에서 실제 실행으로 ─────────────────────────────
 *
 * 전에는 화면 소스에 그 한 줄이 있는지를 **글자로** 봤다. 규칙이 화면 안에
 * 있어 돌려 볼 수 없었기 때문이다. 그 코드가 `transcript-step.ts` 로 나오면서
 * **실제로 돌려서 잰다**(F-7-0).
 */

const mocks = vi.hoisted(() => ({ split: vi.fn(), run: vi.fn() }));
vi.mock("../transcribe-client", () => ({
  splitFilesToStrips: mocks.split,
  runTranscription: mocks.run,
}));

const { runTranscriptStep, transcriptCacheKey } = await import("../transcript-step");

const 원본 = () => [new File(["a"], "원본.png", { type: "image/png" })];
const 입력 = (over: Record<string, unknown> = {}) => ({
  files: 원본(), provider: "openai", cache: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.split.mockResolvedValue({ strips: [{ base64: "AAA" }], cuts: [] });
  mocks.run.mockResolvedValue({ transcript: "### 구간 1", failedBatches: 0, complete: true });
});

describe("끝까지 간 것만 캐시에 넣는다", () => {
  it("**끝까지 읽었으면 캐시에 넣는다**", async () => {
    const result = await runTranscriptStep(입력() as never);

    expect(result.nextCache).toEqual({ key: transcriptCacheKey(원본()), transcript: "### 구간 1" });
  });

  /**
   * **중단은 예외를 안 던진다.** 여기서 안 가르면 앞 2/5 만 읽은 글이 영구히
   * 재사용된다.
   */
  it("**중간에 멈췄으면 캐시에 안 넣는다**", async () => {
    mocks.run.mockResolvedValue({ transcript: "### 구간 1 까지만", failedBatches: 0, complete: false });

    const result = await runTranscriptStep(입력() as never);

    // 이번 생성에는 읽은 만큼 쓴다. 다만 남기지는 않는다.
    expect(result.transcript).toBe("### 구간 1 까지만");
    expect(result.nextCache).toBeNull();
  });

  it("**전사가 통째로 터져도 생성은 진행한다**", async () => {
    mocks.run.mockRejectedValue(new Error("connect ETIMEDOUT"));

    const result = await runTranscriptStep(입력() as never);

    expect(result.transcript).toBeNull();
    expect(result.nextCache).toBeNull();
  });
});

describe("같은 자료면 다시 안 읽는다", () => {
  it("**열쇠가 같으면 모델을 안 부른다**", async () => {
    const cache = { key: transcriptCacheKey(원본()), transcript: "지난 번 전사" };

    const result = await runTranscriptStep(입력({ cache }) as never);

    expect(mocks.run).not.toHaveBeenCalled();
    expect(result.transcript).toBe("지난 번 전사");
    expect(result.fromCache).toBe(true);
  });

  it("**자료가 바뀌면 다시 읽는다**", async () => {
    const cache = { key: "다른자료.png:9", transcript: "엉뚱한 전사" };

    const result = await runTranscriptStep(입력({ cache }) as never);

    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(result.transcript).toBe("### 구간 1");
  });

  /**
   * **크기가 다르면 다른 자료다.** 이름만 보면 같은 이름의 다른 파일을 같은
   * 것으로 친다.
   */
  it("**이름이 같아도 크기가 다르면 다른 열쇠다**", () => {
    const a = [new File(["a"], "원본.png")];
    const b = [new File(["aaaa"], "원본.png")];

    expect(transcriptCacheKey(a)).not.toBe(transcriptCacheKey(b));
  });
});

describe("자른 범위를 위로 올린다", () => {
  it("**조각내기가 말한 것을 그대로 넘긴다**", async () => {
    mocks.split.mockResolvedValue({
      strips: [{ base64: "AAA" }],
      cuts: [{ what: "transcribe-pdf-pages", used: 20, total: 100 }],
    });

    const result = await runTranscriptStep(입력() as never);

    expect(result.cuts).toEqual([{ what: "transcribe-pdf-pages", used: 20, total: 100 }]);
  });

  it("**캐시를 쓰면 자른 것이 없다** — 이번에 아무것도 안 잘랐다", async () => {
    const cache = { key: transcriptCacheKey(원본()), transcript: "지난 번 전사" };

    const result = await runTranscriptStep(입력({ cache }) as never);

    expect(result.cuts).toEqual([]);
  });
});

/**
 * **화면 폴더를 통째로 읽는다.**
 *
 * 한 파일만 읽으면 코드가 옆 파일로 옮겨간 순간 시험이 조용히 통과하거나
 * 엉뚱하게 빨개진다. 2,589줄짜리 화면을 여덟 파일로 쪼갤 때 실제로 그랬다.
 */
const client = readFileSync(new URL("../transcribe-client.ts", import.meta.url), "utf8");
const wizard = readdirSync(new URL("..", import.meta.url))
  .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
  .map((name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8"))
  .join("\n");

describe("전사 캐시", () => {
  it("끝까지 갔는지 알려 준다", () => {
    expect(client).toContain("complete: done === batches.length");
  });

  it("**화면이 그 단계를 쓴다** — 안 쓰면 위 시험이 다 헛것이다", () => {
    expect(wizard).toContain("runTranscriptStep(");
  });

  /**
   * **「끝까지 갔을 때만」이 화면 쪽에 남아 있다.**
   *
   * `runTranscriptStep` 이 `nextCache: null` 을 돌려줘도 화면이 그것을 그냥
   * 대입하면 **잘린 전사가 캐시에 박힌다** — 이 항목이 막으려던 바로 그 꼴이
   * 되살아난다. 대입 조건까지 잰다(2026-09-21 리뷰).
   */
  it("**빈 캐시를 그냥 대입하지 않는다**", () => {
    expect(wizard).toContain("if (step.nextCache) transcriptCacheRef.current = step.nextCache;");
  });
});

describe("파일 다시 고르기", () => {
  it("고른 뒤 입력 값을 비운다", () => {
    // 안 비우면 같은 파일을 다시 고를 때 change 가 안 뜬다. 배지에는 옛 파일이
    // 남아 있는데 사용자는 새로 고른 줄 알고 크레딧을 쓴다.
    expect(wizard).toContain('event.target.value = "";');
  });
});
