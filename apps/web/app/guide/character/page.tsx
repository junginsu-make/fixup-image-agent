import type { Metadata } from "next";
import Link from "next/link";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Callouts, Mock, MockButtons, MockChoices, MockField, MockNote, MockSteps } from "../_components/mockup";

export const metadata: Metadata = { title: "캐릭터 만들기 — 사용 설명서" };

/** 화면(`app/characters/CharacterStudio.tsx`)의 목록과 같은 말을 쓴다. */
const KINDS = [
  { title: "사람", hint: "실제 사람 같은 인물" },
  { title: "동물", hint: "강아지·고양이 등" },
  { title: "캐릭터", hint: "등신 비율이 자유로운 창작물" },
  { title: "사물", hint: "제품·소품" },
];

const TONES = [
  { title: "실사", hint: "사진처럼" },
  { title: "애니", hint: "셀 셰이딩·굵은 선" },
  { title: "3D", hint: "3D 렌더" },
  { title: "그림", hint: "손그림 질감" },
];

const ANGLES = ["정면", "왼쪽 45°", "오른쪽 45°", "왼쪽", "오른쪽", "뒷면"];

export default function CharacterGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="캐릭터 만들기"
        title="한 번 만들어 두고 계속 같은 얼굴로"
        lead="AI 이미지의 가장 큰 불편은 같은 사람이 두 번 나오지 않는다는 것입니다. 이 도구는 대상을 여섯 각도로 고정해 저장합니다. 그다음부터 카드뉴스나 상세페이지에 불러 쓰면 여러 장에 같은 대상이 일관되게 나옵니다."
      />

      <Section title="사람만 만드는 것이 아닙니다" hint="종류와 결을 따로 고릅니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-extrabold">무엇을 만들지 — 종류</h3>
            <ul className="grid gap-2">
              {KINDS.map((kind) => (
                <li key={kind.title} className="rounded-lg border bg-card px-3 py-2">
                  <strong className="text-sm">{kind.title}</strong>
                  <span className="ml-2 text-sm text-muted-foreground">{kind.hint}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-extrabold">어떤 결로 — 화풍</h3>
            <ul className="grid gap-2">
              {TONES.map((tone) => (
                <li key={tone.title} className="rounded-lg border bg-card px-3 py-2">
                  <strong className="text-sm">{tone.title}</strong>
                  <span className="ml-2 text-sm text-muted-foreground">{tone.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          둘을 조합합니다. <strong className="text-foreground">「애니풍 강아지」</strong>는 종류 = 동물, 결 = 애니입니다.
          제품 소품을 여러 장면에 똑같이 넣고 싶다면 종류 = 사물로 만들어 두면 됩니다.
        </p>
      </Section>

      <Section title="전체 흐름" hint="세 단계입니다.">
        <Flow
          nodes={[
            { label: "무엇을 만들지", sub: "종류 · 결 · 설명" },
            { label: "후보 고르기", sub: "마음에 드는 것", human: true },
            { label: "각도 고정", sub: "나머지 다섯 면" },
            { label: "저장", sub: "라이브러리로" },
          ]}
          loopBack="다른 도구에서 불러 씁니다"
        />
        <FlowLegend />
      </Section>

      <Section title="무엇이 다른가">
        <DiffList
          items={[
            {
              common: "같은 프롬프트를 써도 매번 다른 얼굴이 나온다",
              ours: "한 번 정한 대상을 여섯 각도로 고정합니다",
              why: `${ANGLES.join(" · ")} 여섯 면을 같은 대상으로 만들어 저장합니다. 다음부터는 그 이미지를 근거로 삼으므로 장면이 달라져도 같은 대상이 나옵니다.`,
            },
            {
              common: "캐릭터를 쓰려면 매번 설명을 다시 적는다",
              ours: "라이브러리에서 골라 붙입니다",
              why: "저장한 캐릭터는 카드뉴스·상세페이지·이미지 만들기에서 목록으로 뜹니다. 설명을 다시 쓰지 않습니다.",
            },
            {
              common: "사람만 만들 수 있다",
              ours: "동물 · 창작 캐릭터 · 사물까지",
              why: "제품 소품이나 마스코트도 같은 방식으로 고정할 수 있습니다.",
            },
          ]}
        />
      </Section>

      <Section title="화면 읽기">
        <Mock title="캐릭터 만들기 · 무엇을 만들지">
          <MockSteps steps={["무엇을 만들지", "후보 고르기", "각도 고정"]} current={0} />
          <MockChoices label="종류" marker={1} items={KINDS} active={0} />
          <MockChoices label="결" marker={2} items={TONES} active={0} />
          <MockField
            label="어떤 대상인가"
            marker={3}
            rows={2}
            value="30대 초반 여성, 단발, 베이지 니트, 부드러운 인상"
          />
          <MockChoices
            label="참고 그림 붙이기 · 선택"
            marker={4}
            columns={2}
            items={[
              { title: "결만 따라 만들기", hint: "화풍·색·질감만 가져옵니다" },
              { title: "이 캐릭터 뽑아내기", hint: "그림 속 그 캐릭터를 살립니다" },
            ]}
          />
          <MockNote>후보를 몇 장 만들지도 여기서 고릅니다.</MockNote>
          <MockButtons items={[{ label: "후보 만들기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "종류 — 무엇을 만드는지",
              body: "사람·동물·캐릭터·사물 중에서 고릅니다. 종류에 따라 각도의 뜻이 달라집니다 — 사물의 「뒷면」은 제품 뒤쪽입니다.",
            },
            {
              title: "결 — 어떤 화풍으로",
              body: "실사는 사진처럼, 애니는 굵은 선, 3D는 렌더, 그림은 손그림 질감입니다. 결에 따라 기본 모델이 달라집니다.",
            },
            {
              title: "어떤 대상인가 — 구체적일수록 좋습니다",
              body: (
                <>
                  나이·차림새·인상까지 적으세요. 여기가 두루뭉술하면 후보가 다 비슷비슷하게 나옵니다.{" "}
                  <strong className="text-foreground">이 설명은 저장돼서 나중에 각도를 더 만들 때도 쓰입니다.</strong>
                </>
              ),
            },
            {
              title: "참고 그림 — 두 가지 역할",
              body: (
                <>
                  <strong className="text-foreground">결만 따라 만들기</strong>는 화풍만 가져오고 대상은 새로 만듭니다.{" "}
                  <strong className="text-foreground">이 캐릭터 뽑아내기</strong>는 그림 속 그 캐릭터를 그대로 살려
                  각도를 만듭니다. 이미 있는 마스코트를 여러 각도로 만들고 싶을 때는 뒤쪽입니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="각도 여섯 면" hint="정면을 고른 뒤 나머지를 만듭니다.">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ANGLES.map((angle, index) => (
            <div
              key={angle}
              className={`rounded-lg border p-3 text-center text-sm font-bold ${index === 0 ? "border-primary bg-primary-soft text-primary" : "bg-card"}`}
            >
              {angle}
            </div>
          ))}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          먼저 후보 중에서 <strong className="text-foreground">정면</strong>을 고릅니다. 그 정면을 기준으로 나머지 다섯
          면을 만듭니다. 여섯 면을 다 만들 필요는 없습니다 — 필요한 각도만 만들어도 저장됩니다. 다만 각도가 많을수록
          다른 도구에서 쓸 때 자연스럽습니다.
        </p>
      </Section>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["상세페이지에 모델이 여러 번 나온다", "사람 · 실사", "섹션이 바뀌어도 같은 사람이 유지됩니다"],
            ["브랜드 마스코트가 있다", "이 캐릭터 뽑아내기", "기존 그림의 캐릭터를 그대로 살립니다"],
            ["제품 소품을 여러 장면에 넣는다", "사물", "같은 물건이 각 장면에 나옵니다"],
            ["화풍만 참고하고 싶다", "결만 따라 만들기", "그림은 새로 만들되 결을 맞춥니다"],
            ["한 장만 필요하다", "이미지 만들기 도구", "재사용할 게 아니면 굳이 고정할 필요가 없습니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "후보가 다 비슷하게 나옵니다",
              a: "「어떤 대상인가」가 두루뭉술해서 그렇습니다. 나이·머리 모양·옷·인상까지 적어 보세요. 참고 그림을 붙이면 더 좁혀집니다.",
            },
            {
              q: "각도를 만들었는데 다른 사람 같습니다",
              a: "정면 후보가 특징이 약하면 각도를 만들 때 흔들립니다. 특징이 뚜렷한 후보를 정면으로 고르세요. 그래도 어긋나면 그 각도만 다시 만들 수 있습니다.",
            },
            {
              q: "만든 캐릭터를 어디서 쓰나요",
              a: (
                <>
                  상세페이지 만들기의 「등장인물」, 카드뉴스와 이미지 만들기의 「인물 그대로 지키기」에서 불러 씁니다.
                  저장된 캐릭터는{" "}
                  <Link href="/guide/library" className="font-bold text-primary underline underline-offset-4">
                    라이브러리
                  </Link>
                  에도 남습니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/character" toolHref="/characters" toolLabel="캐릭터 열기" />
    </>
  );
}
