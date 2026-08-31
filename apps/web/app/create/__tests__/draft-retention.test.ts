import { describe, expect, it } from "vitest";
import {
  DRAFT_RETENTION_DAYS,
  DRAFT_RETENTION_NOTICE,
  selectExpiredDraftIds,
} from "../draft-retention";

/**
 * 저장된 작업을 자동으로 지우는 규칙.
 *
 * 되돌릴 수 없는 일이라 경계를 못 박는다. 하루 차이로 남의 작업이 사라지면
 * 사과로 끝나지 않는다.
 */

const NOW = new Date("2026-07-31T12:00:00.000Z");

/** `days` 일 전에 저장된 초안. */
function draft(id: string, days: number) {
  return { id, updatedAt: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString() };
}

describe("만료된 초안 고르기", () => {
  it("30일이 지난 것만 고른다", () => {
    const ids = selectExpiredDraftIds(
      [draft("어제", 1), draft("한달반", 45), draft("오늘", 0)],
      NOW,
    );
    expect(ids).toEqual(["한달반"]);
  });

  it("정확히 30일째는 남긴다", () => {
    // 경계에서는 남기는 쪽으로 판단한다 — 지우는 것은 되돌릴 수 없다.
    expect(selectExpiredDraftIds([draft("경계", DRAFT_RETENTION_DAYS)], NOW)).toEqual([]);
  });

  it("30일을 조금이라도 넘기면 고른다", () => {
    const justOver = {
      id: "조금넘음",
      updatedAt: new Date(NOW.getTime() - DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000 - 1000).toISOString(),
    };
    expect(selectExpiredDraftIds([justOver], NOW)).toEqual(["조금넘음"]);
  });

  it("만든 날이 아니라 마지막 저장 시각으로 센다", () => {
    // 오래 붙잡고 다듬는 작업이 작업 도중에 사라지면 안 된다.
    const longRunning = { id: "오래다듬음", updatedAt: draft("x", 2).updatedAt };
    expect(selectExpiredDraftIds([longRunning], NOW)).toEqual([]);
  });

  it("날짜를 읽을 수 없으면 남긴다", () => {
    // 저장 형식이 바뀌었거나 깨진 기록이다. 판단이 안 서면 지우지 않는다.
    expect(selectExpiredDraftIds([{ id: "깨짐", updatedAt: "" }], NOW)).toEqual([]);
    expect(selectExpiredDraftIds([{ id: "이상", updatedAt: "언젠가" }], NOW)).toEqual([]);
  });

  it("빈 목록은 빈 결과", () => {
    expect(selectExpiredDraftIds([], NOW)).toEqual([]);
  });

  it("기간을 바꿔 부를 수 있다", () => {
    expect(selectExpiredDraftIds([draft("사흘전", 3)], NOW, 2)).toEqual(["사흘전"]);
    expect(selectExpiredDraftIds([draft("사흘전", 3)], NOW, 7)).toEqual([]);
  });
});

describe("안내 문구", () => {
  it("실제 보관 기간과 같은 숫자를 말한다", () => {
    // 코드가 30일인데 화면이 7일이라고 하면 거짓말이 된다.
    expect(DRAFT_RETENTION_NOTICE).toContain(String(DRAFT_RETENTION_DAYS));
    expect(DRAFT_RETENTION_NOTICE).toContain("자동으로 삭제");
  });
});
