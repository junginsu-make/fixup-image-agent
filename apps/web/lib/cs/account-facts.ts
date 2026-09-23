import type { UsageSummary } from "../membership/types";
import type { AccountTopic } from "./topics";

/**
 * **내 계정 사실을 사람 말로 옮긴다.**
 *
 * ── 왜 화면 밖 순수 모듈인가 ───────────────────────────────
 *
 * 「남은 날짜가 며칠인가」는 판단이다. 라우트나 프롬프트 안에 두면 값으로 못
 * 잰다 — 이 저장소가 계속 지켜 온 방식이다.
 *
 * ── LLM 에게 숫자를 세게 하지 않는다 ───────────────────────
 *
 * 「9월 30일까지면 며칠 남았나」를 모델에게 시키면 틀린다. **여기서 세고**,
 * 모델은 받은 문장을 말투만 다듬는다.
 *
 * ── 모르는 것은 모른다고 적는다 ────────────────────────────
 *
 * 장부가 없는 계정, 아직 구독하지 않은 계정이 있다. 그때 0 을 적으면
 * 「0장 남았다」가 되어 **없는 사실**을 말하게 된다.
 */

export interface RecentFailure {
  /** 무엇을 하다 실패했나. 사람이 아는 말로 이미 옮겨져 있다. */
  what: string;
  /** 언제. ISO 문자열. */
  at: string;
  /** 까닭. 모르면 빈 문자열. */
  reason: string;
}

export interface AccountFacts {
  usage?: UsageSummary | null;
  /** 지금 쓰는 플랜 이름. 없으면 구독 중이 아니다. */
  planName?: string | null;
  planStatus?: string | null;
  failures?: RecentFailure[];
}

/** 오늘을 받는다. 시계를 밖에서 주어야 시험이 흔들리지 않는다. */
export interface FactOptions {
  now?: Date;
}

const 날 = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * **며칠 남았나.**
 *
 * 날짜만 센다 — 시각까지 세면 「0일 남음」과 「오늘까지」가 갈린다. 자정을
 * 기준으로 세어 사람이 달력을 보고 세는 것과 같게 한다.
 */
export function daysLeft(expiresAt: string | null | undefined, now: Date): number | null {
  const 끝 = 날(expiresAt);
  if (!끝) return null;
  const 하루 = 24 * 60 * 60 * 1000;
  const 자정 = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((자정(끝) - 자정(now)) / 하루);
}

const 날짜글 = (value: string | null | undefined): string => {
  const d = 날(value);
  if (!d) return "";
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

function 남은날말(expiresAt: string | null | undefined, now: Date): string {
  const 남음 = daysLeft(expiresAt, now);
  if (남음 === null) return "";
  if (남음 < 0) return `${날짜글(expiresAt)}에 이미 지났습니다`;
  if (남음 === 0) return `${날짜글(expiresAt)}까지, 오늘이 마지막 날입니다`;
  return `${날짜글(expiresAt)}까지, ${남음}일 남았습니다`;
}

function 잔액말(usage: UsageSummary | null | undefined, now: Date): string {
  if (!usage) return "크레딧 잔액을 읽지 못했습니다.";
  if (usage.unlimited) return "이 계정은 크레딧이 무제한입니다.";

  const 줄: string[] = [`남은 크레딧은 ${usage.remaining}장입니다.`];
  if (usage.reserved > 0) 줄.push(`그중 ${usage.reserved}장은 지금 만들고 있는 작업에 잡혀 있습니다.`);

  const 만료 = 남은날말(usage.subscription?.expiresAt, now);
  if (만료 && (usage.subscription?.units ?? 0) > 0) {
    줄.push(`구독 크레딧 ${usage.subscription!.units}장은 ${만료}.`);
  }
  const 구매만료 = 남은날말(usage.purchased?.expiresAt, now);
  if (구매만료 && (usage.purchased?.units ?? 0) > 0) {
    줄.push(`구매 크레딧 ${usage.purchased!.units}장은 ${구매만료}.`);
  }
  return 줄.join(" ");
}

function 플랜말(facts: AccountFacts, now: Date): string {
  if (!facts.planName) {
    return "지금 구독 중인 플랜이 없습니다.";
  }

  const 줄: string[] = [`지금 ${facts.planName} 플랜을 쓰고 있습니다.`];
  if (facts.planStatus && facts.planStatus !== "active") {
    줄.push(`상태는 「${facts.planStatus}」입니다.`);
  }

  /*
    **남은 날짜는 구독 크레딧의 만료일로 센다.** 이 시스템에서 구독은 달마다
    크레딧을 주는 형태이고, 그 크레딧이 살아 있는 동안이 「남은 기간」이다.
  */
  const 만료 = 남은날말(facts.usage?.subscription?.expiresAt, now);
  줄.push(만료 ? `이번 구독분은 ${만료}.` : "이번 구독분의 만료일을 읽지 못했습니다.");
  return 줄.join(" ");
}

function 사용말(usage: UsageSummary | null | undefined): string {
  if (!usage) return "이번 달 사용량을 읽지 못했습니다.";
  const 줄 = [`이번 달에 ${usage.used}장을 썼습니다.`];
  if (usage.periodEnd) 줄.push(`이번 기간은 ${날짜글(usage.periodEnd)}에 바뀝니다.`);
  return 줄.join(" ");
}

/**
 * **실패는 목록으로 준다.**
 *
 * 「왜 안 만들어졌어요?」에 답하려면 무엇이 언제 왜 실패했는지가 있어야
 * 한다. 없으면 **없다고 말한다** — 「모르겠습니다」와 다르다.
 */
function 실패말(failures: RecentFailure[] | undefined): string {
  if (!failures) return "최근 작업 기록을 읽지 못했습니다.";
  if (failures.length === 0) return "최근에 실패한 작업이 없습니다.";

  const 줄 = failures.map((f) => {
    const 언제 = 날짜글(f.at);
    const 까닭 = f.reason ? ` 까닭: ${f.reason}` : " 까닭이 기록돼 있지 않습니다.";
    return `${언제} ${f.what}.${까닭}`;
  });
  return `최근 실패한 작업 ${failures.length}건입니다. ${줄.join(" ")}`;
}

/**
 * 고른 갈래마다 한 줄씩.
 *
 * **여기서 나온 문장만 모델에게 준다.** 모델은 이 문장을 말투만 다듬어
 * 옮긴다 — 숫자를 새로 세거나 없는 사실을 보태지 않게 한다.
 */
export function describeAccount(
  topics: readonly AccountTopic[],
  facts: AccountFacts,
  options: FactOptions = {},
): string[] {
  const now = options.now ?? new Date();
  return topics.map((topic) => {
    switch (topic) {
      case "balance": return 잔액말(facts.usage, now);
      case "plan": return 플랜말(facts, now);
      case "usage": return 사용말(facts.usage);
      case "failures": return 실패말(facts.failures);
    }
  });
}
