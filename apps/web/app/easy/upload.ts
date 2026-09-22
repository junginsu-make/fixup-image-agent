import type { ReferencePurpose } from "../api/reference-sets/schema";

/**
 * 「직접 첨부」가 `/api/reference-images` 에 보낼 양식.
 *
 * **용도는 `both` 다.** 처음에는 `style` 을 보냈는데 서버가 받는 값이 아니라
 * 올리자마자 zod 오류가 떴다(2026-09-22). 역할은 여기서 묻지 않는다 — 기획이
 * 붙인 것을 전부 읽는다. 카드뉴스·포스터 어디에도 쓰이므로 라이브러리의 직접
 * 올리기와 같은 `both` 로 둔다.
 */
const PURPOSE: ReferencePurpose = "both";

export function easyUploadForm(file: File, id: string): FormData {
  const form = new FormData();
  form.append("id", id);
  form.append("title", file.name);
  form.append("purpose", PURPOSE);
  form.append("file", file);
  return form;
}

/** 서버가 올린 뒤 돌려주는 칸 중 여기서 쓰는 것. `url` 칸은 없다. */
export interface UploadedImage {
  id: string;
  title: string | null;
  signedUrl: string | null;
}

/**
 * 붙인 그림 한 장.
 *
 * 미리보기 주소는 서버의 `signedUrl` 이다. **운영은 올린 직후 이 값이 비어
 * 온다**(목록을 다시 읽어야 서명이 붙는다). 그때는 고른 파일로 미리보기를
 * 만든다 — 이 주소는 화면의 작은 썸네일에만 쓰고 서버로 보내지 않는다.
 */
export function attachmentFromUpload(
  image: UploadedImage,
  file: File,
  preview: (file: File) => string = (one) => URL.createObjectURL(one),
): { id: string; url: string; title: string } {
  return { id: image.id, url: image.signedUrl ?? preview(file), title: image.title ?? file.name };
}
