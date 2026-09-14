import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

/**
 * 목록 화면이 쓸 그림 주소.
 *
 * 저장소에는 경로만 남는다(`{user}/sns/{작업}/{장}.png`). 볼 수 있는 주소는
 * 열 때마다 새로 만든다 — 버킷이 비공개라 서명이 붙은 짧은 수명의 주소다.
 *
 * 작업 하나를 여는 화면은 `refreshProjectAssetUrls` 가 그 일을 한다. 그런데
 * **목록은 아무도 안 했다.** 그래서 카드뉴스 목록과 라이브러리 작업물에
 * "아직 그림이 없습니다" 만 떴다. 로컬에서는 주소가 흐름 안에 그대로 저장돼
 * 있어 드러나지 않았다.
 *
 * 작업마다 따로 서명하면 왕복이 작업 수만큼 늘어난다. 한 번에 모아 서명하고
 * 다시 나눠 붙인다. 그래서 모으기와 붙이기를 나눠 뒀다 — 가운데에서 무엇을
 * 하든(로컬 경로든 서명 주소든) 양쪽은 같다.
 */

export function collectCardPaths(projects: SnsProjectRecord[]): string[] {
  const paths = new Set<string>();
  for (const project of projects) {
    for (const card of (project.data.executionFlow ?? project.data.flow)?.cards ?? []) {
      if (card.assetPath) paths.add(card.assetPath);
      // **미리보기도 함께 서명한다.** 목록은 미리보기를 걸고, 확대·내려받기·
      // 라이브러리 저장은 원본을 쓴다 — 둘 다 필요하다. 한 번에 모아 서명하므로
      // 왕복은 늘지 않는다.
      if (card.thumbPath) paths.add(card.thumbPath);
    }
  }
  return [...paths];
}

export function withCardUrls(
  projects: SnsProjectRecord[],
  urls: Map<string, string>,
): SnsProjectRecord[] {
  return projects.map((project) => {
    const flow = project.data.executionFlow ?? project.data.flow;
    if (!flow) return project;
    return {
      ...project,
      data: {
        ...project.data,
        [project.data.executionFlow ? "executionFlow" : "flow"]: {
          ...flow,
          cards: flow.cards.map((card) => {
            // 주소를 못 받은 카드는 그대로 둔다. 하나 실패했다고 나머지까지
            // 못 보여줄 이유가 없다.
            const url = card.assetPath ? urls.get(card.assetPath) : undefined;
            const thumbUrl = card.thumbPath ? urls.get(card.thumbPath) : undefined;
            if (!url && !thumbUrl) return card;
            return { ...card, ...(url ? { assetUrl: url } : {}), ...(thumbUrl ? { thumbUrl } : {}) };
          }),
        },
      },
    };
  });
}
