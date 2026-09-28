import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGE_CREDIT_POLICY } from "@fixup/shared";

/**
 * **「막혔을 때」가 실제로 뜨는 말을 적고 있는지**(2026-09-28, 설계 §9 2단계).
 *
 * ── 왜 이 시험이 필요한가 ──────────────────────────────────
 *
 * 이 문서는 **화면에 뜬 문장으로 찾게** 만든 표다. 왼쪽 칸이 화면의 말과 다르면
 * 사용자는 자기가 본 말을 문서에서 못 찾는다 — 그러면 문서가 없는 것과 같다.
 *
 * 이 저장소가 같은 실수를 이미 두 번 겪었다. 화면은 「실사 사진」인데 설명서는
 * 「실사」라고 적어 두었고, 크레딧 설명서는 옛 셈법으로 남아 실제와 어긋났다.
 * 그때마다 **배포한 것을 뒤져 보고서야** 알았다.
 *
 * ── 왜 코드에서 가져다 그리지 않나 ─────────────────────────
 *
 * 그 문장 표는 `lib/membership/api.ts` 안에 있고, 그 파일은 서버 전용 것들을
 * 끌고 온다. 문서에서 import 하면 설명서가 그 사슬을 통째로 들게 된다.
 *
 * **글로 옮겨 적고, 어긋나면 이 시험이 잡는다.** 잡는 쪽이 더 단순하다.
 */

const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

const 문서 = read("app/guide/trouble/page.tsx");
const 계정문서 = read("app/guide/account/page.tsx");
const api = read("lib/membership/api.ts");

/** 그 문장이 `api.ts` 의 표에 실제로 있는가. */
function 코드에있다(문장: string): boolean {
  return api.includes(문장);
}

describe("막혔을 때 문서", () => {
  /**
   * **거절 문장을 그대로 적는다.**
   *
   * 여기 적은 것은 `api.ts` 의 거절 문장 중 사용자가 스스로 무엇을 할 수 있는
   * 것들이다. 내부 사정을 알려 주는 문장(`credit_quote_required` 등)은 사용자가
   * 할 일이 없어 문서에 넣지 않는다.
   */
  const 실린문장 = [
    "크레딧이 모자랍니다",
    "이번 달 이미지 생성 한도를 모두 사용했습니다",
    "팀의 이번 달 생성 한도를 모두 사용했습니다",
    "이미 생성 중인 요청이 있습니다",
    "분석 요청이 너무 많습니다",
    "크레딧 계정 전환이 준비 중입니다",
  ];

  it.each(실린문장)("「%s」가 코드에도 있고 문서에도 있다", (문장) => {
    expect(코드에있다(문장), `이 문장이 api.ts 에 없다. 화면이 안 쓰는 말을 문서가 적고 있다`).toBe(true);
    expect(문서.includes(문장), `문서에 이 문장이 없다. 사용자가 본 말을 못 찾는다`).toBe(true);
  });

  /** 로그인·계정 상태 때문에 막히는 말들. `membershipApiError` 가 내는 것이다. */
  const 계정문장 = [
    "로그인이 필요합니다",
    "이메일 인증을 완료해 주세요",
    "관리자 승인 대기 중입니다",
    "이용이 정지된 계정입니다",
    "탈퇴한 계정입니다",
  ];

  it.each(계정문장)("「%s」가 코드에도 있고 문서에도 있다", (문장) => {
    expect(코드에있다(문장), "이 문장이 api.ts 에 없다").toBe(true);
    expect(문서.includes(문장), "문서에 이 문장이 없다").toBe(true);
  });

  /**
   * **차감 정책 숫자를 손으로 적지 않는다.** 크레딧 설명서가 한 번 낡은 자리와
   * 같은 까닭이다(2026-09-21).
   */
  it("한 장당 크레딧을 정책에서 가져온다", () => {
    expect(문서).toContain("IMAGE_CREDIT_POLICY");
    expect(문서).not.toMatch(/1크레딧이 듭니다/);
    expect(IMAGE_CREDIT_POLICY.normalUnits).toBeGreaterThan(0);
  });

  /** 실패와 차감은 크레딧 문서가 정본이다. 두 곳에 표를 두면 한쪽이 낡는다. */
  it("실패와 차감은 크레딧 문서로 잇는다", () => {
    expect(문서).toContain("/guide/credits");
  });

  /**
   * 문의하는 길은 한 곳에만 적는다.
   *
   * **쓰는 자리를 본다.** import 만 보면 쓰지 않고 손으로 적어도 초록이다.
   */
  it("문의 안내를 한 곳에서 가져온다", () => {
    for (const [이름, 글] of [["막혔을 때", 문서], ["계정과 플랜", 계정문서]] as const) {
      expect(글, `${이름} 문서가 문의 안내를 직접 적고 있다`).toContain("{CS_INQUIRY_HINT}");
    }
  });
});

describe("계정과 플랜 문서", () => {
  /**
   * **없는 것을 있다고 적지 않는다.** 이 저장소에는 결제 연동이 없다
   * (2026-09-28 확인). 결제 화면이 있다고 적으면 사용자가 없는 화면을 찾는다.
   */
  it("결제 화면이 아직 없다고 적는다", () => {
    expect(계정문서).toContain("결제 화면");
    expect(계정문서).toMatch(/결제 화면[^。]*아직 없습니다|아직 없습니다/);
  });

  /** 실제로 결제 연동이 들어오면 이 시험이 먼저 붉어져서 문서를 고치게 만든다. */
  it("코드에 결제 연동이 없다", () => {
    const 결제이름 = ["tosspayments", "iamport", "portone", "@stripe", "kakaopay", "nicepay"];
    const 있는것 = 결제이름.filter((name) =>
      readFileSync(join(web, "package.json"), "utf8").includes(name),
    );

    expect(
      있는것,
      "결제 연동이 들어왔다. `app/guide/account/page.tsx` 의 「결제 화면은 아직 없습니다」를 고쳐야 한다",
    ).toEqual([]);
  });

  /**
   * **탈퇴 문구는 화면과 같아야 한다.** 무엇이 남는지 다르게 적으면 그것이
   * 거짓말이 된다.
   */
  it("탈퇴 안내가 화면의 말과 같다", () => {
    const 화면 = read("lib/membership/withdrawal.ts");

    for (const 문장 of ["되돌릴 수 없습니다", "법령에 따라 보관됩니다", "지금 만들고 있는 작업이 있습니다"]) {
      expect(화면.includes(문장), `${문장} 가 withdrawal.ts 에 없다`).toBe(true);
      expect(계정문서.includes(문장), `${문장} 가 문서에 없다`).toBe(true);
    }
  });
});
