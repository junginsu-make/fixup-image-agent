import { describe, expect, it } from "vitest";
import { buildPosterPrompt } from "../prompt";
import { EMPTY_SLOTS } from "../schemas";

const slots = {
  ...EMPTY_SLOTS,
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과" as const,
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

const images = [
  { kind: "style_reference" as const, title: "SNAP" },
  { kind: "preserved" as const, title: "제품 사진" },
];

const size = { width: 1024, height: 1536 };

describe("레퍼런스는 꼴만 가져온다", () => {
  const only = buildPosterPrompt({ slots, images: [{ kind: "style_reference" }], size });

  it("레퍼런스 안의 것은 가져오지 말라고 못 박는다", () => {
    // 안 적으면 모델이 레퍼런스의 아이콘·제품·글자를 통째로 베낀다.
    expect(only).toMatch(/Do NOT copy/i);
    expect(only).toMatch(/icons|illustrations/i);
  });

  it("아이콘은 같은 양식으로 새로 그리라고 한다", () => {
    expect(only).toMatch(/Draw new|same style/i);
  });

  it("색을 어디에 쓰는지까지 말한다", () => {
    expect(only).toMatch(/how each colour is used|fill surfaces/i);
  });
});

describe("지키는 대상이 사람인지 물건인지 가른다", () => {
  // 실측 정책(pdp.reference-policy.ts): 얼굴이 둘이면 모델이 절충해 제3의
  // 인물을 만든다. 물건과 사람을 같은 문장으로 지키라고 하면 그 경고를 할
  // 자리가 없다.
  const person = buildPosterPrompt({
    slots,
    images: [{ kind: "preserved", subject: "person", title: "모델" }],
    size,
  });
  const product = buildPosterPrompt({
    slots,
    images: [{ kind: "preserved", subject: "object", title: "제품" }],
    size,
  });

  it("사람에게는 얼굴과 체형을 지키라고 한다", () => {
    expect(person).toMatch(/facial features|face/i);
  });

  it("물건에게는 라벨과 재질을 지키라고 한다", () => {
    expect(product).toMatch(/labels/i);
    expect(product).not.toMatch(/facial features/i);
  });

  it("얼굴이 둘이면 하나만 쓰라고 못 박는다", () => {
    const twoFaces = buildPosterPrompt({
      slots,
      images: [
        { kind: "preserved", subject: "person", title: "모델 A" },
        { kind: "preserved", subject: "person", title: "모델 B" },
      ],
      size,
    });
    expect(twoFaces).toMatch(/only one person|single person/i);
  });

  it("대상을 안 적으면 물건으로 다룬다", () => {
    // 옛 자료에는 대상이 없다. 사람으로 보면 없는 얼굴을 지키려 든다.
    const legacy = buildPosterPrompt({ slots, images: [{ kind: "preserved", title: "무엇" }], size });
    expect(legacy).not.toMatch(/facial features/i);
  });
});

describe("사용자가 직접 친 말이 가장 세다", () => {
  const prompt = buildPosterPrompt({
    slots, images, size, userInstruction: "배경은 밤, 창밖에 네온",
  });

  it("맨 앞과 맨 뒤 두 곳에 넣는다", () => {
    // 2026-09-04 실측: 프롬프트 뒤에 긴 문단을 붙였더니 앞쪽 구도 지시가 밀려
    // 무시됐다. 긴 프롬프트에서 중간 문장은 힘을 잃으므로 양끝에 둔다.
    const first = prompt.indexOf("배경은 밤, 창밖에 네온");
    const last = prompt.lastIndexOf("배경은 밤, 창밖에 네온");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(last).toBeGreaterThan(first);
    // 앞의 것이 정말 맨 앞이다. 첨부 설명보다 먼저 읽힌다.
    expect(first).toBeLessThan(prompt.indexOf("Image 1 is"));
    // 뒤의 것이 정말 맨 뒤다. 출력 크기 줄 바로 앞이다.
    expect(last).toBeGreaterThan(prompt.indexOf("Do not include"));
  });

  it("우선순위 줄에서 사용자 지시가 맨 앞이다", () => {
    const priority = prompt.slice(prompt.indexOf("Priority when instructions conflict"));
    expect(priority).toMatch(/USER INSTRUCTION/);
    expect(priority.indexOf("USER INSTRUCTION")).toBeLessThan(priority.indexOf("PRESERVED"));
    expect(priority.indexOf("PRESERVED")).toBeLessThan(priority.indexOf("REFERENCE"));
  });

  it("비어 있으면 그 줄 자체를 넣지 않는다", () => {
    const bare = buildPosterPrompt({ slots, images, size });
    expect(bare).not.toMatch(/USER INSTRUCTION/);
    expect(bare).not.toMatch(/re-read the USER INSTRUCTION/);
  });

  it("공백만 적은 것은 안 적은 것으로 본다", () => {
    const blank = buildPosterPrompt({ slots, images, size, userInstruction: "   \n  " });
    expect(blank).not.toMatch(/USER INSTRUCTION/);
  });
});

describe("결을 고르면 그 결로 그린다", () => {
  it("auto 면 결 지시를 넣지 않는다", () => {
    // 기본이 auto 여야 지금까지 쓰던 사람이 안 깨진다 — 첨부한 그림의 결을
    // 따라가는 지금 동작이 그대로 유지된다.
    const auto = buildPosterPrompt({ slots, images, size, look: "auto" });
    const omitted = buildPosterPrompt({ slots, images, size });
    expect(auto).toBe(omitted);
    expect(auto).not.toMatch(/cel-shaded|photographic realism|hand-drawn illustration/i);
  });

  it("애니를 고르면 셀 셰이딩을 말한다", () => {
    const anime = buildPosterPrompt({ slots, images, size, look: "anime" });
    expect(anime).toMatch(/cel-shaded/i);
  });

  it("실사를 고르면 사진처럼 그리라고 한다", () => {
    const photoreal = buildPosterPrompt({ slots, images, size, look: "photoreal" });
    expect(photoreal).toMatch(/real photograph/i);
  });
});

describe("첨부한 그림을 기억으로 대충 그리지 말라고 한다", () => {
  it("첨부가 있으면 먼저 자세히 보라고 못 박는다", () => {
    const prompt = buildPosterPrompt({ slots, images, size });
    expect(prompt).toMatch(/Study every attached image closely/);
    expect(prompt).toMatch(/never substitute a generic stand-in/);
  });

  it("첨부가 없으면 그 줄을 넣지 않는다", () => {
    const none = buildPosterPrompt({ slots, images: [], size });
    expect(none).not.toMatch(/Study every attached image/);
    // 가리킬 그림이 없으면 우선순위를 말할 상대도 없다.
    expect(none).not.toMatch(/Priority when instructions conflict/);
  });
});

describe("포스터 프롬프트", () => {
  const prompt = buildPosterPrompt({ slots, images, size });

  it("첨부마다 역할을 번호로 알려준다", () => {
    expect(prompt).toMatch(/Image 1 is[\s\S]*REFERENCE/);
    expect(prompt).toMatch(/Image 2 is[\s\S]*PRESERVED/);
  });

  it("보존 대상이 스타일보다 우선한다", () => {
    const priority = prompt.slice(prompt.indexOf("Priority"));
    expect(priority.indexOf("PRESERVED")).toBeLessThan(priority.indexOf("REFERENCE"));
  });

  it("이전 결과를 붙이지 않는다 — 앵커가 없다", () => {
    expect(prompt).not.toMatch(/same series/i);
    expect(prompt).not.toMatch(/Only the content differs/i);
    expect(prompt).not.toMatch(/previous/i);
  });

  it("비어 있지 않은 글자 칸마다 자리를 준다", () => {
    for (const value of ["가을, 셔터를 누르다", "필름으로 담은 도시의 온도", "28MM F2.0", "ISO 400"]) {
      expect(prompt).toContain(value);
    }
  });

  it("길면 줄이지 말고 작게 넣으라고 한다", () => {
    expect(prompt).toMatch(/smaller font|more lines/i);
    expect(prompt).toMatch(/Do not omit|do not shorten/i);
  });

  it("원고에 없는 것을 지어내지 말라고 한다", () => {
    expect(prompt).toMatch(/copyright/i);
    expect(prompt).toMatch(/Do not invent/i);
  });

  it("배경 글자는 금지가 아니라 자제다", () => {
    // 간판·표지판까지 막으면 그림이 어색해진다. 2026-08-20 결정.
    expect(prompt).toMatch(/sparse|subordinate/i);
    expect(prompt).not.toMatch(/not listed above/i);
  });

  it("타이포 관계를 따로 말한다", () => {
    expect(prompt).toMatch(/통과|through/i);
  });

  it("금지 항목을 전한다", () => {
    expect(prompt).toContain("로고, 워터마크");
  });

  it("출력 크기를 명시한다", () => {
    expect(prompt).toContain("1024x1536");
  });

  it("글자수를 숫자로 못 박지 않는다", () => {
    expect(prompt).not.toMatch(/\d+\s*characters/i);
  });

  it("빈 슬롯만 있어도 프롬프트가 깨지지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare.length).toBeGreaterThan(0);
    expect(bare).toContain("1024x1536");
  });

  it("글자 칸이 하나도 없으면 렌더 지시를 넣지 않는다", () => {
    const bare = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [], size });
    expect(bare).not.toMatch(/Render this/i);
  });

  it("픽셀을 모르는 모델에는 크기를 적지 않는다", () => {
    // 비율을 열거형으로 받는 모델은 픽셀이 없다. 그때 크기 자리에 0 이
    // 들어가 "Output size 0x0" 이 그대로 모델에게 갔다.
    const enumMode = buildPosterPrompt({ slots: EMPTY_SLOTS, images: [] });
    expect(enumMode).not.toContain("0x0");
    expect(enumMode).not.toMatch(/Output size/i);
    // 크기와 함께 있던 지시는 남아야 한다.
    expect(enumMode).toContain("No outer border");
  });
});

/**
 * 글자를 안 적었으면 「넣지 마라」고 말해야 한다.
 *
 * 전에는 글자 칸이 전부 비면 프롬프트에서 **글자 이야기가 통째로 사라졌다** —
 * 「넣지 마라」도 함께. 그런데 맨 앞 `designerPersona()` 는 「confident
 * typography」를 요구하고 첨부는 `POSTER REFERENCE` 라고 부른다. 막는 말이
 * 없으니 모델이 글자를 만든다.
 *
 * 실제로 첨부 두 장에 글자가 없고 사용자도 요구하지 않았는데 「BEST DAY
 * EVER!」가 크게 박혀 나왔다(2026-09-08 사용자 실측).
 */
describe("글자를 안 적었을 때", () => {
  const noCopy = {
    slots: { ...EMPTY_SLOTS, scene: "강가 바위", subject: "청년 다섯" },
    images: [{ kind: "style_reference" as const }],
  };

  it("글자를 넣지 말라고 말한다", () => {
    const prompt = buildPosterPrompt(noCopy);
    expect(prompt).toContain("Render it with NO text");
  });

  it("무엇이 글자인지 낱낱이 적는다 — 「제목만 아니면 된다」로 새지 않게", () => {
    const prompt = buildPosterPrompt(noCopy);
    for (const word of ["headline", "tagline", "slogan", "caption", "watermark", "logo"]) {
      expect(prompt, `${word} 를 막아야 한다`).toContain(word);
    }
  });

  it("글자가 없는 것이 완성이라고 말한다", () => {
    // 「균형을 위해 글자를 넣자」는 판단을 미리 막는다.
    expect(buildPosterPrompt(noCopy)).toContain("not an unfinished one");
  });

  it("첨부에 원래 있던 글자는 남겨도 된다", () => {
    // 사진 속 티셔츠 문구까지 지우면 첨부를 안 따라간 것이 된다.
    expect(buildPosterPrompt(noCopy)).toContain("do not invent any that was not already there");
  });

  it("한 칸이라도 적었으면 그 칸을 그리라고 말한다 — 지금까지의 동작", () => {
    const prompt = buildPosterPrompt({
      ...noCopy,
      slots: { ...noCopy.slots, headline: "가을, 셔터를 누르다" },
    });
    expect(prompt).toContain("Render this text exactly as written");
    expect(prompt).toContain("가을, 셔터를 누르다");
    expect(prompt).not.toContain("Render it with NO text");
  });

  it("곁텍스트 하나만 있어도 「글자 없음」이 아니다", () => {
    const prompt = buildPosterPrompt({
      ...noCopy,
      slots: { ...noCopy.slots, sideTexts: ["28MM F2.0"] },
    });
    expect(prompt).not.toContain("Render it with NO text");
  });
});
