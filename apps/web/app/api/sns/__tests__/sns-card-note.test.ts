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
 *
 * **여기서 못 잠그는 구간이 하나 있다 — 입력칸 → `notes` state.**
 * 이 저장소에는 DOM 시험 환경이 없어(`jsdom`·`happy-dom`·`@testing-library`
 * 모두 없고 `vitest.config.ts` 도 없다) `onChange` 가 망가져도 문자열 검사는
 * 통과한다. 그 구간은 **시험이 아니라 브라우저 실측이 지킨다** — 커밋
 * 메시지에 실측 결과를 남긴다.
 *
 * 문자열 검사가 뮤테이션에서 살아남으면 **인자를 통째로 못 박아** 죽인다.
 * 그 방법으로도 안 죽는 날이 오면 그때가 시험 환경을 논할 때다.
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
  /**
   * **인자까지 못 박는다.** 처음엔 `onRegenerate(card.index, ` 까지만 봤는데,
   * 그 검사는 `onRegenerate(card.index, undefined)` 에도 그대로 맞는다 —
   * 사람이 적은 말을 안 보내도 저장소 1,556개가 전부 초록이었다
   * (2026-09-09 독립 리뷰가 뮤테이션으로 증명).
   *
   * 다듬기 자체는 `result-rules.test.ts` 가 값으로 잠근다.
   */
  it("결과판이 적은 말을 다듬어 넘긴다", () => {
    expect(board).toContain("onRegenerate(card.index, trimCardNote(notes[card.index]))");
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

  /**
   * **상태 표시를 옛 하드코딩으로 되돌려도 통과했다**(리뷰 MEDIUM-2).
   * 크기(38vh)를 그대로 둔 채 문구만 되돌리면 어떤 검사에도 안 걸렸다.
   */
  it("상태 표시를 조각에 맡긴다", () => {
    expect(board).toContain("<CardPlaceholder status={card.status} />");
    expect(board, "화면에 문구를 박아 두면 상태를 못 가른다").not.toMatch(/>이미지가 없습니다\./);
  });

  /**
   * 누르자마자 닫으면 「다시 만드는 중…」이 한 프레임도 안 보인다(리뷰 MEDIUM-3).
   * 예전에는 바깥 버튼이 그 말을 했는데, 이번에 그 자리가 「다시 만들기」로
   * 고정되면서 표시가 통째로 사라졌다.
   */
  it("응답이 올 때까지 진행 표시를 남긴다", () => {
    expect(board).toContain("noteFor === card.index || regeneratingIndex === card.index");
  });

  /** 적은 말은 이번 한 번만 — 화면이 들고 있으면 다음에 몰래 또 나간다(리뷰 LOW-2). */
  it("보내고 나면 적은 말을 지운다", () => {
    expect(board).toContain("delete next[card.index]");
  });

  /**
   * **실패했으면 적은 말을 남긴다**(재검증 2번).
   *
   * 카드는 한 장씩 돌기 때문에 **생성 중에 결과판을 보는 것이 정상 흐름**이고,
   * 그때 이미 끝난 카드의 「다시 만들기」는 안 잠긴다. 누르면 서버가 409
   * 「다른 카드가 생성 중입니다」로 막는다. 그때까지 적은 말을 지우면 사람은
   * 빨간 띠만 보고 **다시 적어야 한다** — 아무것도 안 나갔는데.
   */
  it("실패하면 적은 말을 남긴다", () => {
    expect(board).toContain("if (!ok) return;");
    expect(client, "실패를 거짓으로 돌려줘야 화면이 가른다").toMatch(/catch[\s\S]{0,400}return false/);
  });

  /** 길이만 문제인 게 아니다(리뷰 LOW-1). */
  it("400 사유를 가른다", () => {
    expect(route).toMatch(/issue\.code === "too_big"/);
  });
});

/**
 * **낱장 다시 만들기도 칸 수만큼 예약해야 한다**(2026-09-09 독립 리뷰 HIGH-3).
 *
 * 전체 만들기(`generate`)는 `cards` 를 넘겨 그림 칸 수만큼 센다. 낱장
 * (`cards/[index]`)은 그것을 안 넘겨 **칸이 셋인 틀도 한 번으로 셌다.**
 * 예약액이 실제 지출의 1/N 이 되고, 넘친 지출은 확정 때 상한에 깎여
 * **장부에서 사라진다**(`202607230001_membership_usage.sql` 의
 * `least(greatest(p_consumed_units,0), requested_units)`).
 *
 * 이 커밋이 만든 문제는 아니지만, 같은 라우트를 고치는 김에 함께 막는다 —
 * 이 저장소가 어제 겪은 것이 정확히 「장부 밖으로 나간 돈」이다.
 */
describe("낱장 다시 만들기의 예약액", () => {
  it("두 라우트가 같은 재료를 넘긴다", () => {
    const generate = readFileSync(
      new URL("../projects/[id]/generate/route.ts", import.meta.url), "utf8",
    );
    const material = "cards: currentFlow.cards.map((card) => ({ index: card.index, layout: card.layout }))";
    expect(generate, "전체 만들기는 이미 넘긴다").toContain(material);
    expect(route, "낱장도 같은 재료를 넘겨야 한다").toContain(material);
  });

  /** 그 한 장만 잡는다는 원래 뜻은 그대로 지킨다. */
  it("여전히 그 한 장만 잡는다", () => {
    expect(route).toContain("onlyCardIndexes: [index]");
  });
});
