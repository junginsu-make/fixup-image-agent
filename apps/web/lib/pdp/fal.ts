import {
  PdpServiceError,
  buildFalPayload,
  falImageFrom,
  resolveEndpoint,
  type ImageGenerator,
} from "@fixup/pdp-core";
import { recordedImageCall } from "../generation/recorded-image";
import { imageUnitUsd } from "../credit-cost";

/**
 * 상세페이지·캐릭터가 fal 로 그림을 만드는 **유일한 자리**.
 *
 * 전에는 `packages/pdp-core` 안에서 `process.env.FAL_KEY` 를 읽고 직접
 * `fetch` 했다. 같은 저장소의 포스터·카드뉴스 코어는 그러지 않는다 — 무엇을
 * 어디로 보낼지는 알되 보내지는 않고, 바깥세상은 `apps/web` 이 맡는다.
 *
 * 무엇을 보낼지(엔드포인트·페이로드)는 여전히 코어가 정한다. 그건 도메인
 * 지식이라 옮기면 두 곳으로 갈린다.
 */

const FAL_BASE_URL = "https://fal.run";

type Env = Record<string, string | undefined>;

export function quotePdpImage(model: Parameters<ImageGenerator>[0], input: Parameters<ImageGenerator>[1]) {
  const payload = buildFalPayload(model, input);
  const size = payload.image_size && typeof payload.image_size === "object" ? payload.image_size as { width: number; height: number } : undefined;
  return Math.ceil(imageUnitUsd(model, { mode: input.references.length ? "i2i" : "t2i", size }) * 1_000_000);
}

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

export function createPdpImageGenerator(environment: Env = process.env): ImageGenerator {
  const apiKey = requireKey(environment);

  return async (model, input) => {
    const endpoint = resolveEndpoint(model, input.references);
    const payload = buildFalPayload(model, input);
    const unit = quotePdpImage(model, input);
    return recordedImageCall({ provider: "fal", model, endpoint, identity: payload,
      price: { providerUnitMicrousd: unit, chargeUnitMicrousd: unit, configuration: { mode: input.references.length?"i2i":"t2i",size:payload.image_size??input.aspectRatio,quality:payload.quality??null,resolution:payload.resolution??null } },
    }, async () => {
    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const text = await response.text();
    if (!response.ok) {
      throw Object.assign(new PdpServiceError(
        response.status === 429 ? "AI_QUOTA_EXCEEDED" : "PDP_IMAGE_GENERATION_FAILED",
        response.status === 429
          ? "이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요."
          : "이미지를 생성하지 못했습니다.",
        `fal ${endpoint} responded ${response.status}: ${text.slice(0, 300)}`,
      ), { providerStatus: response.status });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new PdpServiceError(
        "AI_RESPONSE_INVALID",
        "이미지 생성 응답을 해석하지 못했습니다.",
        "fal response was not valid JSON.",
      );
    }

    return parsed;
    }, async (parsed) => {
    // The paid response is durably recorded before this download starts.
    const image = falImageFrom(parsed);
    const downloaded = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
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
    });
  };
}
