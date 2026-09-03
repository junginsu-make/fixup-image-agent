/**
 * 내려받을 때 붙일 파일 이름.
 *
 * 서명 주소는 경로가 `.../object/sign/abc` 처럼 확장자 없이 오는 일이 많다.
 * 그대로 저장하면 확장자 없는 파일이 떨어져 열리지 않는다.
 */

const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

/** 파일 이름에 못 쓰는 글자. 운영체제마다 조금씩 다르지만 넓게 잡는다. */
const FORBIDDEN = /[/\\:*?"<>|]/g;

/** 넉넉히 잡되 상한은 둔다. 넘치면 저장 자체가 실패한다. */
const MAX_BASE = 80;

export function downloadName(image: { name?: string; alt?: string; src: string }): string {
  if (image.name?.trim()) return image.name.trim();

  const path = image.src.split(/[?#]/)[0] ?? "";
  const tail = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const extension = EXTENSIONS.includes(tail) ? tail : "png";

  const base = (image.alt ?? "").replace(FORBIDDEN, "-").trim().slice(0, MAX_BASE) || "image";
  return `${base}.${extension}`;
}
