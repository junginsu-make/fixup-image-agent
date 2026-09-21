import type { Metadata } from "next";
import { GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Summary } from "../_components/summary";

export const metadata: Metadata = { title: "Easy 모드 · 사용 설명서" };

/**
 * Easy 모드 설명서.
 *
 * **다른 설명서보다 짧다.** 고를 것이 없는 도구라 설명할 것도 적다 — 길게 쓰면
 * 「쉽다」는 말과 어긋난다.
 */
export default function EasyGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="Easy 모드"
        title="말로 만듭니다"
        lead="무엇을 만들지 한 줄 적으면 그림이 나옵니다. 비율·모델·장수를 고르지 않고, AI 가 채운 칸을 검토하지도 않습니다. 처음 오셨다면 여기서 시작하세요."
      />

      <Summary
        what="채팅처럼 한 줄 적으면 그림 한 장이 나옵니다. 그림을 붙여도 되고 안 붙여도 됩니다."
        points={[
          {
            title: "고를 것이 하나입니다",
            body: "무엇을 만들지 한 줄. 비율은 1:1, 한 번에 한 장으로 갑니다. 그 밖은 AI 가 정합니다.",
          },
          {
            title: "되묻지 않습니다",
            body: "그림을 붙일지 한 번 묻고, 그 다음은 적어 주신 말 그대로 만듭니다. 붙인 그림을 어떻게 쓸지도 AI 가 읽어서 판단합니다.",
          },
          {
            title: "값을 미리 보여 드립니다",
            body: "입력창 위에서 글 모델과 그림 모델을 고를 수 있고, 각 모델의 값이 함께 나옵니다. 채팅은 빠른 대신 돌이킬 수 없어서, 누르기 전에 아는 것이 낫습니다.",
          },
          {
            title: "지난 대화가 왼쪽에 쌓입니다",
            body: "돌아가서 다시 볼 수 있습니다. 만든 그림은 라이브러리에 저장됩니다.",
          },
        ]}
        when={[
          "무엇을 적어야 할지 모르겠을 때",
          "빠르게 한 장만 뽑아 보고 싶을 때",
          "이미지 만들기의 다섯 단계가 부담스러울 때",
        ]}
      />

      <Section title="이미지 만들기와 무엇이 다른가">
        <p>
          같은 엔진을 씁니다. 그림을 만드는 방식은 똑같고, <strong>고를 것의 수</strong>만
          다릅니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-medium">　</th>
                <th className="py-2 pr-4 font-medium">이미지 만들기</th>
                <th className="py-2 font-medium">Easy 모드</th>
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
                <td className="py-2">없음 (모델은 선택)</td>
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
          Easy 안에서도 왼쪽 사이드바가 그대로 있으니 거기서 바로 옮겨 갑니다.
        </p>
      </Section>

      <Section title="그림을 붙이면">
        <p>
          붙인 그림을 <strong>전부 읽습니다.</strong> 누가 있는지, 무슨 일이 벌어지고
          있는지, 글자와 색이 어떤지. 그 다음 적어 주신 말과 맞춰 그림 지시문을 씁니다.
        </p>
        <p>
          그래서 <strong>「이 그림을 어떻게 쓸까」를 고르지 않아도 됩니다.</strong> 인물
          사진을 붙이면 그 사람을 지키고, 제품 사진을 붙이면 그 제품을 지키고, 포스터를
          붙이면 그 배치와 연출을 따라갑니다.
        </p>
      </Section>

      <Pitfalls
        items={[
          {
            q: "보내면 바로 값이 듭니다",
            a: "엔터가 곧 생성입니다. 04 같은 확인 단계가 없으니, 적은 말을 한 번 더 읽고 보내세요. 보내는 중에는 입력창이 잠깁니다.",
          },
          {
            q: "고를 것이 없어 못 만드는 것도 있습니다",
            a: "특정 비율이 필요하거나 여러 장을 한 번에 뽑아야 하면 이 모드로는 안 됩니다. 왼쪽 사이드바의 「이미지 만들기」로 가세요.",
          },
          {
            q: "대화를 지우면 되돌릴 수 없습니다",
            a: "만든 그림은 라이브러리에 남지만 주고받은 말은 사라집니다.",
          },
        ]}
      />

      <GuideFooter href="/guide/easy" toolHref="/easy" toolLabel="Easy 모드 열기" />
    </>
  );
}
