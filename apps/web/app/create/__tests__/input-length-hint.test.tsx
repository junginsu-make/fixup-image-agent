import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { PAGE_CONTEXT_MAX_LENGTH, SELLER_BRIEF_MAX_LENGTH } from "@fixup/pdp-core";
import { InputLengthHint } from "../InputLengthHint";

/**
 * **제한을 보이게 한다**(U-08).
 *
 * 전에는 화면에 제한이 없었다. 사용자는 얼마든지 적고, 그 뒤에 값이 말없이
 * 잘리거나 「요청이 올바르지 않습니다」 한 줄을 만났다.
 */
const 글 = (length: number, limit = 100) =>
  JSON.stringify(create(<InputLengthHint value={"가".repeat(length)} limit={limit} />).toJSON());

describe("가까워졌을 때만 보인다", () => {
  it("**평소에는 안 보인다** — 모든 칸에 「0/500」이 뜨면 아무도 안 읽는다", () => {
    expect(create(<InputLengthHint value="짧다" limit={100} />).toJSON()).toBeNull();
  });

  it("8할을 넘기면 보인다", () => {
    expect(글(80)).toContain("80자");
  });

  it("**넘치면 얼마나 줄여야 하는지 말한다**", () => {
    const text = 글(130);

    expect(text).toContain("30자를 줄여");
    // 눈에 띄어야 한다. 회색으로 두면 넘친 줄 모른다.
    expect(text).toContain("text-warning");
  });

  it("딱 맞으면 넘친 것이 아니다", () => {
    const text = 글(100);

    expect(text).not.toContain("줄여");
    expect(text).not.toContain("text-warning");
  });
});

describe("화면이 실제로 쓴다", () => {
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");

  it("**판매자 칸에 붙는다**", () => {
    expect(client).toContain("limit={SELLER_BRIEF_MAX_LENGTH}");
  });

  it("**배경 칸에도 붙는다**", () => {
    expect(client).toContain("limit={PAGE_CONTEXT_MAX_LENGTH}");
  });

  it("**넘치면 분석을 못 시작한다**", () => {
    expect(client).toContain("overLimit.length === 0");
  });

  it("**왜 못 누르는지 말한다** — 막기만 하면 서버가 말없이 되돌려보내던 때와 같다", () => {
    expect(client).toContain("줄인 뒤 다시 눌러 주세요");
  });
});

describe("서버와 화면이 같은 상수를 쓴다", () => {
  it("**zod 에 손으로 적은 500 이 없다**", () => {
    const request = readFileSync(new URL("../../../lib/pdp/request.ts", import.meta.url), "utf8");

    expect(request).toContain("SELLER_BRIEF_MAX_LENGTH");
    expect(request).toContain("PAGE_CONTEXT_MAX_LENGTH");
    expect(request).not.toContain("text.max(500)");
  });

  it("**기획과 이미지 생성이 같은 상한이다** — 구성안을 다 만든 뒤 400 이 나면 안 된다", () => {
    const request = readFileSync(new URL("../../../lib/pdp/request.ts", import.meta.url), "utf8");

    expect(request).toContain("additionalInfo: text.max(PAGE_CONTEXT_MAX_LENGTH).optional()");
    expect(SELLER_BRIEF_MAX_LENGTH).toBeGreaterThan(0);
    expect(PAGE_CONTEXT_MAX_LENGTH).toBeGreaterThan(0);
  });
});
