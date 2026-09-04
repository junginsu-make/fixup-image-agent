import type { Metadata } from "next";
import Link from "next/link";
import { POSTER_RATIOS } from "@fixup/sns-core";
import { ATTACHMENT_ROLE_HINT, ATTACHMENT_ROLE_LABEL } from "@fixup/shared";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import {
  Callouts,
  Mock,
  MockButtons,
  MockChoices,
  MockField,
  MockSteps,
} from "../_components/mockup";

export const metadata: Metadata = { title: "이미지 만들기 — 사용 설명서" };

const STEPS = ["01 레퍼런스", "02 규격", "03 지시", "04 기획 확인", "05 결과"];

/** 역할 어휘는 코드가 단일 출처다. */
const PRESERVE_ITEMS = (["preserve_product", "preserve_person"] as const).map((role) => ({
  title: ATTACHMENT_ROLE_LABEL[role],
  hint: ATTACHMENT_ROLE_HINT[role],
}));

export default function ImageGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="이미지 만들기"
        title="한 장짜리 이미지 — 광고 소재 · 포스터"
        lead="여러 장으로 나누지 않고 한 장으로 끝내는 것들입니다. 광고 소재, 행사 포스터, 썸네일, 배너. 따라 만들 이미지 한 장을 고르고 한 줄만 적으면, 나머지 열 개 남짓한 칸은 AI가 초안으로 채웁니다. 사람은 틀린 칸만 고칩니다."
      />

      <Section title="전체 흐름" hint="다섯 단계입니다.">
        <Flow
          nodes={[
            { label: "01 레퍼런스", sub: "따라 만들 이미지" },
            { label: "02 규격", sub: "비율 · 모델 · 장수" },
            { label: "03 지시", sub: "한 줄만" },
            { label: "04 기획 확인", sub: "틀린 칸만", human: true },
            { label: "05 결과", sub: "고르고 검수" },
          ]}
        />
        <FlowLegend />
      </Section>

      <Section title="무엇이 다른가">
        <DiffList
          items={[
            {
              common: "프롬프트를 길게 잘 써야 좋은 결과가 나온다",
              ours: "한 줄만 쓰면 나머지 칸을 AI가 채웁니다",
              why: "「필름 카메라 감성의 사진전 포스터」 한 줄이면 됩니다. 헤드라인, 장면, 등장 인물, 색 배분, 금지할 것까지 열 개 남짓한 칸을 AI가 초안으로 채우고, 04에서 사람이 틀린 칸만 고칩니다. 프롬프트 쓰는 법을 배우지 않아도 됩니다.",
            },
            {
              common: "레퍼런스는 분위기만 흐릿하게 반영된다",
              ours: "레퍼런스에서 무엇을 가져올지 말로 정합니다",
              why: "「따라 만들기」로 넣으면 레이아웃·서체·색 문법을 가져오고 내용만 바꿉니다. 제품이나 인물을 그대로 지켜야 하면 그 그림은 역할을 달리해서 따로 넣습니다.",
            },
            {
              common: "마음에 안 들면 처음부터 다시 쓴다",
              ours: "칸 단위로 고쳐서 다시 만듭니다",
              why: "헤드라인만 틀렸으면 그 칸만 고칩니다. 나머지 칸은 그대로 두고 다시 만들면 됩니다.",
            },
          ]}
        />
      </Section>

      <Section title="01 레퍼런스 — 화면 읽기" hint="여기서는 레퍼런스가 필수입니다. 한 장 이상 골라야 넘어갑니다.">
        <Mock title="이미지 만들기 · 01 레퍼런스">
          <MockSteps steps={STEPS} current={0} />
          <MockChoices
            label="따라 만들 이미지"
            marker={1}
            columns={3}
            active={0}
            items={[{ title: "레퍼런스 A", hint: "선택됨" }, { title: "레퍼런스 B" }, { title: "+ 올리기" }]}
          />
          <MockChoices
            label="그대로 지킬 것 · 선택"
            marker={2}
            columns={2}
            items={PRESERVE_ITEMS}
          />
          <MockButtons items={[{ label: "규격 고르기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "따라 만들 레퍼런스 — 한 장 이상 필수",
              body: (
                <>
                  이 도구는 레퍼런스 없이 시작할 수 없습니다. <strong className="text-foreground">「무엇을 만들지」가
                  아니라 「어떤 결로 만들지」를 그림으로 먼저 정하기</strong> 때문입니다. 마음에 드는 포스터나 광고
                  이미지를 올리거나 라이브러리에서 고르세요.
                </>
              ),
            },
            {
              title: "그대로 지킬 것 — 필요할 때만",
              body: (
                <>
                  실제 제품 사진이나 특정 인물이 결과에 그대로 나와야 할 때 추가합니다. 레퍼런스와는 다른 자리입니다 —
                  레퍼런스는 <strong className="text-foreground">결</strong>을, 이쪽은{" "}
                  <strong className="text-foreground">생김새</strong>를 가져옵니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="02 규격 · 03 지시 — 화면 읽기">
        <Mock title="이미지 만들기 · 02 규격">
          <MockSteps steps={STEPS} current={1} />
          <MockChoices
            label="비율"
            marker={1}
            active={3}
            items={POSTER_RATIOS.slice(0, 4).map((ratio) => ({ title: ratio.id, hint: ratio.label }))}
            note={`인쇄까지 생각한 목록이라 ${POSTER_RATIOS.length}가지가 있습니다.`}
          />
          <MockChoices
            label="변형 장수"
            marker={2}
            columns={3}
            active={2}
            items={[{ title: "1장" }, { title: "2장" }, { title: "3장" }]}
          />
          <MockButtons items={[{ label: "이전", variant: "quiet" }, { label: "지시 쓰기" }]} />
        </Mock>

        <Mock title="이미지 만들기 · 03 지시">
          <MockSteps steps={STEPS} current={2} />
          <MockField label="작업 이름" placeholder="가을 사진전" />
          <MockField
            label="한 줄 지시"
            placeholder="필름 카메라 감성의 사진전 포스터"
            marker={3}
            rows={2}
            note="나머지 칸은 AI 가 초안으로 채웁니다. 다음 화면에서 고칩니다."
          />
          <MockButtons items={[{ label: "이전", variant: "quiet" }, { label: "기획 시작" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "비율 — 인쇄까지 포함",
              body: (
                <>
                  카드뉴스보다 목록이 넓습니다. 화면용({POSTER_RATIOS.slice(0, 3).map((r) => r.id).join(" · ")})에 더해
                  포스터 세로와 A4가 있습니다. <strong className="text-foreground">A4 인쇄용은 GPT Image 2로만
                  만들 수 있습니다</strong> — 픽셀을 직접 지정해야 하기 때문입니다. 「A4 비율 시안」은 화면 확인용이라
                  실제 인쇄에는 해상도가 모자랍니다.
                </>
              ),
            },
            {
              title: "변형 장수 — 최대 3장",
              body: (
                <>
                  같은 지시로 서로 다른 안을 몇 개 볼지입니다. 장수만큼 크레딧이 차감됩니다. 처음에는 3장으로 여러 안을
                  보고, 방향이 잡히면 1장으로 좁히는 편이 낫습니다.
                </>
              ),
            },
            {
              title: "한 줄 지시 — 길게 쓰지 마세요",
              body: (
                <>
                  <strong className="text-foreground">무엇을 만드는지</strong>만 적으면 됩니다. 색, 구도, 서체를 여기
                  적을 필요가 없습니다 — 그건 레퍼런스가 정하고, 세부는 다음 화면에서 칸별로 고칩니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="04 기획 확인 — AI가 채운 칸을 고치는 곳" hint="이 도구의 핵심 화면입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          한 줄만 적었는데 아래처럼 칸이 채워져 나옵니다. <strong className="text-foreground">전부 고칠 필요는
          없습니다.</strong> 눈에 걸리는 칸만 고치고 넘어가세요.
        </p>
        <Mock title="이미지 만들기 · 04 기획 확인">
          <MockSteps steps={STEPS} current={3} />
          <MockField label="헤드라인 — 가장 크게 들어갈 말" value="가을, 필름에 담다" marker={1} />
          <MockField label="보조 문구" value="10.1 – 10.30 · 시청 갤러리" />
          <MockField label="장면" value="빛바랜 필름 사진이 벽에 걸린 전시장" marker={2} />
          <MockField label="등장 — 사람 / 제품" value="관람객 뒷모습 한 명" />
          <MockField label="주조색 · 강조색" value="따뜻한 베이지 · 짙은 갈색" marker={3} />
          <MockField label="넣지 말 것" value="현대적인 디지털 카메라" marker={4} />
          <MockButtons items={[{ label: "이미지 만들기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "헤드라인 — 이미지에 가장 크게 그려질 글자",
              body: "여기 적은 글자가 그대로 이미지에 들어갑니다. 짧을수록 잘 읽힙니다. 이 칸을 비우면 글자 없는 이미지가 나옵니다.",
            },
            {
              title: "장면 · 등장 — 무엇이 그려질지",
              body: "배경과 등장 대상입니다. 사람을 넣을 거라면 나이·관계·차림새까지 적으면 더 정확합니다. 특정 인물이어야 한다면 01에서 「인물 그대로 지키기」로 사진을 넣으세요.",
            },
            {
              title: "주조색 · 강조색",
              body: "레퍼런스에서 가져온 색이 채워져 있습니다. 브랜드 색이 정해져 있으면 여기서 바꾸세요.",
            },
            {
              title: "넣지 말 것 — 자주 잊는 칸",
              body: (
                <>
                  결과에 자꾸 나오는데 원하지 않는 것을 적습니다. 「사람 얼굴」, 「영어 문구」, 「로고」처럼 적으면
                  됩니다. <strong className="text-foreground">한 번 만들어 보고 거슬리는 게 생기면 그때 채우는 칸</strong>
                  입니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["인스타 광고 소재", "4:5 · 변형 3장", "피드에서 크게 잡히고, 여러 안을 비교할 수 있습니다"],
            ["행사 포스터를 인쇄한다", "A4 인쇄용 · GPT Image 2", "약 290dpi로 나옵니다. 다른 모델은 이 비율을 못 만듭니다"],
            ["화면으로만 볼 시안", "A4 비율 시안", "인쇄 해상도가 필요 없으면 이쪽이 쌉니다"],
            ["글자가 많이 들어간다", "GPT Image 2", "글자가 가장 정확합니다"],
            ["글자가 거의 없는 배경 이미지", "Nano Banana", "가장 저렴합니다"],
            ["제품이 실물 그대로 나와야 한다", "「제품 그대로 지키기」 추가", "형태·색·라벨이 유지됩니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "레퍼런스를 안 골랐는데 다음으로 안 넘어갑니다",
              a: "이 도구는 레퍼런스가 필수입니다. 한 장 이상 골라야 합니다. 참고할 이미지가 아예 없다면 카드뉴스나 상세페이지 도구가 더 맞을 수 있습니다.",
            },
            {
              q: "A4 인쇄용이 회색으로 안 눌립니다",
              a: "다른 모델을 고르셨을 겁니다. A4 인쇄용은 픽셀을 직접 지정해야 해서 GPT Image 2로만 만들 수 있습니다.",
            },
            {
              q: "결과에 원하지 않는 것이 자꾸 나옵니다",
              a: "04 기획 확인의 「넣지 말 것」 칸에 적고 다시 만드세요. 프롬프트에 「~를 넣지 마라」를 적는 것보다 이 칸이 확실합니다.",
            },
            {
              q: "레퍼런스와 너무 똑같이 나옵니다",
              a: (
                <>
                  「따라 만들기」는 레이아웃·서체·색 문법을 가져오는 역할입니다. 더 달라지길 원하면 03 한 줄 지시를 더
                  구체적으로 쓰거나, 04에서 장면·색 칸을 직접 바꾸세요. 역할 설명은{" "}
                  <Link href="/guide" className="font-bold text-primary underline underline-offset-4">
                    처음 오셨다면
                  </Link>
                  에 있습니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/image" toolHref="/poster" toolLabel="이미지 만들기 열기" />
    </>
  );
}
