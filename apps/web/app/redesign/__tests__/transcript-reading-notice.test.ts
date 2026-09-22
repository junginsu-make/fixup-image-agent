import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **원본을 못 읽었으면 말해야 한다**(2026-09-22 재검토).
 *
 * ── 무엇이 있었나 ──────────────────────────────────────────
 *
 * 「일부 구간 전사 실패」 알림이 **한 번도 화면에 안 떴다.** 토스트로 보냈는데
 * 바로 다음 줄이 같은 틱에 다른 토스트로 덮었다.
 *
 * ```
 * onNotice: setToast,                       // 실패 알림이 여기로 간다
 * …
 * setToast("원본 분석과 실제 이미지 생성을 시작합니다.");   // 같은 틱에 덮는다
 * ```
 *
 * 그리고 **전사가 통째로 실패하면 아무 말도 없었다** — `catch { transcript =
 * null }` 로 조용히 넘어간다.
 *
 * ── 왜 중요한가 ────────────────────────────────────────────
 *
 * 전사가 없으면 서버 프롬프트가 「원본 전사: 없음(이미지만으로 추정)」으로
 * 바뀐다. 그러면 **「전사에 없는 수치·인증·효능을 만들지 마라」는 제동과
 * `verified_facts` 가 함께 사라진다.** 결과는 나오지만 근거가 다른 물건이다.
 *
 * 저장소가 이미 같은 판단을 적어 뒀다 — **버리는 것 자체는 괜찮다. 안 알리는
 * 것이 문제다**(리디자인 참조 예산에서 겪었다).
 *
 * ── 무엇을 재는가 ──────────────────────────────────────────
 *
 * 문구는 화면이 정한다. 여기서는 **읽기가 어떻게 끝났는지를 단계가 위로
 * 올려 주는가**만 본다.
 */

const mocks = vi.hoisted(() => ({ split: vi.fn(), run: vi.fn() }));
vi.mock("../transcribe-client", () => ({
  splitFilesToStrips: mocks.split,
  runTranscription: mocks.run,
}));

const { runTranscriptStep } = await import("../transcript-step");

const 원본 = () => [new File(["a"], "원본.png", { type: "image/png" })];
const 입력 = (over: Record<string, unknown> = {}) => ({
  files: 원본(), provider: "openai", cache: null, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.split.mockResolvedValue({ strips: [{ base64: "AAA" }], cuts: [] });
  mocks.run.mockResolvedValue({ transcript: "### 구간 1", failedBatches: 0, complete: true });
});

describe("읽기가 어떻게 끝났는지 올린다", () => {
  it("**다 읽었으면 못 읽은 구간이 0 이다**", async () => {
    const result = await runTranscriptStep(입력() as never);

    expect(result.failedBatches).toBe(0);
    expect(result.readFailed).toBe(false);
  });

  it("**일부를 못 읽었으면 몇 구간인지 올린다**", async () => {
    mocks.run.mockResolvedValue({ transcript: "### 구간 1", failedBatches: 3, complete: false });

    const result = await runTranscriptStep(입력() as never);

    expect(result.failedBatches).toBe(3);
    expect(result.readFailed, "일부는 읽었으니 통째 실패가 아니다").toBe(false);
  });

  /**
   * **통째로 실패한 것과 일부 실패는 다르다.** 앞은 사진만 보고 만든다는
   * 뜻이고, 뒤는 읽은 범위로 만든다는 뜻이다. 화면이 다른 말을 해야 한다.
   */
  it("**통째로 못 읽었으면 그렇다고 올린다**", async () => {
    mocks.run.mockRejectedValue(new Error("공급자가 죽었다"));

    const result = await runTranscriptStep(입력() as never);

    expect(result.readFailed).toBe(true);
    expect(result.transcript, "못 읽었으면 없는 것이다").toBeNull();
  });

  it("**조각내다 터져도 통째 실패다**", async () => {
    mocks.split.mockRejectedValue(new Error("PDF 를 못 열었다"));

    const result = await runTranscriptStep(입력() as never);

    expect(result.readFailed).toBe(true);
  });

  /**
   * **글이 한 자도 안 나왔으면 읽은 것이 아니다.** 예외 없이 빈 값이 오는
   * 길이 있다 — 그때 「읽었다」고 하면 사용자는 근거가 있는 줄 안다.
   */
  it("**빈 전사는 못 읽은 것으로 본다**", async () => {
    mocks.run.mockResolvedValue({ transcript: "   ", failedBatches: 0, complete: true });

    const result = await runTranscriptStep(입력() as never);

    expect(result.readFailed).toBe(true);
  });

  /**
   * **캐시로 건너뛴 것은 실패가 아니다.** 지난 번에 끝까지 읽은 것을 쓴다.
   */
  it("**캐시를 쓰면 실패가 아니다**", async () => {
    const result = await runTranscriptStep(
      입력({ cache: { key: "원본.png:1", transcript: "지난 번에 읽은 것" } }) as never,
    );

    expect(result.fromCache).toBe(true);
    expect(result.readFailed).toBe(false);
    expect(result.failedBatches).toBe(0);
  });
});

/**
 * **알림을 토스트로 보내지 않는다.**
 *
 * 토스트는 2.8초 뒤 사라지고, 여기서는 같은 틱의 다음 토스트가 덮어 **아예
 * 안 보였다.** 단계는 값만 올리고, 남길지는 화면이 정한다.
 */
describe("단계는 문구를 만들지 않는다", () => {
  it("**실패를 알림으로 흘려보내지 않는다**", async () => {
    mocks.run.mockResolvedValue({ transcript: "### 구간 1", failedBatches: 2, complete: false });
    const 알림 = vi.fn();

    await runTranscriptStep(입력({ onNotice: 알림 }) as never);

    const 보낸것 = 알림.mock.calls.map((call) => String(call[0])).join(" ");
    expect(보낸것, "실패를 토스트로 흘려보낸다").not.toContain("전사 실패");
  });
});

/**
 * **알림을 만들어 두고 안 쓰면 아무것도 안 고친 것이다.**
 *
 * 이 저장소가 이미 겪은 꼴이다 — 조립기는 있는데 쓰는 곳이 없었다(X-07).
 *
 * 화면(`redesign-wizard.tsx`)은 브라우저 코드(pdfjs·캔버스)를 들여와 여기서
 * 못 띄운다. 옆의 `coverage-wiring.test.ts` 와 같은 사정이다. **글로
 * 잠근다** — 다른 방법이 없어서이지 이것이 더 나아서가 아니다.
 */
describe("화면이 그 알림을 실제로 쓴다", () => {
  const wizard = readFileSync(new URL("../redesign-wizard.tsx", import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("**전사 결과를 그대로 알림으로 옮긴다**", () => {
    expect(wizard, "전사 결과를 알림으로 안 옮긴다").toMatch(
      /setSourceReadingNotice\(sourceReadingNotice\(step\)\)/,
    );
  });

  it("**새 기획을 걸 때 지난 알림을 지운다** — 남으면 옛 경고가 계속 붙는다", () => {
    expect(wizard).toMatch(/setSourceReadingNotice\(""\)/);
  });

  /**
   * **남는 자리에 건다.** 토스트로 보내면 2.8초 뒤 사라지고, 실제로는 같은
   * 틱의 다음 토스트가 덮어 한 번도 안 보였다.
   */
  it("**경고 줄에 함께 그린다**", () => {
    /*
      **여는 조건까지 본다.** 뒤만 400자 보면 `sourceReadingNotice_ ? (` 를
      `false ? (` 로 바꿔도 통과했다 — 값은 배열 안에 그대로 남아 있고 조건만
      죽는다. 실측에서 드러난 자리다.
    */
    const 자리 = wizard.indexOf('role="alert"');
    expect(자리, "경고 줄을 못 찾았다").toBeGreaterThan(0);
    const 경고줄 = wizard.slice(Math.max(0, 자리 - 300), 자리 + 400);

    expect(경고줄, "알림을 경고 줄에 안 건다").toContain("sourceReadingNotice_ ?");
    expect(경고줄, "알림을 실제로 안 그린다").toContain("sourceReadingNotice_]");
  });

  it("**토스트로 보내지 않는다**", () => {
    expect(wizard, "알림이 다시 토스트로 갔다").not.toMatch(/setToast\(sourceReadingNotice/);
  });
});
