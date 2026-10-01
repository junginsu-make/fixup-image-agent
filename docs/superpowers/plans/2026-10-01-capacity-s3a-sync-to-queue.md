# 100명 대비 S3a — 동기 fal 호출을 대기열로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상세페이지(이미지·대표 이미지·한 장 다시 만들기)·캐릭터·리디자인이 fal 을 **동기(`fal.run`)** 로 부르던 것을 **대기열 제출 + 상태 확인**으로 바꿔, fal 계정의 동시 한도를 넘었을 때 곧바로 429 로 실패하던 것을 없앤다. 화면이 기다리는 모양·응답·오류 코드·비용 한 줄·크레딧 정산은 그대로다.

**Architecture:** 대기열 제출 한 곳(`lib/fal/http.ts` `submitFalQueue` — 손으로 `fetch` 한 번, 비용 한 줄도 여기서)과 키마다 따로 만든 공식 클라이언트로 상태·결과·취소(`falQueueOps`)를 둔다. 「어느 키로 보내고 어느 키로 묻나」는 `FalRouter` 모양(`lib/fal/route.ts`)으로 감싸고, S3a 는 서버 `FAL_KEY` 하나(`envFalRouter`)만 쓴다 — S3b 가 같은 모양으로 계정 풀을 끼운다. `runFalQueued`(`lib/fal/run.ts`)가 제출 → 1초마다 상태 → 결과를 요청 안에서 기다리고(fal 쪽 대기 상한 120초, 우리 쪽 상한 300초), 상세페이지·리디자인 생성기가 그것을 부른다.

**Tech Stack:** Next.js 15.5(라우트는 nodejs), `@fal-ai/client` 1.10.1(설치본, 새 의존성 없음), vitest 4.1, k6(측정만)

**Spec:** `docs/superpowers/specs/2026-10-01-fal-account-pool-addendum.md`(보충 — 이 계획의 기준) · `docs/superpowers/specs/2026-09-29-capacity-100-design.md` §3.3·§3.9·§4(S3) · 지킬 계약 `docs/superpowers/specs/2026-09-30-ai-usage-control-design.md` §3.3·§3.4

## Global Constraints

- 설계 §3.3 「먼저 동기 호출을 없앤다」 — 이 단계는 **키 하나(`FAL_KEY`)** 로만 한다. 계정 풀·관리자 화면·DB 는 S3b
- **마이그레이션 없음, 새 환경변수 없음.** 독립 배포(설계 §4 S3 「○」)
- 바뀌면 안 되는 것(보충 §5): 상세페이지 생성기 모양(`ImageGenerator`: 한 장 → `{ base64, mimeType }`)과 오류 코드(`AI_QUOTA_EXCEEDED`·`PDP_IMAGE_GENERATION_FAILED`·`AI_KEY_MISSING`), 리디자인 오류 문구(「이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.」·「이미지를 생성하지 못했습니다 (N).」·「만든 이미지를 내려받지 못했습니다.」), 크레딧 예약·정산 라우트(손대지 않는다)
- **비용 한 줄은 제출 자리 한 곳**(`lib/fal/http.ts`)에서, fal 요청 번호를 싣는다(ai-control §3.4·I-9). 상태·결과 조회에서는 적지 않는다
- fal 쪽 대기 상한 `x-fal-request-timeout: 120`, 우리 쪽 상한 300초(넘으면 취소 한 번 + 실패), 상태 확인 1초 간격(보충 §3)
- 공식 클라이언트는 **키마다 `createFalClient`** 로 만든다. 전역 `fal.config` 를 쓰지 않는다(동시 요청끼리 키가 섞인다)
- 제출은 공식 `queue.submit` 이 아니라 `fetch` 한 번 — 공식 제출은 429·5xx 를 같은 키로 3번 다시 보낸다(보충 §2). S3a 에서는 그 재시도도 없어진다(포스터·카드뉴스 제출은 S3a 에서 **안 바꾼다** — S3b)
- 화면에 나가는 우리말 문자열에 줄표(—)를 쓰지 않는다(`app/__tests__/ui-text-dash.test.ts` 가 `lib/` 의 한글 문자열도 잰다)
- 새 의존성 없음. Windows·EC2 에서 배포 꾸러미를 빌드하지 않는다. 시험 서버용 빌드는 B 에서, 저장소가 공개라 **push 대신 git bundle**
- 커밋 메시지 `<type>(<영역>): <한국어 설명>` + 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push 는 사용자 지시가 있을 때만
- 사용자에게 하는 보고는 한국어·쉬운 말(비개발자)

## 계획을 쓰며 확인한 사실

| 확인 | 결과 | 근거 |
|---|---|---|
| 동기 호출 자리 | `lib/pdp/fal.ts:21·42`(상세페이지 이미지·대표 이미지·한 장 다시·캐릭터 — 캐릭터는 `lib/characters.ts:31` 이 같은 생성기를 부른다), `lib/redesign/image-generator.ts:48·126`(리디자인 생성·섹션 고치기) | grep `fal.run` |
| 그 밖의 fal 길 | 포스터·카드뉴스 = 이미 대기열(`lib/fal/queue.ts`, 화면이 물을 때 결과), 배경 제거 = `fal.subscribe`(대기열 + 클라이언트 폴링, `lib/ad/background.ts:113`). **S3a 대상 아님** | 같은 grep |
| 공식 클라이언트 인스턴스 | `createFalClient(userConfig)` → `createConfig(userConfig)` 를 인스턴스마다 따로 | `node_modules/@fal-ai/client/src/client.js` |
| 공식 제출 재시도 | `QUEUE_RETRY_CONFIG = { maxRetries: 3, … retryableStatusCodes: [429,502,503,504] }` 를 호출마다 덮어씀 | `src/queue.js:33-38·66`, `src/request.js:35` |
| 상태 주소 | 엔드포인트 앞 두 칸 + `/requests/<id>/status`(공식 클라이언트가 만든다 — 손으로 만들지 않는다) | `src/queue.js:73-81` |
| fal 쪽 대기 상한 | 머리 `x-fal-request-timeout`, 넘으면 504 + `x-fal-request-timeout-type: user` → `ApiError.timeoutType === "user"` | `src/headers.js`, `src/response.js:17-33·59-71` |
| 오류 상태 코드 | 공식 클라이언트 실패는 `ApiError.status`, 손으로 보낸 제출 실패는 `FalHttpError.status`(이 계획) — 둘 다 `status` 숫자라 `classifyFalFailure`(`lib/fal/failure.ts`) 그대로 읽힌다 | 같은 곳 |
| 가짜 AI(B) | 대기열 제출·상태·결과·취소를 이미 흉내 낸다(`tools/mock-ai/fal.mjs:63-168`). 키는 안 본다 → Task 6 에서 키별 흉내를 더한다(S3b 도 쓴다) | 이 컴퓨터 `scratchpad/loadtest/tools/mock-ai` |
| 계획 코드 검증 | 일회용 워크트리(master `0e4cd257`)에서 이 계획의 코드로 `tsc` 0 · 관련 시험 전부 통과 · 아래 뮤테이션 전부 잡힘 | 2026-10-01 |

## File Structure

| 파일 | 할 일 |
|---|---|
| Create `apps/web/lib/fal/http.ts` | 대기열 제출 한 번(`submitFalQueue`, 비용 한 줄) · 키마다 상태·결과·취소(`falQueueOps`) · `FalHttpError` |
| Create `apps/web/lib/fal/route.ts` | `FalRoute`·`FalRouter` 모양, 서버 키 하나의 길(`envFalRouter`), `FalKeyMissingError` |
| Create `apps/web/lib/fal/run.ts` | `runFalQueued` — 제출 → 1초마다 상태 → 결과, 상한·취소·끝남 |
| Modify `apps/web/lib/pdp/fal.ts` | 동기 `fetch(fal.run)` → `runFalQueued`. 오류 코드 그대로 |
| Modify `apps/web/lib/redesign/image-generator.ts` | 같다. 오류 문구 그대로 |
| Create `apps/web/lib/fal/__tests__/http.test.ts`, `run.test.ts`, `apps/web/lib/__tests__/redesign-image-queue.test.ts` | 새 시험 |
| Modify `apps/web/lib/pdp/__tests__/fal.test.ts` | 동기 → 대기열 흉내 |
| Modify `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts` | 상세페이지·리디자인 블록 → 제출 자리 |
| Modify `apps/web/lib/__tests__/ai-cost-call-sites.test.ts` | 공급자 호출 파일 목록: `lib/fal/http.ts` 더하고 `pdp/fal.ts`·`redesign/image-generator.ts` 뺀다 |

## Review Focus

1. **결과가 「끝남」인데 실은 거절(422 내용 검사)인 장** — 동기 때는 제출 응답이 곧 거절이었다. 이제는 상태가 `COMPLETED` 이고 결과 받기가 422 를 던진다. 사람이 기대하는 것: 「이미지를 생성하지 못했습니다」(쿼터 초과가 아님). → Task 3 시험 「결과가 거절(422)로 끝나도 생성 실패다」, Task 4 「그 밖의 거절은 상태 번호를 말한다」
2. **fal 이 몰려 120초 안에 시작을 못 하는 장** — fal 이 504 `user` 로 끝낸다. 기대: 「몰렸습니다, 잠시 후 다시」(429 와 같은 말). → Task 3 「504 user 면 몰린 것」, Task 4 같은 시험
3. **오래 걸리는 장(300초 넘음)** — 기다리기만 하면 화면 요청이 끝없이 매달린다. 기대: 취소를 한 번 보내고 「너무 오래 걸렸습니다」. → Task 2 「상한을 넘기면 취소」, Task 3 「우리 쪽 상한을 넘기면 취소를 보내고」
4. **참고 사진이 든 상세페이지(편집 엔드포인트, data URL 몸통)** — 동기와 같은 몸통을 대기열이 받는지. → Task 3 「첨부가 있으면 편집 엔드포인트로」, Task 6 의 k6 상세페이지 시나리오(상품 사진 첨부)
5. **같은 장을 두 번 적거나 빠뜨리는 비용** — 상태를 여러 번 물어도 한 줄. → Task 3 비용 시험(제출에 한 줄·거절 제출은 0줄), `lib/fal/__tests__/http.test.ts` 「값을 주면 제출 자리에서 비용 한 줄」

---

### Task 1: 대기열 제출 한 곳과 키마다 묻기

**Files:**
- Create: `apps/web/lib/fal/http.ts`
- Create: `apps/web/lib/fal/route.ts`
- Test: `apps/web/lib/fal/__tests__/http.test.ts`
- Modify: `apps/web/lib/__tests__/ai-cost-call-sites.test.ts:35`

**Interfaces:**
- Consumes: `recordAiCost(entry: AiCostEntry): void`(`lib/llm/meter.ts:79`), `createFalClient`(`@fal-ai/client`)
- Produces:
  - `FAL_QUEUE_BASE = "https://queue.fal.run"`
  - `class FalHttpError extends Error { status: number; body: string }`
  - `interface FalSubmitCost { model: string; images: number }`, `interface FalSubmitOptions { startTimeoutS?: number; cost?: FalSubmitCost }`
  - `submitFalQueue(key: string, endpoint: string, input: Record<string, unknown>, options?: FalSubmitOptions, fetchImpl?): Promise<string>` — fal 요청 번호
  - `type FalQueuePhase = "queued" | "in_progress" | "completed"`, `interface FalQueueOps { status(endpoint, requestId): Promise<FalQueuePhase>; result(endpoint, requestId): Promise<unknown>; cancel(endpoint, requestId): Promise<void> }`, `falQueueOps(key: string, factory?): FalQueueOps`
  - `interface FalRoute { accountId: string | null; key: string }`, `interface FalRouter { submit(endpoint, input, options?): Promise<{ requestId: string; route: FalRoute }>; routeOf(requestId): Promise<FalRoute>; finished(requestId): void; uploadRoute(): Promise<FalRoute> }`, `envFalRouter(environment?, submit?): FalRouter`, `class FalKeyMissingError`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/lib/fal/__tests__/http.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **대기열 제출 한 번**(설계 2026-09-29 §3.3). 제출은 손으로 보낸다 — 공식 클라이언트는 429 를 같은
 * 키로 세 번 다시 보내서, 계정 풀이 「곧바로 다음 계정」으로 옮길 수 없다.
 */
vi.mock("server-only", () => ({}));

const { replaceAiCostWriterForTest } = await import("../../ai-cost/write");
const { withLlmMeter } = await import("../../llm/meter");
const { FalHttpError, falQueueOps, submitFalQueue } = await import("../http");

type Row = Record<string, unknown>;
let rows: Row[] = [];
beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row as unknown as Row); });
});
afterEach(() => replaceAiCostWriterForTest(null));

const 받은 = (response: Response) => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return response;
  };
  return { seen, fetchImpl };
};

describe("submitFalQueue", () => {
  it("queue.fal.run/<엔드포인트 전체> 로 Key 인증·JSON 몸통을 보내고 요청 번호를 돌려준다", async () => {
    const { seen, fetchImpl } = 받은(new Response(JSON.stringify({ request_id: "r-1" })));
    const id = await submitFalQueue("k-1", "fal-ai/nano-banana/edit", { prompt: "p" }, {}, fetchImpl);
    expect(id).toBe("r-1");
    expect(seen[0]!.url).toBe("https://queue.fal.run/fal-ai/nano-banana/edit");
    expect(seen[0]!.init?.method).toBe("POST");
    expect(seen[0]!.init?.headers).toEqual({ Authorization: "Key k-1", "Content-Type": "application/json" });
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ prompt: "p" });
  });

  it("fal 쪽 대기 상한은 x-fal-request-timeout 머리로 간다", async () => {
    const { seen, fetchImpl } = 받은(new Response(JSON.stringify({ request_id: "r-1" })));
    await submitFalQueue("k", "fal-ai/x", {}, { startTimeoutS: 120 }, fetchImpl);
    expect((seen[0]!.init?.headers as Record<string, string>)["x-fal-request-timeout"]).toBe("120");
  });

  it("실패는 상태 코드와 원문을 실은 FalHttpError 다 — 같은 키로 다시 보내지 않는다", async () => {
    const { seen, fetchImpl } = 받은(new Response('{"detail":"busy"}', { status: 429 }));
    const error = await submitFalQueue("k", "fal-ai/x", {}, {}, fetchImpl).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalHttpError);
    expect(error).toMatchObject({ status: 429, body: '{"detail":"busy"}' });
    expect(seen).toHaveLength(1);
  });

  it("요청 번호가 없으면 502 로 본다", async () => {
    const { fetchImpl } = 받은(new Response("{}"));
    await expect(submitFalQueue("k", "fal-ai/x", {}, {}, fetchImpl)).rejects.toMatchObject({ status: 502 });
  });

  it("값을 주면 제출 자리에서 비용 한 줄 — 실패한 제출은 적지 않는다", async () => {
    await withLlmMeter(async () => {
      const ok = 받은(new Response(JSON.stringify({ request_id: "r-9" })));
      await submitFalQueue("k", "fal-ai/x", {}, { cost: { model: "nano-banana", images: 1 } }, ok.fetchImpl);
      const bad = 받은(new Response("no", { status: 401 }));
      await submitFalQueue("k", "fal-ai/x", {}, { cost: { model: "nano-banana", images: 1 } }, bad.fetchImpl).catch(() => undefined);
    });
    expect(rows).toEqual([expect.objectContaining({ p_provider: "fal", p_model: "nano-banana", p_images: 1, p_basis: "image_unit", p_fal_request_id: "r-9" })]);
  });

  it("값을 안 주면 적지 않는다(부르는 쪽이 따로 적는다)", async () => {
    await withLlmMeter(async () => {
      await submitFalQueue("k", "fal-ai/x", {}, {}, 받은(new Response(JSON.stringify({ request_id: "r-2" }))).fetchImpl);
    });
    expect(rows).toEqual([]);
  });
});

describe("falQueueOps", () => {
  it("키마다 클라이언트를 따로 만든다 — 전역 설정을 바꾸지 않는다", () => {
    const made: string[] = [];
    const factory = (config: { credentials: string }) => {
      made.push(config.credentials);
      return { queue: {} } as never;
    };
    falQueueOps("k-a", factory);
    falQueueOps("k-b", factory);
    expect(made).toEqual(["k-a", "k-b"]);
  });

  it("상태 셋을 우리 말로 바꾼다", async () => {
    const answers = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
    const ops = falQueueOps("k", () => ({ queue: { status: async () => ({ status: answers.shift() }) } }) as never);
    expect([await ops.status("e", "r"), await ops.status("e", "r"), await ops.status("e", "r")]).toEqual(["queued", "in_progress", "completed"]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/fal/__tests__/http.test.ts`
Expected: FAIL — `Failed to load url ../http`(파일이 없다)

- [ ] **Step 3: `apps/web/lib/fal/http.ts` 를 만든다**

```ts
import { createFalClient, type FalClient } from "@fal-ai/client";
import { recordAiCost } from "../llm/meter";

/**
 * fal **대기열(queue)** 에 보내고, 보낸 키로 상태·결과·취소를 묻는다(설계 2026-09-29 §3.3).
 *
 * ── 왜 제출만 손으로 보내나 ─────────────────────────────────────
 *
 * `@fal-ai/client` 의 `queue.submit` 은 429·502·503·504 를 **같은 키로 세 번까지** 다시 보낸다
 * (`src/queue.js` 의 `QUEUE_RETRY_CONFIG`, 호출마다 덮어써서 `retry: { maxRetries: 0 }` 로도 못 끈다).
 * 계정 풀(S3b)은 429·키 오류를 보면 **곧바로 다음 계정**으로 같은 제출을 옮겨야 하므로, 제출만은
 * 상태 코드를 그대로 보는 `fetch` 한 번으로 한다. 지금 동기 경로(`fal.run` 직접 `fetch`)와 같은 모양이다.
 *
 * 상태·결과·취소는 공식 클라이언트에 맡긴다 — 주소 규칙(엔드포인트 뒤 칸이 떨어진다)과 읽기
 * 재시도가 거기 있다. 클라이언트는 **키마다 새로 만든다**(`createFalClient` 는 설정을 인스턴스마다
 * 따로 쥔다, `src/client.js`). 전역 `fal.config` 는 쓰지 않는다 — 동시에 도는 요청끼리 키가 섞인다.
 */

export const FAL_QUEUE_BASE = "https://queue.fal.run";

/** fal 이 준 HTTP 상태를 싣는다. `classifyFalFailure`(`./failure.ts`)가 이 `status` 로 가른다. */
export class FalHttpError extends Error {
  constructor(readonly status: number, readonly body: string, message?: string) {
    super(message ?? `fal responded ${status}: ${body.slice(0, 300)}`);
    this.name = "FalHttpError";
  }
}

/** 제출 한 번의 값. 있으면 제출이 성공한 그 자리에서 비용 한 줄을 쓴다(설계 2026-09-30 §3.4). */
export interface FalSubmitCost {
  /** 단가표(`model_prices`)의 모델 id. */
  model: string;
  images: number;
}

export interface FalSubmitOptions {
  /** fal 쪽에서 처리를 **시작하기까지** 기다릴 상한(초). `x-fal-request-timeout` 로 간다. */
  startTimeoutS?: number;
  cost?: FalSubmitCost;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 제출하고 fal 요청 번호를 돌려준다. 실패면 `FalHttpError`(상태 코드 그대로). */
export async function submitFalQueue(
  key: string,
  endpoint: string,
  input: Record<string, unknown>,
  options: FalSubmitOptions = {},
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  if (options.startTimeoutS !== undefined) headers["x-fal-request-timeout"] = String(options.startTimeoutS);

  const response = await fetchImpl(`${FAL_QUEUE_BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const text = await response.text();
  if (!response.ok) throw new FalHttpError(response.status, text);

  let requestId: unknown;
  try {
    requestId = (JSON.parse(text) as { request_id?: unknown }).request_id;
  } catch {
    requestId = undefined;
  }
  if (typeof requestId !== "string" || !requestId) {
    throw new FalHttpError(502, text, "fal 이 요청 번호를 주지 않았습니다.");
  }

  /*
    **제출하는 자리에서 적는다**(설계 2026-09-30 §3.4·I-9). fal 큐는 제출하면 과금이 끝난다.
    상태 조회는 여러 번 오거나 아예 안 올 수 있어 거기서 적지 않는다. 요청 번호가 표에서 unique 라
    두 번 안 적힌다.
  */
  if (options.cost) {
    recordAiCost({
      provider: "fal",
      model: options.cost.model,
      images: options.cost.images,
      basis: "image_unit",
      falRequestId: requestId,
    });
  }
  return requestId;
}

export type FalQueuePhase = "queued" | "in_progress" | "completed";

/** 한 키로 묻는 상태·결과·취소. */
export interface FalQueueOps {
  status(endpoint: string, requestId: string): Promise<FalQueuePhase>;
  /** 결과 본문(`images`·`image` 등). fal 이 실패로 끝냈으면 상태 코드를 실은 예외를 던진다. */
  result(endpoint: string, requestId: string): Promise<unknown>;
  cancel(endpoint: string, requestId: string): Promise<void>;
}

type ClientFactory = (config: { credentials: string; retry: { maxRetries: number } }) => Pick<FalClient, "queue">;

export function falQueueOps(key: string, factory: ClientFactory = createFalClient): FalQueueOps {
  const client = factory({ credentials: key, retry: { maxRetries: 0 } });
  return {
    async status(endpoint, requestId) {
      const status = await client.queue.status(endpoint, { requestId, logs: false });
      if (status.status === "IN_QUEUE") return "queued";
      if (status.status === "IN_PROGRESS") return "in_progress";
      return "completed";
    },
    async result(endpoint, requestId) {
      const result = await client.queue.result(endpoint as never, { requestId });
      return result.data as unknown;
    },
    async cancel(endpoint, requestId) {
      await client.queue.cancel(endpoint, { requestId });
    },
  };
}
```

- [ ] **Step 4: `apps/web/lib/fal/route.ts` 를 만든다**

```ts
import { submitFalQueue, type FalSubmitOptions } from "./http";

/**
 * **어느 fal 키로 보내고, 보낸 요청을 어느 키로 다시 묻는가.**
 *
 * fal 요청 번호는 계정마다 따로라, 상태·결과·취소는 **보낸 계정의 키**로 해야 한다(설계 §3.3).
 * S3a 에는 서버 키(`FAL_KEY`) 하나뿐이다(`envFalRouter`). S3b 가 같은 모양으로 계정 풀을 끼운다.
 */

export interface FalRoute {
  /** `fal_accounts.id`. 서버 키(`FAL_KEY`)로 보냈으면 null. */
  accountId: string | null;
  key: string;
}

export interface FalRouter {
  /** 제출하고, 어느 키로 보냈는지 함께 돌려준다. 비용 한 줄은 제출이 성공한 자리에서 쓴다. */
  submit(
    endpoint: string,
    input: Record<string, unknown>,
    options?: FalSubmitOptions,
  ): Promise<{ requestId: string; route: FalRoute }>;
  /** 이미 보낸 요청을 물을 키. */
  routeOf(requestId: string): Promise<FalRoute>;
  /** 이 요청이 끝났다(성공·실패·포기). 동시 수 세기에서 뺀다. 기다리지 않는다. */
  finished(requestId: string): void;
  /** 참고 그림을 fal 저장소에 올릴 키. */
  uploadRoute(): Promise<FalRoute>;
}

/** 서버 키가 없다. 부르는 쪽이 자기 오류(예: `AI_KEY_MISSING`)로 바꾼다. */
export class FalKeyMissingError extends Error {
  constructor() {
    super("FAL_KEY is not configured.");
    this.name = "FalKeyMissingError";
  }
}

type Env = Record<string, string | undefined>;

/** 서버 키 하나로 보내고 묻는다 — 오늘과 같다. */
export function envFalRouter(environment: Env = process.env, submit = submitFalQueue): FalRouter {
  const route = (): FalRoute => {
    const key = environment.FAL_KEY?.trim();
    if (!key) throw new FalKeyMissingError();
    return { accountId: null, key };
  };
  return {
    async submit(endpoint, input, options) {
      const chosen = route();
      const requestId = await submit(chosen.key, endpoint, input, options);
      return { requestId, route: chosen };
    },
    async routeOf() {
      return route();
    },
    finished() {},
    async uploadRoute() {
      return route();
    },
  };
}
```

- [ ] **Step 5: 공급자 호출 파일 목록에 더한다** — `apps/web/lib/__tests__/ai-cost-call-sites.test.ts` 의 `기록하는파일` 에서 `"apps/web/lib/fal/queue.ts": /recordAiCost\(/,` 줄 **바로 아래**에 한 줄:

```ts
  // 상세페이지·캐릭터·리디자인의 대기열 제출(S3a). 값을 받으면 제출 자리에서 적는다.
  "apps/web/lib/fal/http.ts": /recordAiCost\(/,
```

(`http.ts` 는 `@fal-ai/client` 를 들이고 `queue.fal.run` 을 적으므로 이 시험의 「알려진 목록」에 있어야 한다.)

- [ ] **Step 6: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/fal/__tests__/http.test.ts lib/__tests__/ai-cost-call-sites.test.ts && npx tsc --noEmit && echo TSC_OK`
Expected: PASS(http 8개), call-sites 전부 PASS, `TSC_OK`

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/fal/http.ts apps/web/lib/fal/route.ts apps/web/lib/fal/__tests__/http.test.ts apps/web/lib/__tests__/ai-cost-call-sites.test.ts
git commit -m "feat(fal): 대기열 제출 한 곳과 키마다 묻는 길

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 맡기고 이 요청 안에서 기다리기

**Files:**
- Create: `apps/web/lib/fal/run.ts`
- Test: `apps/web/lib/fal/__tests__/run.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `falQueueOps`·`FalQueueOps`·`FalQueuePhase`·`FalSubmitCost`·`FalRouter`
- Produces:
  - `FAL_RUN_POLL_MS = 1000`, `FAL_RUN_DEADLINE_MS = 300000`, `FAL_RUN_START_TIMEOUT_S = 120`
  - `class FalRunTimeoutError extends Error { status: 504; requestId: string }`
  - `interface RunFalQueuedOptions { endpoint; input; cost?; startTimeoutS?; deadlineMs?; pollMs?; signal?: AbortSignal; onSubmitted?(requestId) }`
  - `interface RunFalDeps { opsFor(key): FalQueueOps; sleep(ms): Promise<void>; now(): number }`
  - `runFalQueued(router: FalRouter, options: RunFalQueuedOptions, deps?: Partial<RunFalDeps>): Promise<{ requestId: string; data: unknown }>`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/lib/fal/__tests__/run.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { FalRunTimeoutError, runFalQueued } from "../run";
import type { FalQueueOps, FalQueuePhase } from "../http";
import type { FalRouter } from "../route";

/**
 * **맡기고 이 요청 안에서 묻는다**(설계 2026-09-29 §3.3). 끝나면 반드시 `finished` — 계정 풀이
 * 동시 수를 그것으로 센다. 빠뜨리면 그 계정이 30분 동안 찬 것으로 보인다.
 */

function 길(): FalRouter & { submitted: unknown[]; done: string[] } {
  const submitted: unknown[] = [];
  const done: string[] = [];
  return {
    submitted,
    done,
    async submit(endpoint, input, options) {
      submitted.push({ endpoint, input, options });
      return { requestId: "r-1", route: { accountId: "acct-2", key: "key-2" } };
    },
    async routeOf() { return { accountId: "acct-2", key: "key-2" }; },
    finished(requestId) { done.push(requestId); },
    async uploadRoute() { return { accountId: "acct-2", key: "key-2" }; },
  };
}

function 묻기(phases: FalQueuePhase[], result: unknown = { images: [] }) {
  const keys: string[] = [];
  const cancelled: string[] = [];
  const ops: FalQueueOps = {
    status: vi.fn(async () => phases.shift() ?? "completed"),
    result: vi.fn(async () => result),
    cancel: vi.fn(async (_e, id) => { cancelled.push(id); }),
  };
  return { keys, cancelled, ops, opsFor: (key: string) => { keys.push(key); return ops; } };
}

describe("runFalQueued", () => {
  it("보낸 계정의 키로 묻고, 끝나면 결과 본문을 돌려준다", async () => {
    const router = 길();
    const fake = 묻기(["queued", "in_progress", "completed"], { images: [{ url: "u" }] });
    const sleeps: number[] = [];
    const out = await runFalQueued(router, { endpoint: "fal-ai/x", input: { a: 1 }, cost: { model: "m", images: 1 } }, {
      opsFor: fake.opsFor, sleep: async (ms) => { sleeps.push(ms); }, now: () => 0,
    });
    expect(out).toEqual({ requestId: "r-1", data: { images: [{ url: "u" }] } });
    expect(fake.keys).toEqual(["key-2"]);
    expect(sleeps).toEqual([1000, 1000]);
    expect(router.submitted).toEqual([{ endpoint: "fal-ai/x", input: { a: 1 }, options: { startTimeoutS: 120, cost: { model: "m", images: 1 } } }]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("상한을 넘기면 취소를 한 번 보내고 FalRunTimeoutError — 그래도 finished", async () => {
    const router = 길();
    const fake = 묻기(Array(20).fill("in_progress"));
    let clock = 0;
    const error = await runFalQueued(router, { endpoint: "e", input: {}, deadlineMs: 3_000 }, {
      opsFor: fake.opsFor, sleep: async (ms) => { clock += ms; }, now: () => clock,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalRunTimeoutError);
    expect(fake.cancelled).toEqual(["r-1"]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("결과가 실패로 끝나면 그 예외 그대로 — 그래도 finished", async () => {
    const router = 길();
    const fake = 묻기(["completed"]);
    fake.ops.result = vi.fn(async () => { throw Object.assign(new Error("bad"), { status: 422 }); });
    await expect(runFalQueued(router, { endpoint: "e", input: {} }, { opsFor: fake.opsFor, sleep: async () => {} })).rejects.toMatchObject({ status: 422 });
    expect(router.done).toEqual(["r-1"]);
  });

  it("끊으면 취소를 보내고 멈춘다", async () => {
    const router = 길();
    const fake = 묻기(Array(5).fill("in_progress"));
    const controller = new AbortController();
    const error = await runFalQueued(router, { endpoint: "e", input: {}, signal: controller.signal }, {
      opsFor: fake.opsFor, sleep: async () => { controller.abort(); },
    }).catch((e: unknown) => e);
    expect((error as Error).name).toBe("AbortError");
    expect(fake.cancelled).toEqual(["r-1"]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("제출이 실패하면 묻지도 finished 하지도 않는다(받은 번호가 없다)", async () => {
    const router = 길();
    router.submit = async () => { throw Object.assign(new Error("busy"), { status: 429 }); };
    const fake = 묻기([]);
    await expect(runFalQueued(router, { endpoint: "e", input: {} }, { opsFor: fake.opsFor })).rejects.toMatchObject({ status: 429 });
    expect(fake.keys).toEqual([]);
    expect(router.done).toEqual([]);
  });

  it("onSubmitted 는 fal 이 받은 순간 한 번", async () => {
    const seen: string[] = [];
    await runFalQueued(길(), { endpoint: "e", input: {}, onSubmitted: (id) => seen.push(id) }, { opsFor: 묻기(["completed"]).opsFor });
    expect(seen).toEqual(["r-1"]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/fal/__tests__/run.test.ts`
Expected: FAIL — `Failed to load url ../run`

- [ ] **Step 3: `apps/web/lib/fal/run.ts` 를 만든다**

```ts
import { falQueueOps, type FalQueueOps, type FalSubmitCost } from "./http";
import type { FalRouter } from "./route";

/**
 * **대기열에 맡기고, 끝날 때까지 이 요청 안에서 묻는다**(설계 2026-09-29 §3.3).
 *
 * 동기 호출(`fal.run`)은 fal 계정의 동시 한도를 넘으면 **곧바로 429** 로 실패했다. 대기열은 한도를
 * 넘어도 fal 쪽에서 기다린다. 그래서 상세페이지·캐릭터·리디자인이 같은 그림을 대기열로 받는다 —
 * 화면이 기다리는 시간과 응답 모양은 그대로다.
 *
 * - fal 쪽 대기 상한(`startTimeoutS`): 이만큼 지나도 시작을 못 하면 fal 이 504(`timeoutType=user`)로 끝낸다
 * - 우리 쪽 상한(`deadlineMs`): 지나면 취소를 한 번 보내고 `FalRunTimeoutError`. 동기 호출 때도 Node `fetch`
 *   의 머리 대기 상한(undici `headersTimeout` 300초)이 사실상 같은 끝이었다
 * - 끝나면(성공·실패·포기 모두) `router.finished` — 계정 풀의 동시 수 세기에서 뺀다
 */

export const FAL_RUN_POLL_MS = 1_000;
export const FAL_RUN_DEADLINE_MS = 300_000;
export const FAL_RUN_START_TIMEOUT_S = 120;

/** 우리 쪽 상한을 넘겼다. 504 를 실어 `classifyFalFailure` 가 「제공자 쪽 문제」로 읽게 한다. */
export class FalRunTimeoutError extends Error {
  readonly status = 504;
  constructor(readonly requestId: string) {
    super("이미지 생성이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
    this.name = "FalRunTimeoutError";
  }
}

export interface RunFalQueuedOptions {
  endpoint: string;
  input: Record<string, unknown>;
  /** 있으면 제출 자리에서 비용 한 줄. 부르는 쪽이 따로 적으면 비운다(배경 제거의 `onEnqueue`). */
  cost?: FalSubmitCost;
  startTimeoutS?: number;
  deadlineMs?: number;
  pollMs?: number;
  /** 끊으면 그만 묻고 취소를 한 번 보낸다. */
  signal?: AbortSignal;
  /** fal 이 요청을 받은 순간. */
  onSubmitted?: (requestId: string) => void;
}

export interface RunFalDeps {
  opsFor: (key: string) => FalQueueOps;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function abortError(): Error {
  const error = new Error("요청을 멈췄습니다.");
  error.name = "AbortError";
  return error;
}

export async function runFalQueued(
  router: FalRouter,
  options: RunFalQueuedOptions,
  deps: Partial<RunFalDeps> = {},
): Promise<{ requestId: string; data: unknown }> {
  const opsFor = deps.opsFor ?? falQueueOps;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const pollMs = options.pollMs ?? FAL_RUN_POLL_MS;
  const deadline = now() + (options.deadlineMs ?? FAL_RUN_DEADLINE_MS);

  if (options.signal?.aborted) throw abortError();
  const { requestId, route } = await router.submit(options.endpoint, options.input, {
    startTimeoutS: options.startTimeoutS ?? FAL_RUN_START_TIMEOUT_S,
    cost: options.cost,
  });
  options.onSubmitted?.(requestId);
  const ops = opsFor(route.key);
  const cancel = () => ops.cancel(options.endpoint, requestId).catch(() => undefined);

  try {
    for (;;) {
      if (options.signal?.aborted) {
        await cancel();
        throw abortError();
      }
      const phase = await ops.status(options.endpoint, requestId);
      if (phase === "completed") {
        return { requestId, data: await ops.result(options.endpoint, requestId) };
      }
      if (now() >= deadline) {
        await cancel();
        throw new FalRunTimeoutError(requestId);
      }
      await sleep(Math.max(0, Math.min(pollMs, deadline - now())));
    }
  } finally {
    router.finished(requestId);
  }
}
```

- [ ] **Step 4: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/fal/__tests__/run.test.ts`
Expected: PASS(6개)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/fal/run.ts apps/web/lib/fal/__tests__/run.test.ts
git commit -m "feat(fal): 대기열에 맡기고 요청 안에서 끝날 때까지 묻는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 상세페이지·캐릭터를 대기열로

**Files:**
- Modify: `apps/web/lib/pdp/fal.ts`(전체)
- Test: `apps/web/lib/pdp/__tests__/fal.test.ts`(전체), `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts:6-7·75-93`
- Modify: `apps/web/lib/__tests__/ai-cost-call-sites.test.ts:36`

**Interfaces:**
- Consumes: Task 1 `envFalRouter`·`FalRouter`, Task 2 `runFalQueued`·`FalRunTimeoutError`·`RunFalDeps`
- Produces: `createPdpImageGenerator(environment?: Env, router?: FalRouter, deps?: Partial<RunFalDeps>): ImageGenerator` — 앞 인자 하나만 쓰던 기존 호출(`lib/pdp/providers.ts:264`, `lib/characters.ts:32`)은 그대로 된다

- [ ] **Step 1: 실패하는 시험으로 바꾼다** — `apps/web/lib/pdp/__tests__/fal.test.ts` 전체를:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createPdpImageGenerator } = await import("../fal");

/**
 * fal 로 나가는 요청을 **값으로** 잰다.
 *
 * 이 구간에는 시험이 한 건도 없었다. 독립 리뷰가 아래 넷을 동시에 넣고 돌렸는데
 * 타입검사 0건 · 1,406건 전부 통과였다.
 *
 *   Key → Bearer            fal 인증이 전부 실패
 *   주소 뒤에 /WRONG        전 요청 404
 *   429 → 503               쿼터 초과가 안 잡힘
 *   AI_KEY_MISSING 바꿔치기 키 없음이 파싱 오류로 보고됨
 *
 * 유효한 코드끼리 바꿔치기는 tsc 가 못 잡는다. 값으로 재야 한다.
 *
 * **S3a 부터 대기열이다**(설계 2026-09-29 §3.3). 제출 `POST queue.fal.run/<엔드포인트>` → 상태
 * `GET …/requests/<id>/status` → 결과 `GET …/requests/<id>` → 그림 내려받기. 상태·결과는 공식
 * 클라이언트가 같은 전역 `fetch` 로 부르므로 여기서 한꺼번에 흉내 낸다.
 */

const 환경 = { FAL_KEY: "fal-key" };
const 입력 = {
  prompt: "a clean product photo",
  systemPrompt: "art direction",
  aspectRatio: "3:4" as const,
  references: [],
};
const 빨리 = { sleep: async () => {} };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type FetchArgs = [string, RequestInit?];
let calls: FetchArgs[] = [];
let onSubmit: () => Response;
let statuses: string[];
let onResult: () => Response;
let onDownload: () => Response;

beforeEach(() => {
  calls = [];
  onSubmit = () => json({ request_id: "req-1", status: "IN_QUEUE" });
  statuses = ["COMPLETED"];
  onResult = () => json({ images: [{ url: "https://cdn/x.png", content_type: "image/png" }] });
  onDownload = () => new Response(new Uint8Array([1, 2, 3]));
  vi.stubGlobal("fetch", async (...args: FetchArgs) => {
    const url = String(args[0]);
    calls.push([url, args[1]]);
    if (!url.startsWith("https://queue.fal.run/")) return onDownload();
    if (url.includes("/requests/req-1/status")) return json({ status: statuses.shift() ?? "COMPLETED" });
    if (url.includes("/requests/req-1/cancel")) return json({ status: "CANCELLATION_REQUESTED" }, 202);
    if (url.includes("/requests/req-1")) return onResult();
    return onSubmit();
  });
});

afterEach(() => vi.unstubAllGlobals());

const 제출 = () => calls.find(([url, init]) => url.startsWith("https://queue.fal.run/") && init?.method === "POST")!;

describe("어디로 어떻게 보내나", () => {
  it("대기열의 모델 엔드포인트로 POST 한다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    expect(제출()[0]).toBe("https://queue.fal.run/fal-ai/nano-banana");
  });

  it("첨부가 있으면 편집 엔드포인트로 간다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", {
      ...입력,
      references: [{ kind: "anchor", base64: "A", mimeType: "image/png" }],
    });
    expect(제출()[0]).toBe("https://queue.fal.run/fal-ai/nano-banana/edit");
  });

  /** `Bearer` 로 바꾸면 fal 인증이 전부 실패한다. */
  it("인증 헤더는 Key 다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    const headers = 제출()[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Key fal-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("fal 쪽 대기 상한(120초)을 함께 보낸다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    expect((제출()[1]?.headers as Record<string, string>)["x-fal-request-timeout"]).toBe("120");
  });

  it("프롬프트가 몸통에 실린다", async () => {
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    const body = JSON.parse(String(제출()[1]?.body)) as { prompt?: string };
    expect(body.prompt).toContain("a clean product photo");
  });

  it("끝날 때까지 상태를 묻고, 같은 키로 결과를 받는다", async () => {
    statuses = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
    await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    const statusCalls = calls.filter(([url]) => url.includes("/requests/req-1/status"));
    expect(statusCalls).toHaveLength(3);
    // 상태 주소는 엔드포인트의 앞 두 칸만 쓴다(공식 클라이언트 규칙).
    expect(statusCalls[0]![0]).toMatch(/^https:\/\/queue\.fal\.run\/fal-ai\/nano-banana\/requests\/req-1\/status/);
    const result = calls.find(([url]) => /\/requests\/req-1$/.test(url))!;
    expect(new Headers(result[1]?.headers).get("authorization")).toBe("Key fal-key");
  });

  it("그림은 받은 주소에서 내려받는다", async () => {
    const image = await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력);
    expect(calls.at(-1)![0]).toBe("https://cdn/x.png");
    expect(image.mimeType).toBe("image/png");
    expect(image.base64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });
});

describe("잘못됐을 때 무엇이라고 말하나", () => {
  it("키가 없으면 키가 없다고 한다", () => {
    expect(() => createPdpImageGenerator({})).toThrow(
      expect.objectContaining({ code: "AI_KEY_MISSING" }),
    );
    expect(() => createPdpImageGenerator({ FAL_KEY: "   " })).toThrow(
      expect.objectContaining({ code: "AI_KEY_MISSING" }),
    );
  });

  /** 429 는 「몰렸다」다. 다른 실패와 섞이면 사용자에게 엉뚱한 안내가 간다. */
  it("제출이 429 면 쿼터 초과다", async () => {
    onSubmit = () => new Response("rate limited", { status: 429 });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
    });
  });

  it("fal 이 대기 상한 안에 시작하지 못했으면(504 user) 몰린 것이다", async () => {
    onResult = () => new Response(JSON.stringify({ detail: "start timeout" }), {
      status: 504, headers: { "content-type": "application/json", "x-fal-request-timeout-type": "user" },
    });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "AI_QUOTA_EXCEEDED",
    });
  });

  it("그 밖의 제출 실패는 생성 실패다", async () => {
    onSubmit = () => new Response("boom", { status: 500 });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("결과가 거절(422)로 끝나도 생성 실패다", async () => {
    onResult = () => json({ detail: "content checker" }, 422);
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("우리 쪽 상한을 넘기면 취소를 보내고 생성 실패로 말한다", async () => {
    statuses = Array(10).fill("IN_PROGRESS");
    let clock = 0;
    const 느린 = { sleep: async () => { clock += 100_000; }, now: () => clock };
    await expect(createPdpImageGenerator(환경, undefined, 느린)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
      message: "이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.",
    });
    expect(calls.some(([url, init]) => url.endsWith("/requests/req-1/cancel") && init?.method === "PUT")).toBe(true);
  });

  it("그림 주소가 없으면 생성 실패다", async () => {
    onResult = () => json({ images: [] });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("내려받기가 실패해도 생성 실패로 말한다", async () => {
    onResult = () => json({ images: [{ url: "https://cdn/x.png" }] });
    onDownload = () => new Response("gone", { status: 404 });
    await expect(createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).rejects.toMatchObject({
      code: "PDP_IMAGE_GENERATION_FAILED",
    });
  });

  it("형식을 안 알려주면 png 로 본다", async () => {
    onResult = () => json({ images: [{ url: "https://cdn/x.png" }] });
    onDownload = () => new Response(new Uint8Array([9]));
    expect((await createPdpImageGenerator(환경, undefined, 빨리)("nano-banana", 입력)).mimeType).toBe("image/png");
  });
});
```

비용 시험도 바꾼다 — `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts`:
1. 머리 주석 7번째 줄 ` * 거기서 적으면 두 번 적히거나 빠진다. 동기 호출(상세페이지·리디자인)은 받은 자리에서,` 를
   ` * 거기서 적으면 두 번 적히거나 빠진다. 상세페이지·리디자인도 S3a 부터 대기열 제출 자리에서,` 로
2. `describe("상세페이지·캐릭터(동기 fal)", …)` 블록 **전체**(75~93줄)를 아래로 바꾼다(리디자인 블록은 Task 4 에서):

```ts
/**
 * 상세페이지·캐릭터·리디자인은 S3a 부터 **대기열**이다(설계 2026-09-29 §3.3). 제출 자리(`lib/fal/http.ts`)
 * 에서 한 줄 — 상태·결과 조회와 그림 내려받기는 적지 않는다.
 */
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const 대기열 = (submit: () => Response, result: unknown) => async (url: string) => {
  const target = String(url);
  if (!target.startsWith("https://queue.fal.run/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
  if (target.includes("/status")) return json({ status: "COMPLETED" });
  if (target.includes("/requests/")) return json(result);
  return submit();
};

describe("상세페이지·캐릭터(대기열 fal)", () => {
  it("제출 자리에서 한 줄 — fal 이 준 요청 번호를 싣는다", async () => {
    vi.stubGlobal("fetch", 대기열(() => json({ request_id: "q-1" }), { images: [{ url: "https://cdn/x.png", content_type: "image/png" }] }));
    await withLlmMeter(async () => {
      await createPdpImageGenerator({ FAL_KEY: "k" })("nano-banana", { prompt: "p", systemPrompt: "s", aspectRatio: "3:4", references: [] });
    });
    expect(rows).toEqual([expect.objectContaining({ p_provider: "fal", p_model: "nano-banana", p_images: 1, p_fal_request_id: "q-1" })]);
  });

  it("fal 이 제출을 거절하면 적지 않는다", async () => {
    vi.stubGlobal("fetch", 대기열(() => new Response("busy", { status: 429 }), {}));
    await withLlmMeter(async () => {
      await expect(createPdpImageGenerator({ FAL_KEY: "k" })("nano-banana", { prompt: "p", systemPrompt: "s", aspectRatio: "3:4", references: [] })).rejects.toThrow();
    });
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/pdp/__tests__/fal.test.ts lib/ai-cost/__tests__/image-submit-cost.test.ts`
Expected: FAIL — `fal.test.ts` 대부분(`제출()` 이 `undefined` — 지금 코드는 `https://fal.run` 으로 보낸다), 비용 시험 「제출 자리에서 한 줄」(행 없음)

- [ ] **Step 3: `apps/web/lib/pdp/fal.ts` 전체를 바꾼다**

```ts
import {
  PdpServiceError,
  buildFalPayload,
  falImageFrom,
  resolveEndpoint,
  type ImageGenerator,
} from "@fixup/pdp-core";
import { envFalRouter, type FalRouter } from "../fal/route";
import { FalRunTimeoutError, runFalQueued, type RunFalDeps } from "../fal/run";

/**
 * 상세페이지·캐릭터가 fal 로 그림을 만드는 **유일한 자리**.
 *
 * 전에는 `packages/pdp-core` 안에서 `process.env.FAL_KEY` 를 읽고 직접
 * `fetch` 했다. 같은 저장소의 포스터·카드뉴스 코어는 그러지 않는다 — 무엇을
 * 어디로 보낼지는 알되 보내지는 않고, 바깥세상은 `apps/web` 이 맡는다.
 *
 * 무엇을 보낼지(엔드포인트·페이로드)는 여전히 코어가 정한다. 그건 도메인
 * 지식이라 옮기면 두 곳으로 갈린다.
 *
 * **대기열로 보낸다**(설계 2026-09-29 §3.3, S3a). 동기 `fal.run` 은 fal 계정의 동시 한도를 넘으면
 * 곧바로 429 였다. 대기열은 fal 쪽에서 기다린다. 이 함수의 모양(한 장 → base64)과 비용 한 줄
 * (제출 자리, `lib/fal/http.ts`)은 그대로다.
 */

type Env = Record<string, string | undefined>;

function requireKey(environment: Env) {
  const apiKey = environment.FAL_KEY?.trim();
  if (!apiKey) {
    throw new PdpServiceError(
      "AI_KEY_MISSING",
      "이미지 생성 키가 설정되지 않았습니다.",
      "FAL_KEY is not configured.",
    );
  }
  return apiKey;
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** fal 이 시작조차 못 했다(대기 상한). 몰린 것이라 429 와 같은 말을 한다. */
function isStartTimeout(error: unknown): boolean {
  return statusOf(error) === 504 && (error as { timeoutType?: unknown }).timeoutType === "user";
}

/** fal 쪽 실패를 상세페이지의 말로. 429 를 다른 실패와 섞으면 사용자에게 엉뚱한 안내가 간다. */
function pdpFailure(error: unknown, endpoint: string): PdpServiceError {
  if (error instanceof PdpServiceError) return error;
  const status = statusOf(error);
  const detail = `fal ${endpoint} ${status ?? "error"}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`;
  if (status === 429 || isStartTimeout(error)) {
    return new PdpServiceError("AI_QUOTA_EXCEEDED", "이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.", detail);
  }
  if (error instanceof FalRunTimeoutError) {
    return new PdpServiceError("PDP_IMAGE_GENERATION_FAILED", "이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.", detail);
  }
  return new PdpServiceError("PDP_IMAGE_GENERATION_FAILED", "이미지를 생성하지 못했습니다.", detail);
}

export function createPdpImageGenerator(
  environment: Env = process.env,
  router: FalRouter = envFalRouter(environment),
  deps: Partial<RunFalDeps> = {},
): ImageGenerator {
  requireKey(environment);

  return async (model, input) => {
    const endpoint = resolveEndpoint(model, input.references);
    let data: unknown;
    try {
      ({ data } = await runFalQueued(
        router,
        { endpoint, input: buildFalPayload(model, input), cost: { model, images: 1 } },
        deps,
      ));
    } catch (error) {
      throw pdpFailure(error, endpoint);
    }

    // fal 은 호스팅 URL 로 돌려준다. 이 파이프라인은 base64 를 쓰므로 받아 바꾼다.
    const image = falImageFrom(data);
    const downloaded = await fetch(image.url);
    if (!downloaded.ok) {
      throw new PdpServiceError(
        "PDP_IMAGE_GENERATION_FAILED",
        "생성한 이미지를 내려받지 못했습니다.",
        `image download responded ${downloaded.status}`,
      );
    }

    return {
      base64: Buffer.from(await downloaded.arrayBuffer()).toString("base64"),
      mimeType: image.mimeType,
    };
  };
}
```

- [ ] **Step 4: 공급자 호출 파일 목록에서 뺀다** — `apps/web/lib/__tests__/ai-cost-call-sites.test.ts` 의 `"apps/web/lib/pdp/fal.ts": /recordAiCost\(/,` 줄을 지운다(이제 fal 주소도 SDK 도 없다 — 남기면 「알려진 목록과 같다」가 빨개진다)

- [ ] **Step 5: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/pdp lib/ai-cost lib/__tests__/ai-cost-call-sites.test.ts lib/__tests__/character-reference-role.test.ts && npx tsc --noEmit && echo TSC_OK`
Expected: PASS 전부, `TSC_OK`

- [ ] **Step 6: 커밋**

```bash
git add apps/web/lib/pdp/fal.ts apps/web/lib/pdp/__tests__/fal.test.ts apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts apps/web/lib/__tests__/ai-cost-call-sites.test.ts
git commit -m "feat(pdp): 상세페이지·캐릭터 그림을 동기 호출 대신 대기열로 받는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 리디자인을 대기열로

**Files:**
- Modify: `apps/web/lib/redesign/image-generator.ts:1-4·48·103-160`
- Test: Create `apps/web/lib/__tests__/redesign-image-queue.test.ts`, Modify `apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts`(리디자인 블록)
- Modify: `apps/web/lib/__tests__/ai-cost-call-sites.test.ts`

**Interfaces:**
- Consumes: Task 1·2 와 같다
- Produces: `createRedesignImageGenerator(environment?, modelId?, router?: FalRouter, deps?: Partial<RunFalDeps>): RedesignImageGenerator` — 기존 호출(`app/api/redesign/generate/route.ts:60`, `edit-section/route.ts:37`)은 그대로

- [ ] **Step 1: 실패하는 시험을 쓴다** — `apps/web/lib/__tests__/redesign-image-queue.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedesignFalError, createRedesignImageGenerator } from "../redesign/image-generator";
import type { FalQueueOps } from "../fal/http";
import type { FalRouter } from "../fal/route";

/**
 * **리디자인도 대기열로 받는다**(설계 2026-09-29 §3.3, S3a). 화면에 가는 문구는 동기 호출 때와 같다 —
 * 429 는 「몰렸다」, 상태 코드가 있으면 그 번호, 우리 쪽 상한은 「너무 오래」.
 */

const 받은것: unknown[] = [];
function 길(submit: () => Promise<string> = async () => "rd-1"): FalRouter {
  return {
    async submit(endpoint, input, options) {
      받은것.push({ endpoint, model: (options?.cost as { model?: string } | undefined)?.model, startTimeoutS: options?.startTimeoutS, prompt: input.prompt });
      return { requestId: await submit(), route: { accountId: null, key: "k" } };
    },
    async routeOf() { return { accountId: null, key: "k" }; },
    finished() {},
    async uploadRoute() { return { accountId: null, key: "k" }; },
  };
}

function 묻기(result: () => Promise<unknown>): { opsFor: () => FalQueueOps } {
  const ops: FalQueueOps = { status: async () => "completed", result, cancel: async () => {} };
  return { opsFor: () => ops };
}

const 만들기 = (router: FalRouter, deps: Partial<Parameters<typeof createRedesignImageGenerator>[3]> = {}) =>
  createRedesignImageGenerator({ FAL_KEY: "k" }, undefined, router, { sleep: async () => {}, ...deps });

const 부탁 = { prompt: "p", references: [], size: "1152x2048" };

afterEach(() => {
  받은것.length = 0;
  vi.unstubAllGlobals();
});

describe("리디자인 대기열", () => {
  it("i2i 엔드포인트로, 실제로 그린 모델 id 를 값으로, fal 쪽 대기 상한을 함께 보낸다", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([7]), { headers: { "content-type": "image/png" } }));
    const image = await 만들기(길(), 묻기(async () => ({ images: [{ url: "https://cdn/r.png" }] })))(부탁);
    expect(받은것).toEqual([{ endpoint: "openai/gpt-image-2.5/flare/edit", model: "gpt-image-2.5-flare", startTimeoutS: 120, prompt: "p" }]);
    expect(image.buffer).toEqual(Buffer.from([7]));
  });

  it("제출이 429 면 「몰렸다」", async () => {
    const router = 길(async () => { throw Object.assign(new Error("busy"), { status: 429 }); });
    await expect(만들기(router)(부탁)).rejects.toEqual(new RedesignFalError("이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요."));
  });

  it("fal 이 대기 상한 안에 시작하지 못했으면(504 user) 「몰렸다」", async () => {
    const fake = 묻기(async () => { throw Object.assign(new Error("timeout"), { status: 504, timeoutType: "user" }); });
    await expect(만들기(길(), fake)(부탁)).rejects.toThrow("이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("그 밖의 거절은 상태 번호를 말한다", async () => {
    const fake = 묻기(async () => { throw Object.assign(new Error("content"), { status: 422 }); });
    await expect(만들기(길(), fake)(부탁)).rejects.toThrow("이미지를 생성하지 못했습니다 (422).");
  });

  it("우리 쪽 상한을 넘기면 「너무 오래」", async () => {
    let clock = 0;
    const ops: FalQueueOps = { status: async () => "in_progress", result: async () => ({}), cancel: async () => {} };
    const generate = 만들기(길(), { opsFor: () => ops, sleep: async () => { clock += 100_000; }, now: () => clock });
    await expect(generate(부탁)).rejects.toThrow("이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.");
  });

  it("상태 코드가 없는 실패(네트워크)는 원래 예외 그대로", async () => {
    const router = 길(async () => { throw new TypeError("fetch failed"); });
    await expect(만들기(router)(부탁)).rejects.toThrow(TypeError);
  });
});
```

비용 시험 — `image-submit-cost.test.ts` 의 `describe("리디자인(동기 fal)", …)` 블록 전체를:

```ts
describe("리디자인(대기열 fal)", () => {
  it("제출 자리에서 한 줄 — 실제로 그린 모델 id 로", async () => {
    vi.stubGlobal("fetch", 대기열(() => json({ request_id: "rd-1" }), { images: [{ url: "https://cdn/r.png" }] }));
    await withLlmMeter(async () => {
      await createRedesignImageGenerator({ FAL_KEY: "k" })({ prompt: "p", references: [], size: "1152x2048" });
    });
    expect(rows).toEqual([expect.objectContaining({ p_model: "gpt-image-2.5-flare", p_images: 1, p_fal_request_id: "rd-1" })]);
  });
});
```

- [ ] **Step 2: 실패를 본다**

Run: `cd apps/web && npx vitest run lib/__tests__/redesign-image-queue.test.ts lib/ai-cost/__tests__/image-submit-cost.test.ts`
Expected: FAIL — 새 시험(지금 생성기는 세 번째·네 번째 인자를 모르고 `https://fal.run` 으로 보낸다. 가짜 fetch 가 없는 시험은 실제 fal 에 엉터리 키 `k` 로 나가 401 을 받는다 — 돈은 들지 않는다), 비용 시험 리디자인 블록

- [ ] **Step 3: `apps/web/lib/redesign/image-generator.ts` 를 바꾼다** — 파일 전체가 이렇게 된다(1~102줄의 설명·모델 선택·크기·요청 만들기·응답 읽기는 그대로이고, 들이는 것·`FAL_BASE_URL` 삭제·`redesignFailure`·생성기 본문만 바뀐다):

```ts
import { buildModelInput, modelById, resolveSize, type ImageModel } from "@fixup/sns-core";
import type { RedesignImageGenerator } from "@fixup/redesign-core";
import { createFalUploader } from "../fal/upload";
import { envFalRouter, type FalRouter } from "../fal/route";
import { FalRunTimeoutError, runFalQueued, type RunFalDeps } from "../fal/run";

/**
 * 리디자인이 **다른 도구와 같은 길로** 그림을 만든다.
 *
 * ── 왜 바꾸나 ──────────────────────────────────────────────────
 *
 * 리디자인은 OpenAI 를 직접 불렀다. 포팅해 온 코드가 그랬고, 그래서 한 세대
 * 이전 모델(gpt-image-2)에 묶여 있었다. 카드뉴스·포스터·이미지·캐릭터는
 * 전부 fal 을 거쳐 **gpt-image-2.5 를 `max` 품질**로 쓴다.
 *
 * 옮기면 셋이 한꺼번에 좋아진다.
 *
 *   모델   gpt-image-2      → gpt-image-2.5
 *   품질   high             → max
 *   단가   $0.21            → $0.16   (같은 크기 기준)
 *
 * 더 나은 그림을 더 싸게 만든다. 단가표가 하나로 모이는 것은 덤이다 — 지금은
 * 리디자인만 `FLAT_USD` 에 자기 값을 따로 들고 있다.
 *
 * ── 왜 여기 있나 ────────────────────────────────────────────────
 *
 * 코어(`redesign-core`)는 **무엇을 보낼지** 알되 보내지 않는다. 키를 읽고
 * 올리고 내려받는 일은 앱의 몫이다. `pdp-core`·`poster-core` 가 이미 그렇게
 * 나뉘어 있다.
 */

/** 리디자인의 기본 모델. 다른 도구의 기본값(표준형)과 같은 것을 쓴다. */
export const REDESIGN_FAL_MODEL = "gpt-image-2.5-flare";

/**
 * 화면의 선택(정밀형·속도형) → **실제로 그릴 모델.**
 *
 * fal 통로가 붙은 뒤로 무엇을 고르든 `gpt-image-2.5-flare` 가 그렸고, 선택은
 * 값을 매기는 데만 쓰였다(2026-09-17 리뷰 F-7-4). 고른 적 없는 모델의 그림을
 * 주면서 다른 값을 받는 셈이었다.
 *
 * 화면이 「속도형」이라 부르는 것은 Google 계열이다. 모델 목록에서도 같은 이름을
 * 쓴다(`sns-core/models.ts` 의 `nano-banana-pro` = 속도형).
 */
export function redesignFalModelFor(choice: string | undefined): string {
  return String(choice) === "google" ? "nano-banana-pro" : REDESIGN_FAL_MODEL;
}

export class RedesignFalError extends Error {}

function requireKey(environment: Record<string, string | undefined>) {
  const apiKey = environment.FAL_KEY?.trim();
  if (!apiKey) throw new RedesignFalError("이미지 생성 키가 설정되지 않았습니다.");
  return apiKey;
}

/**
 * `"1152x2048"` 을 fal 이 받는 모양으로.
 *
 * 실패하면 던지지 않고 `undefined` 를 준다 — 부르는 쪽이 비율에서 정해 둔
 * 기본 크기로 떨어질 수 있게 한다.
 */
export function pixelSizeOf(size: string): { width: number; height: number } | undefined {
  const matched = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(String(size || "").trim());
  if (!matched) return undefined;
  return { width: Number(matched[1]), height: Number(matched[2]) };
}

/**
 * 보낼 것을 만든다. **바깥을 안 부르므로 값으로 잴 수 있다.**
 */
export function buildRedesignFalRequest(input: {
  model: ImageModel;
  prompt: string;
  imageUrls: string[];
  size: string;
}): { endpoint: string; body: Record<string, unknown> } {
  const pixel = pixelSizeOf(input.size);
  const resolved = resolveSize("9:16", input.model);

  return {
    // 원본 상세페이지를 함께 보내므로 언제나 i2i 다.
    endpoint: input.model.i2i.endpoint,
    body: buildModelInput(
      input.model,
      "i2i",
      // 비율에서 나온 크기가 있으면 그것을 쓴다. 없으면 비율이 정한 기본값.
      pixel ? { ...resolved, pixel } : resolved,
      input.prompt,
      input.imageUrls,
    ),
  };
}

/** fal 응답에서 그림 주소를 꺼낸다. */
export function imageUrlFrom(result: unknown): string {
  const image = (result as { images?: Array<{ url?: string }> })?.images?.[0];
  if (!image?.url) throw new RedesignFalError("이미지를 생성하지 못했습니다.");
  return image.url;
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * fal 쪽 실패를 리디자인의 말로. 문구는 동기 호출 때와 같다 — 429(와 fal 이 대기 상한 안에 시작을
 * 못 한 504 user)는 「몰렸다」, 상태 코드가 있으면 그 번호, 없으면(네트워크 등) 원래 예외 그대로.
 */
function redesignFailure(error: unknown): unknown {
  const status = statusOf(error);
  if (status === 429 || (status === 504 && (error as { timeoutType?: unknown }).timeoutType === "user")) {
    return new RedesignFalError("이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (error instanceof FalRunTimeoutError) {
    return new RedesignFalError("이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.");
  }
  if (status !== undefined) return new RedesignFalError(`이미지를 생성하지 못했습니다 (${status}).`);
  return error;
}

export function createRedesignImageGenerator(
  environment: Record<string, string | undefined> = process.env,
  modelId: string = REDESIGN_FAL_MODEL,
  router: FalRouter = envFalRouter(environment),
  deps: Partial<RunFalDeps> = {},
): RedesignImageGenerator {
  const apiKey = requireKey(environment);
  const uploader = createFalUploader(apiKey);
  const model = modelById(modelId);

  return async ({ prompt, references, size }) => {
    /**
     * 첨부를 먼저 올린다. fal 은 바이트가 아니라 **주소**를 받는다.
     *
     * 모델이 받는 장수를 넘기지 않는다 — 넘겨 보내면 fal 이 거절하거나 뒤쪽을
     * 조용히 버린다. 어느 쪽이든 사용자는 붙인 그림이 왜 반영이 안 됐는지
     * 알 수 없다.
     */
    const imageUrls: string[] = [];
    for (const reference of references.slice(0, model.maxReferenceImages)) {
      imageUrls.push(await uploader.uploadReference(reference.buffer, reference.mimeType));
    }

    const { endpoint, body } = buildRedesignFalRequest({ model, prompt, imageUrls, size });

    // 대기열로 보낸다(설계 2026-09-29 §3.3, S3a). 비용 한 줄은 제출 자리(`lib/fal/http.ts`)에서.
    let data: unknown;
    try {
      ({ data } = await runFalQueued(router, { endpoint, input: body, cost: { model: model.id, images: 1 } }, deps));
    } catch (error) {
      throw redesignFailure(error);
    }

    const url = imageUrlFrom(data);
    const downloaded = await fetch(url);
    if (!downloaded.ok) throw new RedesignFalError("만든 이미지를 내려받지 못했습니다.");

    return {
      buffer: Buffer.from(await downloaded.arrayBuffer()),
      mimeType: downloaded.headers.get("content-type") || "image/png",
    };
  };
}
```

- [ ] **Step 4: 공급자 호출 파일 목록에서 뺀다** — `ai-cost-call-sites.test.ts` 의 `"apps/web/lib/redesign/image-generator.ts": /recordAiCost\(/,` 줄을 지운다

- [ ] **Step 5: 통과를 본다**

Run: `cd apps/web && npx vitest run lib/__tests__/redesign-image-queue.test.ts lib/__tests__/redesign-image-generator.test.ts lib/ai-cost lib/__tests__/ai-cost-call-sites.test.ts app/api/redesign && npx tsc --noEmit && echo TSC_OK`
Expected: PASS 전부, `TSC_OK`

- [ ] **Step 6: 남은 동기 호출이 없나**

Run: `cd apps/web && grep -rn "https://fal.run\|fal\.run(" --include=*.ts --include=*.tsx app lib | grep -v __tests__`
Expected: 출력 없음

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/redesign/image-generator.ts apps/web/lib/__tests__/redesign-image-queue.test.ts apps/web/lib/ai-cost/__tests__/image-submit-cost.test.ts apps/web/lib/__tests__/ai-cost-call-sites.test.ts
git commit -m "feat(redesign): 리디자인 그림도 대기열로 받는다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 전체 검증·뮤테이션·독립 리뷰

**Files:** 없음(고칠 것이 나오면 해당 Task 파일)

- [ ] **Step 1: 설계·계획 재확인** — 보충 §3·§5 와 이 계획의 File Structure 를 다시 읽고 `git diff origin/master --stat` 이 표와 맞는지 본다(표에 없는 파일이 바뀌었으면 까닭을 적거나 되돌린다)

- [ ] **Step 2: 형 검사·시험·린트**

```bash
cd apps/web && npx tsc --noEmit && echo TSC_OK
cd apps/web && npx vitest run
cd apps/web && npx next lint
```
Expected: `TSC_OK`; vitest 실패 0(계획 검증 때 S3a 상태 전체 `480 passed | 3 skipped` 파일, `5759 passed` 시험); 린트 오류 0 — 경고는 이 가지가 손대지 않은 12개 파일(`app/create/*` 등)의 옛 경고뿐이어야 한다(`npx next lint 2>&1 | grep -E "^\./" ` 에 `lib/fal`·`lib/pdp/fal.ts`·`lib/redesign` 이 없다)
`lib/__tests__/install-host-duplicate-site.test.ts` 가 전체 실행 중에만 한 번 실패하면 단독으로 다시 돌린다(셸을 띄우는 시험이라 전체 부하에서 가끔 늦는다)

- [ ] **Step 3: 뮤테이션 확인** — 하나씩 바꿔 해당 시험이 **실패하는지** 보고 되돌린다(계획 검증 때 모두 실패를 확인했다)

| 바꾸기 | 잡아야 할 시험 |
|---|---|
| `http.ts` `headers["x-fal-request-timeout"]` → `headers["x-fal-timeout"]` | http 「x-fal-request-timeout 머리로」, pdp 「fal 쪽 대기 상한(120초)」 |
| `http.ts` `if (options.cost) {` → `if (options.cost && false) {` | image-submit-cost 「제출 자리에서 한 줄」 |
| `http.ts` `falQueueOps` 의 `credentials: key` → `credentials: "shared"` | http 「키마다 클라이언트를 따로」 |
| `run.ts` 마감 분기의 `await cancel();` 삭제 | run 「상한을 넘기면 취소를 한 번」, pdp 「우리 쪽 상한…취소」 |
| `run.ts` `finally` 의 `router.finished(requestId);` 삭제 | run 「…그래도 finished」 3개 |
| `run.ts` `startTimeoutS: options.startTimeoutS ?? FAL_RUN_START_TIMEOUT_S,` → `startTimeoutS: options.startTimeoutS,` | pdp 「fal 쪽 대기 상한(120초)」 |
| `pdp/fal.ts` `if (status === 429 \|\| isStartTimeout(error)) {` → `if (isStartTimeout(error)) {` | pdp 「제출이 429 면 쿼터 초과」 |
| `redesign/image-generator.ts` `if (status === 429 \|\| (status === 504` → `if ((status === 504` | redesign-image-queue 「제출이 429 면 몰렸다」 |

- [ ] **Step 4: 독립 리뷰** — `code-reviewer` 에이전트(새 맥락)에 이 계획 경로·보충 문서·`git diff origin/master...HEAD` 를 주고 「응답·오류 코드가 동기 때와 같은가, 비용 한 줄 이중·누락, 대기 상한·취소·끝남 경로, 키마다 클라이언트(전역 설정 없음), 줄표 문구」를 보게 한다. CRITICAL·HIGH 는 고치고 Step 2·3 을 다시 돈다. 지적과 반영을 PR 본문에 표로 적는다

---

### Task 6: 시험 서버에서 전후를 잰다(동기 호출 0, 장당 시간)

**Files:**
- Modify(이 저장소 밖, 시험 도구): `$(dirname "$K")/tools/mock-ai/fal.mjs` — 키별 흉내(S3b 도 쓴다)
- Create: `docs/capacity/raw/2026-10-01-s3a/*.txt`(원본 기록)
- Modify: `docs/capacity/2026-09-29-baseline.md`(끝에 「S3a 뒤」 절)

**조건:** 시험 서버 A `43.202.63.50`(t3.medium, 사설 172.31.13.128), 도우미 B `43.200.70.164`(사설 172.31.26.41, 시험 Supabase·가짜 AI·k6). 키: `K="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/96cc3fe1-376f-4835-8f15-843a84042f56/scratchpad/loadtest/loadtest_lf.pem"`(같은 폴더의 `build-b.sh`·`tools/` 도 쓴다). Git Bash 기준. 같은 날 같은 A 에서 「전」(이 가지가 갈라져 나온 커밋)과 「후」(이 가지)를 잇달아 잰다.

- [ ] **Step 1: 시험 조건 확인** — S2 계획(`2026-10-01-capacity-s2-claims.md`) Task 7 Step 1 의 두 명령을 그대로 돈다. Expected 도 같다(`delay 200ms` 1줄, `active active`, DB 제한 `1000000000 1073741824`). 그리고 가짜 AI 가 도는지:

```bash
A=43.202.63.50; B=43.200.70.164
ssh -i "$K" ubuntu@$B 'pgrep -af "node server.mjs" | head -3; curl -s http://127.0.0.1:8081/__stats | head -c 200; echo'
ssh -i "$K" ubuntu@$A 'getent hosts queue.fal.run fal.run; sudo grep -E "^FAL_KEY=" /etc/fixup-image-agent/app.env | sed "s/=.*/=(값 있음)/"'
```
Expected: B 에 `node server.mjs` 한 줄(**그 명령줄을 적어 둔다** — Step 2 에서 같은 값으로 다시 띄운다), `/__stats` JSON; A 의 두 이름이 `172.31.26.41`, `FAL_KEY=(값 있음)`(값은 `mock-fal-key` 여야 한다 — 진짜 키면 멈추고 사용자에게 묻는다)

- [ ] **Step 2: 가짜 fal 에 키별 흉내를 더한다** — 키 이름으로 답을 정하고(`mock-429-…` 429, `mock-locked-…` 403 잠김, `mock` 으로 시작하지 않으면 401), 작업은 제출한 키를 기억해 **다른 키로 물으면 404**, 통계 경로 이름에 키 꼬리표를 붙인다. 이 컴퓨터에서 패치 파일을 만든다(`$(dirname "$K")/fal-s3.diff`):

```diff
--- ../loadtest/tools/mock-ai/fal.mjs	2026-09-28 16:53:41.268411400 +0900
+++ fal.mjs	2026-10-01 13:53:11.059623300 +0900
@@ -63,6 +63,28 @@
 // ── 큐 상태 ───────────────────────────────────────────────────────────
 const jobs = new Map(); // request_id → job
 
+// ── 키별 흉내 (S3b 계정 풀 시험) ──────────────────────────────────────
+// 키 이름으로 fal 의 답을 정한다. 운영 키 모양을 흉내 낼 필요는 없다 — 앱은 키를 그대로 실어 보낼 뿐이다.
+//   mock-429-…      제출마다 429(한도)               → 앱은 그 계정을 60초 쉬게 하고 다음 계정으로
+//   mock-locked-…   제출마다 403 「User is locked」  → 잔액 소진, 다음 계정 + 관리자 메일
+//   mock-…          정상
+//   그 밖(빈 키 포함) 모든 큐 요청 401                → 키 오류
+// 작업은 **제출한 키**를 기억한다. 다른 키로 상태·결과를 물으면 404 — 「보낸 계정으로 묻는다」를 잰다.
+// 통계(/__stats)의 경로 이름에 키 꼬리표를 붙여, 어느 계정으로 몇 건이 갔는지 센다.
+function keyOf(req) {
+  const header = String(req.headers?.authorization || "");
+  return header.startsWith("Key ") ? header.slice(4).trim() : "";
+}
+function keyTag(key) {
+  return key ? key.slice(0, 24) : "(none)";
+}
+function keyVerdict(key) {
+  if (!key.startsWith("mock")) return { status: 401, body: { detail: "invalid key credentials" } };
+  if (key.startsWith("mock-429")) return { status: 429, body: { detail: "Too many concurrent requests" } };
+  if (key.startsWith("mock-locked")) return { status: 403, body: { detail: "User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing." } };
+  return null;
+}
+
 function sweepJobs() {
   const cutoff = Date.now() - 60 * 60 * 1000;
   for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
@@ -103,9 +125,13 @@
   // 2) 큐
   if (host === "queue.fal.run") {
     const match = /^\/(.+)\/requests\/([0-9a-f-]{8,})(\/status|\/cancel)?\/?$/i.exec(url.pathname);
+    const key = keyOf(req);
+    const tag = keyTag(key);
+    const verdict = keyVerdict(key);
     if (req.method === "POST" && !match) {
       const endpoint = url.pathname.replace(/^\/+/, "");
-      ctx.route(`queue submit ${endpoint}`);
+      ctx.route(`queue submit key=${tag}`);
+      if (verdict) return json(res, verdict.status, verdict.body);
       const id = randomUUID();
       const now = Date.now();
       const job = {
@@ -116,6 +142,7 @@
         startsAt: now + config.queueWaitMs,
         doneAt: now + config.queueWaitMs + config.imageDelayMs,
         cancelled: false,
+        key,
       };
       jobs.set(id, job);
       // 완료 시점에 곧바로 내려줄 수 있게 그림을 미리 준비해 둔다.
@@ -134,8 +161,16 @@
     }
     if (match) {
       const [, , id, suffix] = match;
-      const job = jobs.get(id);
+      if (key && !key.startsWith("mock")) {
+        ctx.route(`queue ${suffix ? suffix.slice(1) : "result"} key=${tag}`);
+        return json(res, 401, { detail: "invalid key credentials" });
+      }
+      const found = jobs.get(id);
+      // 다른 키로 물으면 fal 처럼 「그런 요청 없음」 — 앱이 보낸 계정의 키로 묻는지 잰다.
+      const job = found && found.key === key ? found : undefined;
+      if (found && !job) ctx.route(`queue ${suffix ? suffix.slice(1) : "result"} WRONG-KEY key=${tag}`);
       if (!job) {
+        if (found) return json(res, 404, { status: "NOT_FOUND" });
         ctx.route(`queue ${suffix ? suffix.slice(1) : "result"} (unknown id)`);
         return json(res, 404, { detail: "Request not found" });
       }
```

적용·다시 띄우기(Step 1 에서 적은 명령줄과 같은 환경값으로):
```bash
D="$(dirname "$K")"
(cd "$D/tools/mock-ai" && patch -l --dry-run fal.mjs < "$D/fal-s3.diff" && patch -l fal.mjs < "$D/fal-s3.diff" && node --check fal.mjs && echo LOCAL_OK)
scp -i "$K" "$D/fal-s3.diff" ubuntu@$B:/tmp/fal-s3.diff
ssh -i "$K" ubuntu@$B 'cd ~/tools/mock-ai && cp fal.mjs fal.mjs.pre-s3 && patch -l fal.mjs < /tmp/fal-s3.diff && node --check fal.mjs && echo PATCHED'
ssh -i "$K" ubuntu@$B 'sudo pkill -f "node server.mjs"; sleep 1; cd ~/tools/mock-ai && sudo -E nohup env IMAGE_DELAY_MS=45000 LLM_DELAY_MS=3000 node server.mjs > /tmp/mock.log 2>&1 & sleep 2; pgrep -af "node server.mjs"; head -2 /tmp/mock.log'
```
Expected: `LOCAL_OK`, `PATCHED`, `[mock] HTTPS :443 IMAGE_DELAY_MS=45000 …`. (Step 1 의 명령줄이 다른 값이면 그 값을 쓴다.) 확인 — A 에서 가짜 키와 엉터리 키로 무료 확인 주소를 묻는다:
```bash
ssh -i "$K" ubuntu@$A 'U=https://queue.fal.run/fal-ai/nano-banana-pro/requests/00000000-0000-4000-8000-000000000000/status; for k in mock-a nope; do curl -s -o /dev/null -w "$k %{http_code}\n" -H "Authorization: Key $k" $U; done'
```
Expected: `mock-a 404`, `nope 401`(운영 fal 의 실측과 같은 모양 — 보충 §2)

- [ ] **Step 3: 「전」·「후」 꾸러미를 B 에서 만든다(push 대신 bundle)** — S2 계획 Task 7 Step 2 의 명령을 `s2` → `s3a`, 가지 이름 `feat/capacity-s2-claims` → 이 가지로만 바꿔 그대로 돈다. Expected 도 같다(`BASE_OK`, 빈 `git status`, `BUILD_DONE` 두 번, `COPIED`)

- [ ] **Step 4: 「전」을 배포하고 잰다** — 상세페이지 6섹션 묶음 1·3명(설계 §2.2 의 측정 시나리오)

```bash
ssh -i "$K" ubuntu@$A 'sed -i "s/\r$//" /tmp/ec2-new/*; sudo bash /tmp/ec2-new/deploy-release.sh /tmp/app-s3a-before.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-s3a-before" | tail -2; curl -s -o /dev/null -w "ready=%{http_code}\n" http://127.0.0.1/api/health/ready'
ssh -i "$K" ubuntu@$B 'cd ~/tools/k6 && . ./envk6.sh && USER_PREFIX=s3 USER_COUNT=10 node setup-users.mjs >/dev/null 2>&1 && curl -s -XPOST http://127.0.0.1:8081/__reset >/dev/null &&
LEVELS=1,3 HOLD=150s k6 run generate-pdp.js > /tmp/k6-s3a-before.txt 2>&1; tail -25 /tmp/k6-s3a-before.txt;
curl -s http://127.0.0.1:8081/__stats | python3 -c "import json,sys; r=json.load(sys.stdin)[\"routes\"]; [print(k, v[\"count\"], v[\"status\"]) for k,v in r.items() if \"fal\" in k or \"queue\" in k]"'
```
Expected: `ready=200`; k6 요약표(`pdp_batch` 소요 p50/p95, 실패%, 섹션 성공·실패 수); 가짜 AI 통계에 **`fal.run POST …` 줄이 있고**(동기 호출) `queue submit` 줄은 없다

- [ ] **Step 5: 「후」를 배포하고 똑같이 잰다** — Step 4 의 두 명령을 `before` → `after` 로만 바꿔 돈다.

**S3a 합격 기준:**

| 항목 | 기준 |
|---|---|
| 가짜 AI 의 `fal.run POST` | 「후」 **0** |
| `queue submit key=mock-fal-key` | 「후」 = 만든 장 수(k6 의 장 수와 같다), 상태 `{"200": N}` |
| `queue status`·`queue result` | 있다. `WRONG-KEY` 줄 **0** |
| 실패율 | 「후」 ≤ 「전」 |
| 장·묶음 소요 p50 | 「후」 − 「전」 ≤ **3초**(1초 폴링 + 제출 왕복). 넘으면 숫자로 보고하고 폴링 간격을 사용자와 정한다 |
| A 서버 기록 | `journalctl -u fixup-image-agent --since "20 min ago" | grep -ciE "FalRunTimeout|fal responded"` 가 0 |

- [ ] **Step 6: 429 가 「몰렸습니다」로 나오는지(오류 길 한 번)** — A 의 `FAL_KEY` 를 잠깐 `mock-429-x` 로 바꿔 상세페이지 한 번:

```bash
ssh -i "$K" ubuntu@$A 'F=/etc/fixup-image-agent/app.env; sudo cp -a $F /root/app.env.s3a-bak; sudo sed -i "s/^FAL_KEY=.*/FAL_KEY=mock-429-x/" $F; sudo systemctl restart fixup-image-agent; sleep 8; systemctl is-active fixup-image-agent'
ssh -i "$K" ubuntu@$B 'cd ~/tools/k6 && . ./envk6.sh && LEVELS=1 HOLD=20s k6 run generate-pdp.js 2>&1 | grep "\[pdp\]" | grep -c "\"stopBatch\":true"'
ssh -i "$K" ubuntu@$A 'sudo cp -a /root/app.env.s3a-bak /etc/fixup-image-agent/app.env && sudo systemctl restart fixup-image-agent && sleep 8 && systemctl is-active fixup-image-agent && sudo grep -c "^FAL_KEY=mock-fal-key" /etc/fixup-image-agent/app.env'
```
Expected: 두 번째 명령이 1 이상 — 묶음 라우트는 `AI_QUOTA_EXCEEDED`·`AI_KEY_MISSING`·`AI_PROVIDER_UNAVAILABLE` 일 때만 `stopBatch` 를 켠다(`app/api/pdp/images/batch/route.ts:367`). 키는 있으므로 쿼터 초과(「몰렸습니다」)다. 마지막 `active`, `1`(원래 값으로 돌아옴)

- [ ] **Step 7: 기록하고 커밋** — 원본을 `docs/capacity/raw/2026-10-01-s3a/`(`k6-s3a-before.txt`·`k6-s3a-after.txt`·`mock-stats-before.txt`·`mock-stats-after.txt`)로 내려받고, 비밀값 검사(S2 Task 7 Step 6 의 `grep -rnE …` 명령, 경로만 바꿈)가 `CLEAN` 인지 본 뒤, 기준선 문서 끝에 「## S3a 뒤 (동기 fal → 대기열, 2026-10-01)」 절(조건·전후 표·합격 기준 맞음/아님·해석)을 더한다.

```bash
git add docs/capacity/2026-09-29-baseline.md docs/capacity/raw/2026-10-01-s3a
git commit -m "docs(capacity): S3a 전후 — 상세페이지 동기 호출 0, 장당 시간

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: 시험 서버를 원래대로** — A 는 측정 모양 그대로 둔다(S3b 가 쓴다). 가짜 AI 의 키별 흉내도 **그대로 둔다**(S3b 가 쓴다; 되돌리려면 `cp fal.mjs.pre-s3 fal.mjs` 후 다시 띄우기). B 의 `/tmp/s3a.bundle`·`~/app-s3a-*.tar.gz` 와 이 컴퓨터의 `$(dirname "$K")/s3a.bundle` 은 지운다(이 작업용 일회성 파일)

---

### Task 7: 운영 반영

**Files:** 없음. **이 단계에는 마이그레이션도 새 환경변수도 없다** — 사용자가 손댈 설정이 없다.

- [ ] **Step 1: 다른 터미널의 작업이 섞였나 본다**(메모리 「배포 전 다른 터미널 확인」) — S2 계획 Task 8 Step 2 의 명령. 남의 머지·마이그레이션이 섞였으면 배포하지 말고 사용자에게 묻는다

- [ ] **Step 2: PR·머지·배포** — PR 본문에 Task 5 리뷰 반영표와 Task 6 전후 표. 사용자가 「배포해 주세요」라고 하면 `CLAUDE.md` 대로 **`docs/DEPLOY.md` 「매 배포」를 열어** 그대로 한다(기억으로 하지 않는다). 배포는 재시작이다 — 「배포 전에 최근 생성 요청을 본다」를 먼저(상세페이지는 S3a 뒤에도 요청 안에서 만든다)

- [ ] **Step 3: 배포 뒤 확인(DEPLOY.md 「배포 뒤 확인」 + 이번 변경 문구)**

```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'systemctl is-active fixup-image-agent; curl -s -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:3000/; readlink /opt/fixup-image-agent/current; sudo grep -rl "x-fal-request-timeout" /opt/fixup-image-agent/current/apps/web/.next/server | head -2'
```
Expected: `active`, `local=200`, 새 릴리스, 파일 하나 이상(대기열 제출 코드가 빌드에 있다)

- [ ] **Step 4: (사용자와) 실제 생성 한 번** — 사용자에게 쉬운 말로: 「상세페이지 만들기에서 섹션 하나만 이미지를 만들어 주세요. 평소처럼 1~2분 안에 그림이 나오면 됩니다.」 그다음:

```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'sudo journalctl -u fixup-image-agent --since "10 min ago" --no-pager | grep -ciE "FalRunTimeout|fal responded|PDP_IMAGE_GENERATION_FAILED"'
```
Expected: `0`. 관리자 화면 → 시스템 → 「AI 사용 비용」의 fal 줄에 방금 한 장이 더해졌는지 사용자와 본다(제출 자리 비용 한 줄). 그림이 안 나오거나 줄이 나오면 **되돌린다**: `docs/DEPLOY.md` 「되돌리기」(`sudo bash deploy/ec2/rollback-release.sh <이전 release-id>`) — 표·설정 변경이 없어 되돌리기가 곧 원상복구다

- [ ] **Step 5: 보고** — 결과(전후 숫자, 운영 확인)를 사용자에게 표로 보고하고, 메모리에 남길지 묻는다(쓰기는 묻고 한다). 다음은 S3b(`docs/superpowers/plans/2026-10-01-capacity-s3b-fal-account-pool.md`)
