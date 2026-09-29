import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_DOC } from "../documents";

/**
 * **처리방침이 실제로 쓰는 업체를 적고 있는가**(2026-09-28).
 *
 * ── 왜 이 시험이 필요한가 ──────────────────────────────────
 *
 * 위탁·국외이전 표는 **한 번 적으면 아무도 다시 안 본다.** 업체를 바꾸거나
 * 더해도 화면은 멀쩡히 돌고 시험도 통과한다. 그 사이 처리방침만 낡는다.
 *
 * 낡은 처리방침은 그냥 틀린 글이 아니라 **개인정보 보호법 위반**이다 —
 * 위탁과 국외 이전은 공개 의무가 있다.
 *
 * ── 무엇을 재는가 ──────────────────────────────────────────
 *
 * 코드가 실제로 부르는 곳을 찾아, 그 업체가 표에 있는지 본다. 반대로 표에만
 * 있고 코드에 없는 것도 잡는다 — 안 쓰는 업체를 적어 두면 그것도 거짓이다.
 *
 * **완벽하지 않다.** 환경변수로만 드러나는 것(메일 발송처)은 코드에서 못
 * 본다. 그런 것은 아래 `설정으로만아는것` 에 적어 두고, 적어도 표에서
 * 사라지지는 않게 막는다.
 */

const web = join(__dirname, "..", "..", "..", "..");
const 방침 = PRIVACY_DOC.body;

/** 코드에서 그 업체를 부르는 흔적. 하나라도 있으면 쓰는 것이다. */
const 흔적 = {
  "fal.ai": [/fal\.run/, /@fal-ai\/client/],
  OpenAI: [/api\.openai\.com/, /from "openai"/],
  Anthropic: [/@anthropic-ai\/sdk/],
  Supabase: [/@supabase\/supabase-js/, /supabase\.co/],
  Neon: [/@neondatabase\/serverless/],
  /*
    **이것을 처음에 빠뜨렸다.** 로그인·가입 화면의 자동 가입 방지(Turnstile)가
    Cloudflare 다. 표에 안 적혀 있었고 이 시험도 못 잡았다 — 목록에 없었기
    때문이다(2026-09-28). 무엇을 쓰는지 세는 목록이 곧 이 시험의 눈이다.
  */
  Cloudflare: [/challenges\.cloudflare\.com/, /TURNSTILE/],
  /*
    **이것도 빠져 있었다**(2026-09-29). 상세페이지 리디자인의 「속도형」이
    이미지와 문구를 Google(Gemini) 로 **직접** 보낸다. fal 을 거쳐 가는 것과
    달리 회사가 직접 맡기는 것이라 표에 따로 있어야 한다.
  */
  Google: [/generativelanguage\.googleapis\.com/],
} as const;

function 훑는다(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__", ".turbo"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) 훑는다(path, out);
    else if (/\.(ts|tsx|json)$/.test(name)) out.push(path);
  }
  return out;
}

/*
  **법률 문서 자신은 빼야 한다.**

  `documents.ts` 가 `app/` 아래에 있다. 안 빼면 표에 이름을 적는 순간 「코드가
  그 업체를 부른다」가 참이 되어, **안 쓰는 업체를 적어도 잡히지 않는다.**
  스스로를 근거로 삼는 꼴이다(2026-09-28 변이 시험이 잡았다).
*/
const 법률문서 = join("legal", "documents.ts");

const 소스 = [
  ...훑는다(join(web, "lib")),
  ...훑는다(join(web, "app")),
  ...훑는다(join(web, "..", "..", "packages")),
]
  .filter((path) => !path.endsWith(법률문서))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

/**
 * 표 하나를 잘라 낸다.
 *
 * **문서 전체에서 이름을 찾으면 안 된다.** 위탁 표에서 지워도 국외이전 표에
 * 남아 있으면 통과해 버린다 — 실제로 그렇게 놓쳤다(2026-09-28).
 */
function 표조각(시작표시: string, 끝표시: string): string {
  const a = 방침.indexOf(시작표시);
  const b = 방침.indexOf(끝표시, a);
  return a < 0 || b < 0 ? "" : 방침.slice(a, b);
}

const 위탁표 = 표조각("| 수탁자 | 위탁 업무 |", "회사는 위탁계약에");
const 국외표 = 표조각("| 이전받는 자 | 연락처 |", "이전 시기와 방법");

/** 표의 몸통 줄(머리줄·구분줄 뺌)을 칸으로 나눈다. */
function 몸통칸(표: string): string[][] {
  return 표
    .split("\n")
    .slice(2)
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

/** 「Supabase(Supabase Pte. Ltd.)」 에서 앞의 서비스 이름만. 코드의 흔적과 맞출 때 쓴다. */
const 서비스이름 = (칸: string) => 칸.replace(/\(.*\)$/, "").trim();

describe("처리방침의 위탁 업체", () => {
  it("두 표를 실제로 잘라 냈다", () => {
    // 못 자르면 아래 검사가 전부 조용히 통과한다.
    expect(위탁표.length).toBeGreaterThan(100);
    expect(국외표.length).toBeGreaterThan(100);
  });

  it("코드가 부르는 업체가 두 표에 모두 적혀 있다", () => {
    const 쓰는것 = Object.entries(흔적)
      .filter(([, 규칙]) => 규칙.some((r) => r.test(소스)))
      .map(([이름]) => 이름);

    expect(
      쓰는것.filter((이름) => !위탁표.includes(이름)),
      "코드는 부르는데 위탁 표에 없다. 위탁은 공개 의무가 있다",
    ).toEqual([]);
    expect(
      쓰는것.filter((이름) => !국외표.includes(이름)),
      "코드는 부르는데 국외이전 표에 없다",
    ).toEqual([]);
  });

  /**
   * **표에 적힌 이름을 읽어서 본다.**
   *
   * 처음에는 내가 아는 목록 안에서만 골랐는데, 그러면 **모르는 업체를 새로
   * 적어 넣어도 초록이다.** 안 쓰는 업체를 적어 두는 것도 거짓 공개다.
   */
  const 위탁표의이름들 = 몸통칸(위탁표)
    .map(([칸]) => 서비스이름(칸 ?? ""))
    .filter((이름) => 이름.length > 0);

  it("표에서 이름을 읽어 온다", () => {
    // 못 읽으면 아래 검사가 조용히 통과한다.
    expect(위탁표의이름들.length).toBeGreaterThanOrEqual(5);
  });

  it("안 쓰는 업체를 적어 두지 않는다", () => {
    const 설정으로만 = new Set(["Amazon Web Services"]);
    const 없는것 = 위탁표의이름들
      .filter((이름) => !설정으로만.has(이름))
      .filter((이름) => {
        const 규칙 = (흔적 as Record<string, readonly RegExp[] | undefined>)[이름];
        // 내가 모르는 이름이면 그 이름 자체를 코드에서 찾아본다.
        return 규칙 ? !규칙.some((r) => r.test(소스)) : !소스.includes(이름);
      });

    expect(없는것, "처리방침에는 있는데 코드가 안 부른다").toEqual([]);
  });

  /**
   * **설정에만 있는 것.** 메일 발송처는 `SMTP_HOST` 로 정해져서 코드로는
   * 못 본다. 2026-09-28 에 운영 서버를 확인했다 — AWS SES(서울)였다.
   * 적어도 표에서 사라지지는 않게 막는다.
   */
  const 설정으로만아는것 = ["Amazon Web Services"];

  it.each(설정으로만아는것)("%s 가 표에 남아 있다", (이름) => {
    expect(방침).toContain(이름);
  });

  /** 결제 연동이 들어오면 표를 갱신해야 한다. */
  it("결제대행업체는 기능이 생길 때 더한다고 적는다", () => {
    const 결제이름 = ["tosspayments", "iamport", "portone", "@stripe"];
    const 들어온것 = 결제이름.filter((name) =>
      readFileSync(join(web, "package.json"), "utf8").includes(name),
    );

    if (들어온것.length === 0) {
      expect(방침).toContain("결제대행업체는 유료 결제 기능을 열 때 추가");
    } else {
      expect(방침, "결제 연동이 들어왔다. 위탁·국외이전 표에 넣어야 한다").toMatch(/결제 처리/);
    }
  });
});

describe("업체의 정식 이름과 연락처", () => {
  /**
   * **서비스 이름만으로는 공개한 것이 아니다**(2026-09-29).
   *
   * 개인정보 보호법 제28조의8 은 국외 이전을 받는 자의 **성명(법인명)과
   * 연락처**를 밝히라고 한다. 처음 표에는 「Supabase」 같은 서비스 이름만
   * 있었다. 칸은 「서비스 이름(계약 법인명)」 꼴로 쓴다 — 회원은 서비스 이름으로
   * 알아보고, 법인명은 법이 요구한다.
   */
  it.each([
    ["위탁", () => 몸통칸(위탁표)],
    ["국외 이전", () => 몸통칸(국외표)],
  ])("%s 표의 업체마다 계약 법인명이 적혀 있다", (_이름, 줄들) => {
    const 줄 = 줄들();

    expect(줄.length).toBeGreaterThanOrEqual(5);
    for (const [칸] of 줄) {
      expect(칸, `${칸} 에 법인명이 없다 — 「서비스(법인명)」 꼴로 적는다`).toMatch(/^[^()]+\(.+\)$/);
    }
  });

  it("국외 이전 표의 업체마다 연락처가 있다", () => {
    for (const [업체, 연락처] of 몸통칸(국외표)) {
      expect(연락처, `${업체} 의 연락처가 없다`).toMatch(/^[\w.+-]+@[\w-]+(\.[\w-]+)+$|^https:\/\//);
    }
  });

  it("두 표가 같은 업체를 같은 법인명으로 적는다", () => {
    const 위탁 = 몸통칸(위탁표).map(([칸]) => 칸).sort();
    const 국외 = 몸통칸(국외표).map(([칸]) => 칸).sort();

    expect(국외, "한 업체를 두 표에서 다른 이름으로 적으면 어느 쪽이 맞는지 다툰다").toEqual(위탁);
  });
});

describe("국외 이전", () => {
  /**
   * **국외로 나가는 것을 밝혀야 한다.** 미국·싱가포르로 나간다.
   * 이 문단이 없으면 공개 의무를 안 지킨 것이다.
   */
  it("이전 국가를 적는다", () => {
    for (const 나라 of ["미국", "싱가포르"]) {
      expect(방침, `${나라} 로 나가는 것이 안 적혀 있다`).toContain(나라);
    }
  });

  it("법적 근거와 거부 방법을 적는다", () => {
    expect(방침).toContain("이전의 법적 근거");
    expect(방침).toContain("거부 방법");
    // 거부하면 무엇을 못 쓰는지 구체적으로 말해야 한다.
    expect(방침).toContain("서비스의 주요 기능을 이용할 수 없습니다");
  });

  /** 자리표시가 남은 채로 게시되면 공개한 것으로 치지 않는다. */
  it("업체 이름 자리표시가 남아 있지 않다", () => {
    expect(방침).not.toContain("정확한 법인명]");
    expect(방침).not.toContain("실제 AI 처리업체");
  });
});
