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

/** `duplicateRequestMessage` 의 몸통. 중복 문장은 여기서만 나온다. */
const 중복함수 = (() => {
  const 시작 = api.indexOf("async function duplicateRequestMessage(");
  if (시작 < 0) return "";
  // 함수가 끝나는 줄(맨 앞의 `}`). 줄바꿈이 \r\n 이어도 찾는다.
  const 끝 = api.slice(시작).search(/\r?\n\}\r?\n/);
  return 끝 < 0 ? "" : api.slice(시작, 시작 + 끝);
})();

/** 문서의 「같은 요청을 다시 눌렀을 때」 칸. 다음 칸 앞까지다. */
const 중복칸 = (() => {
  const 시작 = 문서.indexOf("같은 요청을 다시 눌렀을 때");
  return 시작 < 0 ? "" : 문서.slice(시작, 문서.indexOf("<Section", 시작));
})();

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
    /*
      표에 없는 까닭으로 거절될 때 나오는 말이다(`messages[row.reason] ?? …`).
      전에는 아래 중복 문장으로 묶어 두었는데 틀렸다 — 중복일 때는 이 말이
      안 나온다(2026-09-29).
    */
    "요청을 처리할 수 없습니다",
  ];

  it.each(실린문장)("「%s」가 코드에도 있고 문서에도 있다", (문장) => {
    expect(코드에있다(문장), `이 문장이 api.ts 에 없다. 화면이 안 쓰는 말을 문서가 적고 있다`).toBe(true);
    expect(문서.includes(문장), `문서에 이 문장이 없다. 사용자가 본 말을 못 찾는다`).toBe(true);
  });

  /**
   * **같은 요청을 다시 보냈을 때의 말들.** 이 넷은 표가 아니라
   * `duplicateRequestMessage` 가 행 상태를 읽어 고른다(`api.ts`).
   * 마지막 것은 행 상태를 못 읽었을 때다.
   */
  const 중복문장 = [
    "같은 요청이 아직 처리 중입니다",
    "이 요청은 이미 끝났습니다",
    "이 요청은 실패로 끝났습니다",
    "같은 요청이 이미 접수돼 있습니다",
  ];

  it.each(중복문장)("「%s」가 중복일 때 나오고 문서의 중복 칸에 있다", (문장) => {
    expect(중복함수, "duplicateRequestMessage 를 못 찾았다").not.toBe("");
    expect(중복함수.includes(문장), "이 문장이 duplicateRequestMessage 에 없다").toBe(true);
    expect(중복칸.includes(문장), "문서의 「같은 요청을 다시 눌렀을 때」 칸에 이 문장이 없다").toBe(true);
  });

  /** 중복이 아닌 거절 문장을 중복 칸에 두면 사용자가 까닭을 잘못 읽는다. */
  it("중복 칸에 다른 거절 문장을 두지 않는다", () => {
    expect(중복함수).not.toContain("요청을 처리할 수 없습니다");
    expect(중복칸, "문서의 중복 칸을 못 찾았다").not.toBe("");
    expect(중복칸).not.toContain("요청을 처리할 수 없습니다");
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

/**
 * **탈퇴한 사람이 끝났다는 말을 듣는가**(2026-09-28).
 *
 * 탈퇴가 끝나면 `/login?notice=withdrawn` 으로 옮기는데, 로그인 화면이 그
 * 값을 **읽지 않고 있었다.** 되돌릴 수 없는 일을 한 사람이 아무 말도 못 듣고
 * 로그인 칸만 보고 있었다.
 */
describe("탈퇴 뒤 안내", () => {
  it("탈퇴 화면이 보내는 값을 로그인 화면이 읽는다", () => {
    const 탈퇴 = read("app/settings/withdraw-card.tsx");
    const 로그인 = read("app/login/page.tsx");

    expect(탈퇴).toContain("notice=withdrawn");
    expect(로그인, "로그인 화면이 그 값을 안 읽는다").toContain('params.get("notice")');
    expect(로그인).toContain("탈퇴가 완료되었습니다");
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
  /**
   * **플랜을 넣으면 크레딧이 바로 들어온다**(2026-10-09 사용자 결정). 전에는 관리자가 그 달
   * 결제를 따로 확인해야 지급돼 「플랜과 크레딧은 따로」라고 적었다. 관리자 화면과 설명서가
   * 같은 말을 하는지 본다 — 한쪽만 옛 말이면 회원은 없는 「결제 확인」을 기다린다.
   */
  it("플랜을 넣으면 크레딧이 바로 들어온다고 관리자 화면과 설명서가 같이 적는다", () => {
    expect(read("app/admin/member-list/bulk-bar.tsx")).toContain("크레딧이 바로 들어갑니다");
    expect(read("app/admin/member-list/bulk-bar.tsx"), "옛 두 단계 안내가 남아 있다").not.toContain("플랜만 붙습니다");
    expect(계정문서).toContain("플랜을 넣으면 크레딧이 바로 들어옵니다");
    expect(계정문서, "옛 두 단계 안내가 남아 있다").not.toContain("플랜과 크레딧은 따로입니다");
  });

  /**
   * **묻는 말투를 그대로 담는다**(2026-09-28 실측).
   *
   * 색인한 뒤 재 보니 「결제는 어떻게 하나요?」에 **아무 조각도 안 걸렸다.**
   * 문서가 그 내용을 담고 있는데도 그랬다 — 글이 설명하는 말투였고 사용자는
   * 묻는 말투로 친다. 찾는 것은 뜻이 아니라 **말이 닮은 정도**다.
   *
   * 이 문장들을 다듬어 없애면 도우미가 다시 못 찾는다. 그래서 못 박는다.
   */
  const 묻는말 = [
    "결제는 어떻게 하나요",
    "요금이 얼마인가요",
    "구독을 해지하고 싶어요",
    "환불이 되나요",
    "크레딧을 더 사고 싶어요",
  ];

  it.each(묻는말)("「%s」를 묻는 말 그대로 담는다", (문장) => {
    expect(계정문서, "이 말투가 없으면 도우미가 못 찾는다").toContain(문장);
  });

  /**
   * **환불·해지 기준은 사용자가 정한 것이다**(2026-09-28).
   *
   * 그 전에는 「문의로 안내합니다」까지만 적혀 있었다 — 코드에 없고 약관도
   * 초안이라 지어낼 수 없었다. 받은 기준을 **그대로** 적었고, 다듬어서 뜻이
   * 달라지면 **그것이 공개된 약속**이 되므로 여기서 못 박는다.
   */
  const 정한기준 = [
    ["구독 이월 불가", "이월되지 않습니다"],
    ["해지는 기간 끝까지", "이미 결제한 기간까지는 그대로"],
    ["쓴 구독은 환불 불가", "환불되지 않습니다"],
    ["구매 크레딧 3개월", "3개월까지"],
    ["남은 크레딧은 원화로", "원화로 환산"],
  ] as const;

  it.each(정한기준)("**%s** 를 적어 둔다", (_이름, 문장) => {
    expect(계정문서, "사용자가 정한 기준이 문서에서 빠졌다").toContain(문장);
  });

  /** 가입 혜택이 없다는 것도 적는다. 0 에서 시작하는 것을 모르면 고장으로 읽는다. */
  it("가입하면 크레딧이 0 이라고 적는다", () => {
    expect(계정문서).toContain("0 으로 시작합니다");
  });

  it("탈퇴 안내가 화면의 말과 같다", () => {
    const 화면 = read("lib/membership/withdrawal.ts");

    for (const 문장 of ["되돌릴 수 없습니다", "법령에 따라 보관됩니다", "지금 만들고 있는 작업이 있습니다"]) {
      expect(화면.includes(문장), `${문장} 가 withdrawal.ts 에 없다`).toBe(true);
      expect(계정문서.includes(문장), `${문장} 가 문서에 없다`).toBe(true);
    }
  });
});
