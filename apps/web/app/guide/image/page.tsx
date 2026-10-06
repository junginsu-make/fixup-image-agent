import { guideMetadata } from "../../../lib/seo/metadata";
import Link from "next/link";
import { IMAGE_MODELS, POSTER_RATIOS } from "@fixup/sns-core";
import {
  IMAGE_CREDIT_POLICY, IMAGE_LOOKS, IMAGE_LOOK_HINT, IMAGE_LOOK_LABEL, looksWithoutReference, withJosa,
} from "@fixup/shared";
import { ATTACHMENT_ROLE_HINT, ATTACHMENT_ROLE_LABEL } from "@fixup/shared";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import {
  Callouts,
  Mock,
  MockButtons,
  MockChoices,
  MockField,
  MockNote,
  MockSteps,
} from "../_components/mockup";
import { POSTER_STEPS } from "../../poster/steps";

/**
 * 산문에서 그림체를 늘어놓을 때 쓰는 이름들.
 *
 * **손으로 적지 않는다.** 「실사·애니·3D·그림」이라고 박아 뒀더니 이름을 바꾼
 * 뒤 설명서만 옛 이름으로 남았다(2026-09-16 리뷰. 목록을 그리는 자리는 고쳤는데
 * 산문 두 줄이 남아 있었다).
 *
 * 따라갈 그림이 없을 때 고르는 것들이라 「레퍼런스 스타일」은 뺀다.
 */
const LOOK_NAMES = looksWithoutReference().map((look) => IMAGE_LOOK_LABEL[look]).join("·");

export const metadata = guideMetadata("/guide/image");

/**
 * **화면이 쓰는 목록을 그대로 쓴다.**
 *
 * 손으로 옮겨 적었더니 2026-09-16 에 차례를 바꾼 뒤 설명서만 옛 차례로 남았다.
 * 설명서는 틀려도 아무도 안 아프다 — 화면은 멀쩡히 돌고 시험도 통과한다.
 */
const STEPS = POSTER_STEPS.map((step) => step.label);

/**
 * 역할 어휘는 코드가 단일 출처다.
 *
 * **화면은 그림마다 넷 중 하나를 고른다**(`poster/_components/reference-picker.tsx`
 * 의 `POSTER_ROLES`). 전에는 여기서 「지키기」 둘만 보여 줘, 화면에 있는
 * 「사람은 그대로, 그림 느낌만」을 설명서에서 찾을 수 없었다(2026-09-29 대조).
 */
const ROLE_ITEMS = (["style", "preserve_product", "preserve_person", "preserve_person_restyled"] as const).map((role) => ({
  title: ATTACHMENT_ROLE_LABEL[role],
  hint: ATTACHMENT_ROLE_HINT[role],
}));

/**
 * 픽셀을 직접 지정하는 방식들 — A4 인쇄용·「첨부한 그림과 같은 비율」은 이것들만
 * 만든다(`sns-core` 의 `resolveFrom`). **이름을 손으로 적지 않는다.** 전에는
 * 「정밀형으로만」이라고 적어 두었는데 표준형·정밀형 플러스도 만든다.
 */
const PIXEL_MODEL_NAMES = IMAGE_MODELS.filter((model) => model.pixelSizeLimits).map((model) => model.label).join("·");

/** 비율 버튼의 이름표. 화면(`poster/new-client.tsx`)이 버튼에 그대로 적는 말이다. */
const RATIO_LABEL = (id: string) => POSTER_RATIOS.find((ratio) => ratio.id === id)?.label ?? id;

/** 코드에서 가져온 이름 뒤에 붙일 조사만. 이름이 바뀌어도 받침이 맞게 따라간다. */
const 조사 = (word: string, pair: Parameters<typeof withJosa>[1]) => withJosa(word, pair).slice(word.length);

/** 차감은 방식과 무관하다. 큰 그림만 한 장에 더 든다(`@fixup/shared` 의 `imageCredits`). */
const { normalUnits: 보통크레딧, largeUnits: 큰그림크레딧 } = IMAGE_CREDIT_POLICY;

export default function ImageGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="이미지 만들기"
        title="한 장짜리 이미지 · 광고 소재 · 포스터"
        lead="여러 장으로 나누지 않고 한 장으로 끝내는 것들입니다. 광고 소재, 행사 포스터, 썸네일, 배너. 따라 만들 이미지 한 장을 고르고 한 줄만 적으면, 나머지 열 개 남짓한 칸은 AI가 초안으로 채웁니다. 사람은 틀린 칸만 고칩니다."
      />

      <Summary
        what="광고 소재·포스터·일반 이미지를 한 장씩 만듭니다. 글만으로도 되고, 따라 만들 그림을 붙이면 그 결을 따라갑니다."
        points={[
          {
            title: "글만으로도 됩니다",
            body: "무엇을 만들지 한 줄만 쓰면 됩니다. 따라 만들 그림은 선택입니다. 붙이면 그 결을 따라가고, 안 붙이면 글만 보고 그립니다.",
          },
          {
            title: "기획을 먼저 보여 줍니다",
            body: "AI가 채운 칸을 사람이 고친 뒤에 그림을 부릅니다. 고칠 일은 돈이 들기 전에 고칩니다.",
          },
          {
            title: "규격을 골라 둡니다",
            body: "비율과 장수를 먼저 정합니다. 만든 뒤에 크기를 바꾸는 것은 다시 만드는 일입니다.",
          },
          {
            title: "만든 것은 라이브러리로",
            body: "결과물이 쌓여 다음 작업의 재료가 됩니다. 광고 규격 내보내기도 여기서 가져다 씁니다.",
          },
        ]}
        when={[
          "배너·포스터처럼 한 장짜리 그림이 필요할 때",
          "참고할 그림은 있는데 프롬프트로 옮기기 어려울 때",
          "같은 결로 여러 장을 뽑아 고르고 싶을 때",
        ]}
      />

      <Section title="전체 흐름" hint="다섯 단계입니다.">
        <Flow
          nodes={[
            { label: "01 지시", sub: "무엇을 만들까" },
            { label: "02 레퍼런스", sub: "따라 만들 이미지 · 선택" },
            { label: "03 규격", sub: "비율 · 모델 · 장수" },
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

      <Details title="01 지시 · 화면 읽기" hint="무엇을 만들지부터 씁니다. 그림은 다음 화면에서, 그것도 선택입니다.">
        <Mock title="이미지 만들기 · 01 지시">
          <MockSteps steps={STEPS} current={0} />
          <MockField label="작업 이름 · 선택" placeholder="가을 사진전" />
          <MockField
            label="무엇을 만들까 · 한두 줄 · 선택"
            placeholder="필름 카메라 감성의 사진전 포스터"
            marker={1}
            rows={2}
            note="편하게 쓰세요. AI 가 구도·색·문구를 정해 04 기획 확인에서 보여드립니다."
          />
          <MockNote marker={2}>꼭 지킬 말이 있나요? · 선택 · 눌러서 펼치기</MockNote>
          <MockField
            label="꼭 지킬 말"
            placeholder="예: 배경은 밤, 창밖에 네온"
            rows={2}
            note="이 말은 프롬프트 맨 앞과 맨 뒤에 두 번 들어가 첨부한 그림보다도 셉니다."
          />
          <MockButtons items={[{ label: "다음" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "무엇을 만들까 · 이것만 있으면 시작됩니다",
              body: (
                <>
                  <strong className="text-foreground">따라 만들 그림은 없어도 됩니다.</strong> 무엇을 만들지 한 줄만
                  쓰면 그 글만 보고 그립니다. 그림을 붙이면 그 그림체를 따라가고, 안 붙이면 다음 화면에서 고른
                  그림체({LOOK_NAMES})로 그립니다. 반대로 이 칸을 비우고 02에서 그림만 붙여도
                  됩니다. 둘 중 하나만 있으면 만들 수 있습니다.
                </>
              ),
            },
            {
              title: "꼭 지킬 말 · 가장 센 말",
              body: (
                <>
                  접혀 있어서 <strong className="text-foreground">「꼭 지킬 말이 있나요?」</strong>를 눌러야 펼쳐집니다.
                  여기 적은 말은 프롬프트의 <strong className="text-foreground">맨 앞과 맨 뒤 두 곳</strong>에 들어가고,
                  첨부한 그림보다도 셉니다. 긴 프롬프트에서 가운데 문장은 힘을 잃기 때문입니다. 한두 줄만 적으세요.
                </>
              ),
            },
            {
              title: "완성된 프롬프트가 있다면",
              body: (
                <>
                  「무엇을 만들까」에 그대로 넣으세요. 화면이 알아보고 <strong className="text-foreground">「그대로
                  생성」</strong>과 「AI가 다듬어서 생성」 중에 고르라고 묻습니다. 「그대로 생성」은 쓴 글을 고치지 않고
                  그대로 보내며, <strong className="text-foreground">04 기획 확인을 건너뜁니다</strong>. AI가 칸을
                  채우지 않아 고칠 것이 없습니다. 결과 화면 위 안내 줄의 「N장 만들기」를 누르면 바로 만듭니다.
                </>
              ),
            },
          ]}
        />
      </Details>

      <Details title="02 레퍼런스와 03 규격 · 화면 읽기" hint="그림은 선택입니다. 안 붙이면 01에 적은 글만 보고 그립니다.">
        <Mock title="이미지 만들기 · 02 레퍼런스">
          <MockSteps steps={STEPS} current={1} />
          <MockChoices
            label="쓸 이미지 · 선택"
            marker={1}
            columns={3}
            items={[{ title: "새 이미지 올리기" }, { title: "라이브러리에서 불러오기" }, { title: "캐릭터 불러오기" }]}
          />
          <MockChoices
            label="그림마다 역할 · 넷 중 하나"
            marker={2}
            columns={2}
            active={0}
            items={ROLE_ITEMS}
          />
          <MockField
            label="이 그림들을 어떻게 쓸까요 · 선택"
            placeholder="예: 1번 사진의 사람들을 2번 그림 느낌으로"
            rows={2}
            note="그림 왼쪽 위 번호로 부르면 됩니다. 여기 적은 말이 위에서 고른 역할보다 우선합니다."
          />
          {/*
            **이름을 손으로 적지 않는다.** 결 이름표는 `@fixup/shared` 가 갖고
            다섯 도구가 함께 쓴다. 손으로 적었더니 2026-09-16 에 이름을 바꾼 뒤
            설명서만 옛 이름으로 남았다.
          */}
          <MockChoices
            label="그림체 · 무엇으로 그릴까"
            marker={3}
            columns={3}
            active={1}
            items={IMAGE_LOOKS.map((look) => ({
              title: IMAGE_LOOK_LABEL[look],
              hint: IMAGE_LOOK_HINT[look],
            }))}
            note={`「${IMAGE_LOOK_LABEL.auto}」${withJosa(IMAGE_LOOK_LABEL.auto, "은는").slice(-1)} 따라 만들 그림을 붙여야 고를 수 있습니다. 안 붙였으면 흐리게 보입니다.`}
          />
          <MockButtons items={[{ label: "이전", variant: "quiet" }, { label: "다음" }]} />
        </Mock>

        <Mock title="이미지 만들기 · 03 규격">
          <MockSteps steps={STEPS} current={2} />
          {/* 화면은 버튼에 이름표(`label`)를 적는다. id(`a4-print`)는 화면에 없는 말이다. */}
          <MockChoices
            label="비율"
            marker={1}
            columns={3}
            active={0}
            items={POSTER_RATIOS.map((ratio) => ({ title: ratio.label }))}
            note={`인쇄까지 생각한 목록이라 ${POSTER_RATIOS.length}가지가 있습니다.`}
          />
          <MockChoices
            label="모델"
            columns={3}
            active={0}
            items={IMAGE_MODELS.map((model) => ({ title: model.label }))}
            note="고른 방식이 그 비율을 못 만들면 만들 수 있는 방식으로 바꾸고, 바꿨다고 여기 적습니다."
          />
          <MockChoices
            label="변형 장수"
            marker={2}
            columns={3}
            active={2}
            items={[{ title: "1장" }, { title: "2장" }, { title: "3장" }]}
          />
          {/* 값을 보여 준 자리에서 바로 만든다. 여기가 마지막 칸이다. */}
          <MockButtons items={[{ label: "이전", variant: "quiet" }, { label: "만들기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "역할 · 그림마다 고릅니다",
              body: (
                <>
                  붙인 그림마다 무엇을 가져올지 넷 중에서 고릅니다.
                  「{ATTACHMENT_ROLE_LABEL.style}」{조사(ATTACHMENT_ROLE_LABEL.style, "은는")} 레이아웃·서체·색만
                  가져오고, 나머지는 그 대상을 결과에 그대로 넣습니다. 인물은 한 명만 쓸 수 있습니다.{" "}
                  <strong className="text-foreground">「캐릭터 불러오기」</strong>로 넣은 캐릭터는
                  「{ATTACHMENT_ROLE_LABEL.preserve_person}」{조사(ATTACHMENT_ROLE_LABEL.preserve_person, "으로로")}{" "}
                  들어갑니다.
                </>
              ),
            },
            {
              title: "비율 · 인쇄까지 포함",
              body: (
                <>
                  카드뉴스보다 목록이 넓습니다. 화면용·가로 배너에 더해 포스터 세로와 A4,
                  「{RATIO_LABEL("match-source")}」{조사(RATIO_LABEL("match-source"), "이가")} 있습니다.{" "}
                  <strong className="text-foreground">
                    A4 인쇄용은 {withJosa(PIXEL_MODEL_NAMES, "으로로")} 만들 수 있습니다
                  </strong>
                  . 픽셀을 직접 지정해야 하기 때문입니다. 다른 방식을 골라 둔 채 이 비율을 고르면 화면이 만들 수 있는
                  방식으로 바꾸고, 모델 칸 아래에 그렇다고 적습니다. 「A4 비율 시안」은 화면 확인용이라 실제 인쇄에는
                  해상도가 모자랍니다.
                </>
              ),
            },
            {
              title: "변형 장수 · 최대 3장",
              body: (
                <>
                  같은 지시로 서로 다른 안을 몇 개 볼지입니다. 만든 장마다 {보통크레딧}크레딧이 들고, 어느 방식을
                  골라도 같습니다. <strong className="text-foreground">A4 인쇄용처럼 아주 큰 그림은 한 장에{" "}
                  {큰그림크레딧}크레딧</strong>입니다. 처음에는 3장으로 여러 안을 보고, 방향이 잡히면 1장으로 좁히는
                  편이 낫습니다.
                </>
              ),
            },
            {
              title: "무엇을 만들까 · 짧아도 됩니다",
              body: (
                <>
                  <strong className="text-foreground">무엇을 만드는지</strong>만 적어도 됩니다. 색, 구도, 서체를 여기
                  적을 필요가 없습니다. 그건 레퍼런스가 정하고, 세부는 04에서 칸별로 고칩니다. 완성된 프롬프트가
                  있으면 그대로 넣어도 됩니다.
                </>
              ),
            },
          ]}
        />
      </Details>

      <Details title="04 기획 확인 · AI가 채운 칸을 고치는 곳" hint="이 도구의 핵심 화면입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          한 줄만 적었는데 아래처럼 칸이 채워져 나옵니다. <strong className="text-foreground">04는 옆에서 열리는
          칸입니다.</strong> 03에서 「만들기」를 누르면 처음 한 번 저절로 열리고, 닫았으면 「기획 확인」을 눌러 다시
          엽니다. <strong className="text-foreground">전부 고칠 필요는 없습니다.</strong> 눈에 걸리는 칸만 고치고
          아래 「N장 만들기」를 누르세요(N은 03에서 고른 장수입니다). 「그대로 생성」을 골랐으면 칸이 비어 있으니
          고칠 것 없이 바로 누르면 됩니다.
        </p>
        <Mock title="이미지 만들기 · 04 기획 확인">
          <MockSteps steps={STEPS} current={3} />
          <MockField label="헤드라인" value="가을, 필름에 담다" marker={1} />
          <MockField label="받침 문구" value="10.1 – 10.30 · 시청 갤러리" />
          <MockField label="장면" value="빛바랜 필름 사진이 벽에 걸린 전시장" marker={2} />
          <MockField label="피사체" value="관람객 뒷모습 한 명" />
          <MockField label="지배색" value="따뜻한 베이지" marker={3} />
          <MockField label="강조색" value="짙은 갈색" />
          <MockField label="넣지 말 것" value="현대적인 디지털 카메라" marker={4} />
          <MockButtons items={[{ label: "3장 만들기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "헤드라인 · 이미지에 가장 크게 그려질 글자",
              body: "직접 적거나 고친 글자는 그대로 이미지에 들어갑니다. 짧을수록 잘 읽힙니다. 다만 글자 칸(헤드라인·받침 문구·곁텍스트)을 하나도 손대지 않았고 붙인 그림에도 글자가 없으면, AI가 채운 헤드라인은 넣지 않고 글자 없는 이미지로 만듭니다. 글자를 넣고 싶으면 이 칸을 한 번 고치세요.",
            },
            {
              title: "장면과 피사체 · 무엇이 그려질지",
              body: "배경과 등장 대상입니다. 사람을 넣을 거라면 나이·관계·차림새까지 적으면 더 정확합니다. 특정 인물이어야 한다면 02에서 「인물 그대로 지키기」로 사진을 넣으세요.",
            },
            {
              title: "지배색 · 강조색",
              body: "레퍼런스에서 가져온 색이 채워져 있습니다. 브랜드 색이 정해져 있으면 여기서 바꾸세요.",
            },
            {
              title: "넣지 말 것 · 자주 잊는 칸",
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
      </Details>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["인스타 광고 소재", "4:5 · 변형 3장", "피드에서 크게 잡히고, 여러 안을 비교할 수 있습니다"],
            [
              "행사 포스터를 인쇄한다",
              "A4 인쇄용",
              `약 290dpi로 나옵니다. ${withJosa(PIXEL_MODEL_NAMES, "으로로")} 만들고, 한 장에 ${큰그림크레딧}크레딧입니다`,
            ],
            ["화면으로만 볼 시안", "A4 비율 시안", `인쇄 해상도가 필요 없으면 이쪽이면 됩니다. 한 장에 ${보통크레딧}크레딧입니다`],
            ["글자가 많이 들어간다", "정밀형", "글자가 가장 정확합니다"],
            ["제품이 실물 그대로 나와야 한다", "「제품 그대로 지키기」 추가", "형태·색·라벨이 유지됩니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "따라 만들 그림이 없어도 되나요",
              a: `됩니다. 01에 무엇을 만들지 한 줄만 쓰면 그 글만 보고 그립니다. 그림을 안 붙이면 02에서 그림체(${LOOK_NAMES})를 고르게 되어 있습니다. 따라갈 그림이 없으니 어떤 그림체로 그릴지는 직접 정해야 합니다.`,
            },
            {
              q: "광고 규격으로 만들려는데 막힙니다",
              a: "광고 규격만은 따라 만들 그림이 한 장 이상 필요합니다. 첨부한 그림의 크기를 그대로 따라가는 방식이라 맞출 원본이 없으면 만들 수 없습니다.",
            },
            {
              q: "A4 인쇄용을 골랐더니 모델이 바뀌었습니다",
              a: `A4 인쇄용은 픽셀을 직접 지정해야 해서 ${withJosa(PIXEL_MODEL_NAMES, "으로로")} 만들 수 있습니다. 다른 방식을 골라 두었으면 화면이 만들 수 있는 방식으로 바꾸고 모델 칸 아래에 그렇다고 적습니다. 「${RATIO_LABEL("match-source")}」도 같습니다. 크레딧은 방식과 상관없습니다.`,
            },
            {
              q: "결과에 원하지 않는 것이 자꾸 나옵니다",
              a: "04 기획 확인의 「넣지 말 것」 칸에 적고 다시 만드세요. 프롬프트에 「~를 넣지 마라」를 적는 것보다 이 칸이 확실합니다.",
            },
            {
              q: "레퍼런스와 너무 똑같이 나옵니다",
              a: (
                <>
                  「따라 만들기」는 레이아웃·서체·색 문법을 가져오는 역할입니다. 더 달라지길 원하면 01 「무엇을
                  만들까」를 더 구체적으로 쓰거나, 04에서 장면·색 칸을 직접 바꾸세요. 역할 설명은{" "}
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

      <GuideFooter href="/guide/image" toolHref="/poster" toolLabel="「다양하게」 열기" />
    </>
  );
}
