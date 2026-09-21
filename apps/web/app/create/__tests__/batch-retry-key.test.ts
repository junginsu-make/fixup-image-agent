import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { batchRetryKeyId } from "../batch-retry-key";

/**
 * **일괄 생성은 다시 누를 때마다 새로 예약했다**(K-05).
 *
 * 설계 §14.7: 「batch 통신 실패 재시도 key 변경 | **header만 아닌 동일 결과
 * 회수**로 수정」.
 *
 * `apiJson` 은 POST 에 `x-idempotency-key` 가 없으면 **매번 새로 만든다**
 * (`pdp-utils.ts`). 그런데 일괄 생성(`/pdp/images/batch`)은 그 머리글을 안
 * 실었다. 그래서 통신이 끊겨 다시 누르면
 *
 *   새 열쇠 → 새 예약 → **이미 만든 것을 또 만들고 또 받는다**
 *
 * 단건 경로는 섹션마다 열쇠를 붙잡아 둔다(`retryRequestKeysRef`). 일괄만
 * 빠져 있었다.
 *
 * ── 여기서 닫는 것과 못 닫는 것 ─────────────────────────────
 *
 * **닫는 것**: 같은 묶음을 다시 누르면 **같은 열쇠**가 간다. 서버가 중복을
 * 알아보고 거절하므로 두 번 받지 않는다.
 *
 * **못 닫는 것**: 설계가 말한 「동일 **결과** 회수」는 서버 job 이 켜져야 한다
 * (`PDP_JOBS_ENABLED` 가 꺼져 있다). 지금은 「두 번 안 받는다」까지다.
 */

describe("같은 묶음은 같은 열쇠를 쓴다", () => {
  it("**같은 섹션 묶음이면 같은 id 다**", () => {
    expect(batchRetryKeyId(["s1", "s2", "s3"])).toBe(batchRetryKeyId(["s1", "s2", "s3"]));
  });

  it("**묶음이 다르면 다른 id 다** — 안 그러면 다음 묶음이 중복으로 거절된다", () => {
    expect(batchRetryKeyId(["s1", "s2"])).not.toBe(batchRetryKeyId(["s3", "s4"]));
  });

  it("**차례가 다르면 다른 묶음이다**", () => {
    expect(batchRetryKeyId(["s1", "s2"])).not.toBe(batchRetryKeyId(["s2", "s1"]));
  });

  it("**한 장짜리 묶음도 제 id 가 있다**", () => {
    expect(batchRetryKeyId(["s1"])).toBeTruthy();
    expect(batchRetryKeyId(["s1"])).not.toBe(batchRetryKeyId(["s2"]));
  });

  it("**빈 묶음도 터지지 않는다**", () => {
    expect(batchRetryKeyId([])).toBeTruthy();
  });
});

/**
 * **조립기를 만들어 두고 화면이 안 쓰면 아무것도 안 고친 것이다.**
 *
 * 편집기는 렌더 시험 틀이 없다. 글로 잠근다.
 */
describe("편집기가 일괄 호출에 열쇠를 싣는다", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("**일괄 호출이 머리글을 싣는다**", () => {
    const 일괄자리 = editor.slice(editor.indexOf('apiJson<BatchImagesResponse>("/pdp/images/batch"'));

    expect(일괄자리.slice(0, 400)).toContain('"x-idempotency-key"');
  });

  it("**그 열쇠를 붙잡아 둔다** — 새로 만들면 다시 누를 때 또 예약한다", () => {
    const 일괄자리 = editor.slice(editor.indexOf("const chunkKeyId = batchRetryKeyId("));

    expect(일괄자리.slice(0, 400)).toContain("retryRequestKeysRef.current[chunkKeyId]");
    // 단건 경로와 같은 그릇을 쓴다. 두 벌로 두면 한쪽만 고치는 날 갈린다.
    expect(editor).toContain("retryRequestKeysRef.current[sectionKey]");
  });

  it("**없을 때만 새로 만든다** — 늘 새로 만들면 붙잡은 뜻이 없다", () => {
    const 일괄자리 = editor.slice(editor.indexOf("const chunkKeyId = batchRetryKeyId("));

    expect(일괄자리.slice(0, 400)).toMatch(/retryRequestKeysRef\.current\[chunkKeyId\] \?\? randomId\(\)/);
  });
});
