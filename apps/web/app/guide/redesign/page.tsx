import type { Metadata } from "next";
import Link from "next/link";
import { ChoiceTable, DiffList, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Callouts, Mock, MockButtons, MockChoices, MockField, MockNote, MockSteps } from "../_components/mockup";

export const metadata: Metadata = { title: "상세페이지 리디자인 — 사용 설명서" };

export default function RedesignGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="상세페이지 리디자인"
        title="이미 있는 페이지를 뜯어보고 다시 설계"
        lead="지금 쓰고 있는 상세페이지가 있는데 전환이 안 나올 때 씁니다. 이미지나 PDF를 올리면 거기 적힌 글자를 전부 옮겨 적고, 성분·인증·시험 수치 같은 사실만 골라낸 다음, 그것을 근거로 순서를 다시 짭니다."
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
              순서만 다시 짭니다.
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          기존 페이지에는 대개 <strong className="text-foreground">힘들게 모은 사실</strong>이 들어 있습니다 — 성분표,
          인증 번호, 시험 성적서 수치, 실제 후기. 이걸 버리고 새로 만들면 그 정보를 다시 모아야 합니다. 리디자인은 그걸
          먼저 꺼내 놓고 시작합니다.
        </p>
      </Section>

      <Section title="전체 흐름" hint="세 화면을 오갑니다.">
        <Flow
          nodes={[
            { label: "올리기", sub: "이미지 · PDF" },
            { label: "전사", sub: "글자를 옮겨 적기" },
            { label: "사실 추출", sub: "성분 · 인증 · 수치" },
            { label: "재설계", sub: "확인하고 고칩니다", human: true },
            { label: "섹션 생성", sub: "결과 확인" },
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
              ours: "전환을 기준으로 순서를 다시 짭니다",
              why: "섹션이 각각 괜찮아도 나열이면 팔리지 않습니다. 문제 → 전환 → 근거 → 반론 → 행동 순서로 다시 배치합니다.",
            },
            {
              common: "고친 뒤에는 원본을 잃는다",
              ours: "원본에서 뽑은 사실이 그대로 남습니다",
              why: "전사와 사실 추출 결과를 화면에서 볼 수 있습니다. 새 구성이 원본의 어떤 사실에 근거하는지 짚을 수 있습니다.",
            },
          ]}
        />
      </Section>

      <Section title="화면 읽기">
        <Mock title="리디자인 · 올리기">
          <MockSteps steps={["대시보드", "리디자인 작업", "결과 확인"]} current={1} />
          <MockChoices
            label="기존 페이지 올리기"
            marker={1}
            columns={3}
            active={0}
            items={[{ title: "이미지", hint: "긴 세로 이미지" }, { title: "PDF" }, { title: "라이브러리에서" }]}
          />
          <MockField label="상품 이름" placeholder="예: 수분 앰플 30ml" />
          <MockNote marker={2}>올린 페이지에서 글자를 전부 옮겨 적습니다. 잠시 걸립니다.</MockNote>
          <MockButtons items={[{ label: "전사 시작" }]} />
        </Mock>

        <Mock title="리디자인 · 사실 확인">
          <MockField label="확인된 성분" value="히알루론산 2% · 나이아신아마이드 2%" marker={3} />
          <MockField label="인증 · 시험" value="인증 제2024-…호 · 임상 수분 68%↑" />
          <MockField label="새 구성안 · 3번째 섹션" value="문제 공감 — 겨울철 당김" marker={4} />
          <MockButtons items={[{ label: "섹션 만들기" }]} />
        </Mock>

        <Callouts
          items={[
            {
              title: "이미지 또는 PDF로 올립니다",
              body: "쇼핑몰에서 내려받은 긴 세로 이미지를 그대로 올리면 됩니다. 여러 장으로 나뉘어 있으면 여러 장 올려도 됩니다.",
            },
            {
              title: "전사 — 글자를 옮겨 적는 단계",
              body: (
                <>
                  이미지 안의 글자를 텍스트로 꺼냅니다.{" "}
                  <strong className="text-foreground">이 단계는 이미지 크레딧을 쓰지 않습니다.</strong> 시간이 조금
                  걸리지만 여기가 정확해야 뒤가 정확합니다.
                </>
              ),
            },
            {
              title: "사실 추출 — 틀리면 안 되는 것들",
              body: (
                <>
                  성분, 함량, 인증 번호, 시험 수치를 따로 모읍니다.{" "}
                  <strong className="text-foreground">여기 있는 값은 눈으로 한 번 확인하세요.</strong> 전사에서 숫자가
                  잘못 읽힌 채로 넘어가면 새 페이지에도 그대로 들어갑니다.
                </>
              ),
            },
            {
              title: "새 구성안 — 순서가 바뀝니다",
              body: (
                <>
                  원본의 섹션 순서를 그대로 두지 않습니다. 전환을 기준으로 다시 배치합니다. 원하지 않는 순서면 여기서
                  고치세요. 판단 기준은{" "}
                  <Link href="/guide/detail-page" className="font-bold text-primary underline underline-offset-4">
                    상세페이지 만들기
                  </Link>
                  의 심사 항목과 같습니다.
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
            ["기존 페이지가 있다", "리디자인", "쌓인 사실을 잃지 않습니다"],
            ["상품만 있고 페이지는 없다", "상세페이지 만들기", "사진에서 출발합니다"],
            ["성분·인증이 중요한 상품", "리디자인", "사실 추출이 이런 값을 따로 지킵니다"],
            ["디자인만 바꾸고 싶다", "리디자인 후 편집", "구성은 두고 섹션 이미지만 다시 만들 수 있습니다"],
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "전사된 글자가 군데군데 틀립니다",
              a: "원본 이미지의 글자가 작거나 배경과 대비가 낮으면 그렇습니다. 사실 확인 화면에서 직접 고치세요. 특히 숫자와 인증 번호는 꼭 확인하시기 바랍니다.",
            },
            {
              q: "전사가 오래 걸립니다",
              a: "페이지가 길수록 오래 걸립니다. 다른 화면으로 옮겨도 계속 진행됩니다 — 사이드바가 진행 중인 작업을 들고 있습니다.",
            },
            {
              q: "새 구성이 원본과 너무 다릅니다",
              a: "전환 기준으로 순서를 다시 짜기 때문입니다. 원본 순서를 지켜야 한다면 구성안 화면에서 섹션을 옮기거나 지우세요.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/redesign" toolHref="/redesign" toolLabel="리디자인 열기" />
    </>
  );
}
