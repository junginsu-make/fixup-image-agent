import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **낱장을 다시 만들 때 적는 말**(사용자 요청 2026-09-09).
 *
 * 「다시 만들기」는 마음에 안 들어서 누르는 버튼인데, 지금까지는 **무엇이
 * 마음에 안 드는지 말할 자리가 없어** 같은 프롬프트로 한 번 더 돌렸다.
 * 이미지 만들기의 「이 장만 고치기」는 그 자리를 이미 준다 — 같은 결로 맞춘다.
 *
 * 판단(다듬기·상한)은 `result-rules.test.ts` 가, 프롬프트에 실리는지는
 * `sns-queued-flow.test.ts` 가 값으로 잠근다. 여기서는 **이어 주는 줄**을 본다.
 */
const route = readFileSync(
  new URL("../projects/[id]/cards/[index]/route.ts", import.meta.url), "utf8",
);
const board = readFileSync(
  new URL("../../../sns/[id]/result-board.tsx", import.meta.url), "utf8",
);
const client = readFileSync(
  new URL("../../../sns/[id]/project-client.tsx", import.meta.url), "utf8",
);

describe("서버가 적은 말을 받는다", () => {
  it("본문에서 지시를 읽는다", () => {
    expect(route).toContain("CardNoteSchema");
    expect(route).toMatch(/note:\s*z\.string\(\)/);
  });

  /** 읽어 놓고 안 넘기면 아무 일도 안 일어난다 — 이 프로젝트에서 반복된 모양이다. */
  it("읽은 지시를 생성에 넘긴다", () => {
    expect(route).toMatch(/startQueuedFlow\([^)]*cardIndexes:\s*\[index\][^)]*note/s);
  });

  /** 상한을 서버에서도 건다. 화면만 믿으면 안 된다. */
  it("길이 상한을 서버가 건다", () => {
    expect(route).toContain("CARD_NOTE_MAX");
  });
});

describe("화면이 적을 자리를 준다", () => {
  it("결과판이 지시를 받아 넘긴다", () => {
    expect(board).toContain("onRegenerate(card.index, ");
    expect(board).toContain("Textarea");
  });

  it("작업 화면이 그 지시를 서버로 보낸다", () => {
    expect(client).toMatch(/regenerate\(index: number, note\?: string\)/);
    expect(client).toContain("JSON.stringify({ note })");
  });
});

/**
 * **돌고 있다는 것이 눈에 띄어야 한다**(사용자 요청 2026-09-09).
 *
 * 04 에서 「이 원고로 그림 만들기」를 누르면 버튼 글자만 바뀌었다. 이미지
 * 만들기는 같은 문제를 이미 `WorkingBanner` 로 풀었다 — 그 조각의 머리말이
 * 「작동 중인지 알기 어려웠다」고 적어 두었다. 같은 것을 쓴다.
 */
describe("돌고 있다는 표시", () => {
  it("카드뉴스도 같은 띠를 쓴다", () => {
    expect(client).toContain("WorkingBanner");
  });

  /** 기획과 그림 만들기 **둘 다** 오래 걸린다. 한쪽만 붙이면 나머지가 조용하다. */
  it("기획과 그림 만들기 모두에 붙는다", () => {
    expect(client).toMatch(/busy === "planning"/);
    expect(client).toMatch(/busy === "generating"/);
  });

  /** 새 조각을 만들지 않는다 — 두 도구가 다른 모양이면 그게 더 나쁘다. */
  it("포스터의 조각을 그대로 들여온다", () => {
    expect(client).toContain('from "../../poster/_components/working-banner"');
  });
});

/** 결과판이 카드를 한눈에 보여 주는가(사용자 요청 2026-09-09). */
describe("결과판 크기", () => {
  it("한 줄에 여러 장을 놓는다", () => {
    expect(board).toContain("sm:grid-cols-2");
    expect(board).toMatch(/xl:grid-cols-3|2xl:grid-cols-4/);
  });

  it("카드 높이를 줄인다", () => {
    expect(board).toContain("max-h-[38vh]");
    expect(board, "예전 크기가 남아 있으면 안 된다").not.toContain("max-h-[60vh]");
  });

  /** 장부 각주는 우리 회계 사정이지 사용자가 할 일이 아니다. */
  it("장부 각주를 사용자에게 안 보인다", () => {
    expect(board).not.toContain("request_id는 장부에 남습니다");
  });
});
