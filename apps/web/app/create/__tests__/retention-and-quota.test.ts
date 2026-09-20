import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_RETENTION_DAYS, DRAFT_RETENTION_NOTICE } from "../draft-retention";
import { draftSaveFailureMessage } from "../draft-save-failure";
import {
  deletePdpDocument,
  listPdpDocuments,
  purgeExpiredPdpDocuments,
  savePdpDocument,
} from "../document-store";
import { createPdpDocument } from "../document-state";
import type { PdpDraftInput } from "../pdp-drafts";

/**
 * **30일 약속이 새 저장소에서는 지켜지지 않았다**(E-6-3-b).
 *
 * 화면은 「저장한 지 30일이 지난 작업은 자동으로 삭제됩니다」라고 말한다
 * (`PdpMakerClient` 가 실제로 건다). 그런데 청소를 부르는 줄이 이랬다.
 *
 * ```ts
 * if (!documentV3Enabled) await purgeExpiredPdpDrafts(...)
 * ```
 *
 * **새 저장소(v3)를 켜면 청소가 아예 안 돈다.** 그리고 `document-store.ts` 에는
 * 청소 함수가 **없었다.** 약속은 화면에 그대로 떠 있는데 지키는 코드가 없다.
 *
 * 설계 §14.5(E-6-3-b): 「현재 고지 상수는 존재. 실제 **화면 표시·활성 작업·
 * 이관 순서 검증**」. 이관하면서 청소만 뒤에 남은 것이다.
 */

const 기준 = new Date("2026-09-21T00:00:00.000Z");
const 지난날 = new Date(기준.getTime() - (DRAFT_RETENTION_DAYS + 1) * 86_400_000).toISOString();
const 최근 = new Date(기준.getTime() - 1 * 86_400_000).toISOString();

const 문서 = async (id: string, updatedAt: string) => {
  const doc = createPdpDocument({
    id, appState: "upload", preparedImage: null, modelImage: null, modelImageUsage: null,
    result: null, additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "",
    editorState: null, imageModel: "nano-banana", characterId: undefined, characterAngles: [],
    preserveProduct: false, look: "photoreal", styleReference: undefined, styleReferenceEnabled: false,
  } as unknown as PdpDraftInput);
  /*
    `savePdpDocument` 는 저장할 때마다 `updatedAt` 을 **지금**으로 찍는다.
    그러니 옛 기록을 만들려면 시계를 되돌려 저장하는 수밖에 없다.
  */
  vi.setSystemTime(new Date(updatedAt));
  try {
    await savePdpDocument(doc);
  } finally {
    vi.useRealTimers();
  }
};

afterEach(async () => {
  for (const summary of await listPdpDocuments()) await deletePdpDocument(summary.id);
});

describe("새 저장소도 30일 뒤에 치운다", () => {
  it("**기간이 지난 문서를 지운다**", async () => {
    await 문서("old", 지난날);
    await 문서("new", 최근);

    const 지운수 = await purgeExpiredPdpDocuments(기준);

    expect(지운수).toBe(1);
    expect((await listPdpDocuments()).map((s) => s.id)).toEqual(["new"]);
  });

  /**
   * **지금 붙잡고 있는 작업은 안 지운다.** 30일 넘게 다듬는 작업이 화면을 연
   * 순간 사라지면, 사용자는 무슨 일이 일어났는지도 모른다.
   */
  it("**열어 둔 작업은 지나도 남긴다**", async () => {
    await 문서("open", 지난날);

    const 지운수 = await purgeExpiredPdpDocuments(기준, ["open"]);

    expect(지운수).toBe(0);
    expect((await listPdpDocuments()).map((s) => s.id)).toEqual(["open"]);
  });

  it("치울 것이 없으면 0이다", async () => {
    await 문서("new", 최근);

    expect(await purgeExpiredPdpDocuments(기준)).toBe(0);
  });

  /**
   * **청소는 곁다리다.** 이것 때문에 목록이 안 뜨면 본말이 뒤집힌다 —
   * 옛 저장소의 판단과 같은 결이다.
   */
  it("**실패해도 조용히 넘어간다**", async () => {
    await expect(purgeExpiredPdpDocuments(new Date("잘못된 날짜"))).resolves.toBe(0);
  });
});

describe("화면이 건 약속을 코드가 지킨다", () => {
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");

  it("고지가 화면에 걸려 있다", () => {
    expect(client).toContain("DRAFT_RETENTION_NOTICE");
    expect(DRAFT_RETENTION_NOTICE).toContain(String(DRAFT_RETENTION_DAYS));
  });

  /**
   * **저장소를 갈아도 약속은 그대로다.** 전에는 `if (!documentV3Enabled)` 가
   * 붙어 있어서, 새 저장소를 켜는 순간 약속이 거짓이 됐다.
   */
  it("**새 저장소를 켜도 청소를 부른다**", () => {
    const 부르는줄 = client.slice(client.indexOf("purgeExpiredPdpDrafts("));

    expect(client).toContain("purgeExpiredPdpDocuments");
    expect(부르는줄.slice(0, 200)).not.toContain("!documentV3Enabled");
  });
});

/**
 * **용량이 차면 무슨 말을 할 것인가**(E-6-3-a).
 *
 * 대표 최대 초안을 재 봤다 — 섹션 10장에 원본·인물·레퍼런스까지 담으면
 * **하나가 63.4MB** 다(2026-09-21 실측). 스무 개면 1.27GB 라, 브라우저 저장
 * 한도에 닿는 것이 드문 일이 아니다.
 *
 * 그런데 그때 화면이 하는 말은 「작업을 저장하지 못했습니다」 한 줄이었다.
 * **무엇을 하면 되는지가 없다.** 게다가 30초마다 자동 저장이 같은 실패를
 * 되풀이한다.
 *
 * 저장 자체는 `store.put` 한 번이라 실패해도 **앞서 저장한 사본은 살아남는다**
 * (IndexedDB 트랜잭션이 통째로 취소된다). 잃는 것은 이번 변경분뿐이다.
 */
describe("저장이 실패했을 때", () => {
  const 용량초과 = () => {
    const error = new Error("The quota has been exceeded.");
    error.name = "QuotaExceededError";
    return error;
  };

  it("**용량이 찼으면 무엇을 하면 되는지 말한다**", () => {
    const 말 = draftSaveFailureMessage(용량초과());

    expect(말).toContain("저장 공간");
    // 무엇을 하면 되는지. 「실패했습니다」만으로는 사용자가 할 수 있는 것이 없다.
    expect(말).toContain("오래된 작업");
  });

  it("**앞서 저장한 것은 그대로라고 알린다** — 다 날아간 줄 알면 다시 안 온다", () => {
    expect(draftSaveFailureMessage(용량초과())).toContain("마지막으로 저장한");
  });

  it("다른 실패는 전과 같이 말한다", () => {
    expect(draftSaveFailureMessage(new Error("네트워크"))).toContain("저장하지 못했습니다");
  });

  it("**무엇인지 모르는 것도 말은 한다**", () => {
    expect(draftSaveFailureMessage(null)).toBeTruthy();
  });
});

describe("화면이 그 문구를 실제로 쓴다", () => {
  it("**저장 실패 자리가 코어 판정을 부른다** — 화면이 따로 적으면 말이 갈린다", () => {
    const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");
    const 실패자리 = client.slice(client.indexOf('setSaveState("error")'));

    expect(실패자리.slice(0, 300)).toContain("draftSaveFailureMessage(error)");
  });
});
