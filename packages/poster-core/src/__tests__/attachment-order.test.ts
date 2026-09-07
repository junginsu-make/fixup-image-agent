import { describe, expect, it } from "vitest";
import {
  attachmentNumber,
  attachmentUrls,
  orderFromLegacyLists,
  type OrderedAttachment,
} from "../attachment-order";

describe("화면 순서 그대로 간다", () => {
  it("넣은 순서를 안 바꾼다", () => {
    // **이것이 이 파일이 있는 이유다.** 전에는 따라 만들 것을 먼저 이어 붙여서,
    // 화면 왼쪽의 「인물 지키기」가 프롬프트에서 Image 2 가 됐다.
    const attachments: OrderedAttachment[] = [
      { url: "a.png", role: "preserve_person" },
      { url: "b.png", role: "style" },
    ];
    expect(attachmentUrls(attachments)).toEqual(["a.png", "b.png"]);
  });

  it("번호는 1부터 센다", () => {
    // 프롬프트가 `Image 1` 로 시작한다. 화면 카드도 ① 로 시작해야 한다.
    expect(attachmentNumber(0)).toBe(1);
    expect(attachmentNumber(1)).toBe(2);
  });
});

describe("옛 작업", () => {
  it("두 목록을 이어 붙인다 — 지금까지와 같다", () => {
    // 옛 작업에는 화면 순서가 저장돼 있지 않다. 이어 붙이는 것 말고 방법이 없고,
    // 그것이 지금까지의 동작이라 다시 만들어도 결과가 안 바뀐다.
    expect(orderFromLegacyLists(["ref.png"], ["keep.png"])).toEqual([
      { url: "ref.png", role: "style" },
      { url: "keep.png", role: "preserve_product" },
    ]);
  });

  it("사람으로 표시된 것만 인물로 본다", () => {
    const ordered = orderFromLegacyLists([], ["face.png", "bag.png"], ["face.png"]);
    expect(ordered).toEqual([
      { url: "face.png", role: "preserve_person" },
      { url: "bag.png", role: "preserve_product" },
    ]);
  });

  it("표시가 없으면 전부 물건이다", () => {
    // 옛 작업에는 이 값이 없다. 사람으로 보면 없는 얼굴을 지키려 든다.
    expect(orderFromLegacyLists([], ["x.png"])).toEqual([
      { url: "x.png", role: "preserve_product" },
    ]);
  });

  it("아무것도 없으면 빈 목록이다", () => {
    expect(orderFromLegacyLists([], [])).toEqual([]);
  });
});

describe("프롬프트가 화면 번호를 그대로 쓴다", () => {
  it("고른 차례가 Image 번호가 된다", async () => {
    // **이 시험이 이 작업의 핵심이다.** 전에는 따라 만들 것을 먼저 이어 붙여서,
    // 화면 ①(인물 지키기)이 프롬프트에서 Image 2 가 됐다.
    const { buildPosterJob } = await import("../generate");
    const job = buildPosterJob({
      projectId: "p1",
      modelId: "nano-banana-pro",
      ratioId: "2:3",
      variants: 1,
      slots: {
        kind: "", headline: "", subline: "", sideTexts: [], scene: "",
        subject: "", action: "", typeInteraction: null, dominantColor: "",
        accentColor: "", forbidden: "",
      },
      // 화면 ① 이 인물, ② 가 레퍼런스다
      attachments: [
        { url: "person.png", role: "preserve_person" },
        { url: "style.png", role: "style" },
      ],
      referenceUrls: ["style.png"],
      preservedUrls: ["person.png"],
      personUrls: ["person.png"],
    });

    expect(job.prompt).toMatch(/Image 1 is a PRESERVED PERSON/);
    expect(job.prompt).toMatch(/Image 2 is a POSTER REFERENCE/);
    // fal 에 보내는 순서도 같아야 한다. 갈리면 지시가 다른 그림에 붙는다.
    expect(job.input.image_urls).toEqual(["person.png", "style.png"]);
  });

  it("차례가 없으면 지금까지처럼 이어 붙인다 — 옛 작업", async () => {
    const { buildPosterJob } = await import("../generate");
    const job = buildPosterJob({
      projectId: "p1",
      modelId: "nano-banana-pro",
      ratioId: "2:3",
      variants: 1,
      slots: {
        kind: "", headline: "", subline: "", sideTexts: [], scene: "",
        subject: "", action: "", typeInteraction: null, dominantColor: "",
        accentColor: "", forbidden: "",
      },
      referenceUrls: ["style.png"],
      preservedUrls: ["person.png"],
      personUrls: ["person.png"],
    });

    expect(job.input.image_urls).toEqual(["style.png", "person.png"]);
  });
});

describe("사용자가 쓴 그림 지시", () => {
  it("맨 앞에 들어가고 결과물 지시보다 먼저다", async () => {
    const { buildPosterPrompt } = await import("../prompt");
    const prompt = buildPosterPrompt({
      slots: {
        kind: "", headline: "", subline: "", sideTexts: [], scene: "",
        subject: "", action: "", typeInteraction: null, dominantColor: "",
        accentColor: "", forbidden: "",
      },
      images: [{ kind: "style_reference" }],
      attachmentIntent: "1번 사람들을 2번 느낌으로",
      userInstruction: "배경은 밤",
    });

    // 그림을 어떻게 쓸지가 정해져야 나머지가 말이 된다.
    const intent = prompt.indexOf("첨부한 그림에 대해");
    const result = prompt.indexOf("결과물에 대해");
    expect(intent).toBeGreaterThanOrEqual(0);
    expect(result).toBeGreaterThan(intent);
    // 둘 다 USER INSTRUCTION 으로 들어가 우선순위 규칙을 탄다.
    expect(prompt).toMatch(/USER INSTRUCTION[\s\S]*첨부한 그림에 대해/);
  });

  it("안 쓰면 프롬프트에 안 들어간다", async () => {
    const { buildPosterPrompt } = await import("../prompt");
    const prompt = buildPosterPrompt({
      slots: {
        kind: "", headline: "", subline: "", sideTexts: [], scene: "",
        subject: "", action: "", typeInteraction: null, dominantColor: "",
        accentColor: "", forbidden: "",
      },
      images: [{ kind: "style_reference" }],
    });
    expect(prompt).not.toContain("USER INSTRUCTION");
  });
});

describe("빈 차례가 옛 목록을 가리면 안 된다", () => {
  it("attachments 가 빈 배열이면 옛 목록으로 떨어진다", async () => {
    /**
     * **2026-09-07 리뷰에서 잡은 것.**
     *
     * `??` 는 `undefined` 에만 반응한다. 그런데 저장된 차례를 복원하는 쪽
     * (`orderedAttachments`)은 차례가 없는 옛 작업에 **빈 배열**을 준다.
     * 그대로 두면 `[] ?? legacy` 가 `[]` 라서, 옛 작업을 다시 만들 때
     * **그림이 하나도 안 붙는다.** 프롬프트에 Image 줄이 없고 fal 에 URL 도
     * 안 간다 — 첨부를 통째로 잃는다.
     */
    const { buildPosterJob } = await import("../generate");
    const job = buildPosterJob({
      projectId: "p1",
      modelId: "nano-banana-pro",
      ratioId: "2:3",
      variants: 1,
      slots: {
        kind: "", headline: "", subline: "", sideTexts: [], scene: "",
        subject: "", action: "", typeInteraction: null, dominantColor: "",
        accentColor: "", forbidden: "",
      },
      attachments: [],
      referenceUrls: ["style.png"],
      preservedUrls: ["person.png"],
      personUrls: ["person.png"],
    });

    expect(job.input.image_urls).toEqual(["style.png", "person.png"]);
    expect(job.prompt).toMatch(/Image 1 is a POSTER REFERENCE/);
    expect(job.prompt).toMatch(/Image 2 is a PRESERVED PERSON/);
  });
});

describe("수정 경로도 안 깨진다", () => {
  it("attachments 를 안 주면 부모 그림 하나가 그대로 간다", async () => {
    // 수정(`buildEditJob`)은 부모 그림 한 장을 `referenceUrls` 로만 넘긴다.
    // `attachments` 가 아예 없는 길이라 legacy 로 떨어져야 한다.
    const { buildPosterJob } = await import("../generate");
    const job = buildPosterJob({
      projectId: "p1",
      modelId: "nano-banana-pro",
      ratioId: "2:3",
      variants: 1,
      slots: {
        kind: "", headline: "", subline: "", sideTexts: [], scene: "",
        subject: "", action: "", typeInteraction: null, dominantColor: "",
        accentColor: "", forbidden: "",
      },
      referenceUrls: ["parent.png"],
      preservedUrls: [],
    });

    expect(job.input.image_urls).toEqual(["parent.png"]);
    expect(job.prompt).toMatch(/Image 1 is a POSTER REFERENCE/);
  });
});

describe("고른 차례를 손보는 규칙", () => {
  it("처음 고르면 맨 뒤에 붙는다", async () => {
    const { nextPickOrder } = await import("../attachment-order");
    expect(nextPickOrder(["a"], "b", true)).toEqual(["a", "b"]);
  });

  it("역할만 바꾸면 자리를 안 옮긴다", async () => {
    /**
     * **2026-09-07 리뷰에서 잡은 것.**
     *
     * ①번 그림의 역할을 「따라 만들기 → 인물 지키기」로 바꾸면 그것이 맨 뒤로
     * 밀렸다. 드롭다운을 건드렸다는 이유로 번호가 바뀌면, 「①번을」이라고 쓴
     * 지시가 다른 그림에 붙는다.
     */
    const { nextPickOrder } = await import("../attachment-order");
    expect(nextPickOrder(["a", "b", "c"], "a", true)).toEqual(["a", "b", "c"]);
    expect(nextPickOrder(["a", "b", "c"], "b", true)).toEqual(["a", "b", "c"]);
  });

  it("빼면 목록에서 빠진다", async () => {
    const { nextPickOrder } = await import("../attachment-order");
    expect(nextPickOrder(["a", "b"], "a", false)).toEqual(["b"]);
  });

  it("뺐다가 다시 고르면 맨 뒤로 간다", async () => {
    // 그건 실제로 다시 고른 것이다. 화면에서 보이는 것과 같다.
    const { nextPickOrder } = await import("../attachment-order");
    const without = nextPickOrder(["a", "b"], "a", false);
    expect(nextPickOrder(without, "a", true)).toEqual(["b", "a"]);
  });

  it("원본을 안 바꾼다", async () => {
    const { nextPickOrder } = await import("../attachment-order");
    const before = ["a"];
    nextPickOrder(before, "b", true);
    expect(before).toEqual(["a"]);
  });
});

describe("보이는 것과 보내는 것이 같다", () => {
  it("목록에 없는 것은 안 보낸다", async () => {
    /**
     * **2026-09-07 리뷰에서 잡은 것.**
     *
     * 여러 장을 올리다 중간에 실패하면 앞의 것에 역할이 붙지만 목록 다시
     * 읽기를 건너뛴다. 그러면 화면에는 안 보이는데 서버로는 가고, 뒤 번호가
     * 전부 1씩 밀린다 — 「①번을」이라고 쓴 지시가 본 적도 없는 그림을 가리킨다.
     */
    const { visibleOrder } = await import("../attachment-order");
    const inLibrary = new Set(["a", "c"]);
    expect(
      visibleOrder(["b", "a", "c"], () => true, (id) => inLibrary.has(id)),
    ).toEqual(["a", "c"]);
  });

  it("역할이 풀린 것도 안 보낸다", async () => {
    const { visibleOrder } = await import("../attachment-order");
    const picked = new Set(["a"]);
    expect(
      visibleOrder(["a", "b"], (id) => picked.has(id), () => true),
    ).toEqual(["a"]);
  });

  it("둘 다 만족하는 것만 남는다", async () => {
    const { visibleOrder } = await import("../attachment-order");
    expect(
      visibleOrder(["a", "b", "c"], (id) => id !== "b", (id) => id !== "c"),
    ).toEqual(["a"]);
  });
});
