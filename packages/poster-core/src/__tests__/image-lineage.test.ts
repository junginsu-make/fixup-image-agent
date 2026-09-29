import { describe, expect, it } from "vitest";
import { orderPosterImages, posterImageLabels, withEditLineage } from "../image-lineage";

/**
 * 「이 장만 고치기」 결과가 **목록 어디에, 무슨 이름으로** 뜨나.
 *
 * 2026-09-29 — 변형 3을 고쳤는데 결과가 목록 맨 앞쪽에 「변형 1」로 붙었다.
 * `variant_index` 는 요청마다 0 부터 세고(고치기는 늘 0), 목록은 그 번호로만
 * 줄 세웠기 때문이다. 사용자는 변형 3 자리만 보고 「안 먹혔다」고 읽었다.
 */

const 처음 = "2026-09-29T08:00:00.000+00:00";
const 고친뒤 = "2026-09-29T08:05:00.000+00:00";
const 두번고친뒤 = "2026-09-29T08:09:00.000+00:00";

const 변형 = (id: string, variantIndex: number, createdAt = 처음, generationRequestId = "req-1") =>
  ({ id, variantIndex, createdAt, generationRequestId });

describe("목록은 만든 차례대로다", () => {
  it("고친 결과가 앞 회차 변형 사이에 끼지 않고 맨 뒤로 간다", () => {
    const 섞인목록 = [
      변형("v1", 0),
      변형("e1", 0, 고친뒤, "req-2"),
      변형("v2", 1),
      변형("v3", 2),
    ];
    expect(orderPosterImages(섞인목록).map((image) => image.id)).toEqual(["v1", "v2", "v3", "e1"]);
  });

  it("같은 회차 안에서는 변형 번호 차례다", () => {
    const 뒤섞임 = [변형("v3", 2), 변형("v1", 0), 변형("v2", 1)];
    expect(orderPosterImages(뒤섞임).map((image) => image.id)).toEqual(["v1", "v2", "v3"]);
  });

  /*
   * Postgres 는 시각의 끝자리 0 을 떼고 준다 — 초에서 딱 떨어지면 소수점이 아예
   * 없다(`…01+00:00` / `…01.5+00:00`). `localeCompare` 로 견주면 이 짝이 거꾸로
   * 선다(ICU 가 `.` 을 `+` 앞에 둔다 — 2026-09-29 리뷰). 시각으로 견준다.
   */
  it("초에서 딱 떨어지는 시각과 소수가 있는 시각을 바르게 견준다", () => {
    const 목록 = [
      변형("later", 0, "2026-09-29T08:00:01.5+00:00", "req-2"),
      변형("earlier", 0, "2026-09-29T08:00:01+00:00", "req-1"),
    ];
    expect(orderPosterImages(목록).map((image) => image.id)).toEqual(["earlier", "later"]);
  });

  it("시간대 표기가 달라도 시각으로 견준다 — 글자 차례로는 거꾸로다", () => {
    const 목록 = [
      변형("later", 0, "2026-09-29T01:00:00+00:00", "req-2"),
      // 한국 시각 09:00 은 협정 세계시 00:00 — 위보다 한 시간 이르다.
      변형("earlier", 0, "2026-09-29T09:00:00+09:00", "req-1"),
    ];
    expect(orderPosterImages(목록).map((image) => image.id)).toEqual(["earlier", "later"]);
  });

  it("받은 배열을 바꾸지 않는다", () => {
    const 원본 = [변형("v2", 1), 변형("v1", 0)];
    orderPosterImages(원본);
    expect(원본.map((image) => image.id)).toEqual(["v2", "v1"]);
  });
});

describe("고친 결과에 무엇을 고쳤는지 붙인다", () => {
  it("고치기 요청에서 나온 그림에만 붙는다", () => {
    const 목록 = withEditLineage(
      [변형("v3", 2), 변형("e1", 0, 고친뒤, "req-2")],
      [{ id: "req-2", parentImageId: "v3", editInstruction: "배경을 밤으로 바꿔 주세요" }],
    );
    expect(목록[0]!.edit).toBeNull();
    expect(목록[1]!.edit).toEqual({ parentImageId: "v3", instruction: "배경을 밤으로 바꿔 주세요" });
  });

  it("지시가 없는 요청(처음 만들기·다시 만들기)은 고친 것으로 치지 않는다", () => {
    const [image] = withEditLineage(
      [변형("v1", 0)],
      [{ id: "req-1", parentImageId: null, editInstruction: null }],
    );
    expect(image!.edit).toBeNull();
  });
});

describe("목록에 붙는 이름", () => {
  const 목록 = withEditLineage(
    orderPosterImages([
      변형("v1", 0), 변형("v2", 1), 변형("v3", 2),
      변형("e1", 0, 고친뒤, "req-2"),
      변형("e2", 0, 두번고친뒤, "req-3"),
    ]),
    [
      { id: "req-2", parentImageId: "v3", editInstruction: "배경을 밤으로 바꿔 주세요" },
      { id: "req-3", parentImageId: "e1", editInstruction: "글자를 키워 주세요" },
    ],
  );
  const labels = posterImageLabels(목록);

  it("처음 만든 것은 지금처럼 「변형 N」이다", () => {
    expect(labels.v1).toEqual({ title: "변형 1", detail: null });
    expect(labels.v3).toEqual({ title: "변형 3", detail: null });
  });

  it("고친 결과는 「변형 1」이 아니라 「고친 결과 N」이고, 무엇을 무슨 말로 고쳤는지 함께 나온다", () => {
    expect(labels.e1).toEqual({ title: "고친 결과 1", detail: "변형 3에서 고침 · 「배경을 밤으로 바꿔 주세요」" });
  });

  it("고친 것을 또 고치면 그 고친 결과를 가리킨다", () => {
    expect(labels.e2).toEqual({ title: "고친 결과 2", detail: "고친 결과 1에서 고침 · 「글자를 키워 주세요」" });
  });

  it("고친 원본이 지워졌으면 지시만 적는다", () => {
    const [orphan] = withEditLineage(
      [변형("e9", 0, 고친뒤, "req-9")],
      [{ id: "req-9", parentImageId: null, editInstruction: "사람을 빼 주세요" }],
    );
    expect(posterImageLabels([orphan!]).e9).toEqual({ title: "고친 결과 1", detail: "「사람을 빼 주세요」" });
  });

  it("이력을 못 읽으면(팀원이 보는 작업) 지금처럼 「변형 N」으로 떨어진다", () => {
    expect(posterImageLabels([변형("e1", 0, 고친뒤, "req-2")]).e1).toEqual({ title: "변형 1", detail: null });
  });
});
