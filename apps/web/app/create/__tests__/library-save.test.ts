import { describe, expect, it } from "vitest";
import {
  LIBRARY_REQUEST_CHARS,
  libraryVersionKey,
  libraryWorkId,
  pendingLibraryUpload,
  requestBatches,
} from "../library-save";

/**
 * **상세페이지를 라이브러리에 한 작업으로 남긴다**(2026-09-23 사용자).
 *
 * 운영 로그(2026-09-23 01:23):
 *
 *   Request body exceeded 10MB for /api/library. Only the first 10MB will be available
 *   [library:save] SyntaxError: Unterminated string in JSON at position 10476937
 *
 * 묶음 예산이 **20MB(디코드한 바이트)** 였는데, 앞단(미들웨어)은 요청 본문을
 * **10MB** 에서 자른다. base64 는 1.33배라 두 장만 담아도 넘는다. 잘린 JSON
 * 을 못 읽어 500 이 났고, 저장이 하나도 안 됐다.
 *
 * 게다가 묶음마다 새 작업을 만들어 「제목 (1/3)」처럼 한 페이지가 여러 줄로
 * 흩어졌다. 같은 `sourceId` 로 보내면 서버가 한 작업에 이어 붙인다.
 */

const image = (chars: number) => ({ base64: "A".repeat(chars), mimeType: "image/png" });

describe("요청 하나의 크기", () => {
  it("**앞단이 자르는 10MB 보다 작다** — 잘린 JSON 은 못 읽는다", () => {
    expect(LIBRARY_REQUEST_CHARS).toBeLessThan(10 * 1024 * 1024);
  });

  it("합이 예산을 넘으면 나눈다", () => {
    const half = Math.floor(LIBRARY_REQUEST_CHARS / 2) + 1;
    const batches = requestBatches([image(half), image(half), image(10)]);
    expect(batches.map((batch) => batch.length)).toEqual([1, 2]);
  });

  it("큰 한 장도 버리지 않는다 — 혼자 보낸다", () => {
    const batches = requestBatches([image(LIBRARY_REQUEST_CHARS + 5), image(10)]);
    expect(batches.map((batch) => batch.length)).toEqual([1, 1]);
  });

  it("작은 것 여럿은 한 번에 보낸다", () => {
    expect(requestBatches([image(10), image(10), image(10)])).toHaveLength(1);
  });
});

describe("한 페이지는 한 작업이다", () => {
  const 섹션 = [
    { key: "a", image: "data:image/png;base64,AAAA", layers: [] },
    { key: "b", image: "data:image/png;base64,BBBB", layers: [] },
  ];

  it("같은 페이지·같은 그림이면 같은 열쇠다", () => {
    expect(libraryVersionKey(섹션)).toBe(libraryVersionKey(섹션.map((s) => ({ ...s }))));
  });

  it("그림 한 장이 바뀌면 다른 열쇠다", () => {
    const 바뀜 = [섹션[0], { ...섹션[1], image: "data:image/png;base64,CCCC" }];
    expect(libraryVersionKey(바뀜)).not.toBe(libraryVersionKey(섹션));
  });

  it("얹은 글자가 바뀌어도 다른 열쇠다 — 저장본에 구워지기 때문이다", () => {
    const 글자 = [{ ...섹션[0], layers: [{ id: "t", text: "할인" }] }, 섹션[1]];
    expect(libraryVersionKey(글자)).not.toBe(libraryVersionKey(섹션));
  });

  it("순서가 바뀌어도 다른 열쇠다 — 이어 붙이는 차례가 달라진다", () => {
    expect(libraryVersionKey([섹션[1], 섹션[0]])).not.toBe(libraryVersionKey(섹션));
  });

  /*
    **작업 열쇠는 UUID 여야 한다**(독립 리뷰 CRITICAL).

    `library_items.source_id` 칸이 `uuid` 다(202607300001 마이그레이션).
    「pdp:…」 같은 글자를 보내면 조회도 저장도 형식 오류로 실패해, 10MB 를
    고쳐 놓고도 한 장도 안 올라간다. 시험은 Supabase 를 흉내 내므로 못 잡는다.
  */
  it("**작업 열쇠는 UUID 모양이다** — 표의 칸이 uuid 다", () => {
    expect(libraryWorkId(섹션)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("**같은 그림이면 초안 id 와 상관없이 같은 열쇠다** — 다시 열어도 같은 작업을 찾는다", () => {
    expect(libraryWorkId(섹션)).toBe(libraryWorkId(섹션.map((s) => ({ ...s }))));
  });

  it("그림이 바뀌면 다른 작업이다", () => {
    const 바뀜 = [섹션[0], { ...섹션[1], image: "data:image/png;base64,CCCC" }];
    expect(libraryWorkId(바뀜)).not.toBe(libraryWorkId(섹션));
  });
});

describe("이미 보낸 것은 다시 안 보낸다", () => {
  it("처음이면 전부 보낸다", () => {
    expect(pendingLibraryUpload(null, "v1", 9)).toEqual({ from: 0, done: false });
  });

  it("**같은 판을 다 보냈으면 또 안 보낸다** — 한 작업에 같은 장이 두 번 붙는다", () => {
    expect(pendingLibraryUpload({ key: "v1", sent: 9 }, "v1", 9)).toEqual({ from: 9, done: true });
  });

  it("중간에 끊겼으면 **이어서** 보낸다", () => {
    expect(pendingLibraryUpload({ key: "v1", sent: 4 }, "v1", 9)).toEqual({ from: 4, done: false });
  });

  it("다른 판이면 처음부터 보낸다", () => {
    expect(pendingLibraryUpload({ key: "v1", sent: 9 }, "v2", 9)).toEqual({ from: 0, done: false });
  });
});
