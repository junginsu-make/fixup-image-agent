import { guideMetadata } from "../../../lib/seo/metadata";
import Link from "next/link";
import { IMAGE_MODELS, REVIEW_CRITERIA } from "@fixup/pdp-core";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts, Mock, MockButtons, MockChoices, MockField, MockNote, MockSteps, MockTabs } from "../_components/mockup";
import { COPY_SLOTS } from "../../create/copy-slots";
import { CREATE_STEPS } from "../../create/create-steps";
import { DRAFT_RETENTION_DAYS } from "../../create/draft-retention";

export const metadata = guideMetadata("/guide/detail-page");

/** 화면의 단계 이름 그대로. 손으로 적으면 이름이 바뀔 때 설명서만 남는다. */
const 단계 = CREATE_STEPS.image.map((step) => step.label);

/** 한 번에 보내는 장 수(모델마다 다르다). 「3장 또는 6장」처럼 읽힌다. */
const 묶음 = [...new Set(IMAGE_MODELS.filter((model) => !model.characterOnly).map((model) => model.maxBatchSize))]
  .sort((a, b) => a - b)
  .map((size) => `${size}장`)
  .join(" 또는 ");

/**
 * 편집기 「카피」 탭의 단추 이름. 화면이 영어로 적는다.
 * `Key Points` 는 목록이 아니라 `PdpEditor.tsx` 에서 따로 그린다.
 */
const 카피단추 = [...COPY_SLOTS.map((slot) => slot.label), "Key Points"];

export default function DetailPageGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="상세페이지 만들기"
        title="사진 한 장 또는 글만으로 상세페이지를"
        lead="쇼핑몰 상품 페이지에 들어가는 긴 세로 이미지입니다. 상품 사진 한 장을 올리거나, 사진 없이 무엇을 파는지 글로만 적어도 됩니다. 구성안을 먼저 짜고 문구를 고친 뒤, 그 문구까지 그려 넣은 섹션 이미지를 만듭니다."
      />

      <Summary
        what="상품 사진 한 장 또는 글만으로 쇼핑몰 상세페이지를 만듭니다."
        points={[
          {
            title: "사진으로도 글로도 시작합니다",
            body: "상품 사진이 있으면 읽어서 시작하고, 없으면 설명 글만으로도 만듭니다.",
          },
          {
            title: "문구까지 이미지에 들어갑니다",
            body: "섹션 이미지에 문구를 함께 그려서 만듭니다. 이미지 속 문구를 바꾸려면 그 섹션을 다시 만듭니다.",
          },
          {
            title: "심사를 거칩니다",
            body: "만든 구성안을 정해진 항목으로 채점합니다. 미달이어도 막지 않고, 무엇이 걸렸는지 알려 줍니다.",
          },
          {
            title: "분석은 무료입니다",
            body: "사진을 읽고 구성안을 짜는 데는 크레딧이 들지 않습니다. 그림을 만들 때만 차감합니다.",
          },
        ]}
        when={[
          "쇼핑몰에 올릴 상세페이지가 필요할 때",
          "상품 사진은 있는데 페이지 구성을 못 잡겠을 때",
          "문구까지 들어간 섹션 이미지를 한 번에 받고 싶을 때",
        ]}
      />

      <Section title="들어가는 길이 둘입니다" hint="가진 것에서 시작하세요.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <strong className="block text-sm font-extrabold">이미지로 시작</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              상품 사진 한 장을 올립니다. 시스템이 사진을 먼저 읽어{" "}
              <strong className="text-foreground">형태 · 색 · 재질 · 라벨에 적힌 글자</strong>를 확인하고, 거기서 확인된
              것만 근거로 구성안을 짭니다.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <strong className="block text-sm font-extrabold">텍스트로 시작</strong>
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
            { label: "01 이미지 / 텍스트", sub: "가진 것에서" },
            { label: 단계[1]!, sub: "AI 초안 고치기", human: true },
            { label: 단계[2]!, sub: "문구까지 그린 이미지" },
            { label: 단계[3]!, sub: "확인 · 다운로드", human: true },
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
              why: "심사자에게는 구성안과 판매 원칙만 주고 원래 브리프는 주지 않습니다. 사는 사람은 브리프를 못 보기 때문입니다. 미달이면 지적을 담아 다시 만들어 봅니다.",
            },
            {
              common: "섹션을 한 장씩 눌러 만든다",
              ours: "남은 섹션을 한 번에 만듭니다",
              why: `한 번 누르면 모델에 따라 ${묶음}씩 나눠 보냅니다. 한꺼번에 보내면 오래 걸려 중간에 끊기기 때문입니다. 한 번에 만들어도 크레딧은 장마다 차감되고, 나온 장만 차감됩니다.`,
            },
          ]}
        />
      </Section>

      <Section title="심사는 무엇을 보나" hint="구성안을 이 항목들로 채점합니다. 미달이어도 다음으로 넘어갈 수 있습니다.">
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
          하나라도 미달이면 지적사항을 담아 구성안을 다시 만들어 봅니다. 이미지로 시작하면 한 번, 텍스트로 시작하면
          두 번까지입니다. 끝까지 남은 지적은 감추지 않고 화면에 띄웁니다. 미달이 남아도 막지 않으니, 섹션 카드에서
          직접 고치고 넘어가면 됩니다.{" "}
          <strong className="text-foreground">통과하지 못한 채로 넘어갔다는 사실을 아는 편이 낫습니다.</strong>
        </p>
      </Section>

      <Details title="이미지로 시작 · 화면 읽기">
        <Mock title="상세페이지 만들기 · 이미지 업로드">
          <MockSteps steps={단계} current={0} />
          <MockTabs items={["이미지로 시작", "텍스트로 시작"]} active={0} marker={1} />
          <MockChoices
            label="원본 이미지 업로드"
            marker={2}
            columns={2}
            active={0}
            items={[{ title: "제품 이미지", hint: "한 장" }, { title: "저장된 이미지에서 고르기" }]}
          />
          <MockChoices
            label="인물 · 캐릭터 · 선택"
            marker={3}
            columns={2}
            items={[{ title: "인물 사진 1장" }, { title: "저장해 둔 캐릭터", hint: "여러 섹션에 같은 사람" }]}
          />
          <MockChoices
            label="디자인 레퍼런스 · 선택"
            marker={4}
            columns={2}
            items={[{ title: "따라 만들 페이지", hint: "페이지당 한 장만" }, { title: "+ 고르기" }]}
          />
          <MockButtons items={[{ label: "AI 분석 시작하기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "이미지 / 텍스트 · 어느 쪽으로 시작할지",
              body: "사진이 있으면 이미지로 시작하는 쪽이 정확합니다. 제품에서 확인되는 것을 근거로 삼기 때문입니다. 사진이 없으면 텍스트로 시작하세요.",
            },
            {
              title: "제품 이미지 · 한 장을 올립니다",
              body: "올리는 자리는 한 장입니다. 라벨 글자가 읽히는 사진일수록 좋습니다. 거기서 근거를 가져옵니다. 계정에 이미 있는 이미지는 「저장된 이미지에서 고르기」로 가져옵니다.",
            },
            {
              title: "인물 · 캐릭터 · 같은 사람을 여러 섹션에",
              body: (
                <>
                  인물 사진 1장이나 저장해 둔 캐릭터 중 하나를 씁니다. 붙이면 섹션이 바뀌어도 같은 사람이 나옵니다.
                  캐릭터를 만드는 법은{" "}
                  <Link href="/guide/character" className="font-bold text-primary underline underline-offset-4">
                    캐릭터 만들기
                  </Link>
                  에 있습니다.
                </>
              ),
            },
            {
              title: "디자인 레퍼런스 · 페이지당 한 장만",
              body: (
                <>
                  따라 만들고 싶은 상세페이지가 있으면 넣습니다. 레이아웃·분위기·폰트·색을 따라가고, 그 안의 제품·인물은
                  가져오지 않습니다. <strong className="text-foreground">여러 장을 넣지 않습니다.</strong> 섹션마다 다른
                  결이 섞이면 한 페이지로 안 읽히기 때문에 한 장으로 제한합니다.
                </>
              ),
            },
          ]}
        />
      </Details>

      <Details title="편집 화면 · 문구는 이미지 안에 있습니다" hint="섹션 이미지에 문구가 그려져 나옵니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          섹션 이미지가 만들어지면 편집기가 열립니다. 섹션 이미지에는{" "}
          <strong className="text-foreground">구성안의 제목·부제·핵심 문구가 이미 그려져 있습니다.</strong> 이미지 속
          문구를 바꾸려면 「{단계[1]}」에서 문구를 고친 뒤 그 섹션을 「이미지 다시 만들기」로 다시 만듭니다. 다시 만들
          때마다 크레딧이 듭니다.
        </p>
        <Mock title="상세페이지 만들기 · 편집">
          <MockSteps steps={단계} current={3} />
          <MockTabs items={["이미지", "텍스트 편집", "카피"]} active={0} marker={1} />
          <MockField
            label="제목에서 강조할 낱말"
            value="수분이 · 68%"
            marker={2}
            note="누른 낱말이 강조색으로 굵게 그려집니다."
          />
          <MockButtons items={[{ label: "이미지 다시 만들기" }]} marker={3} />
          <MockNote marker={4}>구매 버튼은 만들지 않습니다. 이미지에 그리면 눌리지 않는 그림 버튼이 됩니다.</MockNote>
          <MockButtons items={[{ label: "이어보기 다운로드", variant: "quiet" }, { label: "전체 다운로드" }]} />
        </Mock>
        <Callouts
          items={[
            {
              title: "이미지 탭 · 다시 만들 때 정합니다",
              body: "그 섹션의 연출과 강조할 낱말을 정한 뒤 「이미지 다시 만들기」를 누릅니다. 문구를 고친 뒤 아직 다시 만들지 않은 섹션에는 「이전 구성의 결과」 표시가 붙습니다.",
            },
            {
              title: "강조할 낱말",
              body: "제목에서 크게 보이고 싶은 낱말만 고릅니다. 안 고르면 AI가 알아서 한두 낱말을 고릅니다. 조사가 붙은 덩어리 그대로 고르세요. 「수분이」를 「수분」과 「이」로 나누면 어긋납니다.",
            },
            {
              title: "카피 · 텍스트 편집 탭 · 더 얹고 싶을 때만",
              body: `「카피」 탭의 ${카피단추.join(" · ")} 단추를 누르면 그 문구를 이미지 위에 한 겹 더 얹습니다. 「텍스트 편집」에서 크기와 색을 바꾸고, 「배경 사각형 추가」로 바탕을 깝니다. 문구는 이미 이미지에 들어 있으니 따로 더 넣고 싶을 때만 씁니다. 얹는 것은 크레딧이 들지 않습니다.`,
            },
            {
              title: "내려받기 · 두 가지",
              body: "「이어보기 다운로드」는 섹션을 위아래로 붙인 긴 한 장으로, 「전체 다운로드」는 섹션마다 한 장씩 압축 파일 하나로 받습니다.",
            },
            {
              title: "구매 버튼은 만들지 않습니다",
              body: "이미지에 그린 버튼은 눌리지 않습니다. 실제 구매 버튼은 쇼핑몰이 붙이는 것이라 여기서 그리면 오히려 혼란을 만듭니다.",
            },
          ]}
        />
      </Details>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["상품 사진이 있다", "이미지로 시작", "제품에서 확인되는 것을 근거로 씁니다"],
            ["아직 사진이 없다", "텍스트로 시작", "시나리오와 대표 이미지를 먼저 만듭니다"],
            ["따라 하고 싶은 페이지가 있다", "디자인 레퍼런스 한 장", "레이아웃과 색 문법을 가져옵니다"],
            ["모델이 여러 섹션에 나와야 한다", "인물 · 캐릭터 붙이기", "섹션이 바뀌어도 같은 사람이 나옵니다"],
            ["이미 있는 페이지를 고치고 싶다", "리디자인 도구", "이 도구는 새로 만드는 쪽입니다"],
          ]}
        />
      </Section>

      <Section title="만든 것은 어디에 남나" hint="작업과 이미지가 따로 남습니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">만드는 중인 작업은 이 브라우저에 30초마다 자동으로 저장됩니다.</strong>{" "}
          첫 화면의 「이어서 작업하기」에서 다시 열 수 있고, 마지막으로 저장한 지 {DRAFT_RETENTION_DAYS}일이 지나면
          자동으로 지워집니다. 브라우저에 남는 것이라 다른 기기에서는 보이지 않습니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">섹션 이미지를 다 만들면 라이브러리에 한 작업으로 자동으로 올라갑니다.</strong>{" "}
          그 뒤에 바꾼 것이 라이브러리에 안 보이면 편집 화면의 「라이브러리에 저장」 단추를 누르세요.
        </p>
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
              a: `「근거」 심사가 이것을 잡습니다. 그래도 남았다면 「${단계[1]}」에서 그 문구를 고친 뒤 그 섹션을 다시 만드세요. 이미지 안에 그려진 글자라 편집 화면에서 지울 수 없습니다. 확인되지 않은 성분·인증·수치는 빼는 편이 안전합니다.`,
            },
            {
              q: "섹션마다 사람 얼굴이 다릅니다",
              a: "「인물 · 캐릭터」를 붙이지 않으셨을 겁니다. 캐릭터를 먼저 만들어 저장한 뒤 붙이면 같은 사람이 유지됩니다.",
            },
            {
              q: "문구를 고치면 크레딧이 또 차감되나요",
              a: "구성안에서 문구를 고치는 것은 차감되지 않습니다. 다만 이미지 속 문구는 그 섹션을 다시 만들어야 바뀌고, 다시 만들 때마다 크레딧이 듭니다. 편집 화면에서 글자나 도형을 더 얹는 것은 차감되지 않습니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/detail-page" toolHref="/create" toolLabel="상세페이지 만들기 열기" />
    </>
  );
}
