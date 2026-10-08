import { guideMetadata } from "../../../lib/seo/metadata";
import Link from "next/link";
import { AD_SPECS, adPortalSummary } from "./data";
import { ChoiceTable, Flow, FlowLegend, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Details, Summary } from "../_components/summary";
import { Callouts, Mock, MockButtons, MockSteps } from "../_components/mockup";

export const metadata = guideMetadata("/guide/ad");

export default function AdGuidePage() {
  const portals = adPortalSummary();

  return (
    <>
      <GuideHeader
        kicker="광고 규격으로 내보내기"
        title="만든 그림 한 장에서 포털 규격을 한꺼번에"
        lead="네이버·구글·카카오는 광고 상품마다 요구하는 픽셀이 다릅니다. 손으로 하면 한 장을 열일곱 번 자르고 줄여야 합니다. 그것을 대신합니다. 새로 그리지 않고, 이미 만들어 둔 그림에서 뽑습니다."
      />

      <Summary
        what="이미 만든 그림 한 장을 골라 포털 광고 규격 여러 개를 한 번에 뽑아 ZIP 으로 받습니다."
        points={[
          {
            title: "새로 그리지 않습니다",
            body: "라이브러리·이미지 만들기·참고 이미지에 있는 것에서 뽑습니다. 그래서 크레딧이 들지 않습니다. 투명 배너도 마찬가지입니다.",
          },
          {
            title: "많이 늘리지 않습니다",
            body: "원본이 조금 작으면 1.2배까지는 늘려서 뽑습니다. 그보다 크게 만들어야 하는 규격은 흐려지므로 못 뽑는다고 알립니다.",
          },
          {
            title: "비율이 다르면 가운데를 자릅니다",
            body: "규격 비율에 맞춰 그림 가운데를 잘라냅니다. 결과에서 주인공이 남았는지 꼭 보세요.",
          },
          {
            title: "나온 파일을 다시 검사합니다",
            body: "픽셀·형식·투명 여부·용량을 실제 파일에서 확인합니다. 통과한 것만 ZIP 에 담깁니다.",
          },
        ]}
        when={[
          "만들어 둔 소재를 네이버·구글·카카오에 올려야 할 때",
          "같은 그림을 여러 규격으로 맞춰야 할 때",
          "포털이 요구하는 픽셀을 일일이 찾아 자르기 번거로울 때",
        ]}
      />

      <Section title="아는 규격" hint={`지금 ${AD_SPECS.length}개입니다. 포털이 규격을 바꾸면 이 목록도 바뀝니다.`}>
        <ChoiceTable
          head={["포털", "광고 상품", "규격"]}
          rows={portals}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">「필수」는 그것이 없으면 등록 자체가 안 되는 규격입니다.</strong> 처음에는
          아무 포털도 골라져 있지 않습니다. 포털을 고르면 그 포털의 필수 규격이 함께 켜집니다. 성과가 떨어지는 것과
          등록이 안 되는 것은 다릅니다.
        </p>
      </Section>

      <Section title="세 걸음" hint="새로 만드는 화면이 아니라서 짧습니다.">
        <Flow
          nodes={[
            { label: "01 그림 고르기", sub: "만들어 둔 것에서 한 장" },
            { label: "02 어디에 올릴까요", sub: "포털 · 규격" },
            { label: "03 확인하고 내려받기", sub: "눈으로 보고 봉투에", human: true },
          ]}
        />
        <FlowLegend />
      </Section>

      <Details title="01 그림 고르기 · 화면 읽기" hint="「라이브러리에서 고르기」를 누르면 만든 그림과 올린 참고 이미지가 한 창에 뜹니다.">
        <Mock title="광고 규격으로 내보내기 · 01 그림 고르기">
          <MockSteps steps={["01 그림 고르기", "02 어디에 올릴까요", "03 확인하고 내려받기"]} current={0} />
          <MockButtons items={[{ label: "라이브러리에서 고르기" }]} />
        </Mock>
        <Callouts
          items={[
            {
              title: "큰 그림을 고르세요",
              body: "원본을 1.2배보다 크게 늘리지 않기 때문에, 작은 그림을 고르면 뽑을 수 있는 규격이 줄어듭니다. 1200×1200 이상이면 대부분 나옵니다.",
            },
            {
              title: "남의 그림은 안 됩니다",
              body: "내가 만든 것과 내가 올린 참고 이미지만 뽑힙니다. 관리자도 마찬가지입니다. 보는 것과 파일로 빼내는 것은 다른 일입니다.",
            },
          ]}
        />
      </Details>

      <Details title="02 어디에 올릴까요 · 규격 고르기" hint="포털을 고르면 그 상품의 규격이 펼쳐집니다.">
        <Callouts
          items={[
            {
              title: "못 뽑는 규격도 목록에 남습니다",
              body: "회색으로 보이고 왜 못 뽑는지 적힙니다. 숨기면 「이 시스템은 그 규격을 모르는구나」가 되고, 보이면 「아직 안 되는구나」가 됩니다.",
            },
            {
              title: "필수를 끄면 알려 줍니다",
              body: "필수 규격을 빼고 뽑으면 화면이 먼저 말합니다. 안 그러면 포털이 반려하고 나서야 압니다.",
            },
            {
              title: "안전영역이 있는 규격은 띠가 보입니다",
              body: "카카오 디스플레이가 그렇습니다. 위아래 100px, 왼쪽 40px 안에는 중요한 것을 두지 마세요. 미리보기에 반투명 띠로 표시됩니다.",
            },
          ]}
        />
      </Details>

      <Details title="03 확인하고 내려받기" hint="눈으로 보고 ZIP 으로 받습니다.">
        <Callouts
          items={[
            {
              title: "많이 줄어든 것은 표시됩니다",
              body: "214×214 는 1200×1200 에서 5.6배 축소입니다. 헤드라인이 안 읽히는 결과도 규격 검사는 통과하므로, 사람이 봐야 합니다.",
            },
            {
              title: "검사에 걸린 것은 ZIP 에 안 담깁니다",
              body: "담으면 포털이 반려할 파일이 정상 파일과 같은 봉투에 들어갑니다. 무엇이 왜 빠졌는지는 화면에 적힙니다.",
            },
            {
              title: "뽑은 것은 라이브러리에도 남습니다",
              body: "검사를 통과한 규격이 한 묶음으로 라이브러리 「광고소재」에 저장됩니다. 창을 닫아도 거기서 다시 보고 내려받습니다. 받은 파일 그대로 저장해 형식·크기가 바뀌지 않습니다.",
            },
          ]}
        />
      </Details>

      <Details title="투명 배너는 다르게 만듭니다" hint="카카오 비즈보드와 네이버 스마트채널 이야기입니다.">
        <p className="text-sm leading-7 text-muted-foreground">
          이 둘은 가로가 세로의 4배 가까이 됩니다. <strong className="text-foreground">AI 모델이 만들 수 있는 비율은
          3배까지</strong>라서 그냥은 못 만듭니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          그래서 <strong className="text-foreground">배경을 지워 물체만 떼어낸 뒤 투명한 캔버스에 얹습니다.</strong>{" "}
          물체는 오른쪽에 놓고 왼쪽을 비웁니다. 광고주가 글자를 넣을 자리입니다. 캔버스를 우리가 만드니까 모델의
          비율 제한이 상관없어집니다.
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          <strong className="text-foreground">투명 배너도 크레딧이 들지 않습니다.</strong> 배경을 지우는 일을 한 번 더
          하지만 새로 그리는 것은 아닙니다. 둘 다 골라도 떼어낸 물체 하나를 나눠 씁니다.
        </p>
      </Details>

      <Section title="크레딧" hint="들지 않습니다.">
        <p className="text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">이 화면은 새 그림을 그리지 않으므로 크레딧이 들지 않습니다.</strong>{" "}
          이미 만든 그림을 자르고 줄이기만 합니다. 투명 배너를 골라도 같습니다. 크레딧이 드는 자리는{" "}
          <Link href="/guide/credits" className="font-bold text-primary underline underline-offset-4">
            크레딧과 모델
          </Link>
          에 있습니다.
        </p>
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "고른 규격이 회색이고 안 켜집니다",
              a: "이 화면에서 만들지 않는 규격입니다. 브랜드 로고처럼 직접 올려야 하는 것이 그렇고, 줄 옆에 이유가 적혀 있습니다. 고른 그림과는 상관없습니다. 그림이 많이 작아서(1.2배 넘게 늘려야 해서) 못 뽑는 규격은 켜지기는 하고, 뽑은 뒤 03에서 「만들지 않았습니다」와 이유가 나옵니다. 그때는 더 큰 그림을 고르세요.",
            },
            {
              q: "브랜드 로고 규격이 안 만들어집니다",
              a: "로고는 만드는 것이 아니라 받는 것입니다. 모델이 지어내면 다른 로고가 됩니다. 가지고 계신 파일을 직접 올리세요.",
            },
            {
              q: "투명 배너에 물체가 너무 작게 들어갔습니다",
              a: "세로로 긴 피사체를 가로로 긴 배너에 놓으면 그렇게 됩니다. 늘리면 찌그러지고 자르면 잘려서 둘 다 광고로 못 씁니다. 가로로 넓은 그림을 골라 다시 뽑으세요.",
            },
            {
              q: "용량이 모자란다고 나옵니다",
              a: "네이버 메인은 50KB 미만을 받지 않습니다. 단색에 가까운 시안이 그렇게 됩니다. 사진이나 그라디언트가 있는 그림을 고르세요.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/ad" toolHref="/ad" toolLabel="「광고소재」 열기" />
    </>
  );
}
