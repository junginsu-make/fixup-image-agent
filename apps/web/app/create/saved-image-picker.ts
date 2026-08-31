export interface SavedLibraryItem {
  id: string;
  title: string;
  coverUrl: string | null;
  sourceType?: "generation" | "character";
}

export interface SavedLibraryImage {
  id: string;
  name: string;
  url: string;
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
      origin: "library",
    }));
}
