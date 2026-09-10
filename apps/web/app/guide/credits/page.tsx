import type { Metadata } from "next";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { ChoiceTable, Flow, GuideHeader, Pitfalls, Section } from "../_components/flow";
import { GuideFooter } from "../_components/guide-footer";
import { Callouts, Mock, MockChoices, MockField, MockNote } from "../_components/mockup";

export const metadata: Metadata = { title: "크레딧과 모델 — 사용 설명서" };

/**
 * 가중치는 README §이미지 모델의 표와 같다. 모델 목록 자체는 코드에서 가져와
 * 이름이 바뀌면 여기도 따라 바뀌게 둔다.
 */
const WEIGHTS: Record<string, { weight: number; note: string }> = {
  // 빠진 모델은 표에 「—」로 나온다. 막히지 않고 빈칸으로 새는 쪽이라 잊기 쉽다.
  "gpt-image-2.5-flare": { weight: 4, note: "글자가 정확하면서 2 보다 2.5배 빠릅니다" },
  "gpt-image-2.5-sunburst": { weight: 4, note: "글자 배치 지시를 더 잘 지킵니다. 대신 느립니다" },
  "gpt-image-2": { weight: 4, note: "글자가 가장 정확합니다. 명조 계열도 표현합니다" },
  "nano-banana-pro": { weight: 3, note: "빠릅니다. 글자는 고딕 계열입니다" },
  "nano-banana-2": { weight: 3, note: "Pro 와 같은 계열입니다" },
  "nano-banana": { weight: 1, note: "가장 저렴합니다. 글자가 적은 장면에" },
};

export default function CreditsGuidePage() {
  return (
    <>
      <GuideHeader
        kicker="크레딧과 모델"
        title="어디서 얼마나 차감되나"
        lead="이 시스템에서 돈이 드는 자리는 하나뿐입니다 — 그림을 만들 때입니다. 읽고, 분석하고, 구성안을 짜고, 원고를 쓰는 데는 이미지 크레딧이 차감되지 않습니다. 어디까지가 무료이고 어디부터 차감인지 알아 두면 마음 편히 여러 번 고칠 수 있습니다."
      />

      <Section title="무료 구간과 차감 구간" hint="경계는 언제나 「만들기」 버튼입니다.">
        <Flow
          nodes={[
            { label: "재료 읽기", sub: "무료" },
            { label: "기획 · 구성안", sub: "무료" },
            { label: "원고 · 문구", sub: "무료 · 여러 번", human: true },
            { label: "그림 생성", sub: "여기서 차감" },
            { label: "검수", sub: "무료" },
          ]}
        />
        <ul className="grid gap-2 text-sm leading-7 text-muted-foreground">
          <li>
            · <strong className="text-foreground">분석과 기획은 무료입니다.</strong> 사진을 읽고 구성안을 짜는 데는
            이미지 크레딧이 들지 않습니다. 남용을 막는 시간당 제한만 있습니다
          </li>
          <li>
            · <strong className="text-foreground">원고는 몇 번을 고쳐도 무료입니다.</strong> 그림을 만들기 전이기
            때문입니다. 여기서 충분히 고치세요
          </li>
          <li>
            · <strong className="text-foreground">성공한 이미지만 차감합니다.</strong> 실패한 이미지는 크레딧으로
            정산하지 않습니다
          </li>
          <li>
            · <strong className="text-foreground">상세페이지 편집 화면의 문구는 무료입니다.</strong> 이미지 위에 얹는
            것이라 몇 번을 고쳐도 차감되지 않습니다
          </li>
        </ul>
      </Section>

      <Section title="모델마다 차감량이 다릅니다" hint="원가가 4.6배까지 벌어지기 때문입니다.">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-bold text-muted-foreground">모델</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">한 장당 차감</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">특징</th>
              </tr>
            </thead>
            <tbody>
              {IMAGE_MODELS.map((model) => {
                const info = WEIGHTS[model.id];
                return (
                  <tr key={model.id} className="border-b align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-bold">
                      {model.label}
                      {model.isDefault ? (
                        <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary">
                          기본
                        </span>
                      ) : null}
                    </th>
                    <td className="px-4 py-3 font-extrabold text-primary">{info ? `${info.weight}장` : "—"}</td>
                    <td className="px-4 py-3 leading-6 text-muted-foreground">{info?.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          「한 장당 차감」은 이미지 한 장을 만들 때 월 한도에서 빠지는 양입니다. GPT Image 2로 카드 6장을 만들면{" "}
          <strong className="text-foreground">6 × 4 = 24장</strong>이 차감됩니다. Nano Banana로 같은 6장을 만들면
          6장입니다.
        </p>
      </Section>

      <Section title="그래서 무엇을 고르나" hint="글자가 얼마나 들어가는지로 정하면 대체로 맞습니다.">
        <ChoiceTable
          head={["이런 결과물이면", "이 모델", "왜"]}
          rows={[
            ["카드뉴스 · 글자가 많다", "GPT Image 2", "한글이 가장 정확합니다. 여기서 아끼면 다시 만들게 됩니다"],
            ["포스터 · 헤드라인이 크다", "GPT Image 2", "큰 글자가 틀리면 바로 눈에 띕니다"],
            ["A4 인쇄용", "GPT Image 2", "픽셀을 직접 지정해야 해서 다른 모델은 이 비율을 못 만듭니다"],
            ["배경 · 분위기 이미지", "Nano Banana", "글자가 없으면 비싼 모델을 쓸 이유가 없습니다"],
            ["여러 안을 빠르게 보고 싶다", "Nano Banana Pro", "빠르고 차감이 GPT 보다 적습니다"],
            ["모르겠다", "기본값 그대로", "기본은 GPT Image 2 입니다. 가장 안전합니다"],
          ]}
        />
      </Section>

      <Section title="남은 크레딧은 어디서 보나">
        <Mock title="계정">
          <MockField label="이번 달 이미지 크레딧" value="24 / 300장 사용" marker={1} />
          <MockNote marker={2}>진행 중인 작업이 있으면 그만큼 미리 잡아 둡니다.</MockNote>
          <MockChoices
            columns={2}
            items={[{ title: "사용량", hint: "이번 달 기준" }, { title: "회원 정보", hint: "이메일 · 상태" }]}
          />
        </Mock>
        <Callouts
          items={[
            {
              title: "화면 오른쪽 위에도 늘 떠 있습니다",
              body: "어느 화면에서든 상단에 남은 장수가 보입니다. 만들기 전에 확인하세요.",
            },
            {
              title: "「잡아 둔 양」이 있습니다",
              body: "만드는 중인 작업은 결과가 나오기 전에 미리 잡아 둡니다. 실패하면 돌려놓습니다. 그래서 진행 중에는 남은 양이 실제보다 적게 보일 수 있습니다.",
            },
          ]}
        />
      </Section>

      <Section title="자주 막히는 곳">
        <Pitfalls
          items={[
            {
              q: "한도를 다 썼다고 나옵니다",
              a: "이번 달 이미지 생성 한도를 모두 사용한 경우입니다. 다음 달에 초기화됩니다. 한도를 늘리려면 운영자에게 문의하세요.",
            },
            {
              q: "분석만 했는데 제한에 걸립니다",
              a: "분석은 크레딧을 쓰지 않지만 남용을 막는 시간당 횟수 제한이 따로 있습니다. 잠시 뒤 다시 시도하세요.",
            },
            {
              q: "만들다가 중지했는데 차감됐습니다",
              a: (
                <>
                  <strong className="text-foreground">중지는 되돌리기가 아닙니다.</strong> 이미 만들어진 장은 성공한
                  것이라 차감된 채로 남습니다. 중지는 그 뒤로 더 만들지 않게 하는 것입니다.
                </>
              ),
            },
            {
              q: "AI 서비스에 따로 가입해야 하나요",
              a: "아닙니다. 생성은 운영자 서버 키로 돕니다. 회원이 API 키를 준비하거나 브라우저에 입력할 일이 없습니다.",
            },
          ]}
        />
      </Section>

      <GuideFooter href="/guide/credits" toolHref="/settings" toolLabel="사용량 보기" />
    </>
  );
}
