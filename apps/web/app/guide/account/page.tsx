import type { Metadata } from "next";
import { ChoiceTable, Flow, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts, Mock, MockButtons, MockField, MockNote } from "../_components/mockup";
import { CS_INQUIRY_HINT } from "../_components/contact";

/**
 * **계정 · 플랜 · 탈퇴**(2026-09-28, 설계 §9 2단계 「결제 · 환불 · 구독 해지」와
 * 「회원 탈퇴」).
 *
 * ── 왜 이 문서가 필요한가 ──────────────────────────────────
 *
 * 설계 §2.1 이 적어 둔 그대로다 — 이 물음들에 **문서가 아예 없었다.**
 *
 *     결제가 안 돼요            문서 없음
 *     환불 / 구독 해지          문서 없음
 *     회원 탈퇴                 기능 자체가 없었다(2026-09-23 에 만들었다)
 *
 * 도우미는 없는 글을 답하지 않는다(설계 §6.3). 그래서 **글이 없으면 봇도
 * 못 답한다.** 이 문서가 그 자리를 채운다.
 *
 * ── 지어내지 않는다 ────────────────────────────────────────
 *
 * 이 저장소에는 **결제 연동이 없다.** 토스·아임포트·Stripe 같은 것을 찾아봤고
 * 하나도 없다(2026-09-28 확인). 플랜과 크레딧은 운영자가 직접 넣는다
 * (`credit_admin_subscription_many` · `credit_admin_grant_many`).
 *
 * 그러면 「결제 방법」을 쓸 수 없다. **없는 것을 있는 것처럼 쓰면 그게 가장
 * 나쁘다** — 사용자가 없는 화면을 찾아다닌다. 그래서 있는 그대로 쓴다.
 *
 * **환불 기준도 여기 안 적는다.** 코드에 없고 약관도 초안이다(설계 §14).
 * 기준을 지어내면 그것이 공개된 약속이 된다. 문의로 안내한다고만 적는다.
 */
export const metadata: Metadata = { title: "계정과 플랜 · 사용 설명서" };

export default function AccountGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="계정과 플랜"
        title="내 정보 · 크레딧 · 구독 · 탈퇴"
        lead="계정 화면에서 내 정보를 고치고, 이번 달에 무엇을 얼마나 썼는지 보고, 필요하면 탈퇴할 수 있습니다. 플랜과 크레딧은 지금은 운영자가 직접 넣어 드립니다. 결제 화면은 아직 없습니다."
      />

      <Summary
        what="계정 화면에서 할 수 있는 일과, 플랜·구독·탈퇴가 어떻게 되는지 정리했습니다."
        points={[
          {
            title: "결제 화면은 아직 없습니다",
            body: "플랜과 크레딧은 운영자가 직접 넣어 드립니다. 필요하면 문의해 주세요.",
          },
          {
            title: "쓴 내역이 한 줄씩 남습니다",
            body: "무엇에 몇 크레딧이 나갔는지, 실패한 것은 차감됐는지 모두 볼 수 있습니다.",
          },
          {
            title: "탈퇴는 계정 화면 맨 아래에 있습니다",
            body: "되돌릴 수 없습니다. 확인을 위해 이메일을 그대로 입력해야 합니다.",
          },
          {
            title: "해지와 환불은 문의로 받습니다",
            body: "스스로 해지하는 버튼은 아직 없습니다.",
          },
        ]}
        when={[
          "이름이나 추천코드를 고치고 싶을 때",
          "이번 달에 얼마나 썼는지 보고 싶을 때",
          "플랜을 바꾸거나 해지하고 싶을 때",
          "더 이상 쓰지 않아 계정을 닫고 싶을 때",
        ]}
      />

      <Section title="계정 화면에 무엇이 있나" hint="왼쪽 사이드바 아래 「계정」입니다.">
        <Mock title="계정">
          <MockField label="이름" value="홍길동" />
          <MockField label="추천코드" value="가입할 때 적은 코드" />
          <MockNote>남은 크레딧과 이번 달 사용량이 위쪽에 함께 보입니다.</MockNote>
          <MockButtons items={[{ label: "비밀번호 바꾸기", variant: "quiet" }, { label: "저장" }]} />
        </Mock>

        <ChoiceTable
          head={["칸", "무엇을 하나", "바로 반영되나"]}
          rows={[
            ["이름 · 추천코드", "적어 두면 관리자 화면에서도 같이 보입니다", "저장하면 바로"],
            ["비밀번호", "메일로 받은 링크에서 새로 정합니다", "메일을 받은 뒤"],
            ["남은 크레딧", "이번 달에 더 만들 수 있는 양입니다", "만들 때마다 바로"],
            ["사용 기록", "무엇에 몇 크레딧이 나갔는지 한 줄씩", "만들 때마다 바로"],
            ["회원 탈퇴", "계정을 닫습니다. 맨 아래에 따로 있습니다", "누른 즉시"],
          ]}
        />
      </Section>

      <Section title="플랜과 크레딧은 어떻게 받나" hint="지금은 운영자가 넣어 드립니다.">
        <Callouts
          items={[
            {
              title: "결제 화면이 아직 없습니다",
              body: (
                <>
                  카드로 직접 결제하는 화면은 준비 중입니다. 지금은{" "}
                  <strong className="text-foreground">운영자가 플랜을 넣어 드리는 방식</strong>입니다. 어떤 플랜이
                  필요한지 알려 주시면 맞춰 드립니다.
                </>
              ),
            },
            {
              title: "넣어 드리면 바로 쓸 수 있습니다",
              body: (
                <>
                  플랜이 들어오면 그 달 몫의 크레딧이 함께 들어옵니다. 새로 로그인할 필요 없이 화면을 다시 열면
                  남은 크레딧이 바뀐 것을 볼 수 있습니다.
                </>
              ),
            },
          ]}
        />

        <Flow
          nodes={[
            { label: "문의", sub: "필요한 플랜을 알려 주세요", human: true },
            { label: "운영자 확인", sub: "플랜을 넣습니다" },
            { label: "크레딧 들어옴", sub: "그 달 몫" },
            { label: "만들기", sub: "바로 쓸 수 있습니다" },
          ]}
        />

        <p className="text-sm leading-7 text-muted-foreground">
          크레딧이 언제까지 쓸 수 있는지, 무엇을 만들면 몇 크레딧이 나가는지는{" "}
          <strong className="text-foreground">크레딧과 모델</strong> 문서에 적어 두었습니다. 구독으로 받은 크레딧은{" "}
          <strong className="text-foreground">이월되지 않습니다.</strong>
        </p>
      </Section>

      <Section title="구독을 바꾸거나 해지하려면" hint="문의로 받습니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">스스로 해지하는 버튼은 아직 없습니다.</strong> 해지하고 싶으시면
          문의해 주세요. 운영자가 해지 처리해 드립니다. 플랜을 올리거나 내리는 것도 같습니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">환불 기준은 문의로 안내해 드립니다.</strong> 결제 방식과 함께 정리되는
          중이라 이 문서에 미리 적어 두지 않았습니다. 잘못 적어 두는 것보다 직접 답해 드리는 편이 정확합니다.
        </p>
        <p className="text-sm leading-6 text-subtle-foreground">{CS_INQUIRY_HINT}</p>
      </Section>

      <Section title="회원 탈퇴" hint="계정 화면 맨 아래, 테두리가 다른 카드입니다.">
        <Mock title="계정 · 회원 탈퇴">
          <MockNote>탈퇴하면 로그인할 수 없게 되고 만든 작업물과 라이브러리가 모두 사라집니다. 되돌릴 수 없습니다.</MockNote>
          <MockButtons items={[{ label: "탈퇴 절차 시작", variant: "quiet" }]} />
        </Mock>

        <ol className="grid gap-2 text-sm leading-7 text-muted-foreground">
          <li>
            1. 계정 화면 맨 아래 <strong className="text-foreground">「탈퇴 절차 시작」</strong>을 누릅니다
          </li>
          <li>
            2. 확인을 위해 <strong className="text-foreground">내 이메일을 그대로 입력</strong>합니다
          </li>
          <li>
            3. <strong className="text-foreground">「탈퇴하기」</strong>를 누르면 그 자리에서 처리되고 로그아웃됩니다
          </li>
        </ol>

        <Callouts
          items={[
            {
              title: "무엇이 사라지나",
              body: (
                <>
                  로그인, 만든 작업물, 라이브러리에 올려 둔 참고 이미지와 캐릭터,{" "}
                  <strong className="text-foreground">남은 크레딧</strong>이 모두 사라집니다. 남은 크레딧이 있으면
                  탈퇴 화면이 그 수를 적어 줍니다.
                </>
              ),
            },
            {
              title: "무엇이 남나",
              body: (
                <>
                  크레딧을 받거나 쓴 기록이 있으면 <strong className="text-foreground">결제·크레딧 기록은 법령에 따라
                  보관됩니다.</strong> 그 경우 계정은 지워지는 대신 닫힙니다. 기록이 전혀 없으면 계정이 통째로
                  지워집니다. 어느 쪽이었는지는 끝난 뒤 화면이 알려 줍니다.
                </>
              ),
            },
          ]}
        />

        <ChoiceTable
          head={["이렇게 나오면", "뜻", "무엇을 하면 되나"]}
          rows={[
            [
              "지금 만들고 있는 작업이 있습니다",
              "크레딧이 잡혀 있습니다",
              "만들기가 끝난 뒤에 다시 시도해 주세요",
            ],
            [
              "계정이 모두 삭제되었습니다",
              "기록이 없어 통째로 지웠습니다",
              "같은 이메일로 새로 가입할 수 있습니다",
            ],
            [
              "기록은 법령에 따라 보관됩니다",
              "돈 기록이 있어 계정을 닫았습니다",
              "다시 쓰시려면 문의해 주세요",
            ],
          ]}
        />

        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">탈퇴한 계정으로는 로그인할 수 없습니다.</strong> 닫힌 계정을 다시 열
          방법은 화면에 없습니다. 실수로 탈퇴하셨다면 문의해 주세요.
        </p>
      </Section>

      <Details title="왜 탈퇴에 이메일을 입력하게 하나" hint="되돌릴 수 없는 일이라서입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          단추 하나로 끝나면 잘못 누릅니다. 만든 작업물이 모두 사라지고 되돌릴 방법이 없기 때문에,{" "}
          <strong className="text-foreground">한 번 더 생각할 자리</strong>를 둡니다. 관리자가 회원을 지울 때도 같은
          문턱을 지납니다.
        </p>
      </Details>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "결제 화면을 찾을 수 없습니다",
              a: "아직 없습니다. 필요한 플랜을 문의해 주시면 운영자가 넣어 드립니다.",
            },
            {
              q: "구독을 해지하고 싶은데 버튼이 없습니다",
              a: "스스로 해지하는 버튼은 아직 없습니다. 문의해 주시면 처리해 드립니다.",
            },
            {
              q: "탈퇴가 안 됩니다",
              a: "만들고 있는 작업이 있으면 막힙니다. 끝난 뒤에 다시 시도해 주세요. 확인 칸에 이메일을 정확히 입력했는지도 확인해 주세요.",
            },
            {
              q: "탈퇴했는데 기록이 남았다고 나옵니다",
              a: "크레딧을 받거나 쓴 기록이 있으면 그 기록은 법령에 따라 보관됩니다. 로그인은 되지 않습니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/account" toolHref="/settings" toolLabel="계정 열기" />
    </>
  );
}
