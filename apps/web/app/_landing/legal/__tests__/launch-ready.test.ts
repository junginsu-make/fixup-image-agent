import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, PRIVACY_DOC, TERMS_DOC } from "../documents";
import { CS_EMAIL } from "../../../../lib/cs/contact";
import { CHAT_TTL_MS } from "../../../../lib/cs/chat-store";
import { SESSION_MAX_MS, SESSION_START_COOKIE } from "../../../../lib/auth/session-window";

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
    const 주소들 = doc.body.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];

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

describe("국외 이전 표", () => {
  /**
   * **처리방침은 서울로 적는다 — 실제 프로젝트는 아직 도쿄다**(2026-09-29).
   *
   * 운영 DB 주소를 AWS 가 공개한 지역별 주소 목록(ip-ranges.json)과 맞춰 보니
   * `ap-northeast-1`(도쿄)이었다. 사용자가 서울로 옮기기로 하고, **표기를 먼저
   * 서울로 하라고 지시했다**(2026-09-29: 「그냥 우선 표기만 서울로 하세요」).
   *
   * Supabase 는 지역을 설정으로 못 바꾼다. 서울에 새 프로젝트를 만들고 DB·회원·
   * 파일을 옮긴 뒤 연결 주소와 키를 바꿔야 한다(공식 문서 「Change Project
   * Region」). **그 이사가 끝나기 전까지 이 표기는 실제와 다르다.**
   */
  it("Supabase 의 저장 지역을 서울로 적는다", () => {
    expect(방침).toContain("| Supabase | 대한민국(서울)");
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
   * **24시간 뒤 다시 로그인하게 하는 장치가 지금은 돌지 않는다**(2026-09-29 확인).
   *
   * 시작 시각 쿠키(`fx_session_started`)의 수명이 정확히 24시간이라, 끊어야
   * 할 그 순간 브라우저가 쿠키를 먼저 지운다. 다음 요청은 「시작」으로 읽혀
   * 새 24시간이 시작된다. 로그인 쿠키(`sb-…`)는 최대 400일 남는다.
   *
   * 그래서 처리방침은 그 약속을 하지 않는다. 장치를 고치면 이 시험을 바꾸고
   * 처리방침에 다시 적는다.
   */
  it("24시간 강제 재로그인을 약속하지 않는다", () => {
    expect(방침).not.toContain("24시간이 지나면 다시 로그인");
    expect(방침).toContain("로그아웃할 때까지(브라우저에 최대 400일)");
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
    for (const 이름 of ["sb-", SESSION_START_COOKIE, 프로젝트쿠키]) {
      expect(방침, `${이름} 쿠키가 처리방침에 없다`).toContain(이름);
    }
  });

  it("쿠키 기간이 코드와 같다", () => {
    expect(방침).toContain(`${SESSION_MAX_MS / 3_600_000}시간`);
    expect(방침).toContain(`${프로젝트일수}일`);
  });

  /** 분석·광고 도구를 안 쓴다고 적었으면, 실제로 안 들어와 있어야 한다. */
  it("분석·광고 쿠키를 안 쓴다고 적고, 실제로 그런 도구가 없다", () => {
    expect(방침).toContain("분석·광고 목적의 쿠키를 사용하지 않습니다");

    const 패키지 = read(web, "package.json");
    for (const 도구 of ["@vercel/analytics", "posthog", "@next/third-parties", "mixpanel", "react-ga"]) {
      expect(패키지, `${도구} 가 들어왔다 — 처리방침 제11조를 고친다`).not.toContain(도구);
    }
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
