import { guideMetadata } from "../../../lib/seo/metadata";
import { IMAGE_CREDIT_POLICY, IMAGE_MODEL_NAMES } from "@fixup/shared";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts, Mock, MockButtons, MockChoices, MockField, MockSteps } from "../_components/mockup";
import { MAX_REFERENCE_IMAGES, REDESIGN_STEPS } from "../../redesign/redesign-model";

export const metadata = guideMetadata("/guide/redesign");

/** 고르는 화면(`ImageModelPicker`)과 같은 세 모델 — 이름과 설명을 정본에서 받는다. */
const 보이는모델 = IMAGE_MODEL_NAMES.filter((entry) => entry.visible);

/** 화면의 세 화면 이름 그대로. */
const 화면 = REDESIGN_STEPS.map((step) => step.label);

export default function RedesignGuidePage() {
  const 보통 = IMAGE_CREDIT_POLICY.normalUnits;

  return (
    <>
      <GuideHeader
        kicker="상세페이지 리디자인"
        title="이미 있는 페이지를 뜯어보고 다시 설계"
        lead="지금 쓰고 있는 상세페이지가 있는데 전환이 안 나올 때 씁니다. 이미지나 PDF를 올리면 거기 적힌 글자를 전부 옮겨 적고, 성분·인증·시험 수치 같은 사실을 골라낸 다음, 그것을 근거로 구성을 다시 짜서 섹션 이미지로 만듭니다."
      />

      <Summary
        what="이미 있는 상세페이지를 뜯어보고 구성을 다시 짜서 새 섹션 이미지로 만듭니다."
        points={[
          {
            title: "한 번 누르면 이어서 진행됩니다",
            body: "「리디자인 생성」을 누르면 글자 옮겨 적기, 원본 분석, 이미지 만들기가 이어서 진행됩니다. 중간에 멈춰 확인하는 화면은 없습니다. 기본은 히어로 1장까지이고, 나머지는 첫 장을 본 뒤 「나머지 상세페이지 만들기」를 눌러 만듭니다.",
          },
          {
            title: "무엇을 참조했는지 적어 둡니다",
            body: "결과 카드마다 그 섹션의 목적과 원본의 어느 부분을 참조했는지 보여 줍니다.",
          },
          {
            title: "기존 자산을 씁니다",
            body: "쓸 만한 사진과 문구는 그대로 가져갑니다. 통째로 버리지 않습니다.",
          },
          {
            title: "나온 장만 차감합니다",
            body: `글자를 옮겨 적고 분석하는 데는 따로 들지 않지만, 그 단계만 따로 돌릴 수는 없습니다. 이미지가 한 장 나올 때마다 ${보통}크레딧이 듭니다.`,
          },
        ]}
        when={[
          "이미 페이지가 있는데 성과가 안 나올 때",
          "무엇을 고쳐야 할지부터 모를 때",
          "기존 사진과 문구를 살리면서 개선하고 싶을 때",
        ]}
      />

      <Section title="새로 만들기와 무엇이 다른가" hint="비슷해 보이지만 출발점이 다릅니다.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <strong className="block text-sm font-extrabold">상세페이지 만들기</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">상품 사진</strong>에서 출발합니다. 페이지가 아직 없을 때.
            </p>
          </div>
          <div className="rounded-xl border-2 border-primary bg-primary-soft/40 p-4">
            <strong className="block text-sm font-extrabold text-primary">리디자인</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">이미 만든 페이지</strong>에서 출발합니다. 거기 쌓인 정보를 잃지 않고
              구성을 다시 짭니다.
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          기존 페이지에는 대개 <strong className="text-foreground">힘들게 모은 사실</strong>이 들어 있습니다. 성분표,
          인증 번호, 시험 성적서 수치, 실제 후기. 이걸 버리고 새로 만들면 그 정보를 다시 모아야 합니다. 리디자인은 그걸
          먼저 꺼내 놓고 시작합니다.
        </p>
      </Section>

      <Section title="전체 흐름" hint="「리디자인 생성」 한 번이면 이미지까지 이어집니다. 사람이 보는 것은 결과가 나온 뒤입니다.">
        <Flow
          nodes={[
            { label: "올리기", sub: "이미지 · PDF" },
            { label: "전사", sub: "글자를 옮겨 적기" },
            { label: "분석 · 생성", sub: "사실 · 구성 · 이미지" },
            { label: "히어로 확인", sub: "첫 장부터 봅니다", human: true },
            { label: "나머지 · 수정", sub: "8장까지 · 한 장씩", human: true },
          ]}
        />
        <FlowLegend />
      </Section>

      <Section title="무엇이 다른가">
        <DiffList
          items={[
            {
              common: "기존 페이지를 참고 이미지로 던져 넣는다",
              ours: "글자를 전부 옮겨 적고 사실만 골라냅니다",
              why: "이미지로만 던지면 모델이 글자를 대충 읽고 넘어갑니다. 전사를 따로 하면 인증 번호나 시험 수치처럼 틀리면 안 되는 것이 정확히 남습니다.",
            },
            {
              common: "보기 좋게 다듬는다",
              ours: "올린 자료를 분석해 구성을 다시 짭니다",
              why: "섹션이 각각 괜찮아도 나열이면 팔리지 않습니다. AI가 원본을 분석해 섹션마다 무엇을 말할지 정하고, 인증·수치 같은 근거는 근거를 말하는 섹션에 싣습니다.",
            },
            {
              common: "고친 뒤에는 원본을 잃는다",
              ours: "원본에서 뽑은 사실이 그대로 남습니다",
              why: "결과 화면의 「원문 근거」에 원본에서 뽑은 사실이 글로 남고, 섹션 카드마다 원본의 어느 부분을 참조했는지 적혀 있습니다.",
            },
          ]}
        />
      </Section>

      <Details title="화면 읽기">
        <Mock title={`리디자인 · ${화면[1]}`}>
          <MockSteps steps={화면} current={1} />
          <MockChoices
            label="기존 상세페이지 자료 업로드"
            marker={1}
            columns={2}
            active={0}
            items={[
              { title: "이미지 또는 PDF", hint: `앞 ${MAX_REFERENCE_IMAGES}장까지 그림 생성에 반영` },
              { title: "라이브러리에서 불러오기" },
            ]}
          />
          <MockField
            label="추가 요청사항"
            placeholder="예: 배경은 밤, 창밖에 네온"
            note="여기 적은 말이 다른 모든 지시보다 우선합니다."
          />
          <MockChoices
            label="이미지 생성 모델"
            columns={3}
            active={0}
            items={보이는모델.map((entry) => ({ title: entry.name }))}
          />
          <MockChoices
            label="결과 장수"
            marker={2}
            columns={2}
            active={0}
            items={[{ title: "히어로 1장" }, { title: "기본 6~8장" }]}
          />
          <MockButtons items={[{ label: "리디자인 생성" }]} marker={3} />
        </Mock>

        <Mock title={`리디자인 · ${화면[2]}`}>
          <MockSteps steps={화면} current={2} />
          <MockField
            label="원문 근거(전사에서 추출한 정확 사실)"
            value="히알루론산 2% · 인증 제2024-…호 · 임상 수분 68%↑"
            marker={4}
          />
          <MockField label="이 섹션 수정하기" placeholder="예: 이 섹션은 헤드라인을 줄이고, …" marker={5} />
          <MockButtons items={[{ label: "나머지 상세페이지 만들기" }]} marker={6} />
        </Mock>

        <Callouts
          items={[
            {
              title: "이미지 또는 PDF로 올립니다",
              body: `쇼핑몰에서 내려받은 긴 세로 이미지를 그대로 올리면 됩니다. 여러 장으로 나뉘어 있으면 여러 장 올려도 됩니다. 다만 그림을 만들 때 참고하는 것은 앞 ${MAX_REFERENCE_IMAGES}장까지라, 가장 중요한 장을 앞에 두세요.`,
            },
            {
              title: "결과 장수 · 히어로 1장부터",
              body: "기본은 「히어로 1장」입니다. 첫 장을 먼저 보고 나머지를 만드는 순서라, 방향이 틀렸을 때 크레딧을 덜 씁니다. 처음부터 「기본 6~8장」을 골라도 됩니다.",
            },
            {
              title: "리디자인 생성 · 끝까지 한 번에",
              body: (
                <>
                  누르면 전사, 원본 분석, 이미지 만들기가 이어서 진행됩니다.{" "}
                  <strong className="text-foreground">진행 중에는 창을 닫거나 다른 화면으로 옮기지 마세요.</strong>{" "}
                  전사가 이 브라우저에서 돌아서, 창을 닫으면 멈춥니다.
                </>
              ),
            },
            {
              title: "원문 근거 · 읽고 복사만 합니다",
              body: (
                <>
                  원본에서 뽑은 성분·함량·인증 번호·시험 수치가 결과 화면에 글로 남습니다. 여기서 고칠 수는 없고 「사실
                  목록 복사」로 가져갈 수만 있습니다.{" "}
                  <strong className="text-foreground">이미지 속 글자는 틀릴 수 있습니다.</strong> 숫자와 인증 번호는 이
                  목록을 기준으로 맞춰 보세요.
                </>
              ),
            },
            {
              title: "이 섹션 수정하기 · 한 장씩 다시",
              body: `섹션 카드마다 있습니다. 고칠 점을 적고 「이 섹션 수정」을 누르면 그 장만 다시 만듭니다. 한 번에 ${보통}크레딧이 듭니다.`,
            },
            {
              title: "나머지 상세페이지 만들기 · 8장까지",
              body: "히어로를 보고 「히어로 검토 후 요청」 칸에 나머지에 반영할 방향을 적은 뒤 누릅니다. 빠진 섹션을 채워 8장까지 만듭니다.",
            },
          ]}
        />
      </Details>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["기존 페이지가 있다", "리디자인", "쌓인 사실을 잃지 않습니다"],
            ["상품만 있고 페이지는 없다", "상세페이지 만들기", "사진에서 출발합니다"],
            ["성분·인증이 중요한 상품", "리디자인", "사실 추출이 이런 값을 따로 지킵니다"],
            ["방향부터 확인하고 싶다", "히어로 1장", "첫 장을 보고 나머지에 반영할 방향을 적습니다"],
            ["몇 장만 마음에 안 든다", "이 섹션 수정하기", "나머지는 두고 그 장만 다시 만듭니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "전사된 글자가 군데군데 틀립니다",
              a: "원본 이미지의 글자가 작거나 배경과 대비가 낮으면 그렇습니다. 결과 화면의 「원문 근거」와 이미지 속 숫자·인증 번호를 꼭 맞춰 보시고, 틀린 장은 「이 섹션 수정하기」에 바른 값을 적어 다시 만드세요.",
            },
            {
              q: "전사가 오래 걸립니다",
              a: "페이지가 길수록 오래 걸립니다. 진행 중에는 창을 닫지 마세요. 끝나면 결과가 대시보드의 「최근 리디자인 프로젝트」와 라이브러리에 저장됩니다. 대시보드 목록은 이 브라우저에 남는 것이라 다른 기기에서는 라이브러리에서 찾으세요.",
            },
            {
              q: "새 구성이 원본과 너무 다릅니다",
              a: "AI가 원본을 분석해 구성을 다시 짜기 때문입니다. 원본 순서를 지키고 싶다면 만들기 전에 「추가 요청사항」에 그렇게 적어 주세요. 여기 적은 말이 다른 모든 지시보다 우선합니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/redesign" toolHref="/redesign" toolLabel="리디자인 열기" />
    </>
  );
}
