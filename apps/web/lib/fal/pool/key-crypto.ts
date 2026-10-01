import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * fal 키를 DB 에 넣기 전에 잠근다(설계 2026-09-29 §3.3 「암호화」).
 *
 * 비유: 키를 금고(DB)에 넣되, 금고 열쇠(`FAL_KEY_ENCRYPTION_SECRET`)는 서버에만 둔다. DB 를 다른 제품과
 * 함께 쓰므로 금고만 열린다고 키가 새지 않게 하는 것이 사실상 유일한 방어다.
 *
 * - AES-256-GCM, 기록마다 12바이트 무작위 IV, 16바이트 인증 태그
 * - **추가 인증 데이터 = 계정 id** — 암호문을 다른 행으로 옮겨 붙이면 풀리지 않는다
 * - 열쇠는 32바이트 무작위 값의 base64(`openssl rand -base64 32`). 운영 `app.env` 는 값을 큰따옴표로
 *   감싸 두므로(systemd 가 벗긴다) 혹시 남은 따옴표도 벗긴다
 */

export const FAL_KEY_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type MasterKey = { ok: true; key: Buffer } | { ok: false; reason: "missing" | "invalid" };

export function readMasterKey(raw: string | undefined): MasterKey {
  const value = (raw ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!value) return { ok: false, reason: "missing" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return { ok: false, reason: "invalid" };
  const key = Buffer.from(value, "base64");
  return key.length === 32 ? { ok: true, key } : { ok: false, reason: "invalid" };
}

export interface SealedFalKey {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function sealFalKey(master: Buffer, accountId: string, plain: string): SealedFalKey {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", master, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** 풀지 못하면(열쇠가 다름·다른 행의 암호문·변조) 던진다. */
export function openFalKey(master: Buffer, accountId: string, sealed: SealedFalKey): string {
  const tag = Buffer.from(sealed.tag, "base64");
  if (tag.length !== TAG_BYTES) throw new Error("fal key tag has the wrong length");
  const decipher = createDecipheriv("aes-256-gcm", master, Buffer.from(sealed.iv, "base64"), { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(accountId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/**
 * 붙여 넣은 키를 다듬는다. 앞뒤 공백·따옴표는 벗기고, 안에 공백·제어 문자가 있거나 길이가 이상하면 null.
 * (fal 키는 `아이디:비밀` 모양이지만 모양을 단정하지 않는다 — 확인은 fal 에 한 번 물어서 한다.)
 *
 * **제어 문자를 막는 까닭**: 이런 키를 그대로 `Authorization` 헤더에 실으면 `fetch`가
 * `Headers.append: "Key <키>" is an invalid header value` 처럼 키를 그대로 담은 오류를 던진다 —
 * 등록·다시 확인 단계에서 애초에 걸러 그 오류 자체가 나지 않게 한다.
 */
export function normalizeFalKey(raw: string): string | null {
  const value = raw.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (value.length < 16 || value.length > 300 || /[\s\x00-\x1f\x7f]/.test(value)) return null;
  return value;
}

export function lastFourOf(key: string): string {
  return key.slice(-4);
}
