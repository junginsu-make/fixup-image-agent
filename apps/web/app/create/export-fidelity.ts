import type { CanvasLayer } from "./pdp-drafts";

/**
 * 내려받는 그림을 만든 그림과 같게 만든다.
 *
 * ── 무엇이 문제였나 ───────────────────────────────────────────
 *
 * 편집 캔버스는 `min(100%, 460px)` 이고, 내보내기는 그 폭에 **2를 곱해** 구웠다.
 * 1536px 로 만든 것이 최대 920px 로 나간다 — 폭 60%, 넓이로는 36% 다.
 * 상세페이지는 확대해서 보는 물건이라 그 손실이 그대로 보인다.
 *
 * 게다가 레이어를 하나도 안 얹어도 이 길을 지났다. **아무것도 안 얹었는데**
 * 원본이 작아지고 JPEG 로 바뀌었다.
 *
 * ── 어떻게 고치나 ────────────────────────────────────────────
 *
 * 레이어 좌표는 캔버스 폭 기준이다. 그래서 **배율만 원본에 맞추면** 배치는
 * 그대로 두고 해상도만 되찾는다. 얹은 것이 없으면 아예 다시 굽지 않는다.
 */

/** 지금까지의 배율. 원본 크기를 모를 때만 여기로 떨어진다. */
const FALLBACK_SCALE = 2;

/**
 * 너무 큰 배율은 막는다.
 *
 * 9:16 원본이 1536×2752 이므로 8배면 12288px 까지 받아 준다. 그 위는 브라우저
 * 캔버스 한도에 걸려 **한 장도 못 받는다** — 작게 받는 것보다 나쁘다.
 */
const MAX_SCALE = 8;

export function exportScaleFor(input: { naturalWidth: number; canvasWidth: number }): number {
  const { naturalWidth, canvasWidth } = input;
  if (!naturalWidth || !canvasWidth) return FALLBACK_SCALE;

  // 원본이 캔버스보다 작으면 늘리지 않는다. 없는 화질을 만들 수는 없다.
  const scale = naturalWidth / canvasWidth;
  if (scale <= 1) return 1;
  return Math.min(scale, MAX_SCALE);
}

/**
 * 다시 구울 필요가 있는가.
 *
 * **얹은 것이 없으면 원본 그대로 준다.** 다시 구우면 JPEG 로 바뀌며 손실이
 * 나는데, 글자도 도형도 없으면 그럴 이유가 없다.
 */
export function needsRecomposite(layers: CanvasLayer[]): boolean {
  return layers.length > 0;
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * 내려받을 파일 이름.
 *
 * 합쳐서 구운 것은 JPEG 다. 원본 그대로 주는 것은 **원래 형식**을 따른다 —
 * png 를 `.jpg` 로 저장하면 여는 프로그램이 헷갈린다.
 *
 * `section_id` 는 AI 응답값이라 `../` 가 섞일 수 있다. 손질한다.
 */
export function exportFileName(sectionId: string, mimeType: string, recomposited: boolean): string {
  const safe = sectionId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";
  const extension = recomposited ? "jpg" : (EXTENSION[mimeType] ?? "png");
  return `pdp-${safe}.${extension}`;
}

/** `data:image/png;base64,...` 에서 형식만 꺼낸다. 못 읽으면 png 로 본다. */
export function mimeTypeOfDataUrl(dataUrl: string): string {
  return /^data:([^;]+);/.exec(dataUrl)?.[1] ?? "image/png";
}

/**
 * 구운 그림을 서버로 보낼 수 있는 모양으로.
 *
 * `FileReader` 가 주는 것은 `data:image/jpeg;base64,...` 꼴이라 앞머리를 떼어
 * 낸다. 서버는 base64 원문만 받는다.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
