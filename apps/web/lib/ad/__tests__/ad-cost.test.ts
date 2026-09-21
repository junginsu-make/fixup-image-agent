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

/**
 * 어떤 것을 **마지막으로** 정의한 마이그레이션. 그것이 실제 동작이다.
 *
 * 전에는 「`ad_export` 가 적힌 가장 최신 파일」 하나를 골랐다. 그런데 예약
 * 함수를 다시 정의하는 마이그레이션은 화이트리스트를 그대로 옮겨 적으므로
 * `ad_export` 가 같이 적힌다 — 2026-09-20 에 분석 한도 정책을 고치면서 그
 * 파일이 골라졌고, 단가표를 안 건드렸다는 이유로 세 시험이 빨개졌다.
 *
 * 지키려는 것은 「한 파일에 다 있다」가 아니라 **「지금 실제로 걸려 있는
 * 정의들이 서로 안 어긋난다」**이다. 그러니 각각 마지막 것을 찾는다.
 */
const migrationsDir = path.join(REPO, "supabase", "migrations");
const migrationNames = readdirSync(migrationsDir).sort();
/**
 * 주석을 걷어내고 본다. 이 저장소의 SQL 은 설명이 길어서, 「무엇을 하려다
 * 말았다」고 적은 주석의 낱말이 정의로 오인된다.
 */
const readMigration = (name: string) =>
  readFileSync(path.join(migrationsDir, name), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");

function latestDefining(needle: string): string {
  const last = migrationNames.filter((name) => readMigration(name).includes(needle)).pop();
  expect(last, `${needle} 을 정의한 마이그레이션이 없다`).toBeTruthy();
  return readMigration(last!);
}

/** 표의 check 제약 / 예약 함수 / 단가표. 셋이 서로 다른 파일일 수 있다. */
const operationCheck = latestDefining("generation_events_operation_check");
const reserveFunction = latestDefining("create or replace function public.reserve_generation");
const priceTable = latestDefining(BACKGROUND_REMOVAL_MODEL);

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
    // 표가 받는 값
    const check = operationCheck.indexOf("generation_events_operation_check");
    expect(check).toBeGreaterThan(0);
    expect(operationCheck.slice(check)).toContain("'ad_export'");

    // 예약 함수가 통과시키는 값. 다른 파일에서 다시 정의됐을 수 있다.
    const reserve = reserveFunction.indexOf("create or replace function public.reserve_generation");
    expect(reserve).toBeGreaterThan(-1);
    expect(reserveFunction.slice(reserve)).toContain("'ad_export'");
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
    expect(priceTable).toContain(BACKGROUND_REMOVAL_MODEL);
    expect(priceTable).toContain("model_prices");
  });

  /** 코드의 값과 표의 값이 갈리면 장부가 거짓이 된다. */
  it("코드의 단가와 표의 단가가 같다", () => {
    const found = priceTable.match(/0\.00300/);
    expect(found).not.toBeNull();
    expect(BACKGROUND_REMOVAL_USD).toBeCloseTo(0.003, 6);
  });
});
