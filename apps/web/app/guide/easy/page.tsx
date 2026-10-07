import { guideMetadata } from "../../../lib/seo/metadata";
import { GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Summary } from "../_components/summary";
import { EASY_LOOKS, EASY_RATIOS } from "../../easy/ask";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS } from "../../easy/ad-ask";
import { resultLabel } from "../../easy/image-numbers";
import { SEE_FAILED } from "../../easy/see-prompt";

export const metadata = guideMetadata("/guide/easy");

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
 *
 * 2026-09-29 에 한 번 더 맞췄다 — 입력창 위에서 모델을 고를 수 있고
 * (`model-bar.tsx`), 모양은 주문마다 묻고, 이미지를 붙이면 안 묻고 1:1 로
 * 간다(`ask.ts`).
 *
 * 2026-10-07 에 2차 기능을 더했다(후속 Task 5) — 물음 줄 · 결과물 번호 · 보고 답하기 · 광고 물음 ·
 * 크레딧. 이름표 · 단추 글은 화면이 쓰는 값을 가져다 쓴다(`__tests__/easy-guide.test.ts`).
 * 표의 「고치려면」도 그때 고쳤다. 2026-10-06(#254)부터 말로 고치는데 「다시 적어 새로 만든다」는 옛 안내로 남아 있었다.
 */
export default function EasyGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="이미지 · 쉽게"
        title="말로 만듭니다"
        lead="무엇을 만들지 한 줄 적으면 이미지가 나옵니다. 궁금한 것은 그냥 물어보셔도 됩니다. 장수를 고르지 않고, AI 가 채운 칸을 검토하지도 않습니다. 모델은 입력창 위에서 바꿀 수 있지만 그대로 둬도 됩니다. 처음 오셨다면 여기서 시작하세요."
      />

      <Summary
        what="채팅처럼 말을 주고받다가, 만들어 달라고 하면 이미지가 나옵니다. 이미지를 붙여도 되고 안 붙여도 됩니다."
        points={[
          {
            title: "묻는 말에는 답하고, 주문에는 만듭니다",
            body: "「뭘 적어야 잘 나와?」처럼 물으면 답만 합니다. 이때는 값이 들지 않습니다. 「○○ 만들어줘」처럼 주문하면 그때 만듭니다.",
          },
          {
            title: "적을 것은 한 줄입니다",
            body: "무엇을 만들지 한 줄. 모양을 안 고르면 정사각형 한 장으로 가고, 그 밖은 AI 가 정합니다. 장수는 고르지 않습니다. 모델은 입력창 위에서 바꿀 수 있지만 기본값 그대로 둬도 됩니다.",
          },
          {
            title: "모양은 주문마다 한 번 묻습니다",
            body: "붙인 이미지 없이 주문하면 비율과 그림체를 한 번 묻습니다. 안 고르고 넘어가도 됩니다. 말 속에 이미 있으면 묻지 않습니다. 물은 바로 뒤에 새로 주문하면 다시 묻지 않습니다.",
          },
          {
            title: "지난 대화가 왼쪽에 쌓입니다",
            body: "돌아가서 다시 볼 수 있습니다. 만든 이미지는 오른쪽 결과 칸에 모이고, 라이브러리에도 저장됩니다.",
          },
        ]}
        when={[
          "무엇을 적어야 할지 모르겠을 때",
          "빠르게 한 장만 뽑아 보고 싶을 때",
          "「다양하게」의 다섯 단계가 부담스러울 때",
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

      <Section title="AI 가 물으면 단추로도, 말로도 답합니다" hint="처음 주문을 다시 적지 않아도 됩니다.">
        <p>
          모양 말고도 AI 가 물을 때가 있습니다. 한 장으로 만들지 카드뉴스로 만들지, 어느 이미지를
          고칠지, 카드뉴스의 몇 번 장인지 같은 것입니다. <strong>물음 밑에 단추가 붙습니다.</strong> 단추를
          눌러도 되고, 「세로로 해줘」처럼 말로 답해도 됩니다.
        </p>
        <p>
          <strong>답하면 처음 주문을 이어 갑니다.</strong> 「고양이 포스터 만들어줘」에 모양을 묻고
          「포스터 세로」를 고르고 「이걸로 만들기」를 누르면, 주문을 다시 적지 않아도 고양이 포스터를 세로로 만듭니다.
        </p>
        <p>
          <strong>물음은 대화에 남습니다.</strong> 새로고침하거나 나중에 대화를 다시 열어도 그대로
          있습니다. 단추는 아직 답하지 않은 마지막 물음에만 붙습니다. 사진을 고르는 물음처럼 다시 연
          뒤 단추가 안 보이면 말로 이어 답하시면 됩니다.
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
                <td className="py-2">비율 · 그림체 (주문마다 묻고 넘어갈 수 있음) · 모델 (기본값 그대로 둬도 됨)</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">한 번에</td>
                <td className="py-2 pr-4">여러 장</td>
                <td className="py-2">한 장</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-2 pr-4">기획 확인</td>
                <td className="py-2 pr-4">04 에서 칸 열 개</td>
                <td className="py-2">없음</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">고치려면</td>
                <td className="py-2 pr-4">04 로 돌아가 고친다</td>
                <td className="py-2">「이미지 2 배경만 바꿔줘」처럼 말로 고친다</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>둘은 갈래입니다.</strong> 세밀하게 만들 것은 「이미지 &gt; 다양하게」로 가세요.
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
          붙인 것이 있으면 <strong>모양을 묻지 않습니다.</strong> 그림체는 붙인 이미지를
          따라갑니다. 비율은 말 속에 적지 않았으면 <strong>정사각형(1:1)</strong>으로
          만듭니다. 다른 비율이 필요하면 「세로로」·「인스타 피드에 올릴」처럼 함께 적어 주세요.
        </p>
        <p>
          이미지를 만들거나 고치거나 카드뉴스 원고를 쓰고 나면
          <strong> 쓴 사진은 입력창에서 내려갑니다.</strong> 다음 주문에 같은 사진을 쓰려면 다시 붙여 주세요. 올린 사진은
          라이브러리에 남아 있어 거기서 다시 고를 수 있습니다.
        </p>
      </Section>

      <Section title="만든 것은 오른쪽에 모입니다">
        <p>
          대화 속 이미지는 작게 들어갑니다. 대화가 길어져도 오간 말이 안 밀리게 하기
          위해서입니다. <strong>큰 그림과 만든 조건은 오른쪽 결과 칸</strong>에 있습니다.
          결과 칸은 넓은 화면에서만 보입니다. 화면이 좁으면 대화 속 이미지를 눌러 크게 보세요.
        </p>
        <p>
          결과마다 밑에 <strong>어떤 모델로 어떤 비율에서 만들었는지</strong>가 작게
          적힙니다. 여러 장을 만들었을 때 무엇이 다른지 열어 보지 않고 알 수 있습니다.
        </p>
        <p>
          아무 이미지나 누르면 크게 열리고, 그 안에서 <strong>이 대화의 결과를 넘겨
          가며</strong> 볼 수 있습니다. 내려받기도 거기 있습니다.
        </p>
        <p>
          라이브러리에서 「쉽게」로 만든 작업의 「과정 보기」를 누르면 <strong>그 대화가 다시
          열립니다.</strong> 대화를 지웠으면 그 작업에 따라 「다양하게」나 「카드뉴스」 화면이 열립니다.
        </p>
      </Section>

      <Section title="만든 것에 번호가 붙습니다" hint="번호로 골라 고칩니다.">
        <p>
          만든 결과물마다 「{resultLabel("image", 1)}」·「{resultLabel("cardnews", 2)}」처럼 번호가
          붙습니다. 이미지와 카드뉴스가 한 줄로 이어서 번호를 받습니다. 지운 결과물도 번호를 그대로
          차지해서, 뒤 번호가 당겨지지 않습니다.
        </p>
        <p>
          <strong>번호로 골라 고칩니다.</strong> 「이미지 2 배경만 바꿔줘」·「아까 첫 번째 거 글자 크게」처럼
          말하면 그 이미지를 고칩니다. 「방금 거」라고 하면 마지막 이미지입니다. 다 만든 이미지가 여럿인데
          어느 것인지 말에서 알 수 없으면, AI 가 몇 번을 고칠지 묻고 번호 단추를 붙입니다.
        </p>
        <p>
          고친 이미지는 새 번호를 받고, 고치기 전 이미지는 그대로 남습니다. <strong>고치기도 이미지를
          새로 한 장 만드는 일이라 크레딧이 듭니다.</strong> 카드뉴스 번호는 이미지 고치기로 고치지 않습니다.
          카드뉴스는 「3번 장 더 짧게」처럼 장 번호로 말씀해 주세요.
        </p>
      </Section>

      <Section title="이미지를 보고 답합니다" hint="크레딧이 들지 않습니다.">
        <p>
          「방금 거 어때?」·「1번이랑 2번 중 뭐가 나아?」처럼 이미지에 대해 물으면 AI 가 <strong>그
          이미지를 직접 보고</strong> 답합니다. 붙인 사진을 두고 물어도 됩니다. 한 번에 네 장까지 봅니다.
        </p>
        <p>
          볼 수 없을 때는 지어내지 않습니다. 「{SEE_FAILED}」라고 말합니다. 다만 고른 결과물이 모두 아주 오래된
          것(이 대화에서 최근에 만든 작업 100개보다 앞선 것)이면, 오래되어 이 대화에서는 볼 수 없다고 말하고 지우지
          않았다면 라이브러리에서 열어 보시라고 안내합니다.
        </p>
      </Section>

      <Section title="「광고 소재」라고 하면 먼저 묻습니다">
        <p>
          「광고 소재」는 두 뜻일 수 있습니다. 광고에 쓸 이미지 한 장을 만드는 것과, 만든 이미지를 네이버·구글·카카오
          규격별로 여러 장 뽑는 것입니다. 그래서 <strong>어느 쪽인지 먼저 묻습니다.</strong>
        </p>
        <p>
          「{AD_CHOICE_IMAGE}」 단추를 누르면 여기서 만듭니다. 「{AD_CHOICE_SPECS}」 단추를 누르면 규격별로 뽑는 법을
          알려 드리고 「광고소재 열기」 단추를 붙입니다. 규격별로 뽑는 일은 이 대화가 아니라 「광고소재」 화면에서 합니다.
        </p>
        <p>
          「광고 소재」와 함께 「규격별」·「사이즈별」·「리사이즈」·「네이버」처럼 규격을 가리키는 말을 적으면 묻지 않고 바로
          안내합니다.
        </p>
      </Section>

      <Section title="크레딧은 이미지가 나올 때만 듭니다">
        <ul className="grid gap-2 text-sm leading-7 text-muted-foreground">
          <li>
            · <strong className="text-foreground">듭니다.</strong> 이미지 만들기, 이미지 고치기, 카드뉴스의
            「이대로 만들기」, 카드 한 장 「다시 만들기」
          </li>
          <li>
            · <strong className="text-foreground">들지 않습니다.</strong> 대화, AI 의 물음과 답, 이미지를 보고 답하기,
            카드뉴스 원고 쓰기와 고치기, 광고 규격 안내
          </li>
        </ul>
        <p>
          입력창 밑에 적힌 「이미지를 만들면 약 ○」는 만들 때 드는 양입니다. 보낸다고 늘 드는 것이 아닙니다.
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
            a: "친 말이 답이 아니면 그 물음은 거기서 끝납니다. 글은 대화에 남지만 단추는 사라집니다. 그 물음 때문에 값이 들지는 않습니다. 다만 모양을 물은 바로 뒤에 새 주문을 치면 모양을 다시 묻지 않고 바로 만듭니다. 말에 모양이 없으면 정사각형이고, 그때는 크레딧이 듭니다.",
          },
        ]}
      />

      <GuideFooter href="/guide/easy" toolHref="/easy" toolLabel="「쉽게」 열기" />
    </>
  );
}
