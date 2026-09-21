import type { Metadata } from "next";
import { GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Summary } from "../_components/summary";
import { EASY_LOOKS, EASY_RATIOS } from "../../easy/ask";

export const metadata: Metadata = { title: "쉽게 · 사용 설명서" };

/**
 * 「이미지 > 쉽게」 설명서.
 *
 * **다른 설명서보다 짧다.** 고를 것이 없는 도구라 설명할 것도 적다 — 길게 쓰면
 * 「쉽다」는 말과 어긋난다.
 *
 * ── 2026-09-21 에 크게 고쳤다 ────────────────────────────────
 *
 * 하루 사이에 도구가 세 군데 바뀌었는데 설명서가 그대로였다. **틀린 안내는
 * 없는 것만 못하다.**
 *
 *   · 「말로만 만든다」 → 이제 **묻고 답한다.** 대화가 되는 것을 한 줄도 안 적었다
 *   · 「각 모델의 값이 함께 나옵니다」 → 값 표시는 뺐다(사용자 요청)
 *   · 「보내면 바로 값이 듭니다」 → 말로 묻는 턴은 값이 안 든다
 *   · 「무조건 1:1」 → 비율·그림체를 한 번 묻는다
 */
export default function EasyGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="이미지 · 쉽게"
        title="말로 만듭니다"
        lead="무엇을 만들지 한 줄 적으면 이미지가 나옵니다. 궁금한 것은 그냥 물어보셔도 됩니다. 비율·모델·장수를 고르지 않고, AI 가 채운 칸을 검토하지도 않습니다. 처음 오셨다면 여기서 시작하세요."
      />

      <Summary
        what="채팅처럼 말을 주고받다가, 만들어 달라고 하면 이미지가 나옵니다. 이미지를 붙여도 되고 안 붙여도 됩니다."
        points={[
          {
            title: "묻는 말에는 답하고, 주문에는 만듭니다",
            body: "「뭘 적어야 잘 나와?」처럼 물으면 답만 합니다. 이때는 값이 들지 않습니다. 「○○ 만들어줘」처럼 주문하면 그때 만듭니다.",
          },
          {
            title: "고를 것이 하나입니다",
            body: "무엇을 만들지 한 줄. 모양을 안 고르면 정사각형 한 장으로 가고, 그 밖은 AI 가 정합니다.",
          },
          {
            title: "모양은 한 번만 묻습니다",
            body: "붙인 이미지 없이 주문하면 비율과 그림체를 한 번 묻습니다. 안 고르고 넘어가도 됩니다. 말 속에 이미 있으면 묻지 않습니다.",
          },
          {
            title: "지난 대화가 왼쪽에 쌓입니다",
            body: "돌아가서 다시 볼 수 있습니다. 만든 이미지는 오른쪽 결과 칸에 모이고, 라이브러리에도 저장됩니다.",
          },
        ]}
        when={[
          "무엇을 적어야 할지 모르겠을 때",
          "빠르게 한 장만 뽑아 보고 싶을 때",
          "이미지 만들기의 다섯 단계가 부담스러울 때",
        ]}
      />

      <Section title="말을 걸어도 됩니다">
        <p>
          <strong>친 말이 전부 주문은 아닙니다.</strong> 「안녕하세요」나 「뭘 적어야
          잘 나와?」처럼 물으면 답만 하고, 이미지는 만들지 않습니다. 그래서
          <strong> 값도 들지 않습니다.</strong>
        </p>
        <p>
          낱말로 가르지 않습니다. 「방금 그린 거 왜 그렇게 나왔어?」에도 「그린」이
          있지만 묻는 말입니다. <strong>지금 한 장 만들어 내놓기를 바라는지</strong>만
          봅니다.
        </p>
        <p>
          지난 대화를 함께 읽습니다. 그래서 「그거 말고 다른 걸로」처럼 앞을 가리키는
          말도 통합니다.
        </p>
      </Section>

      <Section title="모양을 한 번 묻습니다" hint="안 고르셔도 됩니다.">
        <p>
          붙인 이미지 없이 만들어 달라고 하면, 만들기 전에 <strong>비율과 그림체</strong>를
          한 번 묻습니다. 전에는 무엇을 적든 정사각형으로 나왔습니다.
        </p>
        <div className="grid gap-3">
          <div>
            <h3 className="text-sm font-extrabold">비율</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {EASY_RATIOS.map((ratio) => ratio.label).join(" · ")}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-extrabold">그림체</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {EASY_LOOKS.map((look) => look.label).join(" · ")}
            </p>
          </div>
        </div>
        <p>
          <strong>막지 않습니다.</strong> 「이대로 만들기」가 늘 열려 있고, 누르면
          정사각형에 적어 주신 말에 맞춰 만듭니다.
        </p>
        <p>
          <strong>말 속에 이미 있으면 묻지 않습니다.</strong> 「세로로 만들어줘」·
          「인스타 피드에 올릴」·「실사 사진처럼」이라고 적으셨으면 그대로 갑니다.
          다만 「포스터」·「배너」처럼 <strong>쓰임만 가리키는 말</strong>로는 모양을
          정하지 않습니다. 말한 적 없는 모양으로 나가면 안 되기 때문입니다.
        </p>
      </Section>

      <Section title="「다양하게」와 무엇이 다른가">
        <p>
          같은 엔진을 씁니다. 이미지를 만드는 방식은 똑같고, <strong>고를 것의 수</strong>만
          다릅니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-medium">　</th>
                <th className="py-2 pr-4 font-medium">다양하게</th>
                <th className="py-2 font-medium">쉽게</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">단계</td>
                <td className="py-2 pr-4">다섯</td>
                <td className="py-2">하나 (대화)</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">고르는 칸</td>
                <td className="py-2 pr-4">비율 · 모델 · 장수 · 그림체</td>
                <td className="py-2">비율 · 그림체 (한 번 묻고 넘어갈 수 있음)</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">한 번에</td>
                <td className="py-2 pr-4">여러 장</td>
                <td className="py-2">한 장</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">기획 확인</td>
                <td className="py-2 pr-4">04 에서 열한 칸</td>
                <td className="py-2">없음</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">고치려면</td>
                <td className="py-2 pr-4">04 로 돌아가 고친다</td>
                <td className="py-2">다시 적어서 다시 만든다</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>둘은 갈래입니다.</strong> 세밀하게 만들 것은 이미지 만들기로 가세요.
          왼쪽 사이드바가 그대로 있으니 거기서 바로 옮겨 갑니다.
        </p>
      </Section>

      <Section title="이미지를 붙이면">
        <p>
          붙인 이미지를 <strong>전부 읽습니다.</strong> 누가 있는지, 무슨 일이 벌어지고
          있는지, 글자와 색이 어떤지. 그 다음 적어 주신 말과 맞춰 이미지 지시문을 씁니다.
        </p>
        <p>
          그래서 <strong>「이 이미지를 어떻게 쓸까」를 고르지 않아도 됩니다.</strong> 인물
          사진을 붙이면 그 사람을 지키고, 제품 사진을 붙이면 그 제품을 지키고, 포스터를
          붙이면 그 배치와 연출을 따라갑니다.
        </p>
        <p>
          붙인 것이 있으면 <strong>모양을 묻지 않습니다.</strong> 그 결을 따라가는 것이
          기본이기 때문입니다.
        </p>
      </Section>

      <Section title="만든 것은 오른쪽에 모입니다">
        <p>
          대화 속 이미지는 작게 들어갑니다. 대화가 길어져도 오간 말이 안 밀리게 하기
          위해서입니다. <strong>큰 그림과 만든 조건은 오른쪽 결과 칸</strong>에 있습니다.
        </p>
        <p>
          결과마다 밑에 <strong>어떤 모델로 어떤 비율에서 만들었는지</strong>가 작게
          적힙니다. 여러 장을 만들었을 때 무엇이 다른지 열어 보지 않고 알 수 있습니다.
        </p>
        <p>
          아무 이미지나 누르면 크게 열리고, 그 안에서 <strong>이 대화의 결과를 넘겨
          가며</strong> 볼 수 있습니다. 내려받기도 거기 있습니다.
        </p>
      </Section>

      <Pitfalls
        items={[
          {
            q: "만들어 달라고 하면 바로 값이 듭니다",
            a: "주문이면 확인 단계 없이 만듭니다. 묻는 말에는 값이 들지 않지만, 「만들어줘」라고 적으면 그때부터는 되돌릴 수 없습니다. 만드는 동안에는 입력창이 잠깁니다.",
          },
          {
            q: "고를 것이 없어 못 만드는 것도 있습니다",
            a: "A4 인쇄용처럼 특정 비율이 필요하거나 여러 장을 한 번에 뽑아야 하면 이 모드로는 안 됩니다. 왼쪽 사이드바의 「이미지 > 다양하게」로 가세요.",
          },
          {
            q: "대화를 지우면 되돌릴 수 없습니다",
            a: "만든 이미지는 라이브러리에 남지만 주고받은 말은 사라집니다.",
          },
          {
            q: "모양을 물었는데 답을 안 하고 다른 말을 쳤습니다",
            a: "그 물음은 버려집니다. 아무것도 만들지 않았으니 값도 들지 않습니다. 다시 주문하시면 다시 묻습니다.",
          },
        ]}
      />

      <GuideFooter href="/guide/easy" toolHref="/easy" toolLabel="「쉽게」 열기" />
    </>
  );
}
