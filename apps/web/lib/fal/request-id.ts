/** A recovery receipt is an opaque application ID, never an API key. */
export const FAL_RECEIPT_PREFIX = "fxfal1.";
export interface FalReceipt { accountId: string; slotId: number; requestId: string; }
export class FalRecoveryRequiredError extends Error {
  // No HTTP status: callers must keep the reservation while the accepted job is recovered.
  constructor() { super("이미 접수된 이미지 요청의 계정 정보를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요."); this.name = "FalRecoveryRequiredError"; }
}
export const isFalReceipt = (id: string) => id.startsWith(FAL_RECEIPT_PREFIX);
export function parseFalReceipt(id: string): { receipt: FalReceipt; payload: string; signature: string } {
  try {
    if (id.length > 8192) throw new Error();
    const [prefix, payload, signature, extra] = id.split(".");
    if (prefix !== "fxfal1" || !payload || !/^[A-Za-z0-9_-]+$/.test(payload) || !signature || !/^[A-Za-z0-9_-]{43}$/.test(signature) || extra !== undefined) throw new Error();
    const bytes = Uint8Array.from(atob(payload.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
    const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(data) || data.length !== 3) throw new Error();
    const [accountId, slotId, requestId] = data;
    if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId) || !Number.isSafeInteger(slotId) || slotId < 1 || typeof requestId !== "string" || !requestId || isFalReceipt(requestId)) throw new Error();
    return { receipt: { accountId, slotId, requestId }, payload, signature };
  } catch { throw new FalRecoveryRequiredError(); }
}
/** Decode only AFTER the router has authenticated the receipt, or for server-owned cost metadata. */
export function falProviderRequestId(id: string): string {
  return isFalReceipt(id) ? parseFalReceipt(id).receipt.requestId : id;
}
