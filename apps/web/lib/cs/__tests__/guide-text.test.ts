import { describe, expect, it } from "vitest";
import { guideDocumentFrom, htmlToText, sliceGuideBody } from "../guide-text";

/**
 * **그려진 설명서를 글로 뽑는다**(2026-09-23, 설계 §3).
 *
 * ── 왜 소스를 안 긁나 ──────────────────────────────────────
 *
 * 설명서의 숫자가 본문에 없다. `guide/credits/page.tsx` 는 손으로 적은
 * 숫자가 틀려 있던 사고 뒤로 **쓰는 그 함수로 그 자리에서 셈한다.** 소스를
 * 긁으면 봇은 「5장」이 아니라 `creditUnits(...)` 를 읽는다.
 */

const 껍데기 = (본문: string) => `
<html><head><title>x</title><style>.a{color:red}</style></head>
<body>
  <nav>사이드바 · 이미지 · 상세페이지 · 리디자인</nav>
  <div class="grid"><div data-guide-body class="x">${본문}</div></div>
  <footer>꼬리말 · 이용약관</footer>
  <script>console.log("스크립트")</script>
</body></html>`;

describe("본문만 잘라 낸다", () => {
  it("**표식이 달린 칸 안쪽을 가져온다**", () => {
    expect(sliceGuideBody(껍데기("<p>본문입니다</p>"))).toContain("본문입니다");
  });

  /**
   * **껍데기가 섞이면 모든 조각이 비슷해진다.** 어느 조각을 꺼내도 메뉴
   * 목록이 붙어 있으면 검색이 갈라내지 못한다.
   */
  it("**사이드바와 꼬리말을 안 가져온다**", () => {
    const 잘라낸것 = sliceGuideBody(껍데기("<p>본문입니다</p>"));

    expect(잘라낸것).not.toContain("사이드바");
    expect(잘라낸것).not.toContain("꼬리말");
  });

  /**
   * **같은 이름의 태그가 겹쳐 있다.** 깊이를 안 세면 첫 번째 닫는 태그에서
   * 끊겨 본문 앞부분만 가져온다.
   */
  it("**안에 같은 태그가 겹쳐 있어도 끝까지 가져온다**", () => {
    const 본문 = "<div><div>깊은 곳</div></div><p>마지막 문단</p>";

    const 잘라낸것 = sliceGuideBody(껍데기(본문));

    expect(잘라낸것).toContain("깊은 곳");
    expect(잘라낸것, "첫 닫는 태그에서 끊겼다").toContain("마지막 문단");
  });

  it("**표식이 없으면 빈 글이다** — 통째로 넣지 않는다", () => {
    expect(sliceGuideBody("<html><body><p>표식 없음</p></body></html>")).toBe("");
  });
});

describe("태그를 걷는다", () => {
  it("**글만 남는다**", () => {
    expect(htmlToText("<p>안녕<strong>하세요</strong></p>")).toBe("안녕 하세요");
  });

  it("**스크립트와 스타일은 통째로 버린다**", () => {
    const 글 = htmlToText('<p>본문</p><script>var a=1</script><style>.x{}</style>');

    expect(글).toBe("본문");
  });

  /**
   * **제목을 제목인 채로 남긴다.** 글만 뽑으면 제목과 문단이 한 줄로 붙어,
   * 조각을 꺼냈을 때 무엇에 대한 글인지 알 수 없다.
   */
  it("**제목에 표시를 남긴다**", () => {
    const 글 = htmlToText("<h2>크레딧과 모델</h2><p>설명입니다</p>");

    expect(글).toContain("## 크레딧과 모델");
    expect(글).toContain("설명입니다");
  });

  it("**표의 칸을 가른다** — 안 가르면 숫자가 줄줄이 붙는다", () => {
    const 글 = htmlToText("<tr><td>표준형</td><td>5장</td></tr>");

    expect(글).toContain("표준형 · 5장");
  });

  it("**실체 참조를 되돌린다**", () => {
    expect(htmlToText("<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>")).toBe("1 < 2 && 3 > 2");
  });

  it("**빈 줄을 겹쳐 두지 않는다**", () => {
    expect(htmlToText("<p>가</p><p></p><p></p><p>나</p>")).toBe("가\n나");
  });
});

/**
 * **이것이 이 파일의 존재 이유다.** 계산된 숫자가 글에 들어와야 한다.
 */
describe("계산된 숫자가 들어온다", () => {
  it("**함수 이름이 아니라 그 결과가 들어온다**", () => {
    // 서버가 그려 낸 모습이다. 소스에는 `creditUnits(...)` 가 있었다.
    const 그려진것 = 껍데기("<table><tr><td>표준형</td><td>5장</td></tr></table>");

    const 글 = htmlToText(sliceGuideBody(그려진것));

    expect(글).toContain("5장");
    expect(글, "함수 이름이 지식으로 들어갔다").not.toContain("creditUnits");
  });
});

describe("지식 한 덩이로", () => {
  const 만들기 = (본문: string) =>
    guideDocumentFrom({ href: "/guide/credits", label: "크레딧과 모델", html: 껍데기(본문) });

  it("**출처 이름과 주소를 단다**", () => {
    const 것 = 만들기("<p>" + "크레딧 설명".repeat(10) + "</p>");

    expect(것?.name).toContain("크레딧과 모델");
    expect(것?.href).toBe("/guide/credits");
  });

  /**
   * **조각이 잘려도 출처를 잃지 않는다.** 긴 쪽은 여러 조각으로 나뉘는데,
   * 가운데 조각만 꺼내면 어느 문서인지 알 수 없다.
   */
  it("**첫 줄에 어느 쪽 글인지 박는다**", () => {
    const 것 = 만들기("<p>" + "크레딧 설명".repeat(10) + "</p>");

    expect(것?.text.split("\n")[0]).toContain("크레딧과 모델");
    expect(것?.text.split("\n")[0]).toContain("/guide/credits");
  });

  /**
   * **빈 쪽은 안 만든다.** 못 긁었는데 껍데기만 넣으면, 검색에 걸려도 아무
   * 쓸모가 없는 조각이 지식 행세를 한다.
   */
  it("**너무 짧으면 안 만든다**", () => {
    expect(만들기("<p>짧음</p>")).toBeNull();
  });

  it("**표식이 없으면 안 만든다**", () => {
    const 것 = guideDocumentFrom({ href: "/guide/x", label: "x", html: "<p>표식 없음</p>" });

    expect(것).toBeNull();
  });
});
