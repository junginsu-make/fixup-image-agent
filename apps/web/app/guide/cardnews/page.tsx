import type { Metadata } from "next";
import Link from "next/link";
import { CARD_RATIOS, IMAGE_MODELS, MAX_CARDS } from "@fixup/sns-core";
import { ATTACHMENT_ROLE_HINT, ATTACHMENT_ROLE_LABEL, type AttachmentRole } from "@fixup/shared";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import {
  Callouts,
  Mock,
  MockButtons,
  MockChoices,
  MockField,
  MockNote,
  MockSteps,
  MockTabs,
} from "../_components/mockup";

export const metadata: Metadata = { title: "카드뉴스 만들기 — 사용 설명서" };

/** 화면에 뜨는 목록을 그대로 가져온다. 여기 적으면 코드가 바뀔 때 안내만 낡는다. */
const RATIO_ITEMS = CARD_RATIOS.map((ratio) => ({ title: ratio.id, hint: ratio.label }));
const MODEL_NAMES = IMAGE_MODELS.map((model) => model.label).join(" · ");

/** 역할 어휘도 코드가 단일 출처다. 여기 베껴 적으면 어휘가 바뀔 때 안내만 낡는다. */
const ROLES: AttachmentRole[] = ["style", "preserve_product", "preserve_person", "place_as_is"];
const ROLE_ITEMS = ROLES.map((role) => ({
  title: ATTACHMENT_ROLE_LABEL[role],
  hint: ATTACHMENT_ROLE_HINT[role],
}));

export default function CardNewsGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="카드뉴스 만들기"
        title="여러 장으로 이야기하는 카드뉴스"
        lead="인스타그램에서 옆으로 넘겨 보는 그 카드입니다. 글 한 편이나 영상 하나를 넣으면 표지부터 마지막 장까지 나눠 만듭니다. 만드는 길이 두 가지인데, 무엇을 더 중요하게 여기느냐에 따라 고릅니다."
      />

      <Section
        title="먼저 — 길이 두 가지입니다"
        hint="카드뉴스 첫 화면 오른쪽 위에 버튼 두 개가 나란히 있습니다."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border-2 border-primary bg-primary-soft/40 p-4">
            <strong className="block text-sm font-extrabold text-primary">내 카드뉴스 만들기</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">칸을 먼저 정하고, 글자는 시스템이 직접 그립니다.</strong> AI는 그림
              칸만 채웁니다. 글자 위치가 장마다 흔들리지 않고 한글이 깨지지 않습니다. 브랜드 톤을 지켜야 하거나
              여러 장을 같은 틀로 찍어내야 할 때 고르세요.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <strong className="block text-sm font-extrabold">새 카드뉴스 만들기</strong>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              <strong className="text-foreground">레퍼런스에 맞춰 카드를 통째로 그립니다.</strong> 지금까지의 방식입니다.
              마음에 드는 카드뉴스 한 장을 첨부하면 그 결을 따라갑니다. 디자인이 자유롭고 빠르지만, 글자는 모델이
              그리므로 장마다 조금씩 달라질 수 있습니다.
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          아래 설명은 <strong className="text-foreground">「새 카드뉴스 만들기」</strong> 기준입니다. 화면이 다섯 단계로
          길어서 먼저 익혀 두면 다른 도구도 쉽습니다.
        </p>
      </Section>

      <Section title="전체 흐름" hint="다섯 단계입니다. 03까지는 되돌아가 고칠 수 있습니다.">
        <Flow
          nodes={[
            { label: "01 내용", sub: "쓰거나 가져오기" },
            { label: "02 이미지", sub: "종류 · 역할 · 자리" },
            { label: "03 규격", sub: "비율 · 장수 · 모델" },
            { label: "04 원고 확인", sub: "여기서 고칩니다", human: true },
            { label: "05 결과", sub: "검수까지" },
          ]}
        />
        <FlowLegend />
      </Section>

      <Section title="무엇이 다른가" hint="일반 AI 이미지 도구와 비교해서.">
        <DiffList
          items={[
            {
              common: "프롬프트를 넣으면 이미지가 한 장 나온다",
              ours: "이야기를 여러 장으로 나눠 기획합니다",
              why: "표지에 무엇을 걸고 속지를 몇 장으로 쪼갤지, 마지막 장에 무엇을 넣을지를 먼저 짭니다. 사람이 장마다 프롬프트를 쓰지 않습니다.",
            },
            {
              common: "글자가 틀리면 이미지를 다시 만든다",
              ours: "글자를 먼저 확정하고 그다음에 그림을 부릅니다",
              why: "04 원고 확인 단계에서 사람이 글을 고칩니다. 여기까지는 이미지 크레딧이 차감되지 않습니다. 그림을 만든 뒤에 글자를 고치는 것은 다시 만드는 일이고, 그건 돈이 듭니다.",
            },
            {
              common: "결과가 맞는지는 눈으로 확인한다",
              ours: "만든 그림을 다른 호출이 검수합니다",
              why: "원고에 없는 글자가 들어갔는지, 글자가 바뀌었는지를 별도 호출로 대조합니다. 만든 쪽이 스스로 채점하면 자기 글을 칭찬하기 마련입니다.",
            },
          ]}
        />
      </Section>

      <Section title="01 내용 — 화면 읽기" hint="무엇으로 카드뉴스를 만들지 정합니다.">
        <Mock title="카드뉴스 만들기 · 01 내용">
          <MockSteps steps={["01 내용", "02 이미지", "03 규격", "04 원고 확인", "05 결과"]} current={0} />
          <MockField label="프로젝트 제목" placeholder="예: AI 자동화, 한 업무부터 시작하기" marker={1} />
          <MockTabs items={["직접 쓰기", "유튜브 주소", "웹 주소", "질문해서 찾기"]} active={0} marker={2} />
          <MockField label="카드뉴스로 만들 내용" placeholder="글이나 메모를 그대로 붙여 넣으세요." rows={4} />
          <MockField
            label="말투나 분위기 · 선택"
            placeholder="예: 친구에게 말하듯 가볍게"
            marker={3}
            note="비우면 AI가 내용을 보고 어울리는 말투를 정합니다."
          />
          <MockButtons items={[{ label: "이미지 고르기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "프로젝트 제목",
              body: (
                <>
                  나중에 목록에서 찾을 이름입니다. <strong className="text-foreground">카드에 인쇄되는 제목이
                  아닙니다.</strong> 카드에 들어갈 헤드라인은 04 원고 확인에서 따로 정합니다.
                </>
              ),
            },
            {
              title: "내용을 넣는 네 가지 길",
              body: (
                <ul className="grid gap-1.5">
                  <li>
                    <strong className="text-foreground">직접 쓰기</strong> — 이미 쓴 글이나 메모를 붙여 넣습니다
                  </li>
                  <li>
                    <strong className="text-foreground">유튜브 주소</strong> — 영상의 자막을 가져와 내용으로 씁니다.
                    자막이 없는 영상은 가져올 것이 없습니다
                  </li>
                  <li>
                    <strong className="text-foreground">웹 주소</strong> — 공개된 기사·블로그의 본문을 추출합니다.
                    로그인이 필요한 페이지는 열지 못합니다
                  </li>
                  <li>
                    <strong className="text-foreground">질문해서 찾기</strong> — 재료가 아예 없을 때 씁니다. 궁금한 것을
                    쓰면 웹에서 근거를 찾아옵니다. 공식 자료를 우선합니다
                  </li>
                </ul>
              ),
            },
            {
              title: "말투나 분위기 (선택)",
              body: (
                <>
                  비워도 됩니다. 적으면 원고 전체의 어조가 그쪽으로 기웁니다. 「친구에게 말하듯」, 「보고서처럼
                  건조하게」처럼 <strong className="text-foreground">사람에게 설명하듯</strong> 적으면 됩니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section
        title="02 이미지 — 화면 읽기"
        hint="그림을 첨부하고, 그 그림을 어떻게 쓸지 정합니다. 이 단계를 건너뛰어도 만들어집니다."
      >
        <Mock title="카드뉴스 만들기 · 02 이미지">
          <MockSteps steps={["01 내용", "02 이미지", "03 규격", "04 원고 확인", "05 결과"]} current={1} />
          <MockChoices
            label="이 그림을 어떻게 쓸까요"
            marker={1}
            columns={2}
            active={0}
            items={ROLE_ITEMS}
          />
          <MockChoices
            label="어느 자리에 넣을까요"
            marker={2}
            columns={3}
            active={1}
            items={[{ title: "표지" }, { title: "속지" }, { title: "마지막 장" }]}
          />
          <MockNote marker={3}>
            모델마다 첨부할 수 있는 장수가 다릅니다. 넘으면 다음으로 넘어가기 전에 알려 줍니다.
          </MockNote>
          <MockButtons items={[{ label: "이전", variant: "quiet" }, { label: "규격 고르기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "역할 — 그림을 어떻게 쓸지",
              body: (
                <>
                  같은 사진이라도 역할이 다르면 결과가 완전히 달라집니다. 제품 사진을 「따라 만들기」로 두면 그
                  <strong className="text-foreground"> 분위기만</strong> 가져와 다른 제품이 나옵니다. 실제 그 제품을
                  보여줘야 한다면 「제품 그대로 지키기」로 두세요. 네 가지 역할은{" "}
                  <Link href="/guide" className="font-bold text-primary underline underline-offset-4">
                    처음 오셨다면
                  </Link>
                  에 자세히 있습니다.
                </>
              ),
            },
            {
              title: "자리 — 어느 장에 넣을지",
              body: (
                <>
                  카드뉴스는 <strong className="text-foreground">표지 1장 + 속지 여러 장 + 마지막 1장</strong> 구조입니다.
                  표지와 마지막은 각각 한 자리뿐입니다. 속지는 여러 장을 넣을 수 있고, 넣은 만큼 AI가 만드는 속지가
                  줄어듭니다.
                </>
              ),
            },
            {
              title: "첨부 장수 제한",
              body: (
                <>
                  모델마다 다릅니다. GPT Image 2는 16장, Nano Banana Pro와 Nano Banana 2는 14장, Nano Banana는 7장까지
                  받습니다. 다음 단계로 넘어갈 때 확인하므로 미리 세지 않아도 됩니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="03 규격 — 화면 읽기" hint="어디에 올릴지와 몇 장으로 만들지를 정합니다.">
        <Mock title="카드뉴스 만들기 · 03 규격">
          <MockSteps steps={["01 내용", "02 이미지", "03 규격", "04 원고 확인", "05 결과"]} current={2} />
          <MockChoices label="비율" marker={1} items={RATIO_ITEMS} active={0} note="픽셀은 묻지 않습니다. 비율에서 시스템이 정합니다." />
          <MockChoices
            label="전체 장수"
            marker={2}
            columns={4}
            active={0}
            items={[{ title: "AI 추천" }, { title: "4장" }, { title: "5장" }, { title: "6장" }]}
          />
          <MockChoices
            label="언어 · 이미지 모델"
            marker={3}
            columns={2}
            items={[{ title: "한국어", hint: "English · 日本語 · 中文" }, { title: "GPT Image 2 · 기본", hint: MODEL_NAMES }]}
          />
          <MockNote marker={4}>
            6장 = 표지 1 + 원본 1 + AI 속지 3 + 마지막 1 · 예상 비용 $0.24
          </MockNote>
          <MockButtons items={[{ label: "이전", variant: "quiet" }, { label: "기획 시작" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "비율 — 올릴 자리에서 고르세요",
              body: (
                <>
                  픽셀을 몰라도 됩니다. 올릴 곳만 고르면 시스템이 픽셀을 정합니다.{" "}
                  {CARD_RATIOS.map((ratio) => `${ratio.id}(${ratio.label})`).join(", ")} 중에서 고릅니다.
                </>
              ),
            },
            {
              title: "전체 장수 — 모르겠으면 AI 추천",
              body: (
                <>
                  기본은 <strong className="text-foreground">AI 추천</strong>입니다. 내용의 길이를 보고 알아서 정합니다.
                  숫자를 직접 고르면 정확히 그 장수 안에서 이야기를 나눕니다. 최대 {MAX_CARDS}장입니다. 내용이 긴데
                  장수를 적게 잡으면 한 장에 글이 빽빽해집니다.
                </>
              ),
            },
            {
              title: "언어와 이미지 모델",
              body: (
                <>
                  언어는 카드에 그려질 글자의 언어입니다. 모델은 글자 정확도와 비용의 저울질입니다 — 자세한 것은{" "}
                  <Link href="/guide/credits" className="font-bold text-primary underline underline-offset-4">
                    크레딧과 모델
                  </Link>
                  에 있습니다. <strong className="text-foreground">모르겠으면 기본값(GPT Image 2)이 가장 안전합니다.</strong>
                </>
              ),
            },
            {
              title: "자리 계산과 예상 비용",
              body: (
                <>
                  고른 장수가 실제로 어떻게 나뉘는지 그 자리에서 계산해 보여 줍니다. 배치가 불가능하면
                  <strong className="text-foreground"> 「확인 필요」</strong>가 뜨고 이유를 알려 줍니다. 예상 비용은 실제
                  결제액이 아니라 이 작업에 드는 원가 추정입니다.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section title="04 원고 확인 — 가장 중요한 화면" hint="여기서 고친 글자가 그대로 그림에 들어갑니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          기획이 끝나면 장마다 들어갈 글이 표로 나옵니다. <strong className="text-foreground">이 단계까지는 이미지
          크레딧이 한 장도 차감되지 않았습니다.</strong> 고칠 것이 있으면 지금 고치세요. 그림이 나온 뒤에 글자를 고치는
          것은 처음부터 다시 만드는 일입니다.
        </p>
        <Mock title="카드뉴스 만들기 · 04 원고 확인">
          <MockSteps steps={["01 내용", "02 이미지", "03 규격", "04 원고 확인", "05 결과"]} current={3} />
          <MockField label="1장 · 표지 · 헤드라인" value="보증금 지키는 첫걸음" marker={1} />
          <MockField label="1장 · 표지 · 본문" value="안전한 월세 계약 체크리스트" />
          <MockField label="2장 · 속지 · 헤드라인" value="계약 전 확인" />
          <MockNote marker={2}>여기서 확정한 글자만 그림에 들어갑니다.</MockNote>
          <MockButtons items={[{ label: "이미지 만들기" }]} />
        </Mock>
        <Callouts
          items={[
            {
              title: "글을 직접 고칠 수 있습니다",
              body: "AI가 쓴 초안입니다. 어색한 표현, 틀린 사실, 너무 긴 문장을 그 자리에서 고치세요. 짧을수록 이미지 안에서 잘 읽힙니다.",
            },
            {
              title: "「이미지 만들기」를 누르는 순간부터 차감됩니다",
              body: "이 버튼 앞이 무료 구간의 끝입니다. 원고가 마음에 들 때 누르세요.",
            },
          ]}
        />
      </Section>

      <Section title="언제 무엇을 고르나">
        <ChoiceTable
          head={["이런 상황이면", "이렇게", "왜"]}
          rows={[
            ["인스타 피드에 올린다", "비율 4:5", "피드에서 세로로 가장 크게 잡히는 비율입니다"],
            ["스토리·릴스에 쓴다", "비율 9:16", "화면을 꽉 채웁니다"],
            ["글이 길고 정리가 안 됐다", "장수는 AI 추천", "내용 길이에 맞춰 나눕니다"],
            ["정해진 장수로 맞춰야 한다", "장수를 직접 고르기", "그 장수 안에서 이야기를 나눕니다"],
            ["브랜드 톤을 꼭 지켜야 한다", "「내 카드뉴스 만들기」", "칸을 고정하면 장마다 흔들리지 않습니다"],
            ["빠르게 여러 안을 보고 싶다", "「새 카드뉴스 만들기」", "레퍼런스만 주면 통째로 그립니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "유튜브 주소를 넣었는데 내용이 비어 있습니다",
              a: "자막이 없는 영상입니다. 자막을 가져와 내용으로 쓰기 때문에, 자막이 없으면 가져올 것이 없습니다. 「직접 쓰기」로 요지를 적어 주세요.",
            },
            {
              q: "「배치 가능」이 아니라 「확인 필요」가 뜹니다",
              a: "고른 장수 안에 첨부한 원본이 다 들어가지 않는 경우가 대부분입니다. 장수를 늘리거나 원본 첨부를 줄이세요. 표지와 마지막은 각각 한 자리뿐이라는 점도 함께 보세요.",
            },
            {
              q: "만든 그림의 글자가 원고와 다릅니다",
              a: "05 결과의 검수가 그것을 잡아 알려 줍니다. 지적이 남아 있으면 화면에 그대로 띄웁니다. 글자가 많이 들어가는 장이라면 GPT Image 2를 쓰세요 — 글자가 가장 정확합니다.",
            },
            {
              q: "만드는 중에 다른 화면으로 가도 되나요",
              a: "됩니다. 만드는 중인 목록은 사이드바가 들고 있어서 화면을 옮겨도 받아 오는 일이 멈추지 않습니다. 다만 중지는 되돌리기가 아닙니다 — 이미 만든 장은 차감된 채로 남습니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/cardnews" toolHref="/sns" toolLabel="카드뉴스 열기" />
    </>
  );
}
