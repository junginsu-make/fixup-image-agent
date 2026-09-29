import type { Metadata } from "next";
import Link from "next/link";
import { IMAGE_CREDIT_POLICY } from "@fixup/shared";
import { ChoiceTable, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts } from "../_components/mockup";
import { CS_INQUIRY_HINT } from "../_components/contact";
import { hourlyLimitFor } from "../../../lib/membership/hourly-limit";

/**
 * **막혔을 때**(2026-09-28, 설계 §9 2단계 「오류 대응」).
 *
 * ── 이 문서의 일 ───────────────────────────────────────────
 *
 * 사용자는 **화면에 나온 그 말**을 들고 온다. 「크레딧이 모자랍니다」가 떴다고
 * 말한다. 그래서 이 문서는 개념이 아니라 **문장으로 찾게** 만든다 — 왼쪽 칸이
 * 화면에 뜬 말 그대로다.
 *
 * ── 문장을 손으로 옮기지 않는다 ────────────────────────────
 *
 * 화면에 뜨는 말은 `lib/membership/api.ts` 의 표에 있다. 그 말이 바뀌면 이
 * 문서도 낡는다. 그래서 시험이 **표의 문장이 이 문서에 있는지** 본다
 * (`app/guide/__tests__/trouble-messages.test.ts`).
 *
 * 문장을 코드에서 직접 가져다 그리지는 않는다 — 그 표는 서버 전용 파일에 있고
 * (`server-only` 를 끌고 온다) 화면에 주려면 문서가 서버 컴포넌트여야 한다.
 * **시험으로 잇는 것이 더 단순하다.**
 */
export const metadata: Metadata = { title: "막혔을 때 · 사용 설명서" };

export default function TroubleGuidePage() {
  const 보통 = IMAGE_CREDIT_POLICY.normalUnits;
  /** 서버가 막을 때 쓰는 그 함수로 센다. 손으로 적으면 한도를 바꿀 때 문서만 남는다. */
  const 기획한도 = hourlyLimitFor("pdp_analyze");

  return (
    <>
      <GuideHeader
        kicker="막혔을 때"
        title="화면에 나온 그 말을 찾아보세요"
        lead="만들기가 거절되거나 화면에 낯선 말이 뜰 때, 그것이 무슨 뜻이고 무엇을 하면 되는지 모아 두었습니다. 대부분은 잠시 후 다시 하면 풀리고, 크레딧이 잘못 나간 것처럼 보이는 경우는 실제로는 나가지 않은 것입니다."
      />

      <Summary
        what="화면에 뜬 문장으로 찾아 무엇을 하면 되는지 보는 문서입니다."
        points={[
          {
            title: "실패한 것은 차감되지 않습니다",
            body: "잔액이 줄어 보이는 것은 잡아 둔 것입니다. 정산이 끝나면 돌아옵니다.",
          },
          {
            title: "「잠시 후 다시」는 한 시간 안에 풀립니다",
            body: "시간당으로 세는 제한입니다. 가장 먼저 보낸 요청이 한 시간을 넘기면 한 번씩 풀립니다.",
          },
          {
            title: "한 번에 하나씩 만듭니다",
            body: "앞의 만들기가 끝나지 않으면 다음 것이 거절됩니다.",
          },
          {
            title: "모르겠으면 물어보세요",
            body: "「무엇이든 물어보세요」 도우미가 답합니다. 못 답하면 「문의 남기기」를 눌러 담당자에게 넘깁니다. 대화는 24시간 동안만 남습니다.",
          },
        ]}
        when={[
          "만들기 버튼을 눌렀는데 거절될 때",
          "실패했는데 크레딧이 나간 것 같을 때",
          "로그인이 안 되거나 화면이 안 열릴 때",
        ]}
      />

      <Section title="크레딧 · 한도" hint="만들기가 거절되는 가장 흔한 까닭입니다.">
        <ChoiceTable
          head={["화면에 이렇게 나오면", "뜻", "무엇을 하면 되나"]}
          rows={[
            [
              "크레딧이 모자랍니다",
              "남은 크레딧보다 만들려는 장 수가 많습니다",
              "장 수를 줄여 나눠 만들거나, 플랜을 문의해 주세요",
            ],
            [
              "이번 달 이미지 생성 한도를 모두 사용했습니다",
              "옛 기준 계정의 월 한도를 다 썼습니다",
              "달이 바뀌면 새로 채워집니다. 급하면 문의해 주세요",
            ],
            [
              "팀의 이번 달 생성 한도를 모두 사용했습니다",
              "내 한도가 아니라 팀 한도에 걸렸습니다",
              "팀장에게 말해 주세요. 내 한도를 늘려도 풀리지 않습니다",
            ],
            [
              "이미 생성 중인 요청이 있습니다",
              "크레딧이 드는 만들기는 한 번에 하나씩 돕니다",
              "앞의 것이 끝나면 풀립니다. 잠시 기다려 주세요",
            ],
            [
              "분석 요청이 너무 많습니다",
              `시간당 제한에 걸렸습니다. 분석은 무료지만 횟수 제한이 있습니다. 상세페이지 기획은 시간당 ${기획한도}번이고, 다시 기획하기도 한 번으로 셉니다`,
              "가장 먼저 보낸 요청이 한 시간을 넘기면 한 번씩 풀립니다",
            ],
            [
              "크레딧 계정 전환이 준비 중입니다",
              "계정이 아직 크레딧 장부로 옮겨지지 않았습니다",
              "운영자에게 문의해 주세요. 직접 풀 수 없습니다",
            ],
            [
              "요청을 처리할 수 없습니다",
              "위에 없는 까닭으로 거절됐습니다",
              "잠시 후 다시 해 보시고, 계속되면 문의해 주세요",
            ],
          ]}
        />
      </Section>

      <Section title="실패했는데 크레딧이 나갔나요" hint="가장 많이 묻는 것입니다.">
        <Callouts
          items={[
            {
              title: "성공한 장만 차감합니다",
              body: (
                <>
                  만들기를 누르면 필요한 만큼 잡아 둡니다. 그래서{" "}
                  <strong className="text-foreground">잔액이 먼저 줄어 보입니다.</strong> 끝나면 실제로 나온 장만
                  차감하고 나머지는 돌아옵니다. 다섯 장을 시켜 셋만 나왔다면 셋만 나갑니다.
                </>
              ),
            },
          ]}
        />
        <p className="text-sm leading-7 text-muted-foreground">
          확인하는 자리는 <strong className="text-foreground">계정 화면의 사용 기록</strong>입니다. 줄마다 「실패 ·
          차감 없음」처럼 결과가 적혀 있습니다. 어떻게 읽는지는{" "}
          <Link href="/guide/credits" className="font-bold text-primary underline underline-offset-4">
            크레딧과 모델
          </Link>{" "}
          문서에 표로 적어 두었습니다.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          한 장을 다시 만들면 그 장은 새 결과물이라 {보통}크레딧이 듭니다. 시스템이 안에서 스스로 다시 시도한 것은
          차감하지 않습니다.
        </p>
      </Section>

      <Section title="로그인 · 가입" hint="계정 상태 때문에 막히는 경우입니다.">
        <ChoiceTable
          head={["화면에 이렇게 나오면", "뜻", "무엇을 하면 되나"]}
          rows={[
            ["로그인이 필요합니다", "로그인이 풀렸습니다", "다시 로그인해 주세요"],
            ["이메일 인증을 완료해 주세요", "가입 메일의 링크를 아직 누르지 않았습니다", "메일함을 확인해 주세요. 스팸함도 함께 보세요"],
            ["관리자 승인 대기 중입니다", "가입은 됐고 승인을 기다리는 중입니다", "승인되면 메일이 갑니다"],
            ["이용이 정지된 계정입니다", "운영자가 이용을 멈춰 두었습니다", "문의해 주세요"],
            ["탈퇴한 계정입니다", "탈퇴 처리된 계정입니다", "다시 쓰시려면 문의해 주세요"],
          ]}
        />
      </Section>

      <Section title="올린 파일이 거절될 때" hint="상한은 도구마다 다릅니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          올릴 때 <strong className="text-foreground">「이미지 용량이 너무 큽니다」</strong>가 뜨면 대개 같은 자리에
          몇 MB 이하로 올리라는 상한이 함께 적혀 있습니다. 상한이 적혀 있지 않으면 사진의 긴 변을 2000픽셀 정도로
          줄여 올려 보세요. 대체로 통과합니다. 광고 규격으로 내보낼 때 뜨는{" "}
          <strong className="text-foreground">「용량이 넘칩니다」</strong>는 포털이 정한 규격의 상한을 넘었다는
          뜻입니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">리디자인은 이미지와 PDF를, 나머지 도구는 이미지만 받습니다.</strong>{" "}
          압축 파일은 올릴 수 없습니다. 캐릭터는 인물이나 사물 사진을 받습니다.
        </p>
      </Section>

      <Section title="같은 요청을 다시 눌렀을 때" hint="같은 요청은 한 번만 처리됩니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          같은 만들기를 두 번 보내면 두 번 차감되지 않습니다. 대신 지금 그 요청이 어떤 상태인지 알려 줍니다.
        </p>
        <ChoiceTable
          head={["화면에 이렇게 나오면", "뜻", "무엇을 하면 되나"]}
          rows={[
            [
              "같은 요청이 아직 처리 중입니다",
              "앞의 요청이 돌고 있습니다",
              "잠시 기다리면 결과가 나타납니다",
            ],
            [
              "이 요청은 이미 끝났습니다",
              "만들어졌고 값도 나갔습니다",
              "화면에 안 보이면 라이브러리를 보세요. 다시 만들면 한 번 더 나갑니다",
            ],
            [
              "이 요청은 실패로 끝났습니다",
              "실패로 정산됐습니다. 차감은 없습니다",
              "새로 만들어 주세요",
            ],
            [
              "같은 요청이 이미 접수돼 있습니다",
              "앞의 요청이 어떤 상태인지 확인하지 못했습니다",
              "잠시 뒤에도 결과가 안 보이면 새로 만들어 주세요",
            ],
          ]}
        />
      </Section>

      <Section title="만드는 중에 멈춘 것 같을 때">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["기획이 몇 분째 돌고 있다", "그대로 기다려 주세요", "상세페이지 기획은 4분을 넘길 수 있습니다. 화면이 지금 어느 단계인지 알려 줍니다"],
            ["화면을 닫았다 다시 열었다", "라이브러리에서 찾아보세요", "만들어진 결과물은 서버에 남습니다"],
            ["몇 장만 안 나왔다", "안 나온 장만 다시 만드세요", "나온 장만 차감되었습니다"],

          ]}
        />
      </Section>

      <Details title="왜 무료인 분석에도 횟수 제한이 있나" hint="크레딧은 안 드는데 값은 듭니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          사진을 읽고 구성안을 짜는 일에는 크레딧이 들지 않지만,{" "}
          <strong className="text-foreground">글 모델을 부르는 값은 듭니다.</strong> 크레딧으로 세지 않는 대신 시간당
          횟수로 막습니다. 상세페이지 기획은 시간당 {기획한도}번까지이고, 구성안을 다시 기획하는 것도 한 번으로
          셉니다. 가장 먼저 보낸 요청이 한 시간을 넘기면 그만큼 한 번씩 풀립니다.
        </p>
      </Details>

      <Section title="그래도 모르겠으면">
        <p className="text-sm leading-7 text-muted-foreground">{CS_INQUIRY_HINT}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          도우미는 스스로 담당자를 부르지 않습니다.{" "}
          <strong className="text-foreground">「문의 남기기」를 눌러야 담당자에게 넘어갑니다.</strong> 문의할 때{" "}
          <strong className="text-foreground">화면에 뜬 말을 그대로</strong> 적어 주시면 훨씬 빨리 확인됩니다. 그때까지의
          대화도 함께 전달되므로 다시 설명하지 않아도 됩니다. 대화는 24시간 동안만 남고, 브라우저를 닫거나 로그아웃하면
          지워집니다.
        </p>
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "잠시 후 다시 하라는데 얼마나 기다려야 하나요",
              a: `시간당으로 셉니다. 가장 먼저 보낸 요청이 한 시간을 넘기면 한 번씩 풀리므로, 길어도 한 시간입니다. 상세페이지 기획은 시간당 ${기획한도}번까지입니다.`,
            },
            {
              q: "크레딧이 있는데 모자란다고 나옵니다",
              a: "만들려는 장 수가 남은 양보다 많을 때 나옵니다. 장 수를 줄여 나눠 만들어 보세요. 잡아 둔 크레딧이 있으면 그만큼 빠져 보이기도 합니다.",
            },
            {
              q: "결제해서 크레딧을 채우고 싶습니다",
              a: "결제 화면은 아직 없습니다. 필요한 플랜을 문의해 주시면 운영자가 넣어 드립니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/trouble" />
    </>
  );
}
