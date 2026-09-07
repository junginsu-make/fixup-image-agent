import { MATCH_SOURCE } from "@fixup/sns-core";

/**
 * 수정할 때 넘길 크기를 고른다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-b
 *
 * **`match-source` 로 만든 작업은 지금까지 수정이 거절됐다.** `PosterEditJob` 에
 * `sourceSize` 필드가 아예 없어서, `buildPosterJob` 이 「첨부한 그림의 크기를
 * 읽지 못해 같은 비율로 만들 수 없습니다」로 막았다.
 *
 * **순수 함수로 뽑는다** — 라우트 안에 두면 시험이 못 간다.
 */
export function editSourceSize(
  ratioId: string,
  adMaster: { width: number; height: number } | undefined,
  parent: { width: number | null; height: number | null },
): { width: number; height: number } | undefined {
  // 화면이 수정하면서 비율을 바꿀 수 있다(`ratioId ?? project.ratio`).
  // 그때 크기를 실으면 **사용자가 고른 비율을 덮어쓴다.**
  if (ratioId !== MATCH_SOURCE) return undefined;
  if (adMaster) return adMaster;
  // 수정의 원본은 부모 그림 자체다. 그 크기가 곧 만들 크기다 —
  // **광고와 무관한 기존 사용자가 여기서 고쳐진다.**
  // 옛 행에는 크기가 안 채워져 있고, 그때는 지금까지처럼 거절된다.
  if (parent.width && parent.height) return { width: parent.width, height: parent.height };
  return undefined;
}
