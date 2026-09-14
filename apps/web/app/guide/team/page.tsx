import type { Metadata } from "next";
import Link from "next/link";
import { ChoiceTable, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts } from "../_components/mockup";

export const metadata: Metadata = { title: "팀 — 사용 설명서" };

export default function TeamGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="팀"
        title="여러 사람이 같은 재료로 일할 때"
        lead="팀에 들어가면 만든 것과 올린 참고 이미지가 팀 것이 됩니다. 팀원이면 서로의 재료를 불러 쓸 수 있고, 크레딧은 팀 한도를 함께 나눠 씁니다. 혼자 쓰신다면 이 화면은 안 보입니다."
      />

      <Summary
        what="같은 재료를 나눠 쓰고, 크레딧 한도를 함께 관리하는 묶음입니다."
        points={[
          {
            title: "재료가 공유됩니다",
            body: "팀에 들어간 뒤 만든 작업물과 올린 참고 이미지에 팀 도장이 찍힙니다. 팀원이면 서로 불러 쓸 수 있습니다.",
          },
          {
            title: "크레딧을 나눠 씁니다",
            body: "팀 한도와 개인 한도 중 낮은 쪽이 실제 한도입니다. 팀 한도가 0 이면 개인 한도만 봅니다.",
          },
          {
            title: "팀장이 팀 안을 꾸립니다",
            body: "팀원을 넣고 빼고, 팀장을 더 세울 수 있습니다. 팀을 새로 만드는 것은 운영자 몫입니다.",
          },
          {
            title: "팀장은 자기 팀만",
            body: "남의 팀은 못 건드립니다. 이미 다른 팀에 있는 사람도 못 데려옵니다 — 팀 사이를 옮기는 것은 운영자가 합니다.",
          },
        ]}
        when={[
          "같은 브랜드를 여러 사람이 함께 만들 때",
          "참고 이미지와 캐릭터를 팀원끼리 돌려 쓰고 싶을 때",
          "회사 단위로 이번 달 생성량을 묶어서 관리하고 싶을 때",
        ]}
      />

      <Section title="팀장과 팀원" hint="같은 팀 안에서 할 수 있는 일이 다릅니다.">
        <ChoiceTable
          head={["하는 일", "팀장", "팀원"]}
          rows={[
            ["팀 재료 불러 쓰기", "가능", "가능"],
            ["팀원 넣기 · 빼기", "가능 (자기 팀만)", "불가"],
            ["팀장 세우기 · 내리기", "가능", "불가"],
            ["팀 한도 정하기", "불가 — 운영자", "불가"],
            ["팀 만들기 · 지우기", "불가 — 운영자", "불가"],
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">마지막 팀장은 못 내립니다.</strong> 팀장이 없는 팀이 생기면 그 팀을 꾸릴
          사람이 사라지기 때문입니다. 내리려면 다른 사람을 먼저 팀장으로 세우세요.
        </p>
      </Section>

      <Section title="크레딧이 어떻게 나뉘나" hint="둘 중 낮은 쪽이 이번 달 내 한도입니다.">
        <ChoiceTable
          head={["상황", "이번 달 내 한도", "설명"]}
          rows={[
            ["팀이 없다", "개인 한도 그대로", "지금까지와 같습니다"],
            ["팀 한도가 0 이다", "개인 한도 그대로", "팀을 만들었지만 한도를 안 정한 상태입니다"],
            ["팀 한도가 정해져 있다", "개인 한도와 팀 잔액 중 낮은 쪽", "팀원들이 많이 쓰면 내 남은 양도 줄어듭니다"],
          ]}
        />
        <Callouts
          items={[
            {
              title: "팀 때문에 막히면 그렇게 말해 줍니다",
              body: "「팀의 이번 달 생성 한도를 모두 사용했습니다」가 뜨면 내 한도가 아니라 팀 잔액이 바닥난 것입니다. 내 한도를 올려 달라고 해도 안 풀립니다 — 팀장에게 말씀하세요.",
            },
            {
              title: "팀을 옮겨도 쓴 양은 따라갑니다",
              body: "개인 한도와 비교하는 값은 어느 팀에서 썼든 이번 달에 쓴 전부입니다. 팀을 옮겨 한도를 새로 받는 길은 없습니다.",
            },
          ]}
        />
      </Section>

      <Details title="팀에 들어가면 내 것은 어떻게 되나" hint="들어가기 전과 후가 다릅니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">팀에 들어간 뒤 만든 것</strong>부터 팀 도장이 찍힙니다. 작업물과 참고
          이미지가 그렇습니다. 팀원이면 서로 목록에서 보고 불러 쓸 수 있습니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">팀에서 빠지면</strong> 도장이 풀려 다시 개인 것으로 돌아옵니다. 지워지지
          않습니다. 다만 그동안 팀원들이 그 재료로 만든 결과물은 그대로 남습니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          관리자 화면에서 팀을 바꿀 때 <strong className="text-foreground">한 번 묻습니다.</strong> 되돌릴 수 있는
          일이지만, 내가 올린 사진이 갑자기 팀 것이 되는 것은 놀랄 만한 일이기 때문입니다.
        </p>
      </Details>

      <Details title="프로젝트로 더 잘게 나누기" hint="팀 안에서 갈래를 만드는 자리입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          프로젝트는 <strong className="text-foreground">팀 아래에만 있습니다.</strong> 혼자 쓰시는 분에게는 목록 자체가
          안 나옵니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          사이드바에서 프로젝트를 고르면 라이브러리·카드뉴스·이미지 만들기가 그 갈래만 보여 줍니다.{" "}
          <strong className="text-foreground">들어가는 곳이 아니라 거르는 장치입니다.</strong> 골라 둔 동안에는 본문 위에
          「○○만 보고 있습니다」가 뜹니다 — 없으면 비어 있는 화면을 보고 작업물이 사라졌다고 여기게 됩니다.
        </p>
      </Details>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "사이드바에 「팀」이 안 보입니다",
              a: "아직 어느 팀에도 속하지 않았습니다. 팀이 없는 사람에게 메뉴를 내면 눌러 봐야 빈 화면이라 일부러 감춥니다. 운영자나 팀장에게 배정을 요청하세요.",
            },
            {
              q: "팀원을 넣으려는데 목록에 없습니다",
              a: "그 사람이 이미 다른 팀에 있습니다. 팀장은 아직 팀이 없는 사람만 데려올 수 있습니다 — 팀 사이를 옮기는 것은 운영자 몫입니다.",
            },
            {
              q: "팀장을 팀원으로 못 내립니다",
              a: "그 사람이 이 팀의 마지막 팀장입니다. 다른 사람을 먼저 팀장으로 세우면 내릴 수 있습니다.",
            },
            {
              q: "내 한도는 남았는데 못 만듭니다",
              a: (
                <>
                  팀 잔액이 바닥났습니다. 팀장에게 말씀하시거나{" "}
                  <Link href="/guide/credits" className="font-bold text-primary underline underline-offset-4">
                    크레딧과 모델
                  </Link>
                  에서 한도 계산을 확인하세요.
                </>
              ),
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/team" toolHref="/team" toolLabel="팀 열기" />
    </>
  );
}
