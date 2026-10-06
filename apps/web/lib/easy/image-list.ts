import {
  describeEasyResults, numberEasyResults, resultKindOf,
  type EasyImageState, type EasyResultEntry, type EasyResultKind, type EasyResultNumber,
} from "../../app/easy/image-numbers";
import { editedRequestIds, pickRowImage } from "../../app/easy/row-image";
import { posterStoresForUser } from "../poster/stores";
import { cardnewsProjectIds } from "./cardnews-steps";

/**
 * **이 대화의 결과물 사실**(2026-10-07 2차 설계 D2 · D5).
 *
 * 번호(`numberEasyResults` — 이미지 · 카드뉴스 · 지운 것 모두)마다 갈래 · 상태와 이미지 줄에 보이는 그림.
 * 판단 모델의 목록(12줄 창 밖의 결과물도 고를 수 있게) · 고칠 번호 검증(`edit-target.ts`) · 이미지
 * 보기(`see-turn.ts`)가 쓴다.
 *
 * **못 읽어도 턴을 깨지 않는다** — 빈 사실을 돌려준다(목록 없이 예전처럼 판단한다). 결과물 줄이 없으면
 * 저장소를 안 읽는다.
 */
type Row = { id: string; role: string; workId?: string | null; body?: string | null; createdAt?: string };

export interface EasyPicture {
  id: string;
  projectId: string;
  generationRequestId: string;
  selected: boolean;
  assetPath: string;
  thumbPath?: string | null;
}

export interface EasyImageFacts {
  entries: EasyResultEntry[];
  /** 포스터 저장소에 있는 작업(지운 것 · 카드뉴스는 없다). */
  posters: ReadonlySet<string>;
  /** 번호 → 그 줄에 보이는 그림(다 만든 이미지 번호만). */
  pictures: ReadonlyMap<number, EasyPicture>;
  /**
   * 고칠 수 있는 이미지가 있나 — **지운 것만 뺀다**(2차 최종 리뷰 a). 만드는 중 · 못 만든 이미지도 넣는다:
   * 그때 「글자 크게」면 「고칠 것이 없다」가 아니라 「아직 준비 안 됨」 · 「못 만든 이미지」를 말해야 한다.
   */
  madeImage: boolean;
  /** 지운 것을 뺀 이 대화의 마지막 결과물이 이미지인가. 카드뉴스면 false. */
  lastIsImage: boolean;
}

const 비었다: EasyImageFacts = { entries: [], posters: new Set(), pictures: new Map(), madeImage: false, lastIsImage: false };

/** 그림이 없는 줄이 이만큼 지나면 못 만든 것으로 본다(`row-image.ts` 의 고치기 실패 시간과 같다). */
const 실패로볼시간 = 10 * 60 * 1000;

export async function loadEasyImages(userId: string, rows: readonly Row[], now = Date.now()): Promise<EasyImageFacts> {
  const ids = [...new Set(rows.flatMap((row) => (row.role === "image" && row.workId ? [row.workId] : [])))];
  if (!ids.length) return 비었다;
  try {
    const stores = posterStoresForUser(userId);
    const found = await Promise.all(ids.map((id) => stores.projects.get(id).catch(() => undefined)));
    const posters = new Set(found.flatMap((project) => (project ? [project.id] : [])));
    // 포스터가 아닌 작업만 카드뉴스인지 본다(있는지만 — 서명하지 않는다).
    const cards = await cardnewsProjectIds(userId, ids.filter((id) => !posters.has(id)));
    const images: EasyPicture[] = posters.size ? await stores.images.byProjects([...posters]) : [];
    const numbered = numberEasyResults(rows);
    const 줄 = (rowId: string) => rows.find((row) => row.id === rowId);
    const pictures = new Map(numbered.flatMap((one) => {
      const picked = posters.has(one.workId)
        ? pickRowImage(줄(one.rowId) ?? {}, images.filter((image) => image.projectId === one.workId), editedRequestIds(rows, one.workId))
        : undefined;
      return picked ? [[one.n, picked] as const] : [];
    }));
    const factOf = (one: EasyResultNumber): { kind: EasyResultKind; state: EasyImageState } => {
      const kind = resultKindOf(one.workId, posters, cards);
      if (kind !== "image") return { kind, state: kind === "deleted" ? "deleted" : "done" };
      if (pictures.has(one.n)) return { kind, state: "done" };
      const at = Date.parse(줄(one.rowId)?.createdAt ?? "");
      return { kind, state: Number.isFinite(at) && now - at >= 실패로볼시간 ? "failed" : "making" };
    };
    const entries = describeEasyResults(rows, numbered, factOf);
    const 마지막 = [...entries].reverse().find((one) => one.kind !== "deleted");
    return {
      entries, posters, pictures,
      madeImage: entries.some((one) => one.kind === "image"),
      lastIsImage: 마지막?.kind === "image",
    };
  } catch (error) {
    console.warn("[easy] 이 대화의 결과물을 읽지 못했습니다", error instanceof Error ? error.message : error);
    return 비었다;
  }
}
