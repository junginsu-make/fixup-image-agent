import { IMAGE_CREDIT_POLICY, WORK_CREDIT_PRESETS } from "@fixup/shared";
import { ChoiceTable, Flow, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts, Mock, MockNote } from "../_components/mockup";

/**
 * **크레딧 설명서 · 장부 판**(2026-09-28, 설계 §9 2단계).
 *
 * ── 왜 따로 있나 ───────────────────────────────────────────
 *
 * `page.tsx` 가 두 갈래로 갈린다. 옛 회원은 원가에서 차감하는 판을 보고, 장부로
 * 옮긴 회원과 새로 오는 사람은 **한 장에 한 크레딧** 판을 본다.
 *
 * 그 장부 쪽이 **네 줄뿐이었다.** 2026-09-28 에 재 보니 그려진 글이 305자로,
 * 열한 쪽 중 유일하게 얇았다. 도우미(CS 응답 AI)가 「크레딧은 어떻게
 * 차감되나요?」에 이 쪽을 못 집고 팀·처음 오셨다면 쪽을 집었다 — **찾을 글이
 * 없었기 때문이다.**
 *
 * 그런데 크레딧은 **가장 많이 묻는 것이고 틀리면 돈 문제가 된다.** 그래서 이
 * 판을 제대로 쓴다. 파일을 나눈 것은 한 파일이 두 판을 다 들면 길어지기
 * 때문이다.
 *
 * ── 숫자를 손으로 적지 않는다 ──────────────────────────────
 *
 * 이 저장소가 한 번 겪었다 — 설명서만 옛 셈법으로 남아 실제와 어긋났고,
 * 「6장이면 24장」이라는 예가 실제로는 30장이었다(2026-09-21).
 *
 * 그래서 **정책을 그대로 읽어 온다**(`IMAGE_CREDIT_POLICY`). 한 장에 몇
 * 크레딧인지, 큰 그림의 경계가 몇 픽셀인지 여기 적지 않는다.
 */

/** 600만 픽셀을 사람이 읽는 말로. 정책이 바뀌면 이 말도 함께 바뀐다. */
function 큰그림경계(): string {
  const 만 = IMAGE_CREDIT_POLICY.largePixelThreshold / 10_000;
  return `${만.toLocaleString("ko-KR")}만 픽셀`;
}

/** 그 경계가 대략 어느 정도 크기인가. 정사각으로 환산해 감을 준다. */
function 경계의한변(): number {
  return Math.round(Math.sqrt(IMAGE_CREDIT_POLICY.largePixelThreshold) / 100) * 100;
}

export function LedgerCreditsGuide({ wallet }: { wallet?: React.ReactNode }) {
  const 보통 = IMAGE_CREDIT_POLICY.normalUnits;
  const 큰것 = IMAGE_CREDIT_POLICY.largeUnits;

  return (
    <>
      <GuideHeader
        kicker="크레딧과 모델"
        title={`이미지 ${보통}장 = ${보통}크레딧`}
        lead="이 시스템에서 크레딧이 드는 자리는 하나뿐입니다. 그림을 만들 때입니다. 읽고, 분석하고, 구성안을 짜고, 원고를 쓰고, 글자를 얹는 데는 크레딧이 들지 않습니다. 어디까지가 무료인지 알아 두면 마음 편히 여러 번 고칠 수 있습니다."
      />

      {wallet}

      <Summary
        what={`완성된 그림 한 장에 ${보통}크레딧입니다. 모델을 무엇으로 고르든 같습니다.`}
        points={[
          {
            title: "모델을 골라도 차감은 같습니다",
            body: "비싼 모델을 써도 더 깎이지 않습니다. 글자가 많으면 정확한 쪽을 고르세요.",
          },
          {
            title: "성공한 장만 셉니다",
            body: "실패한 장은 차감하지 않습니다. 잡아 두었던 크레딧은 그 자리에서 돌아옵니다.",
          },
          {
            title: "만들기 전은 모두 무료입니다",
            body: "분석 · 기획 · 구성안 · 원고 · 글자 얹기는 몇 번을 고쳐도 크레딧이 들지 않습니다.",
          },
          {
            title: "쓴 내역이 한 줄씩 남습니다",
            body: "계정 화면의 사용 기록에서 무엇에 몇 크레딧이 나갔는지 확인할 수 있습니다.",
          },
        ]}
        when={[
          "이번 달에 얼마나 더 만들 수 있는지 알고 싶을 때",
          "실패했는데 크레딧이 나갔는지 확인하고 싶을 때",
          "크레딧이 부족하다고 나올 때",
        ]}
      />

      <Section title="무료 구간과 차감 구간" hint="경계는 언제나 「만들기」 버튼입니다.">
        <Flow
          nodes={[
            { label: "재료 읽기", sub: "무료" },
            { label: "기획 · 구성안", sub: "무료" },
            { label: "원고 · 문구", sub: "무료 · 여러 번", human: true },
            { label: "그림 생성", sub: "여기서 차감" },
            { label: "검수 · 글자 얹기", sub: "무료" },
          ]}
        />
        <ul className="grid gap-2 text-sm leading-7 text-muted-foreground">
          <li>
            · <strong className="text-foreground">분석과 기획은 무료입니다.</strong> 사진을 읽고 구성안을 짜는 데는
            크레딧이 들지 않습니다. 남용을 막는 시간당 제한만 있습니다
          </li>
          <li>
            · <strong className="text-foreground">원고는 몇 번을 고쳐도 무료입니다.</strong> 그림을 만들기 전이기
            때문입니다. 여기서 충분히 고치세요
          </li>
          <li>
            · <strong className="text-foreground">그림 위에 얹는 글자는 무료입니다.</strong> 상세페이지 편집 화면에서
            문구를 고치는 것은 그림을 다시 만드는 일이 아닙니다
          </li>
          <li>
            · <strong className="text-foreground">내려받기와 광고 규격 내보내기는 무료입니다.</strong> 이미 만든
            그림을 자르고 담는 일입니다
          </li>
        </ul>
      </Section>

      <Section title="무엇을 몇 크레딧으로 세나" hint="완성된 결과물의 장 수로만 셉니다.">
        <ChoiceTable
          head={["만든 것", "차감", "세는 방법"]}
          rows={[
            ["이미지 한 장", `${보통}크레딧`, "모델과 무관합니다"],
            ["카드뉴스", `카드 수 × ${보통}크레딧`, "안에서 그림을 몇 번 그렸는지는 세지 않습니다"],
            ["상세페이지", `(섹션 수 + 대표 1장) × ${보통}크레딧`, "섹션마다 한 장으로 셉니다"],
            [`큰 인쇄용 (${큰그림경계()} 이상)`, `${큰것}크레딧`, `한 변이 대략 ${경계의한변()}픽셀을 넘는 정사각 크기부터입니다`],
            ["광고 규격 내보내기", "무료", "이미 만든 그림을 규격에 맞춰 자릅니다"],
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">다시 만들면 새로 차감됩니다.</strong> 마음에 안 들어 한 장을 다시
          만들면 그 장은 새 결과물이라 {보통}크레딧이 듭니다. 다만 시스템이 안에서 스스로 다시 시도한 것은
          차감하지 않습니다.
        </p>
      </Section>

      <Section title="실패했는데 크레딧이 나갔나요" hint="가장 많이 묻는 것입니다.">
        <Callouts
          items={[
            {
              title: "성공한 장만 차감합니다",
              body: (
                <>
                  만들기를 누르면 필요한 만큼 <strong className="text-foreground">잡아 둡니다</strong>. 끝나면 실제로
                  나온 장만 차감하고 나머지는 그 자리에서 풀립니다. 다섯 장을 시켰는데 셋만 나왔다면 셋만
                  차감됩니다.
                </>
              ),
            },
            {
              title: "결과가 불분명하면 확인 후에 정합니다",
              body: (
                <>
                  통신이 끊겨 결과를 모를 때는 차감하지 않고 <strong className="text-foreground">확인 대기</strong>로
                  남겨 둡니다. 운영자가 확인해 확정하거나 돌려드립니다. 이런 줄은 사용 기록에 그렇게 적힙니다.
                </>
              ),
            },
          ]}
        />

        <p className="text-sm leading-7 text-muted-foreground">
          확인하는 자리는 <strong className="text-foreground">계정 화면의 사용 기록</strong>입니다. 줄마다 결과가
          적혀 있어서, 무엇이 나가고 무엇이 돌아왔는지 직접 볼 수 있습니다.
        </p>

        <Mock title="계정 · 사용 기록">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span>카드뉴스</span>
              <span className="font-bold text-primary">-8크레딧 · 완료</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span>이미지 만들기</span>
              <span className="font-bold">0 · 실패 · 차감 없음</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span>상세페이지</span>
              <span className="font-bold">-6크레딧 · 일부 완료 · 3크레딧 돌려받음</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span>이미지 만들기</span>
              <span className="font-bold">2크레딧 잡아 둠 · 확인 대기</span>
            </div>
          </div>
          <MockNote>줄마다 결과가 적혀 있습니다. 「차감 없음」이면 크레딧은 그대로입니다.</MockNote>
        </Mock>

        <ChoiceTable
          head={["이렇게 적혀 있으면", "크레딧은", "무엇을 하면 되나"]}
          rows={[
            ["실패 · 차감 없음", "그대로입니다", "다시 만들어 보세요"],
            ["결과 없음 · 차감 없음", "그대로입니다", "재료를 바꿔 다시 시도하세요"],
            ["일부 완료 · N크레딧 돌려받음", "나온 장만 나갔습니다", "안 나온 장만 다시 만드세요"],
            ["확인 대기", "아직 안 나갔습니다", "기다리시면 됩니다. 급하면 문의해 주세요"],
            ["처리 중", "잡아 둔 상태입니다", "끝나면 결과에 따라 정해집니다"],
          ]}
        />
      </Section>

      {/*
        **기간은 장부 함수가 정한다**(`202609220001_credit_ledger_v2.sql` 의
        `credit_admin_grant`) — 구독은 그 달 말일, 구매는 3개월, 추가 지급은 운영자가
        넣을 때 정한 날. 약관 제6조가 같은 말을 한다. 그 달 구독 몫은 운영자가 그 달
        결제를 확인해야 들어온다(`credit_admin_confirm_period`). 달이 바뀐다고 저절로
        들어오지 않는다.
      */}
      <Section title="언제까지 쓸 수 있나" hint="받은 방식에 따라 다릅니다.">
        <ChoiceTable
          head={["이렇게 받은 크레딧", "쓸 수 있는 기간", "알아 둘 것"]}
          rows={[
            ["월 구독", "지급된 달의 말일까지", "다음 달로 넘어가지 않습니다"],
            ["구매", "계정에 들어온 날부터 3개월", "기간 안에는 남습니다"],
            ["추가 지급", "운영자가 지급할 때 정한 날까지", "날짜는 계정 화면에 보입니다"],
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">구독 크레딧은 이월되지 않습니다.</strong> 달이 바뀌면 지난 달 몫은
          사라집니다. 새 달 몫은 운영자가 그 달 결제를 확인하면 들어옵니다. 여러 종류가 섞여 있으면{" "}
          <strong className="text-foreground">먼저 사라질 것부터</strong> 씁니다. 종류별로 남은 양과 가장 가까운
          만료일은 계정 화면의 「내 크레딧」에 보입니다.
        </p>
      </Section>

      <Section title="남은 크레딧으로 무엇을 만들 수 있나">
        <ChoiceTable
          head={["만들 것", "한 번에 드는 크레딧", "세는 장 수"]}
          rows={WORK_CREDIT_PRESETS.map((preset) => [
            preset.label,
            `${preset.images * 보통}크레딧`,
            `${preset.images}장`,
          ])}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          위는 <strong className="text-foreground">예시</strong>입니다. 상세페이지의 섹션 수와 카드뉴스의 장 수는
          만들 때 정해지므로 실제로는 이보다 많거나 적을 수 있습니다.
        </p>
      </Section>

      <Section title="모델은 어떻게 고르나" hint="차감이 같으니 결과로만 고르면 됩니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">차감이 모델마다 같아서 아끼려고 고를 이유가 없습니다.</strong> 글자가
          많이 들어가는 결과물은 글자가 정확한 쪽을, 배경이나 분위기 이미지는 빠른 쪽을 고르면 됩니다. 어느 것이
          무엇에 맞는지는 각 도구의 설명서에 적어 두었습니다.
        </p>
      </Section>

      <Details title="왜 한 장에 한 크레딧인가" hint="전에는 모델마다 달랐습니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          전에는 모델의 실제 원가에서 차감량을 셌습니다. 그러면 같은 한 장을 만들어도 무엇을 골랐는지에 따라
          깎이는 양이 달라져서, <strong className="text-foreground">쓰기 전에 얼마가 나갈지 알 수 없었습니다</strong>.
          지금은 결과물의 장 수만 세므로 미리 계산할 수 있습니다. 모델 사이의 원가 차이는 운영자가 감당합니다.
        </p>
      </Details>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "크레딧이 부족하다고 나옵니다",
              a: "남은 양보다 만들려는 장 수가 많을 때 나옵니다. 장 수를 줄여 나눠 만들거나 운영자에게 문의해 주세요. 달이 바뀌어도 새 달 구독 몫은 그 달 결제가 확인된 뒤에 들어옵니다.",
            },
            {
              q: "실패했는데 잔액이 줄어 보입니다",
              a: "잡아 둔 크레딧이 잔액에서 먼저 빠져 보이기 때문입니다. 정산이 끝나면 돌아옵니다. 사용 기록에서 그 줄의 결과를 확인해 주세요.",
            },
            {
              q: "다른 만들기가 아직 끝나지 않았다고 나옵니다",
              a: "크레딧이 드는 만들기는 한 번에 하나씩 돕니다. 앞의 것이 끝나면 풀립니다.",
            },
            {
              q: "이번 달에 안 쓴 크레딧이 사라졌습니다",
              a: "구독 크레딧은 이월되지 않습니다. 달이 바뀌면 지난 달 몫은 사라집니다. 새 달 몫은 운영자가 그 달 결제를 확인하면 들어옵니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/credits" toolHref="/settings" toolLabel="사용량 보기" />
    </>
  );
}
