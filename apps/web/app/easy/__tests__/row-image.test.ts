import { describe, expect, it } from "vitest";
import {
  editAddedOf, editRequestOf, editRowBody, editTargetImage, editedRequestIds, pickCollectedImage, pickRowImage,
} from "../row-image";

/**
 * **그림 줄마다 제 그림** (2026-10-06 「쉽게」 이미지 고치기).
 *
 * 고치기는 같은 포스터 작업 안에 그림을 하나 더 만든다. 대화 줄은 작업 번호만
 * 들고 있으므로, 고친 줄에는 「어느 요청의 결과인가」를 글 칸에 적어 둔다.
 * 처음 만든 줄은 지금처럼 비어 있다 — **고친 줄이 없는 대화는 예전과 똑같이** 고른다.
 */

const 그림 = (id: string, request: string, selected = false) => ({ id, generationRequestId: request, selected });

describe("고친 줄 표시", () => {
  it("요청 번호를 적고 다시 읽는다", () => {
    expect(editRequestOf(editRowBody("req-9"))).toBe("req-9");
  });

  it("처음 만든 줄(빈 글)은 고친 줄이 아니다", () => {
    expect(editRequestOf("")).toBeUndefined();
    expect(editRequestOf("아무 글")).toBeUndefined();
  });

  it("작업 하나의 고친 요청 번호만 모은다", () => {
    const rows = [
      { role: "image", workId: "p1", body: "" },
      { role: "image", workId: "p1", body: editRowBody("r2") },
      { role: "image", workId: "p2", body: editRowBody("r9") },
      { role: "user", workId: null, body: editRowBody("r8") },
    ];
    expect([...editedRequestIds(rows, "p1")]).toEqual(["r2"]);
  });
});

describe("줄에 보일 그림", () => {
  it("고친 줄이 없으면 예전 규칙 그대로 — 골라 둔 것, 없으면 첫 장", () => {
    const images = [그림("a", "r1"), 그림("b", "r1", true)];
    expect(pickRowImage({ body: "" }, images, new Set())?.id).toBe("b");
    expect(pickRowImage({ body: "" }, [그림("a", "r1"), 그림("c", "r1")], new Set())?.id).toBe("a");
  });

  it("고친 줄은 그 요청이 만든 그림을 보인다", () => {
    const images = [그림("a", "r1", true), 그림("b", "r2")];
    expect(pickRowImage({ body: editRowBody("r2") }, images, new Set(["r2"]))?.id).toBe("b");
  });

  it("처음 만든 줄은 고친 그림을 보이지 않는다 — 고친 것이 골라져 있어도", () => {
    const images = [그림("a", "r1"), 그림("b", "r2", true)];
    expect(pickRowImage({ body: "" }, images, new Set(["r2"]))?.id).toBe("a");
  });

  it("고친 그림이 아직 안 왔으면 비운다 — 다른 그림을 대신 보이지 않는다", () => {
    const images = [그림("a", "r1")];
    expect(pickRowImage({ body: editRowBody("r2") }, images, new Set(["r2"]))).toBeUndefined();
  });

  it("처음 그림이 없고 고친 그림만 있으면 처음 줄은 비운다", () => {
    expect(pickRowImage({ body: "" }, [그림("b", "r2")], new Set(["r2"]))).toBeUndefined();
  });
});

/* ── 독립 리뷰 반영(2026-10-06) ── */
describe("고친 줄에 넣은 사진도 적는다 — 다음 고치기에 또 넣지 않으려고", () => {
  it("요청 번호와 넣은 사진을 함께 적고 읽는다", () => {
    const body = editRowBody("r2", ["logo-1", "logo-2"]);
    expect(editRequestOf(body)).toBe("r2");
    expect(editAddedOf(body)).toEqual(["logo-1", "logo-2"]);
  });

  it("넣은 사진이 없으면 예전 모양 그대로", () => {
    expect(editRowBody("r2")).toBe("edit-request:r2");
    expect(editAddedOf(editRowBody("r2"))).toEqual([]);
    expect(editAddedOf("")).toEqual([]);
  });
});

describe("결과 받기 — 이번 요청이 만든 그림을 고른다", () => {
  const 목록 = [그림("a", "r1"), 그림("b", "r2")];

  it("고친 결과는 원본(첫 장)이 아니라 그 요청의 그림", () => {
    expect(pickCollectedImage(목록, "r2")?.id).toBe("b");
  });

  it("처음 만들기는 지금과 같다 — 그림이 한 장이면 그것", () => {
    expect(pickCollectedImage([그림("a", "r1")], "r1")?.id).toBe("a");
    // 요청 번호를 안 싣는 옛 응답이면 지금처럼 첫 장.
    expect(pickCollectedImage<{ id: string; generationRequestId?: string }>([{ id: "a" }], "r1")?.id).toBe("a");
    expect(pickCollectedImage(undefined, "r1")).toBeUndefined();
  });

  /*
   * **고치기가 0장으로 끝나면 비운다**(2026-10-06 재리뷰). 첫 장으로 떨어지면 원본이
   * 고친 자리에 떠서 「값은 나갔는데 안 바뀌었다」가 다시 생긴다.
   */
  it("이번 요청의 그림이 없으면 다른 요청의 그림(원본)을 대신 보이지 않는다", () => {
    expect(pickCollectedImage([그림("a", "r1")], "r2")).toBeUndefined();
  });
});

describe("고칠 그림 — 실패한 고치기에 막히지 않는다", () => {
  const 지금 = Date.parse("2026-10-06T06:00:00Z");
  const 줄 = (body: string, createdAt: string) => ({ role: "image", workId: "p1", body, createdAt });
  const images = [그림("a", "r1")];

  it("마지막 줄의 그림이 있으면 그것", () => {
    const rows = [줄("", "2026-10-06T05:00:00Z")];
    expect(editTargetImage(rows, "p1", images, 지금)).toEqual({ image: images[0] });
  });

  it("마지막 고친 줄이 아직 만드는 중(10분 안)이면 기다리라고 한다", () => {
    const rows = [줄("", "2026-10-06T05:00:00Z"), 줄(editRowBody("r2"), "2026-10-06T05:55:00Z")];
    expect(editTargetImage(rows, "p1", images, 지금)).toEqual({ pending: true });
  });

  it("마지막 고친 줄이 10분이 지나도 그림이 없으면(실패) 그 앞의 그림을 고친다", () => {
    const rows = [줄("", "2026-10-06T05:00:00Z"), 줄(editRowBody("r2"), "2026-10-06T05:40:00Z")];
    expect(editTargetImage(rows, "p1", images, 지금)).toEqual({ image: images[0] });
  });

  it("고칠 그림이 하나도 없으면 없다고 한다", () => {
    const rows = [줄("", "2026-10-06T05:00:00Z")];
    expect(editTargetImage(rows, "p1", [], 지금)).toEqual({ none: true });
  });
});

describe("화면이 결과를 받을 때", () => {
  /*
   * **고친 결과 자리에 원본이 뜨던 것**(2026-10-06 독립 리뷰). `status` 는 작업의 그림을
   * 전부 주고 화면은 첫 장을 골랐다. 고르는 판단은 위 `pickCollectedImage` 가 재고,
   * 여기서는 화면이 그것을 **이번 요청 번호로** 부르는지만 본다.
   */
  it("이번 요청 번호로 결과 그림을 고른다", async () => {
    const { readFileSync } = await import("node:fs");
    const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
    expect(화면).toMatch(/pickCollectedImage(<[^>]*>)?\(poll\.images, submission\.requestRowId\)/);
    expect(화면).not.toContain("poll.images?.[0]");
  });
});
