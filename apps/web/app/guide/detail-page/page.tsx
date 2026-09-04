import type { Metadata } from "next";
import Link from "next/link";
import { REVIEW_CRITERIA } from "@fixup/pdp-core";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Callouts, Mock, MockButtons, MockChoices, MockField, MockNote, MockSteps, MockTabs } from "../_components/mockup";

export const metadata: Metadata = { title: "상세페이지 만들기 — 사용 설명서" };

export default function DetailPageGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="상세페이지 만들기"
        title="사진 한 장 또는 글만으로 상세페이지를"
        lead="쇼핑몰 상품 페이지에 들어가는 긴 세로 이미지입니다. 상품 사진 한 장을 올리거나, 사진 없이 무엇을 파는지 글로만 적어도 됩니다. 구성안을 먼저 짜고 문구를 고친 뒤 섹션 이미지를 묶음으로 만듭니다."
      />

      <Section title="들어가는 길이 둘입니다" hint="가진 것에서 시작하세요.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <strong className="block text-sm font-extrabold">사진으로 시작</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              상품 사진 한 장을 올립니다. 시스템이 사진을 먼저 읽어{" "}
              <strong className="text-foreground">형태 · 색 · 재질 · 라벨에 적힌 글자</strong>를 확인하고, 거기서 확인된
              것만 근거로 구성안을 짭니다.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <strong className="block text-sm font-extrabold">글로 시작</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              사진이 아직 없을 때 씁니다. 무엇을 파는지 적으면 시나리오와 대표 이미지를 먼저 만들고, 그것을 확인한 뒤
              섹션으로 넘어갑니다.
            </p>
          </div>
        </div>
      </Section>

      <Section title="전체 흐름" hint="네 단계입니다. 길이 둘이지만 뒤 두 단계는 같습니다.">
        <Flow
          nodes={[
            { label: "사진 / 글", sub: "가진 것에서" },
            { label: "AI 분석", sub: "구성 초안" },
            { label: "문구 확인", sub: "사람이 고칩니다", human: true },
            { label: "섹션 생성", sub: "묶음으로 한 번에" },
            { label: "편집 · 내보내기", sub: "글자 얹기", human: true },
          ]}
        />
        <FlowLegend />
      </Section>

      <Section title="무엇이 다른가">
        <DiffList
          items={[
            {
              common: "AI가 그럴듯한 마케팅 문구를 지어낸다",
              ours: "제품에서 확인되는 것만 근거로 씁니다",
              why: "사진에서 읽히는 형태·색·재질·라벨 문구에 붙은 문장인지를 봅니다. 「수분 장벽 강화」처럼 확인되지 않은 효능·성분·인증을 사실처럼 쓰면 심사에서 걸러 다시 씁니다.",
            },
            {
              common: "만든 사람이 스스로 잘 됐다고 판단한다",
              ours: `만든 호출과 다른 호출이 ${REVIEW_CRITERIA.length}개 항목을 심사합니다`,
              why: "심사자에게는 구성안과 판매 원칙만 주고 원래 브리프는 주지 않습니다. 사는 사람은 브리프를 못 보기 때문입니다. 미달이면 지적을 담아 다시 만듭니다.",
            },
            {
              common: "섹션을 한 장씩 순서대로 만든다",
              ours: "섹션 이미지를 묶음으로 한 번에 만듭니다",
              why: "순차 호출은 장마다 크레딧을 따로 쓰고 오래 걸립니다. 묶음으로 만들면 같은 결이 유지되기도 쉽습니다.",
            },
          ]}
        />
      </Section>

      <Section title="심사는 무엇을 보나" hint="구성안이 이 항목들을 통과해야 다음으로 갑니다.">
        <ul className="grid gap-2.5">
          {REVIEW_CRITERIA.map((criterion, index) => (
            <li key={criterion.id} className="rounded-xl border bg-card p-3.5">
              <div className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                  {index + 1}
                </span>
                <strong className="text-sm font-extrabold">{criterion.label}</strong>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{criterion.question}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-6 text-muted-foreground">
          하나라도 미달이면 지적사항을 담아 구성안을 다시 만듭니다(최대 2회). 끝까지 남은 지적은 감추지 않고 화면에
          띄웁니다 — <strong className="text-foreground">통과하지 못한 채로 넘어갔다는 사실을 아는 편이 낫습니다.</strong>
        </p>
      </Section>

      <Section title="사진으로 시작 — 화면 읽기">
        <Mock title="상세페이지 만들기 · 이미지 업로드">
          <MockSteps steps={["이미지 업로드", "AI 분석", "섹션 생성", "편집 · 내보내기"]} current={0} />
          <MockTabs items={["사진으로 시작", "글로 시작"]} active={0} marker={1} />
          <MockChoices
            label="상품 사진"
            marker={2}
            columns={3}
            active={0}
            items={[{ title: "올린 사진", hint: "1장이면 됩니다" }, { title: "+ 올리기" }, { title: "라이브러리에서" }]}
          />
          <MockChoices
            label="스타일 레퍼런스 · 선택"
            marker={3}
            columns={2}
            items={[{ title: "따라 만들 페이지", hint: "페이지당 한 장만" }, { title: "+ 고르기" }]}
          />
          <MockChoices
            label="등장인물 · 선택"
            marker={4}
            columns={2}
            items={[{ title: "저장해 둔 캐릭터", hint: "여러 섹션에 같은 사람" }, { title: "안 넣기" }]}
          />
          <MockButtons items={[{ label: "분석 시작" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "사진 / 글 — 어느 쪽으로 시작할지",
              body: "사진이 있으면 사진 쪽이 정확합니다. 제품에서 확인되는 것을 근거로 삼기 때문입니다. 사진이 없으면 글로 시작해도 되고, 나중에 사진을 더할 수 있습니다.",
            },
            {
              title: "상품 사진 — 한 장이면 충분",
              body: "여러 장 올려도 되지만 한 장으로도 됩니다. 라벨 글자가 읽히는 사진일수록 좋습니다 — 거기서 근거를 가져옵니다.",
            },
            {
              title: "스타일 레퍼런스 — 페이지당 한 장만",
              body: (
                <>
                  따라 만들고 싶은 상세페이지가 있으면 넣습니다.{" "}
                  <strong className="text-foreground">여러 장을 넣지 않습니다.</strong> 섹션마다 다른 결이 섞이면 한
                  페이지로 안 읽히기 때문에 한 장으로 제한합니다.
                </>
              ),
            },
            {
              title: "등장인물 — 같은 사람을 여러 섹션에",
              body: (
                <>
                  저장해 둔 캐릭터를 붙이면 섹션이 바뀌어도 같은 사람이 나옵니다. 캐릭터를 만드는 법은{" "}
                  <Link href="/guide/character" className="font-bold text-primary underline underline-offset-4">
                    캐릭터 만들기
                  </Link>
                  에 있습니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="편집 화면 — 글자를 얹는 곳" hint="이미지가 나온 뒤에 문구를 올립니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          섹션 이미지가 만들어지면 편집기가 열립니다. 여기서 <strong className="text-foreground">문구를 이미지 위에
          얹습니다.</strong> 이미지 안에 글자를 그려 넣는 것이 아니라 위에 올리는 것이라, 몇 번을 고쳐도 크레딧이
          차감되지 않습니다.
        </p>
        <Mock title="상세페이지 만들기 · 편집">
          <MockSteps steps={["이미지 업로드", "AI 분석", "섹션 생성", "편집 · 내보내기"]} current={3} />
          <MockChoices
            label="얹을 문구 고르기"
            marker={1}
            columns={4}
            active={0}
            items={[{ title: "헤드라인" }, { title: "보조 제목" }, { title: "핵심 문구" }, { title: "신뢰 문구" }]}
          />
          <MockField label="강조할 낱말" value="수분이 · 68%" marker={2} note="고른 낱말만 크게·굵게 그려집니다." />
          <MockNote marker={3}>구매 버튼은 만들지 않습니다. 이미지에 그리면 눌리지 않는 그림 버튼이 됩니다.</MockNote>
          <MockButtons items={[{ label: "내보내기" }]} />
        </Mock>
        <Callouts
          items={[
            {
              title: "문구 자리는 네 가지",
              body: "헤드라인·보조 제목·핵심 문구·신뢰 문구입니다. 자리마다 크기와 굵기가 정해져 있어서 페이지 전체가 흐트러지지 않습니다.",
            },
            {
              title: "강조할 낱말",
              body: "제목에서 크게 보이고 싶은 낱말만 고릅니다. 조사가 붙은 덩어리 그대로 고르세요 — 「수분이」를 「수분」과 「이」로 나누면 어긋납니다.",
            },
            {
              title: "구매 버튼은 만들지 않습니다",
              body: "이미지에 그린 버튼은 눌리지 않습니다. 실제 구매 버튼은 쇼핑몰이 붙이는 것이라 여기서 그리면 오히려 혼란을 만듭니다.",
            },
          ]}
        />
      </Section>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["상품 사진이 있다", "사진으로 시작", "제품에서 확인되는 것을 근거로 씁니다"],
            ["아직 사진이 없다", "글로 시작", "시나리오와 대표 이미지를 먼저 만듭니다"],
            ["따라 하고 싶은 페이지가 있다", "스타일 레퍼런스 한 장", "레이아웃과 색 문법을 가져옵니다"],
            ["모델이 여러 섹션에 나와야 한다", "등장인물 붙이기", "섹션이 바뀌어도 같은 사람이 나옵니다"],
            ["이미 있는 페이지를 고치고 싶다", "리디자인 도구", "이 도구는 새로 만드는 쪽입니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "심사에서 계속 미달이 뜹니다",
              a: "「대상」과 「차별점」에서 자주 걸립니다. 누구에게 파는지 한 사람이 떠오를 만큼 좁히고, 경쟁 상품에 그대로 붙여도 말이 되는 문장을 빼세요. 방식이나 포기한 것, 검증 가능한 숫자 중 하나는 있어야 합니다.",
            },
            {
              q: "문구에 없는 효능이 적혀 있습니다",
              a: "「근거」 심사가 이것을 잡습니다. 그래도 남았다면 편집 화면에서 직접 고치세요. 확인되지 않은 성분·인증·수치는 빼는 편이 안전합니다.",
            },
            {
              q: "섹션마다 사람 얼굴이 다릅니다",
              a: "등장인물을 붙이지 않으셨을 겁니다. 캐릭터를 먼저 만들어 저장한 뒤 붙이면 같은 사람이 유지됩니다.",
            },
            {
              q: "문구를 고치면 크레딧이 또 차감되나요",
              a: "아닙니다. 편집 화면의 문구는 이미지 위에 얹는 것이라 몇 번을 고쳐도 차감되지 않습니다. 차감은 섹션 이미지를 만들 때만 일어납니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/detail-page" toolHref="/create" toolLabel="상세페이지 만들기 열기" />
    </>
  );
}
