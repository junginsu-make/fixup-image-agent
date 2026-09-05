export interface SavedLibraryItem {
  id: string;
  title: string;
  coverUrl: string | null;
  /** 목록에 거는 작은 사본. 없으면 원본으로 떨어진다. */
  coverThumbUrl?: string | null;
  sourceType?: "generation" | "character";
}

export interface SavedLibraryImage {
  id: string;
  name: string;
  /**
   * **원본이다.** 고른 그림은 상세페이지·리디자인의 생성 입력으로 들어가므로
   * 여기에 사본을 물리면 크레딧을 쓰는 결과물의 품질이 조용히 깎인다.
   */
  url: string;
  /** 격자에 거는 사본. 없으면 화면이 `url` 로 떨어진다. */
  thumbUrl: string | null;
  origin: "library";
}

/**
 * 캐릭터는 전용 선택창에서 id와 다각도 정보를 유지한 채 고른다. 일반 사진
 * 선택창에서는 라이브러리 백업본을 빼야 같은 캐릭터가 두 번 나타나지 않는다.
 */
export function toSavedLibraryImages(
  items: SavedLibraryItem[],
  excludeCharacterItems = false,
): SavedLibraryImage[] {
  return items
    .filter((item) => item.coverUrl && (!excludeCharacterItems || item.sourceType !== "character"))
    .map((item) => ({
      id: `lib-${item.id}`,
      name: item.title,
      url: item.coverUrl as string,
      thumbUrl: item.coverThumbUrl ?? null,
      origin: "library",
    }));
}
