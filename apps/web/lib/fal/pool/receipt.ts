import { createHmac, timingSafeEqual } from "node:crypto";
import { FAL_RECEIPT_PREFIX, FalRecoveryRequiredError, parseFalReceipt, type FalReceipt } from "../request-id";

const signatureFor = (master: Buffer, payload: string) => {
  const key = createHmac("sha256", master).update("fixup/fal-recovery/signing/v1").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
};
export function sealFalReceipt(master: Buffer, receipt: FalReceipt): string {
  const payload = Buffer.from(JSON.stringify([receipt.accountId, receipt.slotId, receipt.requestId])).toString("base64url");
  return `${FAL_RECEIPT_PREFIX}${payload}.${signatureFor(master, payload)}`;
}
export function openFalReceipt(master: Buffer, id: string): FalReceipt {
  const parsed = parseFalReceipt(id);
  if (!timingSafeEqual(Buffer.from(parsed.signature), Buffer.from(signatureFor(master, parsed.payload)))) throw new FalRecoveryRequiredError();
  return parsed.receipt;
}
