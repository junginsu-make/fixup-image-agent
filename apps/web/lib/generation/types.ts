export type RunState = "prepared" | "running" | "collecting" | "settlement_pending" | "succeeded" | "failed" | "cancelled" | "needs_reconciliation";
export type AttemptState = "prepared" | "submitting" | "submitted" | "result_ready" | "stored" | "failed" | "unknown" | "cancelled";
export interface GenerationRun {
  id: string; user_id: string; event_id: string; operation: string;
  resource_type: "sns" | "poster" | "character" | null; resource_id: string | null;
  execution_snapshot: Record<string, unknown>; checkpoint: Record<string, unknown>;
  state: RunState; stop_requested_at: string | null;
  lease_token: string | null; lease_epoch: number; lease_until: string | null;
  error_code: string | null; max_cost_microusd: number; result_manifest: Record<string, unknown>;
}
export interface GenerationAttempt {
  id: string; run_id: string; logical_step: string; sequence: number;
  state: AttemptState; endpoint: string; model: string; provider: string;
  provider_request_id: string | null; request_payload: Record<string, unknown>;
  price_snapshot: { chargeUnitMicrousd?: number; chargeFlatMicrousd?: number; providerUnitMicrousd?: number;
    tokenPrice?:{inputPerMillion:number;outputPerMillion:number};webSearchCallMicrousd?:number };
  output_manifest: Record<string, unknown> | null;
  estimated_cost_microusd: number; requested_images: number; returned_images: number; delivered_images: number;
  measured_cost_microusd?: number; input_tokens?: number; output_tokens?: number; metering_state?: string;
  submitted_at?: string; error_code?: string;
}
export interface AttemptPatch {
  state: AttemptState; providerRequestId?: string; returnedImages?: number; deliveredImages?: number;
  costMicrousd?: number; meteringState?: "observed" | "estimated" | "unknown";
  inputTokens?: number; outputTokens?: number; output?: Record<string, unknown>; errorCode?: string;
}
export interface AttemptSpec {
  step: string; sequence: number; provider: string; model: string; endpoint: string;
  requestHash: string; payload: Record<string, unknown>; price: GenerationAttempt["price_snapshot"];
  maxCostMicrousd: number; requestedImages: number;
}
export interface ExecutionStore {
  prepare(spec: AttemptSpec): Promise<GenerationAttempt>;
  advance(id: string, patch: AttemptPatch): Promise<GenerationAttempt>;
  attempts(): Promise<GenerationAttempt[]>;
  checkpoint(data: Record<string, unknown>, state: "running" | "collecting" | "settlement_pending", delay?: number): Promise<GenerationRun>;
  persist(data: Record<string, unknown>): Promise<GenerationRun>;
  settle(): Promise<GenerationRun>;
  accepted?(attempt: GenerationAttempt, providerRequestId: string): Promise<void>;
}
export function isTerminal(state: RunState) { return ["succeeded","failed","cancelled"].includes(state); }
export function publicRun(run: GenerationRun) {
  return { id: run.id, state: run.state, active: !isTerminal(run.state), needsReview: run.state === "needs_reconciliation" };
}
