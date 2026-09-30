import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **기획 요청 실패를 삼키지 않는다**(최종 전체 리뷰 반영, 설계 §3.2).
 *
 * 크레딧 0 회원의 카드뉴스 기획(`POST /api/sns/projects/[id]/plan`)이 이제
 * 예약에서 거절될 수 있다(`credits_required`·`ai_paused`). 예전에는
 * `planned.json()` 의 값을 버리고 바로 다음 화면으로 넘어가서, 실패해도
 * 사용자는 원인을 몰랐다.
 *
 * 렌더링까지 띄우지 않고 **글**을 본다 — `useRouter`·`credit-policy-provider`
 * 를 다 갖추는 비용보다, 이 길목이 실제로 있는지를 세는 편이 싸고 정확하다
 * (`apps/web/app/_components/__tests__/read-only-work.test.ts` 와 같은 방식).
 */
describe("카드뉴스 만들기 — 기획 실패를 보여 준다", () => {
  const source = readFileSync(join(__dirname, "..", "new-client.tsx"), "utf8");

  it("기획 응답의 ok 를 확인하고 실패하면 던진다", () => {
    expect(source).toContain("const plannedBody = await planned.json()");
    expect(source).toContain(
      'if (!planned.ok || !plannedBody.ok) throw new Error(plannedBody.message ?? "기획을 시작하지 못했습니다.");',
    );
  });

  it("이 확인이 다음 화면 이동보다 앞에 있다", () => {
    const guard = source.indexOf("if (!planned.ok || !plannedBody.ok)");
    const push = source.indexOf("router.push(`/sns/${payload.project.id}`)");
    expect(guard).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(push);
  });

  it("던진 오류는 화면의 message 로 잡힌다 — catch 가 여전히 감싸고 있다", () => {
    const guard = source.indexOf("if (!planned.ok || !plannedBody.ok)");
    const catchAt = source.indexOf("} catch (error) {", guard);
    expect(catchAt).toBeGreaterThan(guard);
    const body = source.slice(catchAt, catchAt + 200);
    expect(body).toContain("setMessage(error instanceof Error ? error.message");
  });
});
