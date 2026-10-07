import {
  describeEasyResults, numberEasyResults, resultKindOf,
  type EasyImageState, type EasyResultEntry, type EasyResultKind, type EasyResultNumber,
} from "../../app/easy/image-numbers";
import { editedRequestIds, pickRowImage } from "../../app/easy/row-image";
import { posterStoresForUser } from "../poster/stores";
import { cardnewsProjectIds } from "./cardnews-steps";
import { READ_BATCH, readInBatches } from "./read-batches";

/**
 * **이 대화의 결과물 사실**(2026-10-07 2차 설계 D2 · D5).
 *
 * 번호(`numberEasyResults` — 이미지 · 카드뉴스 · 지운 것 모두)마다 갈래 · 상태와 이미지 줄에 보이는 그림.
 * 판단 모델의 목록(12줄 창 밖의 결과물도 고를 수 있게) · 고칠 번호 검증(`edit-target.ts`) · 이미지
 * 보기(`see-turn.ts`)가 쓴다.
 *
 * **못 읽어도 턴을 깨지 않는다.** 통째로 못 읽으면 빈 사실이 아니라 번호마다 「모름」이다(최종 수정 7) — 빈 사실이면
 * 고치기 갈래가 빠져 「고쳐줘」가 새 이미지 만들기(값)로 새거나 번호 단추가 「고칠 것이 없다」로 끝난다. 결과물 줄이
 * 없으면 저장소를 안 읽는다.
 *
 * **한 턴에 읽는 수를 묶는다**(최종 수정 10, 보안 리뷰). 같은 작업은 한 번, 최근 작업 `RECENT_RESULT_WORKS` 개만 읽는다.
 * 그보다 오래된 작업은 번호를 그대로 두고 「모름」이다. 그 번호는 `unreadOld` 에 따로 둔다(후속 Task 2) — 잠깐 못 읽은
 * 것은 「잠시 뒤 다시」가 맞지만 100개 밖은 기다려도 안 읽으므로 고치기 · 보기가 사실대로(오래됨) 답한다.
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
   * 못 읽은 것(`unknown`)도 넣는다 — 이미지일 수 있다(리뷰 1차 수정 2).
   */
  madeImage: boolean;
  /** 지운 것을 뺀 이 대화의 마지막 결과물이 이미지인가(모르는 것이면 이미지로 본다). 카드뉴스면 false. */
  lastIsImage: boolean;
  /**
   * 최근 `RECENT_RESULT_WORKS` 개 밖이라 읽지 않은 결과물 번호(후속 Task 2). 그 entry 는 지금처럼 `unknown` 이다 —
   * 번호 · 이름표 · `madeImage` · `lastIsImage` 는 그대로고 답하는 말만 가른다. 없으면 오래된 것이 없다.
   */
  unreadOld?: ReadonlySet<number>;
}

const 비었다: EasyImageFacts = { entries: [], posters: new Set(), pictures: new Map(), madeImage: false, lastIsImage: false };

/** 한 턴에 저장소에서 읽는 결과물 작업 수(최종 수정 10). */
export const RECENT_RESULT_WORKS = 100;

/** 통째로 못 읽었을 때(최종 수정 7). 번호는 그대로, 모두 「모름」 — 이미지일 수 있다. */
function 모두모름(rows: readonly Row[], unreadOld: ReadonlySet<number>): EasyImageFacts {
  const entries = describeEasyResults(rows, numberEasyResults(rows), () => ({ kind: "unknown", state: "unknown" }));
  return { entries, posters: new Set(), pictures: new Map(), madeImage: entries.length > 0, lastIsImage: entries.length > 0, unreadOld };
}

/** 오래되어 안 읽은 작업의 결과물 번호(후속 Task 2). */
function 오래된번호(rows: readonly Row[], 오래된: readonly string[]): ReadonlySet<number> {
  const 작업 = new Set(오래된);
  return new Set(numberEasyResults(rows).filter((one) => 작업.has(one.workId)).map((one) => one.n));
}

/** 그림이 없는 줄이 이만큼 지나면 못 만든 것으로 본다(`row-image.ts` 의 고치기 실패 시간과 같다). */
const 실패로볼시간 = 10 * 60 * 1000;

export async function loadEasyImages(userId: string, rows: readonly Row[], now = Date.now()): Promise<EasyImageFacts> {
  const 작업들 = rows.flatMap((row) => (row.role === "image" && row.workId ? [row.workId] : []));
  if (!작업들.length) return 비었다;
  // 같은 작업은 한 번, 최근 것부터 정한 수만 읽는다. 나머지(오래된 것)는 「모름」이다.
  const ids = [...new Set([...작업들].reverse())].slice(0, RECENT_RESULT_WORKS);
  const 읽을것 = new Set(ids);
  const 오래된 = [...new Set(작업들)].filter((id) => !읽을것.has(id));
  const unreadOld = 오래된번호(rows, 오래된);
  try {
    const stores = posterStoresForUser(userId);
    // 못 읽은 작업은 「모름」이다 — 없는 것(지운 것)과 가른다(리뷰 1차 수정 2).
    const found = await readInBatches(ids, READ_BATCH, (id) => stores.projects.get(id).then(
      (project) => ({ id, project, failed: false }),
      () => ({ id, project: undefined, failed: true }),
    ));
    const posters = new Set(found.flatMap((one) => (one.project ? [one.project.id] : [])));
    // 포스터가 아닌 작업만 카드뉴스인지 본다(있는지만 — 서명하지 않는다). 카드뉴스를 못 읽으면 그 작업들은 모른다.
    const 나머지 = ids.filter((id) => !posters.has(id));
    const 카드 = await cardnewsProjectIds(userId, 나머지);
    const cards = 카드 ?? new Set<string>();
    const unread = new Set([...found.filter((one) => one.failed).map((one) => one.id), ...(카드 ? [] : 나머지), ...오래된]);
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
      const kind = resultKindOf(one.workId, posters, cards, unread);
      if (kind === "deleted" || kind === "unknown") return { kind, state: kind };
      if (kind === "cardnews") return { kind, state: "done" };
      if (pictures.has(one.n)) return { kind, state: "done" };
      const at = Date.parse(줄(one.rowId)?.createdAt ?? "");
      return { kind, state: Number.isFinite(at) && now - at >= 실패로볼시간 ? "failed" : "making" };
    };
    const entries = describeEasyResults(rows, numbered, factOf);
    const 마지막 = [...entries].reverse().find((one) => one.kind !== "deleted");
    // 모르는 것은 이미지일 수 있다 — 「고칠 것이 없다」고 하지 않게 넣는다(리뷰 1차 수정 2).
    const 이미지일수있다 = (one: EasyResultEntry | undefined) => one?.kind === "image" || one?.kind === "unknown";
    return {
      entries, posters, pictures,
      madeImage: entries.some(이미지일수있다),
      lastIsImage: 이미지일수있다(마지막),
      unreadOld,
    };
  } catch (error) {
    console.warn("[easy] 이 대화의 결과물을 읽지 못했습니다", error instanceof Error ? error.message : error);
    return 모두모름(rows, unreadOld);
  }
}
