import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CREDIT_UNIT_USD } from "@fixup/shared";
import {
  BACKGROUND_REMOVAL_MODEL,
  BACKGROUND_REMOVAL_USD,
  adExportUnits,
  adExportUsd,
} from "../cost";

/**
 * 광고 규격 내보내기의 크레딧.
 *
 * 이 도구는 **새로 그리지 않는다.** 자르기·줄이기는 우리 CPU 만 쓰므로 원가가
 * 0 이고, 밖에 돈을 내는 자리는 투명 배너의 배경 제거 한 번뿐이다.
 *
 * 다른 도구와 같은 공식을 쓴다(사용자 결정 2026-09-14).
 */

const WEB = process.cwd();
const REPO = path.join(WEB, "..", "..");
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

const route = read("app/api/ad/export/route.ts");
const client = read("app/ad/ad-export-client.tsx");
const types = read("lib/membership/types.ts");

/** 이번에 더한 마이그레이션. 파일 이름이 바뀌어도 내용으로 찾는다. */
const migration = (() => {
  const dir = path.join(REPO, "supabase", "migrations");
  for (const name of readdirSync(dir).sort().reverse()) {
    const body = readFileSync(path.join(dir, name), "utf8");
    if (body.includes("ad_export")) return body;
  }
  return "";
})();

describe("원가", () => {
  it("배경 제거를 안 하면 0원이다", () => {
    expect(adExportUsd(0)).toBe(0);
  });

  it("부른 횟수만큼 든다", () => {
    expect(adExportUsd(1)).toBeCloseTo(BACKGROUND_REMOVAL_USD, 6);
    expect(adExportUsd(3)).toBeCloseTo(BACKGROUND_REMOVAL_USD * 3, 6);
  });

  /** 음수나 소수가 들어와도 장부가 음수로 가면 안 된다. */
  it("이상한 값에도 0 아래로 안 간다", () => {
    for (const odd of [-1, -100, Number.NaN]) {
      expect(adExportUsd(odd)).toBe(0);
    }
  });
});

describe("장수", () => {
  /**
   * **자르기·줄이기만 하면 0장이다.** 밖에 낸 돈이 없기 때문이다.
   * 그래도 예약은 거친다 — 그것은 아래 「예약을 거친다」가 본다.
   */
  it("배경 제거를 안 하면 0장이다", () => {
    expect(adExportUnits(0)).toBe(0);
  });

  /** 1원이라도 썼으면 최소 1장이다. */
  it("배경 제거를 한 번 하면 1장이다", () => {
    expect(adExportUnits(1)).toBe(1);
    expect(BACKGROUND_REMOVAL_USD).toBeLessThan(CREDIT_UNIT_USD);
  });

  it("여러 번 불러도 공식이 같다", () => {
    const calls = 40;
    expect(adExportUnits(calls)).toBe(
      Math.max(1, Math.ceil((BACKGROUND_REMOVAL_USD * calls) / CREDIT_UNIT_USD)),
    );
  });
});

describe("장부에 실제로 걸려 있다", () => {
  it("예약을 거친다", () => {
    expect(route).toContain('reserveAiUsage(request, "ad_export"');
  });

  /**
   * **원가가 0 이어도 예약은 거친다.**
   *
   * 「차감이 0」과 「검사를 안 한다」는 다르다. 정지된 계정과 한도 초과는
   * 0장짜리 요청도 막아야 한다.
   */
  it("예약을 조건부로 건너뛰지 않는다", () => {
    const at = route.indexOf("reserveAiUsage(request");
    const before = route.slice(Math.max(0, at - 400), at);
    expect(before).not.toContain("if (planned > 0)");
    expect(before).not.toContain("if (needsCutout(parsed.data.specIds)) {");
  });

  /** 성공·실패 양쪽에서 닫아야 예약된 크레딧이 안 묶인다. */
  it("성공과 실패 양쪽에서 장부를 닫는다", () => {
    expect(route.split("settleAiUsage(").length - 1).toBeGreaterThanOrEqual(2);
    expect(route).toContain('"ad_export_failed"');
  });

  /**
   * **지정한 크기로 안 나온 것은 안 센다.** 규격 검증을 통과한 것만 `ok` 다.
   */
  it("규격을 통과한 것만 성공으로 센다", () => {
    expect(route).toContain('results.filter((entry) => entry.status === "ok")');
  });

  it("실제로 부른 횟수로 정산한다", () => {
    expect(route).toContain("cutoutCalls += 1");
    expect(route).toContain("adExportUnits(cutoutCalls)");
  });

  /** 모델을 안 남기면 나중에 어떤 값으로 곱할지 알 수 없다. */
  it("어떤 모델에 돈을 냈는지 남긴다", () => {
    expect(route).toContain("BACKGROUND_REMOVAL_MODEL");
    expect(route).toContain("billableImages: cutoutCalls");
  });

  it("화면이 요청 식별자를 붙인다", () => {
    expect(client).toContain('"x-idempotency-key"');
    expect(client).toContain("randomId()");
  });

  it("화면이 사용량 칸을 바로 고친다", () => {
    expect(client).toContain("studio-usage-updated");
  });
});

describe("마이그레이션과 코드가 어긋나지 않는다", () => {
  /**
   * **2026-09-08 에 실제로 당한 자리다.**
   *
   * 표의 check 만 넓히고 `reserve_generation` 의 화이트리스트를 빠뜨려서,
   * 이미지 만들기와 카드뉴스가 전부 `invalid_request` 로 거절됐다. 둘 중
   * 좁은 쪽이 실제 한계다.
   */
  it("표의 check 와 예약 함수가 모두 ad_export 를 안다", () => {
    expect(migration).not.toBe("");
    const check = migration.indexOf("generation_events_operation_check");
    const reserve = migration.indexOf("function public.reserve_generation");
    expect(check).toBeGreaterThan(0);
    expect(reserve).toBeGreaterThan(0);

    // check 제약 쪽에 한 번, 예약 함수 쪽에 한 번 — 둘 다 있어야 한다.
    expect(migration.slice(check, reserve)).toContain("'ad_export'");
    expect(migration.slice(reserve)).toContain("'ad_export'");
  });

  /** 코드가 보내는 값과 DB 가 받는 값이 같아야 한다. */
  it("코드의 operation 이름이 마이그레이션과 같다", () => {
    expect(types).toContain('"ad_export"');
    expect(route).toContain('"ad_export"');
  });

  /**
   * 단가표에 행이 없으면 원가 집계가 $0 으로 잡힌다. 같은 일이 2026-09-10 에
   * 세 모델에서 이미 났다.
   */
  it("배경 제거 단가가 표에 들어간다", () => {
    expect(migration).toContain(BACKGROUND_REMOVAL_MODEL);
    expect(migration).toContain("model_prices");
  });

  /** 코드의 값과 표의 값이 갈리면 장부가 거짓이 된다. */
  it("코드의 단가와 표의 단가가 같다", () => {
    const found = migration.match(/0\.00300/);
    expect(found).not.toBeNull();
    expect(BACKGROUND_REMOVAL_USD).toBeCloseTo(0.003, 6);
  });
});
