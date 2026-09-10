import Link from "next/link";
import type { Metadata } from "next";
import { ATTACHMENT_ROLE_HINT, ATTACHMENT_ROLE_LABEL, type AttachmentRole } from "@fixup/shared";
import { Flow, FlowLegend, GuideHeader, Section } from "./_components/flow";
import { GuideFooter } from "./_components/guide-footer";
import { GUIDE_TOPICS } from "./_components/topics";

export const metadata: Metadata = { title: "사용 설명서" };

/** 역할 어휘는 shared 에서 가져온다. 여기 적으면 코드가 바뀔 때 안내만 낡는다. */
const ROLES: AttachmentRole[] = ["style", "preserve_product", "preserve_person", "place_as_is"];

export default function GuideHomePage() {
  const topics = GUIDE_TOPICS.filter((topic) => topic.href !== "/guide");

  return (
    <>
      <GuideHeader
        kicker="처음 오셨다면"
        title="무엇을 만들든, 순서는 하나입니다"
        lead="이 시스템은 도구 다섯 개를 모아 둔 곳이 아니라 한 바퀴 도는 흐름입니다. 재료를 모아 두면 어느 도구에서든 그것을 불러 쓰고, 만든 결과물이 다시 다음 작업의 재료가 됩니다. 아래 순서만 알면 도구가 달라져도 화면이 낯설지 않습니다."
      />

      <Section
        title="한 바퀴"
        hint="도구마다 화면은 다르지만 이 순서는 같습니다."
      >
        <Flow
          nodes={[
            { label: "재료 모으기", sub: "업로드 · 라이브러리" },
            { label: "무엇을 만들지", sub: "한 줄이면 됩니다" },
            { label: "글자 확정", sub: "사람이 고칩니다", human: true },
            { label: "그림 생성", sub: "여기서 돈이 듭니다" },
            { label: "검수 · 저장", sub: "라이브러리로" },
          ]}
          loopBack="만든 것이 다시 재료가 됩니다"
        />
        <FlowLegend />
        <p className="text-sm leading-7 text-muted-foreground">
          가운데 <strong className="text-foreground">글자 확정</strong> 단계가 이 시스템의 핵심입니다. 보통의 AI 이미지
          도구는 그림과 글자를 한 번에 그립니다. 그래서 글자가 틀리면 이미지를 통째로 다시 만들어야 하고,
          다시 만들 때마다 돈이 듭니다. 여기서는 <strong className="text-foreground">글자를 먼저 확정하고 그다음에
          그림을 부릅니다.</strong> 고칠 일이 있으면 돈이 들기 전에 고칩니다.
        </p>
      </Section>

      <Section title="어떤 도구를 열어야 하나" hint="만들려는 것에서 고르세요.">
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic.href}>
              <Link
                href={topic.href}
                className="block h-full rounded-xl border bg-card p-4 transition-colors hover:border-primary hover:bg-background"
              >
                <strong className="block text-sm font-extrabold">{topic.label}</strong>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">{topic.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="도구가 달라도 같은 말"
        hint="한 번만 익히면 다섯 도구에서 그대로 씁니다."
      >
        <div className="grid gap-4">
          <div>
            <h3 className="text-sm font-extrabold">참고 이미지의 역할 네 가지</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              그림을 첨부할 때는 <strong className="text-foreground">그 그림을 어떻게 쓸지</strong>도 함께 고릅니다. 같은
              사진이라도 역할이 다르면 결과가 완전히 달라집니다. 이 네 가지는 카드뉴스·이미지 만들기·상세페이지가
              똑같이 씁니다.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {ROLES.map((role) => (
                <li key={role} className="rounded-lg border bg-card p-3">
                  <strong className="block text-sm text-primary">{ATTACHMENT_ROLE_LABEL[role]}</strong>
                  <span className="mt-0.5 block text-sm leading-6 text-muted-foreground">
                    {ATTACHMENT_ROLE_HINT[role]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border-l-2 border-l-primary bg-muted/30 px-4 py-3">
            <strong className="block text-sm">「원본 그대로 넣기」만 AI를 거치지 않습니다</strong>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              나머지 셋은 그림을 새로 만듭니다. 로고나 인증 마크처럼 <strong className="text-foreground">한 픽셀도
              변하면 안 되는 것</strong>은 「원본 그대로 넣기」로 두세요. AI에게 맡기면 비슷하지만 다른 것이 나옵니다.
            </p>
          </div>

          {/* 상단에 늘 떠 있는데 설명이 없었다. 눌러 보기 전에는 무엇인지 모른다. */}
          <div>
            <h3 className="text-sm font-extrabold">참고할 그림이 없을 때 — 「레퍼런스 찾기」</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              화면 <strong className="text-foreground">오른쪽 위 청록색 버튼</strong>입니다. 어느 도구에서든 보입니다.
              누르면 새 탭에서 핀터레스트가 열립니다 — 만들기 전에 결을 잡을 그림을 찾는 자리입니다.
              마음에 드는 그림을 내려받아 라이브러리에 올려 두면 어느 도구에서든 불러 씁니다.
            </p>
          </div>
        </div>
      </Section>

      <Section title="돈이 드는 자리는 하나뿐" hint="어디서 차감되는지 미리 알아 두세요.">
        <ul className="grid gap-2 text-sm leading-7 text-muted-foreground">
          <li>
            · <strong className="text-foreground">분석과 기획은 무료입니다.</strong> 사진을 읽고, 구성안을 짜고, 원고를
            쓰는 데는 이미지 크레딧이 차감되지 않습니다. 남용을 막는 시간당 제한만 있습니다
          </li>
          <li>
            · <strong className="text-foreground">그림을 만들 때만 차감합니다.</strong> 그것도 성공한 장수만입니다.
            실패한 이미지는 크레딧으로 정산하지 않습니다
          </li>
          <li>
            · <strong className="text-foreground">모델마다 차감량이 다릅니다.</strong> 원가가 4.6배까지 벌어지기
            때문입니다. 자세한 것은 <Link href="/guide/credits" className="font-bold text-primary underline underline-offset-4">크레딧과 모델</Link>에 있습니다
          </li>
        </ul>
      </Section>

      <GuideFooter href="/guide" />
    </>
  );
}
