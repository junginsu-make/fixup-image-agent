import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **본문 캐기 루프가 지켜야 할 세 가지.**
 *
 * `apps/worker/src/index.ts` 는 Supabase 클라이언트를 모듈 최상위에서 만들고
 * 환경변수를 요구해서 통째로 불러올 수 없다. 그래서 배선을 소스로 지킨다 —
 * 되돌아가면 그대로 사고가 나는 세 자리다.
 */
const worker = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

describe("한 건이 죽어도 나머지는 산다", () => {
  it("hydrate 를 감싼다", () => {
    // 갈래가 없어서, 자막이 꺼진 영상 하나가 던지면 이미 받아 둔 나머지까지
    // 한 건도 저장되지 않은 채 markFailed 로 끝났다. 그 영상이 피드 상위에서
    // 밀려날 때까지 매 회차 같은 자리에서 죽어 그 소스는 영구히 0건이었다.
    expect(worker).toContain("hydrated.push(await adapter.hydrate(item, ingestSource));");
    expect(worker).toMatch(/try \{\s*hydrated\.push\(await adapter\.hydrate/);
  });

  it("실패한 항목도 목록에는 남긴다", () => {
    // RSS·네이버 어댑터와 같은 답을 낸다.
    expect(worker).toContain('extractionStatus: "insufficient"');
  });
});

describe("이미 저장된 것은 다시 캐지 않는다", () => {
  it("중복 확인을 먼저 한다", () => {
    expect(worker).toContain("async function knownExternalIds(");
    expect(worker).toContain("if (seen.has(item.externalId)) continue;");
  });

  it("못 물어보면 지금까지처럼 전부 캔다", () => {
    // 비싸지만 안 빠뜨린다. 중복 확인 실패가 수집 중단이 되면 안 된다.
    expect(worker).toContain("중복 확인 실패, 전부 캐냅니다");
  });
});

describe("한 소스가 워커 전체를 막지 않는다", () => {
  it("리스보다 짧은 시간 예산을 둔다", () => {
    // 리스는 10분인데 STT 는 한 편에 최대 60분까지 기다린다. 그동안 다른
    // 사용자의 소스까지 폴링이 멈추고 리스는 만료된다.
    expect(worker).toContain("const HYDRATE_BUDGET_MS = (LEASE_MINUTES - 2) * 60 * 1000;");
    expect(worker).toContain("if (Date.now() >= deadline) {");
  });
});
