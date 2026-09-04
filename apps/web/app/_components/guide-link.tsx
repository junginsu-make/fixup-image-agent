"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@fixup/ui";

/**
 * 비전문 셀러를 위한 이용 안내 모달.
 *
 * 기능이 늘어난 만큼 여기도 따라와야 한다. 라이브러리·레퍼런스·캐릭터는
 * 안내에 아예 없었고, 차감은 "이미지당 1장"으로 적혀 있었는데 실제로는
 * 모델에 따라 4·3·1장이다. 안내가 틀리면 없는 것만 못하다.
 *
 * 제목 옆 장식 아이콘은 뺐다. 아이콘은 버튼(동작)에만 쓴다.
 */
export function GuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
        >
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">이용 안내</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>이용 안내</DialogTitle>
          <DialogDescription>
            상품 사진이나 설명만으로 상세페이지를 새로 만들거나, 기존
            상세페이지를 더 잘 팔리게 다듬는 AI 도구입니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="overview">개요</TabsTrigger>
            <TabsTrigger value="create">새로 만들기</TabsTrigger>
            <TabsTrigger value="redesign">리디자인</TabsTrigger>
            <TabsTrigger value="library">보관·레퍼런스</TabsTrigger>
            <TabsTrigger value="character">캐릭터</TabsTrigger>
            <TabsTrigger value="knowledge">공통 지식</TabsTrigger>
          </TabsList>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <TabsContent value="overview">
              <Section title="어떤 서비스인가요?">
                <p>도구 두 가지와 보관·부가 기능으로 이루어져 있습니다.</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>
                    <b>새로 만들기</b> — 상품 사진 한 장, 또는 사진 없이{" "}
                    <b>설명 글만으로도</b> 상세페이지를 처음부터 만듭니다.
                  </li>
                  <li>
                    <b>리디자인</b> — <b>이미 있는</b> 상세페이지(이미지·PDF)를
                    분석해 더 잘 팔리게 개선합니다.
                  </li>
                  <li>
                    <b>라이브러리</b> — 만든 결과물이 내 계정에 자동 보관됩니다.
                  </li>
                  <li>
                    <b>캐릭터 만들기</b> — 페이지에 넣을 인물을 만들어
                    고정합니다.
                  </li>
                </ul>
                <Steps
                  steps={[
                    "회원가입과 이메일 인증 후 관리자 승인을 받습니다.",
                    "‘새로 만들기’ 또는 ‘리디자인’을 선택해 작업합니다.",
                    "결과를 편집하고 이미지로 내려받습니다. 작업은 라이브러리에 보관됩니다.",
                  ]}
                />
                <Callout title="API 키를 넣을 필요가 없습니다">
                  생성에 쓰는 모든 키는 <b>운영자가 서버에 설정</b>합니다.
                  회원이 따로 발급받거나 입력할 키는 없습니다. 예전 버전에서
                  브라우저에 저장했던 개인 키가 남아 있으면 ‘설정’ 화면에서 지울
                  수 있습니다.
                </Callout>
              </Section>
            </TabsContent>

            <TabsContent value="create">
              <Section
                title="새로 만들기 — 사진 또는 글로 상세페이지"
                keyBadge="성공한 이미지만 차감"
              >
                <Steps
                  steps={[
                    "상품 사진을 올리거나, 사진 없이 상품 설명을 적습니다.",
                    "비율·톤·모델을 고르고 구성(시나리오)을 만듭니다.",
                    "구성을 확인·수정한 뒤 섹션 이미지를 생성합니다.",
                    "에디터에서 문구·색·레이아웃을 다듬고 내려받습니다.",
                  ]}
                />
                <Benefits
                  items={[
                    "구성을 만든 뒤 AI가 스스로 검토해 약한 곳을 한 번 고쳐 옵니다",
                    "‘제품 이미지 보존’을 켜면 올린 상품의 모양·색·라벨을 그대로 지킵니다",
                    "디자인 레퍼런스를 등록해 두면 상품에 어울리는 한 장을 골라 전체에 적용합니다",
                    "만든 캐릭터를 등장인물로 골라 섹션마다 같은 사람이 나오게 합니다",
                    "글자·도형 레이어 편집, 마음에 안 드는 섹션만 다시 생성",
                    "이미지 1장씩 또는 전체 ZIP으로 내보내기",
                  ]}
                />
                <Callout title="차감은 모델에 따라 다릅니다">
                  이미지 한 장에{" "}
                  <b>
                    GPT Image 2는 4장, Nano Banana Pro는 3장, Nano Banana는 1장
                  </b>
                  이 차감됩니다. 화면에 생성 전 차감량이 표시되고,{" "}
                  <b>성공한 이미지만</b> 차감됩니다.
                </Callout>
              </Section>
            </TabsContent>

            <TabsContent value="redesign">
              <Section
                title="리디자인 — 기존 상세페이지 개선"
                keyBadge="성공 이미지 수만큼 차감"
              >
                <p>
                  지금 쓰는 상세페이지를 분석해{" "}
                  <b>전환율(구매로 이어지는 비율)</b> 중심으로 다시 구성합니다.
                </p>
                <Steps
                  steps={[
                    "기존 상세페이지 이미지나 PDF 업로드",
                    "사용할 모델(OpenAI / Gemini) 선택 후 생성 — 히어로(첫 화면)부터 순서대로",
                    "마음에 안 드는 섹션만 골라 다시 만들고 내려받기",
                  ]}
                />
                <Benefits
                  items={[
                    "이미 가진 자산을 버리지 않고 재활용",
                    "PDF도 자동으로 읽어 분석",
                    "섹션별로 개별 수정·리비전 가능",
                  ]}
                />
              </Section>
            </TabsContent>

            <TabsContent value="library">
              <Section
                title="라이브러리와 디자인 레퍼런스"
                keyBadge="전부 내 계정 전용"
              >
                <p>
                  <b>라이브러리</b>는 만든 결과물이 쌓이는 곳입니다. 카드를
                  누르면 그 작업의 이미지를 모두 크게 보고 내려받을 수 있습니다.
                  만든 캐릭터도 함께 보관됩니다.
                </p>
                <p>
                  <b>디자인 레퍼런스</b>는 “이런 느낌으로 만들어 주세요”에
                  해당하는 견본입니다. ‘설정’ 화면에서 이미지를 올리면 AI가
                  색·서체·구성을 읽어 두고, 상품에 어울리는 것을 한 장 골라
                  페이지 전체에 적용합니다. 다른 곳에서 내려받은 이미지를 올려도
                  됩니다.
                </p>
                <Benefits
                  items={[
                    "레퍼런스는 ‘설정’ 화면에서 올리고 지웁니다",
                    "생성 결과 중 마음에 드는 것을 그 자리에서 레퍼런스로 등록할 수 있습니다",
                    "새로 만들기 화면에서 저장된 이미지를 첨부용으로 불러올 수 있습니다",
                  ]}
                />
                <Callout title="공용은 없습니다">
                  라이브러리·레퍼런스·캐릭터는 <b>모두 사용자별로 분리</b>되어
                  있습니다. 내가 올린 것은 남에게 보이지 않고, 남이 올린 것이 내
                  결과에 섞이지 않습니다. 그래서 새로 가입하면 레퍼런스가
                  0장이고, 올리기 전까지는 디자인 참고 없이 만들어집니다.
                </Callout>
              </Section>
            </TabsContent>

            <TabsContent value="character">
              <Section title="캐릭터 만들기 — 인물 고정" keyBadge="부가 기능">
                <p>
                  그냥 만들면 <b>섹션마다 다른 사람</b>이 나옵니다. 섹션
                  이미지가 따로 생성되기 때문입니다. 인물을 먼저 만들어 두면 그
                  사람이 페이지 내내 나옵니다.
                </p>
                <Steps
                  steps={[
                    "어떤 인물인지 글로 적습니다 (예: 30대 후반 한국인 여성, 단발머리, 베이지 니트)",
                    "후보 두 장 중 마음에 드는 인물을 고릅니다",
                    "정면·좌측·우측·뒷모습 네 장이 만들어져 캐릭터로 저장됩니다",
                    "새로 만들기 화면에서 등장인물로 고릅니다",
                  ]}
                />
                <Benefits
                  items={[
                    "섹션 구성에 맞는 각도를 AI가 골라 씁니다",
                    "얼굴·체형·머리는 캐릭터가, 색·서체·구성은 레퍼런스가 맡습니다",
                    "실제 모델 사진이 있다면 캐릭터 대신 그 사진을 쓰는 편이 더 정확합니다",
                  ]}
                />
                <Callout title="한 명당 5장이 차감됩니다">
                  후보 2장 + 각도 3장입니다(정면은 고른 후보를 그대로 씁니다).
                  상세페이지 한 장보다 비싸므로 화면에 미리 표시됩니다.
                </Callout>
              </Section>
            </TabsContent>

            <TabsContent value="knowledge">
              <Section
                title="공통 지식 — AI에게 ‘참고서’ 쥐여 주기"
                keyBadge="리디자인 전용 · 관리자만 등록"
              >
                <p>
                  시험을 외워서 보는 대신 <b>참고서를 펴 놓고</b> 푸는 것과
                  같습니다. 우리 브랜드의 카피·전환 노하우 문서를 올려 두면,{" "}
                  <b>리디자인</b>이 섹션을 만들 때 그 문서에서 지금 만드는
                  섹션과 <b>가장 관련 있는 대목만 찾아</b> 프롬프트에 넣습니다.
                </p>
                <Steps
                  title="어디서 등록하나요"
                  steps={[
                    "관리자 계정으로 ‘리디자인’ 화면에 들어갑니다.",
                    "대시보드 오른쪽 위 ‘지식파일 등록’ 버튼을 누릅니다.",
                    "텍스트 문서를 올리면 조각으로 나뉘어 검색용으로 저장됩니다.",
                    "일반 회원은 등록할 수 없고, 켜고 끄는 것만 할 수 있습니다.",
                  ]}
                />
                <Callout title="지금은 등록된 자료가 없습니다">
                  상단 뱃지에 <b>‘공통 지식 등록된 자료 없음’</b>이라고
                  표시되면, 보관소는 준비돼 있지만{" "}
                  <b>안이 비어 있어 아무 영향도 주지 않는</b> 상태입니다. 자료를
                  올린 뒤부터 결과에 반영되고, 뱃지에 문서 수가 표시됩니다.
                </Callout>
                <Callout title="새로 만들기와는 무관합니다">
                  ‘새로 만들기’의 판매 원칙은 검색해서 꺼내지 않고{" "}
                  <b>항상 전부</b> 프롬프트에 들어갑니다. 분량이 적어 검색으로
                  고르면 필요한 원칙이 빠지는 것을 확인했기 때문입니다. 그래서
                  공통 지식을 비워 둬도 새로 만들기 품질에는 영향이 없습니다.
                </Callout>
              </Section>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  keyBadge,
  children,
}: {
  title: string;
  keyBadge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 py-2 text-sm leading-relaxed text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {keyBadge ? (
          <Badge variant="secondary" className="ml-auto">
            {keyBadge}
          </Badge>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Steps({ steps, title }: { steps: string[]; title?: string }) {
  return (
    <div className="space-y-1.5">
      {title ? <p className="font-medium">{title}</p> : null}
      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Benefits({ items }: { items: string[] }) {
  return (
    <div className="space-y-1.5">
      <p className="font-medium">이런 점이 좋아요</p>
      <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Callout({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      {title ? <p className="mb-1 font-bold text-foreground">{title}</p> : null}
      <p className="leading-5">{children}</p>
    </div>
  );
}
