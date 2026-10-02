import { isUuid, type AiCostProvider } from "./keys";
import { falProviderRequestId } from "../fal/request-id";

/**
 * **공급자를 한 번 부를 때마다 한 줄**을 적는다(설계 2026-09-30 §3.4).
 *
 * ── 누가 부르나 ────────────────────────────────────────────
 *
 * 직접 부르지 않는다. `lib/llm/meter.ts` 의 `recordLlmUsage`(글 모델)와 `recordAiCost`
 * (그림·웹검색·Apify)가 부른다. 거기서 요청 문맥(누가·어느 요청·무슨 작업)을 붙여 넘긴다.
 *
 * ── 실패하면 ──────────────────────────────────────────────
 *
 * **던지지 않는다.** 경고 한 줄만 남긴다(§3.4 「쓰기 실패는 호출을 막지 않는다」).
 * 장부 한 줄 때문에 이미 돈이 나간 결과를 사용자가 못 보면 더 나쁘다.
 *
 * ── Supabase 가 없으면 ─────────────────────────────────────
 *
 * 조용히 건너뛴다. 로컬은 일부러 Supabase 를 비워 둔다(`CLAUDE.md` 「로컬 확인」) — 그 값을
 * 채우면 로컬이 운영 DB 에 쓰게 된다. 시험도 같은 이유로 비어 있다.
 */

export type AiCostBasis = "tokens" | "image_unit" | "provider_reported" | "estimate";

/** 누구의 무슨 호출인가. 라우트 입구가 채운다(`bindAiCaller`). */
export interface AiCaller {
  userId: string | null;
  requestId: string | null;
  operation: string;
}

export interface AiCostEntry {
  provider: AiCostProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  /** `image_unit` 이면 비운다 — DB 가 `model_prices` 로 매긴다. 나머지는 반드시 준다. */
  usd?: number;
  basis: AiCostBasis;
  failed?: boolean;
  falRequestId?: string | null;
}

/** `ai_cost_record` 의 인자 그대로. */
export interface AiCostRow {
  p_user: string | null;
  p_request: string | null;
  p_operation: string;
  p_provider: AiCostProvider;
  p_model: string;
  p_input_tokens: number;
  p_output_tokens: number;
  p_images: number;
  p_usd: number | null;
  p_basis: AiCostBasis;
  p_failed: boolean;
  p_fal_request_id: string | null;
}

/** 문맥 없이 적힌 줄. 화면에 「문맥 없음」으로 보여 빠진 입구를 찾게 한다. */
export const UNBOUND_OPERATION = "unbound";

const count = (value: number | undefined, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.round(value as number), 0), max) : 0;

export function toAiCostRow(caller: AiCaller | undefined, entry: AiCostEntry): AiCostRow {
  return {
    p_user: isUuid(caller?.userId) ? caller!.userId : null,
    p_request: isUuid(caller?.requestId) ? caller!.requestId : null,
    p_operation: (caller?.operation || UNBOUND_OPERATION).slice(0, 80),
    p_provider: entry.provider,
    p_model: (entry.model || "unknown").slice(0, 200),
    p_input_tokens: count(entry.inputTokens, 2_000_000_000),
    p_output_tokens: count(entry.outputTokens, 2_000_000_000),
    p_images: count(entry.images, 100),
    p_usd: entry.basis === "image_unit" ? null : Math.max(0, Number((entry.usd ?? 0).toFixed(6))),
    p_basis: entry.basis,
    p_failed: entry.failed === true,
    p_fal_request_id: entry.falRequestId?.trim() ? falProviderRequestId(entry.falRequestId.trim()) : null,
  };
}

export type AiCostWriter = (row: AiCostRow) => Promise<void>;

async function supabaseWriter(row: AiCostRow): Promise<void> {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  // 부를 때 불러온다. 이 모듈은 계량기(`meter.ts`)가 쓰고, 계량기는 시험·로컬 어디서나 불린다.
  const { createSupabaseAdminClient } = await import("../supabase/admin");
  const { error } = await createSupabaseAdminClient().rpc("ai_cost_record", row);
  if (error) throw new Error(error.message);
}

let writer: AiCostWriter = supabaseWriter;

/** 시험 전용. `null` 이면 원래 쓰기로 돌아간다. */
export function replaceAiCostWriterForTest(next: AiCostWriter | null): void {
  writer = next ?? supabaseWriter;
}

export async function writeAiCostRow(caller: AiCaller | undefined, entry: AiCostEntry): Promise<void> {
  /*
    `toAiCostRow` 도 try 안에서 부른다 — 밖에서 부르면 그 호출이 던질 때(예: 잘못된 타입의
    `entry.usd`) 처리 안 된 거부(unhandled rejection)가 되어 요청과 무관하게 프로세스를
    흔든다. 이 함수의 계약은 "절대 던지지 않는다"(§3.4)인데 모양을 만드는 자리가 빠져 있었다.
  */
  try {
    const row = toAiCostRow(caller, entry);
    await writer(row);
  } catch (error) {
    console.warn("[ai-cost] 비용 한 줄을 적지 못했습니다", {
      operation: caller?.operation ?? UNBOUND_OPERATION,
      provider: entry.provider,
      model: entry.model,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 요청이 끝나기 전에 쓰기를 기다린다. **오래 붙잡지 않는다** — DB 가 느려도 응답은 나간다.
 *
 * 기다리는 이유: 응답을 보낸 직후 배포로 프로세스가 내려가면 아직 안 끝난 쓰기가
 * 사라진다(설계 §7). 한도를 두는 이유: 장부 때문에 사용자가 기다리면 안 된다.
 */
export async function flushAiCostWrites(pending: readonly Promise<void>[], timeoutMs = 3000): Promise<void> {
  if (pending.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([Promise.allSettled(pending).then(() => undefined), limit]);
  } finally {
    clearTimeout(timer);
  }
}
