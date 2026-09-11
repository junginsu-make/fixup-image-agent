import { buildModelInput, modelById, resolveSize, unitPrice, type ImageModel } from "@fixup/sns-core";
import type { RedesignImageGenerator } from "@fixup/redesign-core";
import { createFalUploader } from "../fal/upload";
import { createHash } from "node:crypto";
import { recordedImageCall } from "../generation/recorded-image";

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

/** 리디자인이 쓰는 모델. 다른 도구의 기본값(표준형)과 같은 것을 쓴다. */
export const REDESIGN_FAL_MODEL = "gpt-image-2.5-flare";
export function quoteRedesignFal(size: string) {
  const model = modelById(REDESIGN_FAL_MODEL);
  const pixel = pixelSizeOf(size) ?? resolveSize("9:16", model).pixel;
  if (!pixel) throw new Error("price_unavailable");
  return Math.ceil(unitPrice(model, "i2i", pixel) * 1_000_000);
}

const FAL_BASE_URL = "https://fal.run";

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

export function createRedesignImageGenerator(
  environment: Record<string, string | undefined> = process.env,
): RedesignImageGenerator {
  const apiKey = requireKey(environment);
  const uploader = createFalUploader(apiKey);
  const model = modelById(REDESIGN_FAL_MODEL);

  return async ({ prompt, references, size }) => {
    const unit = quoteRedesignFal(size);
    const image = await recordedImageCall({ provider: "fal", model: model.id, endpoint: model.i2i.endpoint,
      identity: { prompt, size, references: references.slice(0, model.maxReferenceImages).map(r => ({ mimeType: r.mimeType, digest: createHash("sha256").update(r.buffer).digest("hex") })) },
      price: { providerUnitMicrousd: unit, chargeUnitMicrousd: unit },
    }, async () => {
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

    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    const text = await response.text();
    if (!response.ok) {
      throw Object.assign(new RedesignFalError(
        response.status === 429
          ? "이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요."
          : `이미지를 생성하지 못했습니다 (${response.status}).`,
      ), { providerStatus: response.status });
    }

    return JSON.parse(text) as unknown;
    }, async raw => {
    const url = imageUrlFrom(raw);
    const downloaded = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!downloaded.ok) throw new RedesignFalError("만든 이미지를 내려받지 못했습니다.");

    return {
      base64: Buffer.from(await downloaded.arrayBuffer()).toString("base64"),
      mimeType: downloaded.headers.get("content-type") || "image/png",
    };
    });
    return { buffer: Buffer.from(image.base64, "base64"), mimeType: image.mimeType };
  };
}
