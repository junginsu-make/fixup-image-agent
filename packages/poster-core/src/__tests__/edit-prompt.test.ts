import { describe, expect, it } from "vitest";
import { buildPosterJob } from "../generate";
import { buildPosterEditJob } from "../edit-job";
import { planEditJob, type EditJobInput } from "../selection";
import { EMPTY_SLOTS } from "../schemas";

/**
 * 「이 장만 고치기」에 적은 말이 **실제로 모델에 가는 프롬프트**를 잰다.
 *
 * 2026-09-29 사용자 보고 — 고칠 때 적은 말이 안 먹힌다. 실제 프롬프트를 뽑아
 * 보니 세 군데가 어긋나 있었다.
 *
 *   ① 지시가 `Action:` 칸 끝에 붙기만 했다. 처음 만들기가 쓰는
 *      「USER INSTRUCTION(최우선)」 양끝 배치가 없었다.
 *   ② 우선순위 줄이 `the REFERENCE image > the scene description` 이었다.
 *      고칠 그림(= REFERENCE)이 지시(= scene 안)를 공식적으로 이겼다.
 *   ③ 고칠 그림을 `POSTER REFERENCE` 로 붙였다 — 「느낌만 따라 하고 사람·제품은
 *      복사하지 마라」. 고치라는 말과 정반대다.
 *
 * 그래서 전부 `planEditJob → buildPosterEditJob` 을 **그대로 돌려** 나온 문자열을 본다.
 * 중간 값(`editInstruction`)만 보던 옛 시험은 이 셋을 하나도 못 잡았다.
 */

const 원래슬롯 = {
  ...EMPTY_SLOTS,
  kind: "카페 신메뉴 홍보",
  headline: "가을, 한 잔",
  subline: "시나몬 라떼 출시",
  scene: "햇살이 드는 따뜻한 카페 창가, 나무 테이블",
  subject: "김이 오르는 시나몬 라떼 한 잔",
  action: "컵 위로 김이 부드럽게 피어오른다",
  dominantColor: "따뜻한 갈색",
  accentColor: "크림색",
};

const base: EditJobInput = {
  projectId: "p1",
  parentImageId: "i3",
  parentUrl: "https://fal.media/parent.png",
  instruction: "배경을 밤으로 바꿔 주세요",
  modelId: "gpt-image-2",
  ratioId: "2:3",
  slots: 원래슬롯,
};

function built(overrides: Partial<EditJobInput> = {}) {
  const job = buildPosterEditJob(planEditJob({ ...base, ...overrides }));
  if (job.rejected) throw new Error(job.rejected);
  return job;
}

function lines(prompt: string): string[] {
  return prompt.split("\n").map((line) => line.trim()).filter(Boolean);
}

describe("① 고칠 때 적은 말은 가장 센 자리에 간다", () => {
  it("프롬프트 맨 앞이 사용자 지시다", () => {
    const [first, second] = lines(built().prompt);
    expect(first).toBe("USER INSTRUCTION (highest priority — follow exactly):");
    expect(second).toBe("배경을 밤으로 바꿔 주세요");
  });

  it("맨 뒤에서 한 번 더 못 박는다 — 긴 프롬프트에서 중간은 힘을 잃는다", () => {
    const all = lines(built().prompt);
    const tail = all.slice(-2).join("\n");
    expect(tail).toContain("re-read the USER INSTRUCTION");
    expect(tail).toContain("배경을 밤으로 바꿔 주세요");
  });

  it("장면 칸에 끼워 넣지 않는다", () => {
    // 고치기 프롬프트에는 장면 칸이 아예 안 가서, 프롬프트만 봐서는 이것을 못
    // 잰다 — 옛 방식으로 되돌려도 통과했다(2026-09-29 리뷰). 작업 자체를 본다.
    expect(planEditJob(base).slots).toEqual(원래슬롯);
  });

  it("고치기 조립을 빠뜨려도 지시는 양끝에 선다", () => {
    // 누가 `submitPoster(planEditJob(…))` 로 조립을 안 넘기고 부르면 처음 만들기
    // 조립을 탄다. 그때도 지시가 통째로 사라지지는 않게 한다.
    const [first, second] = lines(buildPosterJob(planEditJob(base)).prompt);
    expect(first).toBe("USER INSTRUCTION (highest priority — follow exactly):");
    // 처음 만들기 조립은 「결과물에 대해:」 라벨을 붙인다(`prompt.ts`).
    expect(second).toBe("결과물에 대해: 배경을 밤으로 바꿔 주세요");
  });
});

describe("② 충돌하면 사용자 지시가 이긴다", () => {
  it("우선순위 첫 자리가 사용자 지시다", () => {
    const priority = lines(built().prompt).find((line) => line.startsWith("Priority when instructions conflict"));
    expect(priority).toBeDefined();
    expect(priority).toMatch(/^Priority when instructions conflict: the USER INSTRUCTION > /);
  });

  it("고칠 그림이 지시를 이기는 옛 순서가 없다", () => {
    expect(built().prompt).not.toContain("the REFERENCE image > the scene description");
  });
});

describe("③ 고칠 그림은 참고용이 아니라 고칠 대상이다", () => {
  it("Image 1 을 고칠 대상으로 부른다", () => {
    expect(built().prompt).toContain("Image 1 is the IMAGE TO EDIT");
  });

  it("「느낌만 따라 하고 복사하지 마라」를 보내지 않는다", () => {
    const { prompt } = built();
    expect(prompt).not.toContain("POSTER REFERENCE");
    expect(prompt).not.toContain("Imitate its design language only");
    expect(prompt).not.toContain("not its people");
  });

  it("지시한 곳 말고는 그대로 두라고 말한다", () => {
    expect(built().prompt).toMatch(/change only what the USER INSTRUCTION asks for/);
  });

  /*
   * 「빛까지 그대로」만 있으면 「배경을 밤으로」에 사람만 낮 조명인 합성처럼 나올
   * 수 있다(2026-09-29 리뷰).
   */
  it("바뀐 곳이 어색하지 않게 빛·그림자는 필요한 만큼 맞추라고 한다", () => {
    expect(built().prompt).toContain("adjust lighting, shadows and reflections only as much as the change needs");
  });

  it("크기 줄을 붙인다 — 모델이 입력 그림 크기를 물려받지 않게", () => {
    expect(built().prompt).toContain("Output size 1216x1824.");
  });

  it("고칠 그림이 첫 번째로 가고, 한 장만 받는다", () => {
    const job = built();
    expect(job.endpoint).toBe("openai/gpt-image-2/edit");
    expect(job.mode).toBe("i2i");
    expect(job.input.image_urls).toEqual(["https://fal.media/parent.png"]);
    expect(job.input.num_images).toBe(1);
  });

  /*
   * 원래 장면 설명은 고칠 그림에 이미 그려져 있다. 다시 보내면 지시와 정면으로
   * 부딪힌다 — 「햇살이 드는 창가」와 「배경을 밤으로」가 한 프롬프트에 같이
   * 갔다. 이 저장소가 두 번 확인한 대로, 구체적인 문장 여럿은 우선순위 한 줄로
   * 못 이긴다(prompt.ts 2026-09-08 · 2026-09-17).
   */
  it("원래 장면 설명을 다시 보내지 않는다 — 고칠 그림에 이미 있고, 지시와 부딪힌다", () => {
    const { prompt } = built();
    expect(prompt).not.toContain("햇살이 드는");
    expect(prompt).not.toMatch(/^Scene:/m);
  });
});

describe("원래 작업의 글자 결정을 그대로 따른다", () => {
  /*
   * **기획이 채운 글자도 처음 만들 때 실렸다** (2026-10-02 사용자 결정). 고치기도
   * 같은 글자를 철자 그대로 지킨다 — 처음 만들 때 실은 글자를 고치기가 모르면
   * 뭉개진 한글을 바로잡을 근거가 없다.
   *
   * 옛 작업에는 저장된 표(`inventedSlots`)가 남아 있다. 그 값이 섞여 들어와도
   * 글자가 빠지면 안 된다.
   */
  it("표가 붙은 글자도 철자 그대로 지키라고 한다", () => {
    const 옛작업: Partial<EditJobInput> & { invented?: string[] } = {
      invented: ["headline", "subline", "sideTexts"],
    };
    const { prompt } = built(옛작업);
    expect(prompt).toContain("HEADLINE: 가을, 한 잔");
    expect(prompt).toContain("SUBLINE: 시나몬 라떼 출시");
  });

  it("적어 둔 글자는 철자 그대로 지키라고 하되, 지시가 바꾸면 따른다", () => {
    const { prompt } = built();
    expect(prompt).toContain("HEADLINE: 가을, 한 잔");
    expect(prompt).toMatch(/unless the USER INSTRUCTION changes it/);
  });

  it("고칠 그림의 글자가 뭉개져 있으면 적어 둔 철자가 이긴다", () => {
    expect(built().prompt)
      .toContain("If Image 1 shows this copy with different spelling, use the spelling above.");
  });

  /*
   * 「쓴 그대로」 작업은 기획이 안 돌아 슬롯이 비어 있다. 전에는 그 빈 슬롯
   * 때문에 「글자를 넣지 마라」가 붙어 **원래 있던 글자가 지워질** 수 있었다.
   */
  it("글자를 금지하지 않는다 — 고칠 그림에 있는 글자는 그대로 둔다", () => {
    const { prompt } = built({ slots: EMPTY_SLOTS });
    expect(prompt).not.toContain("Render it with NO text");
    expect(prompt).toMatch(/Keep every piece of text in Image 1 exactly as it is/);
  });

  it("시키지 않은 글자는 새로 넣지 않는다", () => {
    expect(built().prompt).toContain("Do not add any text the USER INSTRUCTION did not ask for.");
  });

  it("원래 작업의 금지 목록은 그대로 간다", () => {
    const { prompt } = built({ slots: { ...원래슬롯, forbidden: "사람 얼굴" } });
    expect(prompt).toContain("Do not include: 사람 얼굴.");
  });
});

/*
 * 원래 작업의 지킬 대상(제품·인물 원본 사진)을 다시 붙인다 — 고칠 때마다 조금씩
 * 달라지는 것을 막으려고.
 *
 * **그런데 원본 사진이 고칠 그림을 이기면 안 된다**(2026-09-29 리뷰). 1차에 「머리를
 * 금발로」 고친 것을 2차 「배경을 밤으로」에서 갈색 원본 사진이 되돌린다. 그래서
 * 원본 사진은 **알아볼 수 있게 하는 데만** 쓰고, 고칠 그림이 일부러 바꾼 것은
 * 고칠 그림을 따른다.
 */
describe("원래 작업의 원본 사진은 알아보게만 한다", () => {
  const 제품 = {
    attachments: [{ url: "https://fal.media/product.png", role: "preserve_product" as const }],
    preservedUrls: ["https://fal.media/product.png"],
  };
  const 사람 = {
    attachments: [{ url: "https://fal.media/model.png", role: "preserve_person" as const }],
    preservedUrls: ["https://fal.media/model.png"],
    personUrls: ["https://fal.media/model.png"],
  };

  it("제품 원본 사진을 Image 2 로 붙인다", () => {
    const job = built(제품);
    expect(job.input.image_urls).toEqual(["https://fal.media/parent.png", "https://fal.media/product.png"]);
    expect(job.prompt).toContain("Image 2 is the original photo of a product that may appear in Image 1.");
  });

  it("고칠 그림이 원본 사진보다 앞선다 — 앞서 고친 것을 되돌리지 않는다", () => {
    expect(built(사람).prompt).toContain(
      "Priority when instructions conflict: the USER INSTRUCTION > Image 1 (the image being edited)"
      + " > the original photos (identity details only).",
    );
  });

  it("원본 사진에 맞추라는 처음 만들기의 문구를 보내지 않는다", () => {
    // 「머리색까지 사진과 같게」가 가면 1차에 바꾼 머리색이 풀린다.
    const { prompt } = built(사람);
    expect(prompt).not.toContain("Reproduce this exact person");
    expect(prompt).not.toContain("hairstyle and hair colour");
    expect(built(제품).prompt).not.toContain("Reproduce this exact object");
  });

  it("고칠 그림이 일부러 바꾼 것은 고칠 그림대로 둔다", () => {
    expect(built(사람).prompt).toContain(
      "Anything Image 1 already changed on purpose — hair colour, clothing, colours, rendering style,"
      + " pose, position or size — stays as it is in Image 1.",
    );
  });

  it("사람은 얼굴을, 제품은 모양·로고·라벨을 알아보게 한다", () => {
    expect(built(사람).prompt).toContain("Image 2 is the original photo of a person who may appear in Image 1.");
    expect(built(사람).prompt).toMatch(/facial structure/);
    expect(built(제품).prompt).toMatch(/logo, label text/);
  });

  /*
   * 처음 만들기는 지킬 인물이 둘이면 「첫 사람만」을 붙인다. 고칠 그림에 없는
   * 두 번째 사람을 「Image 1 에 있는 사람」으로 부르면 끼어들거나 얼굴이 섞인다.
   */
  it("고칠 그림에 없는 사람·제품을 끌어오지 않는다", () => {
    const 둘 = {
      attachments: [
        { url: "https://fal.media/a.png", role: "preserve_person" as const },
        { url: "https://fal.media/b.png", role: "preserve_person" as const },
      ],
      preservedUrls: ["https://fal.media/a.png", "https://fal.media/b.png"],
      personUrls: ["https://fal.media/a.png", "https://fal.media/b.png"],
    };
    expect(built(둘).prompt).toContain(
      "Do not add a person or product from these photos that is not already in Image 1, and do not blend faces.",
    );
  });

  it("그림 느낌만 바꾼 사람도 같은 규칙이다 — 그림 느낌은 고칠 그림의 것이다", () => {
    const { prompt } = built({
      attachments: [{ url: "https://fal.media/model.png", role: "preserve_person_restyled" }],
      preservedUrls: ["https://fal.media/model.png"],
      personUrls: ["https://fal.media/model.png"],
      restyledUrls: ["https://fal.media/model.png"],
    });
    expect(prompt).toContain("Image 2 is the original photo of a person who may appear in Image 1.");
    expect(prompt).toContain("stays as it is in Image 1");
  });

  it("차례가 없는 옛 작업도 두 목록에서 되살린다", () => {
    const job = built({
      preservedUrls: ["https://fal.media/product.png", "https://fal.media/model.png"],
      personUrls: ["https://fal.media/model.png"],
    });
    expect(job.input.image_urls).toEqual([
      "https://fal.media/parent.png", "https://fal.media/product.png", "https://fal.media/model.png",
    ]);
    expect(job.prompt).toContain("Image 2 is the original photo of a product");
    expect(job.prompt).toContain("Image 3 is the original photo of a person");
  });

  /*
   * 따라 만들 그림은 다시 안 붙인다. 그 결은 고칠 그림에 이미 들어 있고, 다시
   * 붙이면 「느낌만 따라 하라」가 또 가서 ③이 되살아난다.
   */
  it("따라 만들 그림은 다시 붙이지 않는다", () => {
    const job = built({
      attachments: [
        { url: "https://fal.media/style.png", role: "style" },
        { url: "https://fal.media/product.png", role: "preserve_product" },
      ],
      preservedUrls: ["https://fal.media/product.png"],
    });
    expect(job.input.image_urls).toEqual(["https://fal.media/parent.png", "https://fal.media/product.png"]);
    expect(job.prompt).not.toContain("POSTER REFERENCE");
    expect(job.prompt).not.toContain("Image 3");
  });

  it("원본 사진이 없으면 원본 사진 이야기를 안 한다", () => {
    const { prompt } = built();
    expect(prompt).not.toContain("original photo");
    expect(prompt).toContain(
      "Priority when instructions conflict: the USER INSTRUCTION > Image 1 (the image being edited).",
    );
  });

  /*
   * 전에는 고칠 그림 한 장만 보내서 한도에 걸릴 일이 없었다. 원본 사진을 더하면서
   * 한도를 넘는 작업이 생겼다 — 고치기 화면에는 뺄 방법도 모델을 바꿀 방법도
   * 없다(2026-09-29 리뷰). 원본 사진은 보조라서 한도에 맞게 줄인다.
   */
  it("한도를 넘으면 원본 사진을 줄인다 — 고칠 그림은 언제나 간다", () => {
    // 경제형(nano-banana)은 7장까지다. 고칠 그림 1장 + 원본 사진 7장 = 8장.
    const urls = Array.from({ length: 7 }, (_unused, index) => `https://fal.media/p${index}.png`);
    const job = buildPosterEditJob(planEditJob({
      ...base,
      modelId: "nano-banana",
      attachments: urls.map((url) => ({ url, role: "preserve_product" as const })),
      preservedUrls: urls,
    }));
    expect(job.rejected).toBeUndefined();
    expect(job.input.image_urls).toEqual(["https://fal.media/parent.png", ...urls.slice(0, 6)]);
    expect(job.prompt).toContain("Image 7 is the original photo");
    expect(job.prompt).not.toContain("Image 8");
  });
});

/**
 * **고치기의 글자 판단은 처음 만들기와 같아야 한다.**
 *
 * 처음 만들기(`prompt.ts` 의 `copyLines`)는 고치지 않았다(2026-09-29 사용자 지시).
 * 그래서 같은 판단이 `edit-prompt.ts` 에 따로 있다. 둘이 갈리면 처음에 글자 없이
 * 만든 그림을 고칠 때 글자가 생기거나, 그 반대가 된다 — 여기서 나란히 놓고 잰다.
 */
describe("글자를 넣을지는 처음 만들 때와 같은 판단이다", () => {
  const 경우들: Array<{ 이름: string; slots: typeof 원래슬롯 }> = [
    { 이름: "헤드라인·받침 문구", slots: 원래슬롯 },
    { 이름: "곁텍스트만", slots: { ...원래슬롯, headline: "", subline: "", sideTexts: ["매일 7시"] } },
    { 이름: "셋 다", slots: { ...원래슬롯, sideTexts: ["매일 7시"] } },
    { 이름: "빈 슬롯", slots: EMPTY_SLOTS },
    { 이름: "공백뿐인 헤드라인", slots: { ...원래슬롯, headline: "   ", subline: "" } },
  ];

  for (const 경우 of 경우들) {
    it(경우.이름, () => {
      const 처음 = buildPosterJob({
        projectId: "p1", modelId: "gpt-image-2", ratioId: "2:3", variants: 3,
        slots: 경우.slots, referenceUrls: [], preservedUrls: [],
      }).prompt;
      const 고치기 = built({ slots: 경우.slots }).prompt;
      const 글자칸 = (prompt: string) => prompt.split("\n").filter((line) => /^\s+(HEADLINE|SUBLINE|SIDE \d+):/.test(line));
      expect(글자칸(고치기)).toEqual(글자칸(처음));
    });
  }
});
