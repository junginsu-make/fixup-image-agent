import type { Metadata } from "next";
import { ChoiceTable, DiffList, Flow, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Callouts, Mock, MockButtons, MockChoices, MockTabs } from "../_components/mockup";

/**
 * 수집(수집함 · 수집 리스트) 이야기를 통째로 뺐다 — 2026-09-10.
 *
 * 그 화면을 당분간 끄기로 했다(`lib/access/routes.ts` 의 `disabled`).
 * 설명서에 남겨 두면 **설명서에는 있는데 눌러도 없는 화면**이 된다.
 * 되살릴 때는 이 파일의 git 이력에서 그 절을 그대로 되가져오면 된다.
 */
export const metadata: Metadata = { title: "라이브러리 — 사용 설명서" };

export default function LibraryGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="라이브러리"
        title="재료를 모아 두고 어느 도구에서든 불러 쓰기"
        lead="로그인하면 처음 열리는 화면이 라이브러리입니다. 만들기 도구부터 열지 않는 이유가 있습니다 — 무엇을 가지고 있는지 모르는 채로 시작하면 매번 재료를 새로 찾게 되기 때문입니다. 여기 쌓인 것은 다섯 도구가 모두 불러 쓸 수 있습니다."
      />

      <Section title="한 바퀴가 닫힙니다" hint="만든 것이 다시 재료가 되는 자리입니다.">
        <Flow
          nodes={[
            { label: "라이브러리", sub: "한자리에 모임" },
            { label: "만들기", sub: "불러 씁니다" },
            { label: "작업물", sub: "다시 라이브러리로" },
          ]}
          loopBack="작업물이 다음 작업의 레퍼런스가 됩니다"
        />
        <p className="text-sm leading-7 text-muted-foreground">
          참고 이미지는 <strong className="text-foreground">사용자가 올린 것</strong>, 작업물은{" "}
          <strong className="text-foreground">시스템이 만든 것</strong>입니다. 둘이 같은 라이브러리에서 같은 자격으로
          쓰입니다. 지난주에 만든 카드뉴스를 이번 포스터의 레퍼런스로 삼을 수 있습니다.
        </p>
      </Section>

      <Section title="라이브러리 — 세 가지가 들어 있습니다">
        <Mock title="라이브러리">
          <MockTabs items={["작업물", "참고 이미지", "캐릭터"]} active={0} marker={1} />
          <MockChoices
            columns={3}
            items={[
              { title: "카드뉴스 · 월세 계약", hint: "9월 2일" },
              { title: "포스터 · 가을 운동회", hint: "9월 1일" },
              { title: "상세 · 수분 앰플", hint: "8월 30일" },
            ]}
          />
          <MockButtons items={[{ label: "카드뉴스로 보내기", variant: "quiet" }, { label: "레퍼런스로 쓰기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "탭 세 개",
              body: (
                <ul className="grid gap-1.5">
                  <li>
                    <strong className="text-foreground">작업물</strong> — 이 시스템이 만든 결과물. 도구별로 쌓입니다
                  </li>
                  <li>
                    <strong className="text-foreground">참고 이미지</strong> — 직접 올린 그림. 「낱장」과 「묶음 세트」로
                    나뉩니다
                  </li>
                  <li>
                    <strong className="text-foreground">캐릭터</strong> — 캐릭터 만들기로 각도를 고정해 둔 인물·동물·사물
                  </li>
                </ul>
              ),
            },
          ]}
        />
      </Section>

      <Section title="묶음 세트가 왜 따로 있나" hint="카드뉴스를 만들 때 쓰는 자리입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          참고 이미지를 낱장으로 올리면 나중에 「이건 표지, 저건 속지」를 매번 다시 정해야 합니다. 묶음 세트는{" "}
          <strong className="text-foreground">그림과 자리를 함께 저장</strong>합니다. 카드뉴스에서 그 세트를 불러오면
          자리까지 그대로 들어옵니다. 같은 틀로 여러 편을 만들 때 시간이 크게 줄어듭니다.
        </p>
      </Section>

      <Section title="무엇이 다른가">
        <DiffList
          items={[
            {
              common: "결과물을 내려받으면 끝",
              ours: "만든 것이 라이브러리로 돌아옵니다",
              why: "작업물이 다음 작업의 레퍼런스가 됩니다. 폴더에서 파일을 찾아 다시 올리는 일이 없습니다.",
            },
          ]}
        />
      </Section>

      <Section title="파일은 어디에 저장되나" hint="자주 받는 질문입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          모든 파일은 <strong className="text-foreground">소유자별 비공개 저장소</strong>에 들어갑니다. 짧은 수명의
          서명된 주소로만 열리고, 저장 경로의 첫 칸이 소유자라서 다른 회원의 것은 열리지 않습니다. 회원이 AI 키를
          브라우저에 입력하는 일도 없습니다 — 생성은 운영자 서버 키로 돕니다.
        </p>
      </Section>

      <Section title="언제 무엇을 쓰나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["같은 틀로 여러 편을 만든다", "묶음 세트로 저장", "그림과 자리가 함께 들어옵니다"],
            ["지난 결과물을 다시 쓰고 싶다", "작업물 탭 → 레퍼런스로", "내려받아 다시 올릴 필요가 없습니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "라이브러리가 너무 많아 찾기 어렵습니다",
              a: "탭으로 먼저 좁히세요. 작업물은 도구별로, 참고 이미지는 낱장과 묶음 세트로 나뉩니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/library" toolHref="/library" toolLabel="라이브러리 열기" />
    </>
  );
}
