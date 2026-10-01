import { describe, expect, it } from "vitest";
import { parseLegal } from "../render";
import { LEGAL_DOCS, PRIVACY_DOC, TERMS_DOC } from "../documents";
import { BUSINESS } from "../business-info";
import { CS_EMAIL } from "../../../../lib/cs/contact";

/**
 * 법률 문서는 **원문 그대로** 걸려야 한다.
 *
 * 표가 목록으로 읽히거나 조 제목이 본문에 섞이면 「게시한 것」과 「원본」이
 * 달라진다. 그 차이가 분쟁의 빌미가 된다.
 */

describe("문서 자체", () => {
  it("둘 다 비어 있지 않다", () => {
    expect(LEGAL_DOCS).toHaveLength(2);
    for (const doc of LEGAL_DOCS) {
      expect(doc.title.length).toBeGreaterThan(2);
      expect(doc.body.length).toBeGreaterThan(1000);
    }
  });

  it("약관과 처리방침이 서로 다른 글이다", () => {
    expect(TERMS_DOC.body).not.toBe(PRIVACY_DOC.body);
  });
});

/**
 * 사업자·시행일·연락처는 **빈칸으로 게시하면 안 되는 칸**이다.
 *
 * 대괄호가 그대로 남은 채 올라가면 「누가 제공하는 서비스인지」와 「언제부터
 * 적용되는지」가 없는 문서가 된다. 그 상태로는 법이 요구하는 고지를 한 것으로
 * 볼 수 없다. 나머지 빈칸(위탁업체 법인명 등)은 아직 값이 없어 남아 있지만,
 * 이 넷은 채워져 있어야 한다.
 */
describe("채워야 하는 칸", () => {
  /**
   * **등록된 상호를 쓴다**(2026-09-28).
   *
   * 전에는 `fixup` 이 들어 있는지만 봤다. 그런데 법률 문서가 밝혀야 하는 것은
   * **사업자등록증의 상호**이고(전자상거래법 제10조), 그것은 「주식회사
   * 픽스업」이다. `fixup` 은 제품·저장소에서 쓰는 이름이지 등록된 상호가 아니다.
   *
   * 푸터의 사업자 정보와 **같은 값**을 쓰는지 본다. 두 곳이 갈라지면 어느
   * 쪽이 진짜인지 다투게 된다.
   */
  /**
   * 시행일은 **날짜가 채워져 있는지**만 본다. 특정 날짜를 박아 두었더니 문서를
   * 고쳐 판이 바뀔 때마다 이 시험이 틀렸다(2026-10-01). 판과 동의 기록이 같은지는
   * `lib/membership/__tests__/signup-consent.test.ts` 가 본다.
   */
  it("두 문서 모두 등록된 상호와 시행일이 들어 있다", () => {
    for (const doc of LEGAL_DOCS) {
      expect(doc.body, "푸터와 다른 상호를 쓰고 있다").toContain(BUSINESS.companyName);
      expect(doc.body).toMatch(/시행일: 20\d{2}년 \d{1,2}월 \d{1,2}일/);
    }
  });

  /** 문의 창구 주소를 쓴다(2026-09-29 통일). 문서마다 주소가 다르면 한쪽은 아무도 안 본다. */
  it("두 문서 모두 연락처 이메일이 들어 있다", () => {
    for (const doc of LEGAL_DOCS) {
      expect(doc.body).toContain(CS_EMAIL);
    }
  });

  it("처리방침에 개인정보 보호 담당자 이름이 있다", () => {
    expect(PRIVACY_DOC.body).toContain("정인수");
  });

  /** 채운 칸이 다시 대괄호로 돌아가지 않게 못을 박는다. */
  it("채운 칸의 빈칸 표시가 남아 있지 않다", () => {
    const filled = ["[사업자명]", "[YYYY년 MM월 DD일]", "[이메일]", "[고객지원 이메일]", "[개인정보 문의 이메일]", "[성명 또는 부서명]", "[담당자 또는 부서]", "[날짜]"];
    for (const doc of LEGAL_DOCS) {
      for (const blank of filled) {
        expect(doc.body).not.toContain(blank);
      }
    }
  });
});

describe("조각내기", () => {
  it("제목을 단계까지 알아본다", () => {
    const blocks = parseLegal("# 큰 제목\n\n## 제1조 목적\n\n본문입니다.");
    expect(blocks[0]).toEqual({ kind: "heading", level: 1, text: "큰 제목" });
    expect(blocks[1]).toEqual({ kind: "heading", level: 2, text: "제1조 목적" });
    expect(blocks[2]).toEqual({ kind: "paragraph", text: "본문입니다." });
  });

  it("빈 줄로 문단을 가른다", () => {
    const blocks = parseLegal("첫 문단.\n\n둘째 문단.");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
  });

  it("목록을 한 덩이로 모은다", () => {
    const blocks = parseLegal("- 하나\n- 둘\n- 셋");
    expect(blocks[0]).toEqual({ kind: "list", items: ["하나", "둘", "셋"] });
  });

  /** 표가 목록이나 문단으로 읽히면 보유기간·처리항목이 뒤섞인다. */
  it("표를 머리와 몸통으로 나눈다", () => {
    const blocks = parseLegal("| 구분 | 목적 |\n|---|---|\n| 회원 | 가입 |\n| 결제 | 정산 |");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      kind: "table",
      head: ["구분", "목적"],
      rows: [
        ["회원", "가입"],
        ["결제", "정산"],
      ],
    });
  });

  it("표 다음 글이 표에 딸려 들어가지 않는다", () => {
    const blocks = parseLegal("| 가 | 나 |\n|---|---|\n| 1 | 2 |\n\n표 아래 문장.");
    expect(blocks.map((b) => b.kind)).toEqual(["table", "paragraph"]);
  });
});

describe("진짜 문서로", () => {
  it("개인정보 처리방침에 표가 들어 있다", () => {
    const blocks = parseLegal(PRIVACY_DOC.body);
    expect(blocks.some((b) => b.kind === "table")).toBe(true);
  });

  it("약관의 조 제목이 제목으로 잡힌다", () => {
    const blocks = parseLegal(TERMS_DOC.body);
    const headings = blocks.filter((b) => b.kind === "heading").map((b) => (b as { text: string }).text);
    expect(headings.some((text) => text.includes("제1조"))).toBe(true);
  });

  /** 원문의 글자 수가 조각 안에 대부분 남아야 한다 — 잘려 나가면 안 된다. */
  it("원문이 통째로 빠지지 않는다", () => {
    for (const doc of LEGAL_DOCS) {
      const blocks = parseLegal(doc.body);
      const kept = blocks
        .map((b) =>
          b.kind === "table"
            ? [...b.head, ...b.rows.flat()].join("")
            : b.kind === "list"
              ? b.items.join("")
              : b.text,
        )
        .join("").length;

      // 마크다운 기호와 공백이 빠지므로 원문보다 짧다. 8할은 남아야 한다.
      expect(kept).toBeGreaterThan(doc.body.length * 0.8);
    }
  });
});
