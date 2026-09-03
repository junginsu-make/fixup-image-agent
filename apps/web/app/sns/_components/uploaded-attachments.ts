import type { Attachment } from "@fixup/sns-core";
import type { ReferenceImageRow } from "../../library/reference-upload";

type ImageView = ReferenceImageRow & { signedUrl: string | null };

/**
 * 방금 올린 그림을 이 작업에 붙일 줄로 바꾼다.
 *
 * 올리기가 라이브러리에만 넣고 끝나서, 화면은 아무 변화가 없었고 올리기가
 * 안 되는 것처럼 보였다. 저장은 되고 있었다(2026-09-03 운영 DB 확인).
 * 올리는 사람은 지금 쓰려고 올린다.
 *
 * **다시 읽은 줄에서 경로와 주소를 가져온다.** 올린 응답에는 운영에서 서명
 * 주소가 없다. 응답으로 붙이면 미리보기가 빈 칸이 된다.
 */
export function attachmentsForUploaded(
  uploadedIds: string[],
  library: ImageView[],
  attached: Attachment[],
): Attachment[] {
  return uploadedIds.flatMap((id) => {
    const image = library.find((entry) => entry.id === id);
    // 목록에 없으면 붙일 근거가 없다. 이미 붙어 있으면 두 번 붙이지 않는다.
    if (!image || attached.some((attachment) => attachment.id === id)) return [];
    return [{
      id: image.id,
      kind: "style_reference" as const,
      role: "body" as const,
      assetPath: image.storagePath,
      url: image.signedUrl ?? "",
    }];
  });
}
