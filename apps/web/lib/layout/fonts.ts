import { existsSync } from "node:fs";
import path from "node:path";
import { FONT_FAMILY_PATTERN } from "@fixup/layout-core";

/**
 * 서체를 릴리스에 동봉한다.
 *
 * 운영 서버에 깔린 한글 폰트는 fallback 하나뿐이라 서체를 고를 수 없다.
 * 파일을 함께 담고 그릴 때마다 그 파일을 가리킨다 — fontconfig 설치에
 * 기대지 않는다. 파일이 없으면 카드는 기본 폰트로라도 나오고, 대신 그
 * 사실을 화면에 알린다.
 */

export const FONT_DIR_ENV = "LAYOUT_FONT_DIR";

/** `apps/web` 이 작업 폴더다. 개발도 EC2 standalone 도 같다. */
export function defaultFontDir(): string {
  return process.env[FONT_DIR_ENV]?.trim() || path.join(process.cwd(), "assets", "fonts");
}

export interface ResolvedFont {
  /** Pango 가 읽는 서체 설명. 「Pretendard Bold 42」 */
  description: string;
  /** 동봉한 파일. 없으면 fontconfig 가 대신 고른다. */
  file?: string;
  warning?: string;
}

const WEIGHT_NAME: Record<number, string> = { 400: "Regular", 700: "Bold" };

export function resolveFont(
  family: string,
  weight: 400 | 700,
  sizePx: number,
  dir: string = defaultFontDir(),
): ResolvedFont {
  const size = Math.round(sizePx * 10) / 10;
  const style = weight === 700 ? " Bold" : "";

  // 이름이 그대로 파일 경로가 된다. 경계에서 이미 막지만 여기서도 막는다 —
  // 표에 직접 쓴 값이 합성까지 흘러올 길이 있다.
  if (!FONT_FAMILY_PATTERN.test(family)) {
    return {
      description: `Sans${style} ${size}`,
      warning: `쓸 수 없는 글꼴 이름입니다. 기본 글꼴로 그립니다.`,
    };
  }
  const description = `${family}${style} ${size}`;

  const stem = `${family}-${WEIGHT_NAME[weight]}`;
  const file = [".otf", ".ttf"]
    .map((extension) => path.join(dir, `${stem}${extension}`))
    .find((candidate) => existsSync(candidate));

  if (file) return { description, file };
  return {
    description,
    warning: `${family} ${WEIGHT_NAME[weight]} 글꼴 파일을 찾지 못했습니다. 기본 글꼴로 그립니다.`,
  };
}
