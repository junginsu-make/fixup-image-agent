import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { modelCatalog, priceText, ratiosText } from "../../lib/model-catalog";

/**
 * **회원 화면이 가린 모델 이름을 여기서만 밝힌다.**
 *
 * 사이트는 「표준형」·「속도형」이라고 부른다. 그게 우리가 붙인 이름이지 모델
 * 이름이 아니라는 것은 코드에만 적혀 있었다(`sns-core/models.ts`). 운영하는
 * 사람이 값이 왜 그런지, 왜 어떤 비율에서 모델이 바뀌는지 알려면 코드를 열어야
 * 했다(2026-09-16 사용자 요청).
 *
 * **비용 패널과 다른 것이다.** `CostPanel` 은 실제로 나간 돈을 보여 준다 — 쓴
 * 모델만 나온다. 이 표는 **쓰든 안 쓰든 무엇이 있는지**를 보여 주는 대조표다.
 *
 * 관리자 폴더 안이라 `admin/layout.tsx` 의 `requireAdmin()` 이 이미 막고 있다.
 */

export function ModelCatalogPanel() {
  const rows = modelCatalog();

  return (
    <Card>
      <CardHeader>
        <CardTitle>이미지 모델 대조표</CardTitle>
        <CardDescription>
          회원 화면은 모델 이름을 가립니다. 「표준형」처럼 보이는 것이 실제로 무엇인지 여기서 봅니다.
          이 표는 코드(<code className="text-xs">sns-core/models.ts</code>)를 그대로 읽습니다 — 따로 적어 두지
          않으므로 모델이 늘거나 값이 바뀌면 여기도 함께 바뀝니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead>
              <tr className="border-b text-meta text-subtle-foreground">
                <th className="py-2 pr-3 font-medium">화면 이름</th>
                <th className="py-2 pr-3 font-medium">실제 모델</th>
                <th className="py-2 pr-3 font-medium">값</th>
                <th className="py-2 pr-3 font-medium">참고 이미지</th>
                <th className="py-2 pr-3 font-medium">한 번에</th>
                <th className="py-2 font-medium">비율</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="py-3 pr-3">
                    <span className="font-bold">{row.label}</span>
                    {row.isDefault ? (
                      <Badge variant="secondary" className="ml-1.5">기본</Badge>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">
                    <code className="text-xs font-bold">{row.id}</code>
                    {/*
                      종점까지 적는다. 값이 왜 그런지·무엇이 되는지가 전부
                      여기서 갈리고, 장애가 났을 때 뒤져야 할 것도 이 문자열이다.
                    */}
                    <span className="mt-1 block text-[11px] text-subtle-foreground">
                      t2i {row.t2iEndpoint}
                      <br />
                      i2i {row.i2iEndpoint}
                    </span>
                  </td>
                  <td className="py-3 pr-3 tabular-nums">
                    {priceText(row)}
                    {row.quality ? (
                      <span className="mt-1 block text-[11px] text-subtle-foreground">품질 {row.quality}</span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 tabular-nums">{row.maxReferenceImages}장</td>
                  <td className="py-3 pr-3 tabular-nums">
                    {row.batchMax}장
                    {row.batchMax === 1 ? (
                      <span className="mt-1 block text-[11px] text-warning">여러 장은 나눠 부릅니다</span>
                    ) : null}
                  </td>
                  <td className="py-3 text-xs">
                    {ratiosText(row)}
                    {row.fixedResolution ? (
                      <span className="mt-1 block text-[11px] text-subtle-foreground">
                        해상도 {row.fixedResolution} 고정
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          제공자를 「OpenAI」·「Google」로 단정하지 않는다. 코드가 아는 것은 종점
          이름 앞부분뿐이다(`vendorOf`). 가장 믿어야 할 화면에서 근거 없는 말을
          하면 안 된다.
        */}
        <p className="mt-3 text-xs text-muted-foreground">
          앞부분({[...new Set(rows.map((row) => row.vendor))].join(" · ")})은 종점 이름에서 읽은 것입니다.
          호출은 모두 fal 을 거칩니다.
        </p>
      </CardContent>
    </Card>
  );
}
