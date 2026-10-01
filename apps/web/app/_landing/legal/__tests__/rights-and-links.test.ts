import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, PRIVACY_DOC, TERMS_DOC } from "../documents";
import { CS_EMAIL } from "../../../../lib/cs/contact";

/**
 * **남의 그림을 쓰는 일에 대한 약속**(2026-10-01, 출시 전 권리 점검).
 *
 * ── 왜 이 시험이 필요한가 ──────────────────────────────────
 *
 * 회원은 참고 그림을 직접 올리고, 상단의 「레퍼런스 찾기」는 외부 이미지
 * 사이트를 새 탭으로 연다. 그런데 약관에는
 *
 * - 외부 사이트로 보내는 링크가 무엇을 뜻하는지(권한을 주는 것도, 제휴도 아님)
 * - 권리자가 **회원이 아니어도** 신고할 곳과 회사가 할 수 있는 조치
 *
 * 가 없었다. 앱 안의 문의는 로그인한 회원만, 그것도 도우미가 답을 못 했을
 * 때만 열린다 — 권리자에게는 길이 없었다.
 *
 * ── 지키는 선 ──────────────────────────────────────────────
 *
 * **사이트 이름을 약관에 넣지 않는다.** 링크가 다른 사이트로 바뀌어도 약관을
 * 다시 쓰지 않게. **「모든 책임은 회원에게」 같은 포괄 면책을 만들지 않는다.**
 * 약관규제법상 무효가 될 수 있고, 제9조의 「책임을 면제하는 의미가 아니다」와
 * 부딪힌다.
 */

const 약관 = TERMS_DOC.body;
const 방침 = PRIVACY_DOC.body;

/** `## 제N조` 부터 다음 `## ` 앞까지. */
function 조(번호: number): string {
  const 시작 = 약관.indexOf(`## 제${번호}조 `);
  expect(시작, `제${번호}조를 못 찾았다`).toBeGreaterThanOrEqual(0);
  const 끝 = 약관.indexOf("\n## ", 시작 + 1);
  return 약관.slice(시작, 끝 === -1 ? undefined : 끝);
}

/** 표에서 업체 이름으로 시작하는 줄들. 위탁 표와 국외 이전 표에 하나씩 있다. */
function 줄들(업체: string): string[] {
  return 방침.split("\n").filter((줄) => 줄.startsWith(`| ${업체}`));
}

describe("올리는 자료의 권리(제8조)", () => {
  it("올려서 AI 생성에 쓰는 자료는 그 목적으로 쓸 권리나 허락을 갖춰야 한다", () => {
    const 본문 = 조(8);
    expect(본문).toMatch(/AI 생성에 사용/);
    expect(본문).toMatch(/권리나 허락/);
  });

  it.each(["저작권", "초상권", "퍼블리시티권", "상표권", "디자인권", "개인정보"])(
    "침해하면 안 되는 권리에 %s 가 들어 있다",
    (권리) => {
      expect(조(8)).toContain(권리);
    },
  );

  it("남의 저작물을 그대로 베끼려고 쓰면 안 된다고 적는다", () => {
    expect(조(8)).toMatch(/그대로 복제할 목적/);
  });
});

describe("외부 사이트 링크(제8조)", () => {
  it("링크는 권한을 주거나 보증하는 것도, 제휴도 아니라고 적는다", () => {
    const 본문 = 조(8);
    expect(본문).toMatch(/외부 웹사이트로 연결되는 링크/);
    expect(본문).toMatch(/해당 사이트와 권리자의 조건/);
    expect(본문).toMatch(/이용 권한을 부여하거나 보증하지 않/);
    expect(본문).toMatch(/제휴·보증·후원을 뜻하지 않/);
  });

  /** 링크가 가리키는 사이트는 코드 한 곳(`reference-hunt-button.tsx`)에서만 바뀐다. */
  it.each(LEGAL_DOCS.map((doc) => [doc.title, doc.body] as const))(
    "%s 에 특정 이미지 사이트 이름이 없다",
    (_제목, 본문) => {
      expect(본문).not.toMatch(/pinterest|핀터레스트|unsplash|pixabay|behance|dribbble|freepik|구글 이미지/i);
    },
  );
});

describe("AI 결과물(제9조)", () => {
  it("공개하거나 상업적으로 쓸 때 권리 확인이 필요할 수 있다고 적는다", () => {
    expect(조(9)).toMatch(/공개하거나 상업적으로 이용/);
  });

  it("회사 책임을 면제하는 뜻이 아니라는 문장을 지킨다", () => {
    expect(조(9)).toContain("책임을 면제하는 의미가 아닙니다");
  });

  it("포괄 면책 문구가 없다", () => {
    expect(약관).not.toMatch(/어떠한 경우에도|일체의 책임|모든 책임은/);
  });
});

describe("권리침해 신고(제10조)", () => {
  it("조 제목에서 신고 창구를 찾을 수 있다", () => {
    expect(약관).toMatch(/^## 제10조 이용 제한과 권리침해 신고$/m);
  });

  it("신고 주소가 문의 창구 주소이고, 회원이 아니어도 신고할 수 있다", () => {
    const 본문 = 조(10);
    expect(본문).toContain(CS_EMAIL);
    expect(본문).toContain("회원이 아니어도");
  });

  it.each(["연락받을 이메일", "콘텐츠를 알아볼 수 있는 정보", "권리와 그 근거"])(
    "신고에 적을 것으로 「%s」 를 안내한다",
    (항목) => {
      expect(조(10)).toContain(항목);
    },
  );

  it("회사가 할 수 있는 조치와 반복 침해 제한을 적는다", () => {
    const 본문 = 조(10);
    expect(본문).toMatch(/삭제/);
    expect(본문).toMatch(/공개 중단/);
    expect(본문).toMatch(/반복적이거나 중대한 침해/);
  });

  /** 조치를 받은 회원에게도 이의신청 길이 있어야 한다. 신고 문단 **뒤에** 와야 조치에도 걸린다. */
  it("이의신청 안내가 신고·조치 문단 뒤에 남아 있다", () => {
    const 본문 = 조(10);
    const 신고 = 본문.indexOf(CS_EMAIL);
    const 이의신청 = 본문.indexOf("이의신청 방법을 안내합니다");
    expect(이의신청).toBeGreaterThan(신고);
  });
});

describe("처리방침의 fal 줄이 실제 쓰임과 같다", () => {
  /**
   * fal 은 그림을 만들 뿐 아니라 **광고 배경 제거**(`lib/ad/background.ts`)도 하고,
   * 올린 파일을 **잠시 맡아 두었다가** 모델에 넘긴다(`lib/fal/upload.ts`).
   */
  it("위탁 표와 국외 이전 표 모두 편집·배경 제거·일시 보관을 적는다", () => {
    const fal = 줄들("fal.ai");
    expect(fal, "fal 줄이 위탁 표와 국외 이전 표에 하나씩 있어야 한다").toHaveLength(2);
    for (const 줄 of fal) {
      expect(줄).toMatch(/편집/);
      expect(줄).toMatch(/배경 제거/);
      expect(줄).toMatch(/일시 보관/);
    }
  });
});

describe("홍보 문구가 베끼기를 권하지 않는다", () => {
  const web = join(__dirname, "..", "..", "..", "..");
  const 문구파일 = ["app/_landing/landing-content.ts", "app/_landing/about-content.ts"];

  it.each(문구파일)("%s 에 「내용만 바꿔 끼운다」 류의 말이 없다", (파일) => {
    const 내용 = readFileSync(join(web, 파일), "utf8");
    expect(내용).not.toMatch(/내용만 교체|swap content only|그대로 복제|똑같이 만들|저작권 걱정/i);
  });
});
