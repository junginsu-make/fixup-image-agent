import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * 설명서의 **위층** — 읽기 전에 알아야 할 것.
 *
 * ── 왜 이 부품이 생겼나 ──────────────────────────────────────
 *
 * 설명서가 화면을 처음부터 훑는 구조였다. 카드뉴스가 367줄인데, **이 도구가
 * 무엇을 하는지 알려면 끝까지 읽어야 했다.** 도구를 고르러 온 사람과 쓰는 법을
 * 찾으러 온 사람이 같은 글을 읽고 있었다.
 *
 * 두 층으로 나눈다. 위층은 「무엇을 하는 도구인가」, 아래층은 「어떻게 쓰는가」다.
 * 위층은 늘 펼쳐져 있고 아래층은 접혀 있다.
 */

/**
 * 이 도구가 무엇을 하는가 — 한 화면에 들어가는 요약.
 *
 * 스크롤을 요구하지 않는다. 여기까지 읽고 「내가 찾던 도구가 아니다」를 알 수
 * 있어야, 나머지 300줄을 안 읽고 돌아갈 수 있다.
 */
export function Summary({
  what,
  points,
  when,
}: {
  /** 한 문장. 이 도구가 무엇을 하는가. */
  what: string;
  /** 특징. 셋에서 넷이 알맞다 — 다섯이 넘으면 요약이 아니다. */
  points: Array<{ title: string; body: string }>;
  /** 언제 고르나. 상황으로 적는다 — 기능 이름으로 적으면 요약이 두 번 된다. */
  when?: string[];
}) {
  return (
    <section className="grid gap-4 rounded-2xl border-2 border-primary/25 bg-primary-soft/25 p-5">
      <p className="text-base font-bold leading-7">{what}</p>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {points.map((point) => (
          <li key={point.title} className="rounded-xl border bg-card p-3.5">
            <strong className="block text-sm font-extrabold text-primary">{point.title}</strong>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">{point.body}</span>
          </li>
        ))}
      </ul>

      {when?.length ? (
        <div>
          <h3 className="text-sm font-extrabold">이럴 때 고르세요</h3>
          <ul className="mt-1.5 grid gap-1 text-sm leading-6 text-muted-foreground">
            {when.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * 설명서의 **아래층** — 접어 두는 상세.
 *
 * `<details>` 를 쓴다. 자바스크립트 없이 열리고 닫히며, **브라우저의 페이지 내
 * 찾기가 닫힌 내용도 찾아 준다**(Chrome·Edge 의 `hidden=until-found` 가 아니어도
 * Ctrl+F 로 찾으면 열린다). 직접 만든 토글은 그 두 가지를 다 잃는다.
 *
 * 기본은 닫힘이다. 열어 두면 접은 뜻이 없다.
 */
export function Details({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group grid gap-3 border-t pt-8 [&[open]]:gap-5">
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border bg-card text-muted-foreground transition-transform group-open:rotate-180">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-extrabold tracking-[-0.01em]">{title}</span>
          {hint ? <span className="mt-1 block text-sm text-muted-foreground">{hint}</span> : null}
        </span>
      </summary>
      <div className="grid gap-3">{children}</div>
    </details>
  );
}
