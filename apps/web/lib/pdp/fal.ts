import {
  PdpServiceError,
  buildFalPayload,
  falImageFrom,
  resolveEndpoint,
  type ImageGenerator,
} from "@fixup/pdp-core";
import { defaultFalRouter } from "../fal/pool/default";
import type { FalRouter } from "../fal/route";
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
  router: FalRouter = defaultFalRouter(environment),
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
