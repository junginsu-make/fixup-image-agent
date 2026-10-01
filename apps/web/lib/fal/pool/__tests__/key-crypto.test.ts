import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lastFourOf, normalizeFalKey, openFalKey, readMasterKey, sealFalKey } from "../key-crypto";

/**
 * **키 잠그기**(설계 2026-09-29 §3.3). DB 를 다른 제품과 함께 쓰므로 암호화가 사실상 유일한 방어다.
 */
const 열쇠 = randomBytes(32);
const 계정 = "a1000000-0000-4000-8000-000000000001";
const 원문 = "11111111-2222-3333-4444-555555555555:0123456789abcdef";

describe("열쇠 읽기", () => {
  it("32바이트 base64 만 받는다 — 따옴표는 벗긴다", () => {
    const b64 = 열쇠.toString("base64");
    expect(readMasterKey(b64)).toEqual({ ok: true, key: 열쇠 });
    expect(readMasterKey(`"${b64}"`)).toEqual({ ok: true, key: 열쇠 });
    expect(readMasterKey(` '${b64}' `)).toEqual({ ok: true, key: 열쇠 });
  });

  it("없으면 missing, 길이·모양이 틀리면 invalid", () => {
    expect(readMasterKey(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(readMasterKey('""')).toEqual({ ok: false, reason: "missing" });
    expect(readMasterKey(randomBytes(16).toString("base64"))).toEqual({ ok: false, reason: "invalid" });
    expect(readMasterKey("not base64 at all!")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("잠그고 풀기", () => {
  it("같은 열쇠·같은 계정이면 풀린다. 원문은 암호문 어디에도 없다", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    expect(openFalKey(열쇠, 계정, sealed)).toBe(원문);
    expect(JSON.stringify(sealed)).not.toContain("0123456789abcdef");
    expect(Buffer.from(sealed.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(sealed.tag, "base64")).toHaveLength(16);
  });

  it("같은 키도 잠글 때마다 IV·암호문이 다르다", () => {
    const a = sealFalKey(열쇠, 계정, 원문);
    const b = sealFalKey(열쇠, 계정, 원문);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("**다른 계정 행으로 옮겨 붙이면 안 풀린다**(추가 인증 데이터 = 계정 id)", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    expect(() => openFalKey(열쇠, "a1000000-0000-4000-8000-000000000002", sealed)).toThrow();
  });

  it("열쇠가 다르거나 한 글자라도 바뀌면 안 풀린다", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    expect(() => openFalKey(randomBytes(32), 계정, sealed)).toThrow();
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => openFalKey(열쇠, 계정, { ...sealed, ciphertext: flipped.toString("base64") })).toThrow();
  });

  it("잘린 태그는 받지 않는다", () => {
    const sealed = sealFalKey(열쇠, 계정, 원문);
    const short = Buffer.from(sealed.tag, "base64").subarray(0, 4).toString("base64");
    expect(() => openFalKey(열쇠, 계정, { ...sealed, tag: short })).toThrow();
  });
});

describe("붙여 넣은 키 다듬기", () => {
  it("앞뒤 공백·따옴표를 벗기고 끝 4자리를 뽑는다", () => {
    expect(normalizeFalKey(`  "${원문}"\n`)).toBe(원문);
    expect(lastFourOf(원문)).toBe("cdef");
  });

  it("너무 짧거나 안에 공백이 있으면 받지 않는다", () => {
    expect(normalizeFalKey("short")).toBeNull();
    expect(normalizeFalKey("abcd efgh ijkl mnop qrst")).toBeNull();
  });
});
