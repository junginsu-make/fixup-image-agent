import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateDocument, type ServerDocument } from "../model";

/**
 * W6(F19 회귀): 「Data: 국내산 100%」 같은 글이 그림으로 잘못 걸려 저장이 막혔다.
 * 거절은 브라우저가 그림으로 여는 data URL 과 긴 base64 문자열만 한다.
 */
const user = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const base = (body: Record<string, unknown> = {}, title = "작업"): ServerDocument => ({
  schemaVersion: 3, id, title, stage: "editor", sourceMode: "image", assets: {},
  body: { sections: [], inputs: { additionalInfo: "" }, settings: {}, references: [], blueprint: {}, editor: null, ...body },
} as ServerDocument);
const longKorean = "이 제품은 국내산 원료만 써서 만들었고, 매일 아침 공장에서 갓 짠 우유로 만듭니다. ".repeat(60);
/** 줄마다 품번 하나(2,400자). 줄을 이어 붙이면 base64 글자만 남지만 그림이 아니다(최종 리뷰 L1). */
const productCodes = Array.from({ length: 301 }, (_, i) => `AB-${String(1000 + i).padStart(4, "0")}`).join("\n");
/** 실제 그림 바이트(PNG 머리 + 3KB)를 메일처럼 76자마다 끊은 base64. */
const mimeImage = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(3000)])
  .toString("base64").replace(/.{76}/g, "$&\r\n");
const UPLOAD_FIRST = "그림은 먼저 업로드해야 합니다.";
/** 1×1 PNG. */
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("W6: 글은 통과시키고 그림 문자열만 막는다", () => {
  it.each([
    ["추가 정보 「Data: 국내산 100%」", base({ inputs: { additionalInfo: "Data: 국내산 100%" } })],
    ["제목줄 「data: 실험 결과 98%」", base({ sections: [{ section_id: "s1", headline: "data: 실험 결과 98%" }] })],
    ["제목 「DATA: 2026 신제품」", base({}, "DATA: 2026 신제품")],
    ["콜론 바로 뒤 한글 「data:텍스트」", base({ notice: "data:텍스트" })],
    ["줄바꿈 뒤 한글 「Data:\\n국내산」", base({ notice: "Data:\n국내산" })],
    ["긴 한국어 문장", base({ inputs: { additionalInfo: longKorean } })],
    ["한 글자만 긴 한국어", base({ inputs: { additionalInfo: "가".repeat(5000) } })],
    ["짧은 base64 처럼 보이는 낱말", base({ notice: "QUJDRA==" })],
    ["L1: 숫자로 시작하는 「Data:2026/10, 국내 출시」", base({ inputs: { additionalInfo: "Data:2026/10, 국내 출시" } })],
    ["L1: 세미콜론 뒤 띄어 쓴 「DATA:; 국내산, 100%」", base({ sections: [{ section_id: "s1", headline: "DATA:; 국내산, 100%" }] })],
    ["L1: 줄마다 품번 하나인 2,400자 목록", base({ inputs: { additionalInfo: productCodes } })],
    ["L1: 하이픈 없는 품번 목록(글자·숫자만, 짧은 줄)", base({ inputs: { additionalInfo: productCodes.replaceAll("-", "") } })],
    ["L1: 콜론·쉼표 뒤 띄어 쓴 「Data:, 해당 없음」", base({ notice: "Data:, 해당 없음" })],
    ["R2: 콜론 뒤 띄어 쓴 「Data: CD/DVD, 블루레이」", base({ inputs: { additionalInfo: "Data: CD/DVD, 블루레이" } })],
    ["R2: 콜론 뒤 띄어 쓴 「Data: A/B 테스트, 결과」", base({ notice: "Data: A/B 테스트, 결과" })],
  ])("%s 은(는) 저장한다", (_name, doc) => {
    expect(longKorean.length).toBeGreaterThan(2048);
    expect(productCodes.length).toBeGreaterThanOrEqual(2400);
    expect(() => validateDocument(doc, user, id)).not.toThrow();
  });
  it.each([
    ["진짜 data URL", "data:image/png;base64,QUJD"],
    ["대문자 data URL", "DATA:IMAGE/PNG;BASE64,QUJD"],
    ["svg data URL", "data:image/svg+xml,%3Csvg%3E"],
    ["앞 공백", "   data:image/png;base64,QUJD"],
    ["제로폭 접두", "\u200bdata:image/png;base64,QUJD"],
    ["BOM·단어 결합 접두", "\ufeff\u2060data:image/webp;base64,QUJD"],
    ["매체형 없는 base64 data URL", "data:;base64,QUJD"],
    ["URL 파서가 지우는 줄바꿈이 낀 data URL", "da\nta:image/png;base64,QUJD"],
    ["긴 표준 base64", "A".repeat(4096)],
    ["URL-safe base64", "A-_b".repeat(1000)],
    ["76자 줄바꿈 base64", ("QUJD".repeat(19) + "\n").repeat(60)],
    ["CRLF 줄바꿈 base64", ("QUJD".repeat(19) + "\r\n").repeat(60) + "QQ=="],
    ["L1: 제로폭 접두 + 매체형 없는 base64 data URL", "​data:;base64,iVBORw0KGgo="],
    ["L1: 76자마다 끊은 실제 그림의 base64", mimeImage],
    ["L1: 줄바꿈 없는 URL-safe base64 한 덩어리", randomBytes(3000).toString("base64url")],
    // 브라우저의 data URL 해석은 매개변수 앞뒤 빈칸을 받아 그림으로 연다(최종 리뷰 2차, Node fetch 로 확인).
    ["R2: 세미콜론 뒤 빈칸 「data:image/png; base64,」", "data:image/png; base64," + PNG_BASE64],
    ["R2: 세미콜론 뒤 빈칸 둘 「data:image/png;  base64,」", "data:image/png;  base64," + PNG_BASE64],
    ["R2: 매개변수 값 앞 빈칸 「data:image/svg+xml; charset=utf-8,」", "data:image/svg+xml; charset=utf-8,%3Csvg%3E"],
    ["R2: 콜론 뒤 빈칸 「data: image/png;base64,」", "data: image/png;base64," + PNG_BASE64],
    ["R2: 형식 뒤 빈칸 「data:image/png ;base64,」", "data:image/png ;base64," + PNG_BASE64],
    // 그림 형식이 아니어도 바이트는 그림이다(<img> 는 내용으로 연다) — 그림 전용 꼴에 기대지 않고 막는지 본다.
    ["R2: 그림 아닌 형식 + 세미콜론 뒤 빈칸", "data:application/octet-stream; base64," + PNG_BASE64],
    ["R2: 그림 아닌 형식 + 형식 뒤 빈칸", "data:application/octet-stream ;base64," + PNG_BASE64],
  ])("%s 은(는) 400으로 막는다", (_name, value) => {
    for (const doc of [base({ notice: value }), base({ editor: { layers: [{ src: value }] } })]) {
      // 문구는 어느 칸인지 앞에 붙는다(아래 L1 시험). 막는 까닭은 그대로 들어 있어야 한다.
      expect(() => validateDocument(doc, user, id)).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining(UPLOAD_FIRST) }));
    }
  });
  it.each([
    ["섹션 2 · 헤드라인", base({ sections: [{ section_id: "s1", headline: "괜찮은 글" }, { section_id: "s2", headline: "data:image/png;base64,QUJD" }] })],
    ["섹션 1 · 이미지 방향", base({ sections: [{ section_id: "s1", prompt_ko: "data:image/png;base64,QUJD" }] })],
    ["추가 정보", base({ inputs: { additionalInfo: "data:image/png;base64,QUJD" } })],
    ["작업 제목", base({}, "data:image/png;base64,QUJD")],
    ["편집 화면", base({ editor: { layers: [{ src: "data:image/png;base64,QUJD" }] } })],
    ["작업 내용", base({ blueprint: { memo: "data:image/png;base64,QUJD" } })],
  ])("L1: 막을 때 어느 칸인지 화면 말로 알린다 — 「%s」", (where, doc) => {
    expect(() => validateDocument(doc, user, id)).toThrow(expect.objectContaining({ status: 400,
      message: `「${where}」의 글이 그림 데이터로 읽혀 저장하지 못했습니다. 이 글을 고쳐 주세요. ${UPLOAD_FIRST}` }));
  });
  it("L1: 안내 문구에 내부 열쇠 이름(toString 같은 것)이 새지 않는다", () => {
    const doc = base({ blueprint: { toString: "data:image/png;base64,QUJD" } });
    expect(() => validateDocument(doc, user, id)).toThrow(expect.objectContaining({ message: expect.stringContaining("「작업 내용」") }));
  });
});
