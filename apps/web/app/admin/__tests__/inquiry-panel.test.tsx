import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

/**
 * **문의함**(설계 §10.3).
 *
 * ── 무엇을 재는가 ──────────────────────────────────────────
 *
 * 넷이다.
 *   ① **대화가 보이는가** — 이것이 답의 절반이다(§10.1)
 *   ② **근거를 못 찾았다는 것이 보이는가** — 지식 구멍의 표시
 *   ③ **회원 관리로 이어지는가**(§10.3)
 *   ④ **메일이 안 간 것이 보이는가**(§10.2)
 *
 * 그리고 **답장 칸이 없는가** — 설계가 「답장은 1차에 안 만든다」고 못 박았다.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));
vi.mock("../system/inquiry-actions", () => ({ setInquiryStatus: vi.fn() }));

const { InquiryPanel } = await import("../system/inquiry-panel");
type InquiryRow = Parameters<typeof InquiryPanel>[0]["rows"][number];

const 한줄: InquiryRow = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "me-1",
  email: "me@example.com",
  createdAt: "2026-09-28T01:00:00Z",
  question: "결제가 안 돼요",
  turns: [
    { role: "user", text: "결제가 안 됩니다" },
    { role: "bot", text: "이건 담당자가 봐야 할 것 같습니다" },
  ],
  sources: [{ name: "이용 안내 · 크레딧과 모델", href: "/guide/credits" }],
  page: "/settings",
  status: "new",
  mailedAt: "2026-09-28T01:00:01Z",
};

/** 그려진 글 전부. 화면이 없으니 나무를 글로 편다. */
function 글(rows: InquiryRow[]): string {
  const tree = create(React.createElement(InquiryPanel, { rows })).toJSON();
  const 편다 = (node: unknown): string => {
    if (node === null || node === undefined) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(편다).join(" ");
    const el = node as { children?: unknown };
    return 편다(el.children);
  };
  return 편다(tree);
}

/** 붙은 주소 전부. */
function 주소들(rows: InquiryRow[]): string[] {
  const tree = create(React.createElement(InquiryPanel, { rows })).toJSON();
  const out: string[] = [];
  const 훑는다 = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(훑는다); return; }
    const el = node as { props?: { href?: string }; children?: unknown };
    if (typeof el.props?.href === "string") out.push(el.props.href);
    훑는다(el.children);
  };
  훑는다(tree);
  return out;
}

describe("문의함", () => {
  it("**물음과 대화를 함께 보여 준다**", () => {
    const 보인것 = 글([한줄]);

    expect(보인것).toContain("결제가 안 돼요");
    expect(보인것, "대화가 안 보인다").toContain("결제가 안 됩니다");
    expect(보인것).toContain("이건 담당자가 봐야 할 것 같습니다");
  });

  /**
   * **지식 구멍이 여기서 드러난다**(§10.1). 근거를 못 찾아 온 문의라면 답할
   * 일이 아니라 설명서에 글을 쓸 일이다.
   */
  it("**근거를 못 찾았으면 그렇게 적는다**", () => {
    expect(글([{ ...한줄, sources: [] }])).toContain("찾지 못했습니다");
  });

  it("**찾았으면 그 문서를 보여 준다**", () => {
    expect(주소들([한줄])).toContain("/guide/credits");
    expect(글([한줄])).not.toContain("찾지 못했습니다");
  });

  /** **회원 관리로 잇는다**(§10.3). 이메일로 찾는 자리가 이미 있다. */
  it("**그 회원을 바로 열 수 있다**", () => {
    expect(주소들([한줄])).toContain("/admin?q=me%40example.com");
  });

  /** **메일이 안 갔으면 알려 준다**(§10.2). 담당자가 모르고 있을 수 있다. */
  it("**메일을 못 보낸 것이 보인다**", () => {
    expect(글([{ ...한줄, mailedAt: null }])).toContain("메일 못 보냄");
    expect(글([한줄])).not.toContain("메일 못 보냄");
  });

  /**
   * **지금 상태에서 갈 수 있는 곳만 보여 준다.** 「끝」인 문의에 「끝으로」가
   * 또 있으면 눌러도 아무 일이 안 일어난다.
   */
  it("**안 본 문의에는 되돌릴 단추가 없다**", () => {
    const 보인것 = 글([한줄]);

    expect(보인것).toContain("보는 중으로");
    expect(보인것).toContain("끝으로");
    expect(보인것, "안 봄인데 안 봄으로 되돌리라고 한다").not.toContain("다시 안 봄으로");
  });

  it("**끝난 문의는 다시 열 수 있다**", () => {
    const 보인것 = 글([{ ...한줄, status: "done" }]);

    expect(보인것).toContain("다시 안 봄으로");
    expect(보인것).toContain("보는 중으로");
    expect(보인것, "이미 끝인데 끝으로 가라고 한다").not.toContain("끝으로");
  });

  it("**안 본 것의 수를 센다**", () => {
    const 보인것 = 글([한줄, { ...한줄, id: "x", status: "done" as const }]);

    expect(보인것).toContain("안 본 문의 1건");
  });

  it("**비어 있으면 그렇게 말한다**", () => {
    expect(글([])).toContain("아직 들어온 문의가 없습니다");
  });

  /**
   * **답장 칸을 만들지 않는다.** 설계 §10.3 — 「답장은 1차에 안 만든다.
   * 메일로 답한다」. 있는 것처럼 보이면 담당자가 거기 적고 아무에게도 안 간다.
   */
  it("**답장 칸이 없다**", () => {
    const tree = JSON.stringify(create(React.createElement(InquiryPanel, { rows: [한줄] })).toJSON());

    expect(tree, "답장 칸이 생겼다").not.toContain("textarea");
    expect(글([한줄])).not.toContain("답장 보내기");
  });

  /**
   * **시간대를 못 박는다**(2026-09-28 독립 검토). 서버 컴포넌트라 EC2 의
   * 시간대로 찍히고 그것은 UTC 다. 이 저장소는 시각을 적는 일곱 자리 모두
   * `Asia/Seoul` 을 적고 있었는데 이 한 줄만 빠져 있었다.
   */
  it("**시각을 서울 시간으로 적는다**", () => {
    /*
      **시각만 본다.** 「오전」을 찾으면 안 된다 — CI 의 ICU 자료는 같은
      `ko-KR` 에 「AM」 을 내고, 그러면 변환이 맞는데도 붉어진다(실제로
      한 번 겪었다). 2026-09-28T01:00:00Z 는 서울에서 10시다.
    */
    const 보인것 = 글([한줄]);
    expect(보인것, "UTC 로 찍혀 9시간 이르게 보인다").toContain("10:00:00");
    expect(보인것, "UTC 시각이 그대로 찍혔다").not.toContain("1:00:00");

    /*
      **글로도 확인한다.** 위 단언은 이 기계가 서울 시간이면 시간대를 안
      박아도 통과한다 — 운영 서버(UTC)에서만 드러나는 것을 여기서 잡으려면
      적혀 있는지를 본다(`member-list-safety.test.ts` 와 같은 방식).
    */
    expect(readFileSync(new URL("../system/inquiry-panel.tsx", import.meta.url), "utf8"))
      .toContain('timeZone: "Asia/Seoul"');
  });

  /** **메일의 링크가 닿는 자리**(설계 §10.2). 없으면 화면 맨 위로 떨어진다. */
  it("**문의마다 번호 붙은 자리가 있다**", () => {
    const tree = JSON.stringify(create(React.createElement(InquiryPanel, { rows: [한줄] })).toJSON());

    expect(tree, "메일 링크가 닿을 자리가 없다").toContain(`cs-${한줄.id}`);
  });

  /** 대화가 지워진 문의도 있다. 한 시간이 지나면 사라진다. */
  it("**남은 대화가 없어도 줄은 그려진다**", () => {
    expect(글([{ ...한줄, turns: [] }])).toContain("남은 대화가 없습니다");
  });

  /**
   * **모르는 것과 못 찾은 것을 가른다.** 대화가 지워진 뒤 남긴 문의를
   * 「설명서에 없다」로 적으면 없는 구멍을 좇게 된다.
   */
  it("**대화가 없으면 근거를 알 수 없다고 한다**", () => {
    const 보인것 = 글([{ ...한줄, turns: [], sources: [] }]);

    expect(보인것).toContain("대화가 남아 있지 않아 알 수 없습니다");
    expect(보인것, "구멍이 아닌데 구멍이라고 적었다").not.toContain("찾지 못했습니다");
  });

  /**
   * **주소가 없으면 링크로 만들지 않는다.** 걸러진 주소(`safeGuideHref`)가
   * 빈 글자로 오는데, 그것을 `/guide` 로 슬쩍 바꾸면 엉뚱한 곳으로 보낸다.
   */
  it("**주소 없는 근거는 링크가 아니다**", () => {
    const rows = [{ ...한줄, sources: [{ name: "어떤 문서", href: "" }] }];

    expect(글(rows), "이름은 보여야 한다").toContain("어떤 문서");
    // 빈 주소로 링크를 만들면 누를 수는 있는데 아무 데도 안 간다.
    expect(주소들(rows), "빈 주소가 링크가 됐다").not.toContain("");
    expect(주소들(rows), "엉뚱한 곳으로 보냈다").not.toContain("/guide");
  });
});
