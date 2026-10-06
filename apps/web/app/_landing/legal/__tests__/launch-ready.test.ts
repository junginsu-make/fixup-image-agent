import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, PRIVACY_DOC, TERMS_DOC } from "../documents";
import { CS_EMAIL } from "../../../../lib/cs/contact";
import { PHONE_CONSENT } from "../../../../lib/membership/phone";
import { CHAT_TTL_MS } from "../../../../lib/cs/chat-store";
import {
  SESSION_MAX_MS,
  SESSION_START_COOKIE,
  SESSION_START_COOKIE_MAX_AGE_S,
  sessionStartValue,
} from "../../../../lib/auth/session-window";
import { ANALYTICS_KEEP_DAYS } from "../../../../lib/analytics/retention";
import { ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE } from "../../../../lib/analytics/consent";

/**
 * **게시해도 되는 상태인가**(2026-09-29).
 *
 * ── 왜 이 시험이 필요한가 ──────────────────────────────────
 *
 * 운영 사이트에 초안이 그대로 걸려 있었다. 제목에 「(초안)」, 본문에
 * `[기간]` · `[회원 탈퇴 경로]` · `[게시 전 확인: …]` 같은 작성용 빈칸이
 * 19곳. 방문자와 카드사·와디즈 심사자가 그대로 봤다.
 *
 * ── 무엇이 정본인가 ────────────────────────────────────────
 *
 * **코드다**(2026-09-29 사용자 결정: 「약관을 코드에 맞춘다」). 그래서 문서에
 * 적는 기간·이름을 여기서 **코드와 설정에서 읽어 와** 대조한다. 문서에 숫자를
 * 손으로만 적어 두면, 코드가 바뀌어도 아무도 모른다.
 */

const web = join(__dirname, "..", "..", "..", "..");
const repo = join(web, "..", "..");
const read = (...parts: string[]) => readFileSync(join(...parts), "utf8");

const 방침 = PRIVACY_DOC.body;
const 약관 = TERMS_DOC.body;
const 문서들 = LEGAL_DOCS.map((doc) => [doc.title, doc] as const);

describe("작성용 표시가 남아 있지 않다", () => {
  it.each(문서들)("%s 에 대괄호 빈칸이 없다", (_제목, doc) => {
    expect(doc.body.match(/\[[^\]\n]*\]/g) ?? [], "작성용 빈칸이 게시된다").toEqual([]);
  });

  /** 「초안」이라고 걸어 두면 그 문서를 약속으로 내건 것인지부터 다툰다. */
  it.each(문서들)("%s 가 스스로를 초안이라고 부르지 않는다", (_제목, doc) => {
    expect(doc.title).not.toContain("초안");
    expect(doc.body.split("\n")[0]).not.toContain("초안");
  });
});

describe("문의처가 한 곳이다", () => {
  /**
   * **2026-09-29 사용자 확인: ai.dev@fixupworld.com.**
   *
   * 약관·처리방침은 `9843ohs@gmail.com`, 도우미 화면은 `ai.dev@gmail.com` 으로
   * 갈라져 있었다. 고객은 어느 쪽이 진짜인지 모르고, 한쪽은 아무도 안 본다.
   * 문서에 적힌 주소가 **도우미가 보여 주고 메일이 가는 주소**와 같은지 본다.
   */
  it.each(문서들)("%s 에 적힌 메일 주소가 모두 문의 창구 주소다", (_제목, doc) => {
    // 국외 이전 표의 「연락처」 칸은 **업체의** 개인정보 문의처다(법이 요구한다). 회사 문의처가 아니므로 뺀다.
    const 국외표시작 = doc.body.indexOf("| 이전받는 자 |");
    const 국외표끝 = doc.body.indexOf("이전 시기와 방법", 국외표시작);
    const 회사글 =
      국외표시작 < 0 ? doc.body : doc.body.slice(0, 국외표시작) + doc.body.slice(국외표끝);
    const 주소들 = 회사글.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];

    expect(주소들.length, "연락할 곳이 하나도 안 적혀 있다").toBeGreaterThan(0);
    expect([...new Set(주소들)]).toEqual([CS_EMAIL]);
  });
});

describe("가입 화면이 받는 것을 처리방침이 적는다", () => {
  const 가입화면 = read(web, "app", "signup", "page.tsx");
  const 가입줄 = 방침.split("\n").find((line) => line.startsWith("| 회원가입")) ?? "";

  it("처리방침의 회원가입 줄을 찾는다", () => {
    // 못 찾으면 아래 검사가 빈 글자에 대고 조용히 실패하거나 통과한다.
    expect(가입줄.length).toBeGreaterThan(20);
  });

  /** 화면이 받는데 처리방침에 없으면 알리지 않고 수집한 것이다. */
  it.each([
    ["이름", 'htmlFor="name"'],
    ["추천코드", 'htmlFor="referrer"'],
    ["전화번호", '<PhoneField id="phone"'],
  ])("%s 를 받고, 그것을 적는다", (항목, 화면표시) => {
    expect(가입화면, "화면이 더는 이것을 받지 않는다 — 처리방침도 고친다").toContain(화면표시);
    expect(가입줄, `가입 화면이 ${항목} 을 받는데 처리방침에 없다`).toContain(항목);
  });

  it("동의 기록을 남긴다는 것을 적는다", () => {
    expect(가입줄).toContain("동의 기록");
  });

  it("만 14세 이상인지 가입 때 확인한다고 적는다", () => {
    expect(방침).toContain("가입 화면에서 만 14세 이상인지 확인");
  });
});

/**
 * **간편가입(Google·카카오)으로 받는 것도 처리방침이 적는다**(2026-10-02).
 *
 * 간편가입은 비밀번호를 받지 않는 대신, 그 업체가 이메일·이름(닉네임)·프로필
 * 사진 주소·계정 식별값을 넘겨 주고 인증 시스템에 남는다. 카카오 동의항목은
 * 이메일·닉네임(필수), 프로필 사진(선택)이다. 만 14세 확인과 약관 동의는 가입
 * 정보 확인 화면(`/auth/onboarding`)이 받는다.
 */
describe("간편가입이 받는 것을 처리방침이 적는다", () => {
  const 공급자코드 = read(web, "lib", "auth", "social-auth.ts");
  const 확인화면 = read(web, "app", "auth", "onboarding", "onboarding-form.tsx");
  const 가입줄 = 방침.split("\n").find((line) => line.startsWith("| 회원가입")) ?? "";

  it.each([
    ["Google", '"google"'],
    ["카카오", '"kakao"'],
  ])("%s 간편가입을 코드가 지원하고, 처리방침이 적는다", (이름, 코드표시) => {
    expect(공급자코드, "코드가 더는 이 공급자를 지원하지 않는다 — 처리방침도 고친다").toContain(코드표시);
    expect(가입줄, `${이름} 간편가입이 처리방침 회원가입 줄에 없다`).toContain(이름);
  });

  it.each(["닉네임", "프로필 사진", "계정 식별값"])("업체가 넘겨주는 %s 을 적는다", (항목) => {
    expect(가입줄).toContain(항목);
  });

  it("간편가입 확인 화면도 전화번호(선택)를 받는다", () => {
    expect(확인화면).toContain("<PhoneField");
  });

  it("간편가입은 비밀번호를 받지 않는다고 적는다", () => {
    expect(가입줄).toContain("비밀번호는 받지 않습니다");
  });

  it("간편가입의 만 14세 확인 자리를 적는다", () => {
    expect(확인화면, "확인 화면이 더는 만 14세를 묻지 않는다 — 처리방침도 고친다").toContain("만 14세 이상입니다");
    expect(방침).toContain("가입 정보 확인 화면에서 만 14세 이상인지 확인");
  });
});

/**
 * **전화번호는 선택 동의로 받는다**(2026-10-02 사용자 결정). 처리방침은 화면의 동의
 * 문구와 같은 목적·항목·보유기간을 적는다 — 다르면 동의받은 것과 공개한 것이 갈린다.
 */
describe("전화번호(선택)를 처리방침이 적는다", () => {
  const 연락처줄 = 방침.split("\n").find((line) => line.startsWith("| 연락처(선택)")) ?? "";
  it("처리방침에 연락처(선택) 줄이 있다", () => {
    expect(연락처줄.length).toBeGreaterThan(20);
  });
  it.each(["purpose", "items", "retention"] as const)("동의 문구의 %s 와 같은 말을 쓴다", (key) => {
    expect(연락처줄).toContain(PHONE_CONSENT[key]);
  });
  it("동의를 받아 처리한다고 적는다", () => {
    expect(연락처줄).toContain("동의");
  });
});

describe("국외 이전 표", () => {
  /**
   * **처리방침은 실제 저장 위치인 도쿄로 적는다**(2026-10-02).
   *
   * 운영 DB 주소를 AWS 가 공개한 지역별 주소 목록(ip-ranges.json)과 맞춰 보니
   * `ap-northeast-1`(도쿄)이었다. 2026-09-29 에는 서울로 옮기기로 하고 표기를 먼저 서울로
   * 했지만, Supabase 는 지역을 설정으로 못 바꿔 새 프로젝트로 이사해야 한다(DB·회원·파일,
   * 같은 DB 를 쓰는 상세페이지 제품, 전체 재로그인). 2026-10-02 사용자가 **이사는 미루고
   * 표기를 실제대로 도쿄로** 하기로 했다. 서울로 이사하면 이 시험과 표를 함께 바꾼다.
   */
  it("Supabase 의 저장 지역을 실제대로 일본(도쿄)로 적는다", () => {
    const 줄 = 방침.split("\n").find((line) => line.startsWith("| Supabase(") && line.includes("@")) ?? "";

    expect(줄, "국외 이전 표에서 Supabase 줄을 못 찾았다").not.toBe("");
    expect(줄).toContain("| 일본(도쿄) |");
    expect(줄).not.toContain("서울");
  });

  /**
   * **AWS 는 국내 법인이 서울에서 처리한다**(2026-09-29 확인). 한국 청구 주소의
   * 계정은 2020-12-01 부터 AWS Korea LLC 와 계약한다(AWS Contracting Party).
   * 서버(EC2)도, 인증메일(SES, `email-smtp.ap-northeast-2`)도 서울이다.
   */
  it("AWS 를 국내 법인과 서울로 적는다", () => {
    const 줄 = 방침.split("\n").find((line) => line.startsWith("| Amazon Web Services(") && line.includes("@")) ?? "";

    expect(줄).toContain("Amazon Web Services Korea LLC");
    expect(줄).toContain("| 대한민국(서울) |");
  });
});

describe("보관 기간을 코드·설정에서 읽는다", () => {
  /**
   * 웹 서버(Caddy)가 접속 기록을 남기는 방식. 처리방침의 보안 로그 기간이다.
   *
   * **「7일」만 적으면 거짓이다**(2026-09-29 독립 리뷰). `roll_keep_for` 는
   * 이미 나눈 파일만 지운다. 지금 쓰는 파일은 `roll_size` 가 차야 나뉘므로,
   * 방문이 적으면 7일보다 오래 남는다. 그래서 세 값을 모두 읽어 그대로 적는다.
   */
  it("웹 서버 접속 기록 방식이 Caddy 설정과 같다", () => {
    const caddy = read(repo, "deploy", "ec2", "Caddyfile.template");
    const 크기 = Number(caddy.match(/roll_size (\d+)MiB/)?.[1]);
    const 개수 = Number(caddy.match(/roll_keep (\d+)\s/)?.[1]);
    const 시간 = Number(caddy.match(/roll_keep_for (\d+)h/)?.[1]);

    expect([크기, 개수, 시간].every((값) => 값 > 0), "Caddy 설정에서 값을 못 읽었다").toBe(true);
    expect(방침).toContain(
      `웹 서버 접속 기록: ${크기}MB씩 나눠 저장하며, 나눈 기록은 ${시간 / 24}일이 지나거나 ${개수}개를 넘으면 삭제`,
    );
  });

  it("도우미 대화 보관 시간이 코드와 같다", () => {
    expect(방침).toContain(`${CHAT_TTL_MS / 3_600_000}시간`);
  });

  /** 도우미 창의 안내도 같은 시간을 말해야 한다. 「한 시간」이 남아 있었다(09-28 에 하루로 늘렸다). */
  it("도우미 창의 안내가 코드와 같은 시간을 말한다", () => {
    const 도우미창 = read(web, "app", "_components", "cs-panel.tsx");

    expect(도우미창).toContain(`대화는 ${CHAT_TTL_MS / 3_600_000}시간 동안만 남고`);
    expect(도우미창).not.toContain("한 시간 동안만");
  });
});

describe("지키지 못하는 약속을 적지 않는다", () => {
  /**
   * **24시간 뒤 다시 로그인 — 이제 코드가 지킨다**(2026-09-29 고침).
   *
   * 전에는 시작 시각 쿠키의 수명이 정확히 24시간이라 끊어야 할 순간에 먼저
   * 사라져, 장치가 한 번도 걸리지 않았다. 그래서 처리방침에서 그 약속을 뺐었다.
   * 쿠키를 로그인 쿠키만큼 살게 하고 그 로그인에 묶어 고쳤다
   * (`__tests__/middleware-session.test.ts` 가 실제 브라우저처럼 잰다).
   *
   * 약속을 다시 적되, **그 약속을 지키는 조건**(쿠키가 24시간보다 오래 산다)을
   * 여기서 함께 본다. 누가 수명을 24시간으로 되돌리면 이 시험이 붉어진다.
   */
  it("24시간 뒤 다시 로그인하게 한다고 적고, 코드가 그렇게 한다", () => {
    expect(SESSION_START_COOKIE_MAX_AGE_S, "쿠키가 24시간보다 오래 살아야 만료를 잰다").toBeGreaterThan(
      SESSION_MAX_MS / 1000,
    );
    expect(방침).toContain("로그인 후 24시간이 지나면 다시 로그인하도록 합니다");
    expect(방침).toContain("로그아웃하거나 로그인 후 24시간이 지나면 삭제");
  });

  /** 시작 시각 쿠키에는 그 로그인의 번호도 들어간다(`sessionStartValue`). 적힌 것을 다 밝힌다. */
  it("시작 시각 쿠키에 무엇이 들어가는지 다 적는다", () => {
    expect(sessionStartValue(1, "s")).toContain("s");
    expect(방침).toContain("로그인 시각과 로그인 식별값 기록");
  });

  /** 비밀번호 해시는 회사 Supabase 프로젝트의 `auth.users` 에 있다. 「회사 DB 에 없다」는 거짓이다. */
  it("비밀번호를 회사 데이터베이스에 두지 않는다고 말하지 않는다", () => {
    expect(방침).not.toContain("회사의 데이터베이스에는 저장하지 않습니다");
  });

  /** 인증 안 한 가입 신청을 날짜로 지우는 장치가 없다. 날짜를 약속하지 않는다. */
  it("인증 안 한 가입 정보를 날짜로 지운다고 약속하지 않는다", () => {
    expect(방침).not.toMatch(/인증을 마치지 않은 가입 신청 정보는 신청일부터 \d+일/);
  });

  /** 첫 화면 작품 소개는 로그인 없이 기한 없이 열린다. 「1시간 주소」의 예외를 밝힌다. */
  it("첫 화면 작품 소개가 공개된다는 예외를 밝힌다", () => {
    expect(방침).toContain("첫 화면 작품 소개에 올린 결과물은 누구나 볼 수 있습니다");
  });
});

describe("쿠키", () => {
  const 프로젝트파일 = read(web, "lib", "teams", "current-project.ts");
  const 프로젝트쿠키 = 프로젝트파일.match(/const COOKIE = "([^"]+)"/)?.[1] ?? "";
  const 프로젝트일수 = Number(프로젝트파일.match(/maxAge: 60 \* 60 \* 24 \* (\d+)/)?.[1]);

  it("코드에서 쿠키 이름과 기간을 읽는다", () => {
    expect(프로젝트쿠키.length).toBeGreaterThan(0);
    expect(프로젝트일수).toBeGreaterThan(0);
  });

  /** 코드가 심는 쿠키가 처리방침에 없으면 알리지 않고 저장한 것이다. */
  it("코드가 심는 쿠키를 모두 적는다", () => {
    for (const 이름 of ["sb-", SESSION_START_COOKIE, 프로젝트쿠키, CONSENT_COOKIE, VISITOR_COOKIE]) {
      expect(방침, `${이름} 쿠키가 처리방침에 없다`).toContain(이름);
    }
  });

  it("쿠키 기간이 코드와 같다", () => {
    expect(방침).toContain(`${SESSION_MAX_MS / 3_600_000}시간`);
    expect(방침).toContain(`${프로젝트일수}일`);
  });

  /** 광고 쿠키를 안 쓰고 외부 분석 도구도 없다. 방문 분석 쿠키는 우리 것(fx_vid) 하나, 동의한 경우에만. */
  it("광고 쿠키를 안 쓴다고 적고, 외부 분석·광고 도구가 없다", () => {
    expect(방침).toContain("광고 목적의 쿠키를 사용하지 않습니다");
    expect(방침).toContain("동의한 경우에만 저장");

    const 패키지 = read(web, "package.json");
    for (const 도구 of ["@vercel/analytics", "posthog", "@next/third-parties", "mixpanel", "react-ga"]) {
      expect(패키지, `${도구} 가 들어왔다 — 처리방침 제11조를 고친다`).not.toContain(도구);
    }
  });

  /** 방문 통계를 적었으면, 적은 대로 동작해야 한다(계획 2026-10-06 site-analytics). */
  it("방문 통계의 보유기간·쿠키 기간·저장하지 않는 것이 코드와 같다", () => {
    expect(방침).toContain("| 서비스 이용 통계 |");
    expect(방침).toContain(`수집일부터 ${ANALYTICS_KEEP_DAYS}일`);
    expect(방침).toContain(`| ${VISITOR_COOKIE} (쿠키) |`);
    expect(방침).toContain(`| ${CONSENT_COOKIE} (쿠키) |`);
    expect(방침).toContain(`${ANALYTICS_COOKIE_DAYS}일`);
    expect(방침).toContain("「방문 통계 설정」");
    // 방문자 값은 서버 메모리 열쇠로 만든다(lib/analytics/visitor.ts) — 문구가 그 사실과 같아야 한다.
    expect(방침).toContain("서버 메모리에만 두고 날마다 바꾸는");
    expect(방침).toContain("방문 분석 쿠키 없이 처리합니다");
    expect(방침).toContain("로그인한 회원의 방문은 회원 식별번호로 기록합니다");
    expect(방침).not.toContain("그 무작위 값은 다음 날 지웁니다");

    const 보내기 = read(web, "app", "_components", "page-view-tracker.tsx");
    for (const 저장 of ["document.cookie", "localStorage", "sessionStorage", "indexedDB"]) {
      expect(보내기, `방문 통계 보내기가 ${저장} 를 쓴다 — 처리방침 제11조를 고친다`).not.toContain(저장);
    }
    const 띠 = read(web, "app", "_components", "consent-banner.tsx");
    expect(띠, "동의 띠의 안내 문구가 처리방침과 다르다").toContain("거부해도 모든 기능을 그대로 쓸 수 있습니다");
  });
});

describe("탈퇴·권리 행사 경로", () => {
  /**
   * 약관·처리방침이 가리키는 곳이 **실제 메뉴 이름**과 같아야 찾아간다.
   * 메뉴 이름은 `lib/access/routes.ts` 가 정한다.
   */
  it("문서가 가리키는 메뉴가 실제로 있다", () => {
    const 메뉴 = read(web, "lib", "access", "routes.ts");
    const 탈퇴카드 = read(web, "app", "settings", "withdraw-card.tsx");

    expect(메뉴).toContain('"계정"');
    expect(탈퇴카드).toContain("회원 탈퇴");
    for (const doc of [약관, 방침]) {
      expect(doc).toContain("「계정」 화면 맨 아래의 「회원 탈퇴」");
    }
  });
});
