/**
 * 저장해 둔 그림을 **어디에 지우라고 말할지** 정한다.
 *
 * 목록이 **세 통**에서 온다(`SavedImagePicker` 의 `load`). 「레퍼런스」로 보이는
 * 것이 그중 둘이라 겉모습만 보고 지우면 엉뚱한 통을 부른다.
 *
 *   /api/pdp/style-references  디자인 레퍼런스   DELETE { id }        `referenceId` 가 있다
 *   /api/reference-images      참고 이미지       DELETE /<id>         접두사 `lib-` 가 붙어 온다
 *   /api/library               작업물            DELETE { id }        접두사 `lib-` 가 붙어 온다
 *
 * 화면 안에서 갈래를 타면 값으로 못 잰다. 이 저장소는 그 대가를 여러 번 치렀다.
 */

export interface DeletableSavedImage {
  id: string;
  origin: "reference" | "library";
  /**
   * **디자인 레퍼런스 표의 행 id.**
   *
   * 이 값이 있으면 `/api/pdp/style-references` 에서 온 것이다. 없으면서
   * `origin` 이 `reference` 면 `/api/reference-images` 쪽이다. 둘 다 화면에는
   * 「레퍼런스」로 보이므로 이 칸이 유일한 구분이다.
   */
  referenceId?: string;
}

export interface DeleteTarget {
  url: string;
  /** 몸통이 필요하면 담는다. 경로에 id 를 싣는 곳은 비운다. */
  body?: { id: string };
}

/** 목록에 담을 때 붙인 접두사를 뗀다. */
function bareId(id: string) {
  return id.startsWith("lib-") ? id.slice(4) : id;
}

export function deleteTargetFor(image: DeletableSavedImage): DeleteTarget {
  if (image.origin === "library") {
    return { url: "/api/library", body: { id: bareId(image.id) } };
  }
  if (image.referenceId) {
    return { url: "/api/pdp/style-references", body: { id: image.referenceId } };
  }
  return { url: `/api/reference-images/${bareId(image.id)}` };
}
