import { describe, expect, it, vi } from "vitest";
import { buildPlanPrompt, planPoster, PRIMARY_POSTER_MODEL } from "../planning";
import { EMPTY_SLOTS, keepInvented } from "../schemas";

const input = {
  instruction: "필름 카메라 감성의 사진전 포스터",
  ratio: "2:3",
  references: [{ title: "SNAP 포스터", grammar: "글자가 인물을 통과한다" }],
};

const filled = {
  kind: "전시 홍보",
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["28MM F2.0", "ISO 400"],
  scene: "해질녘 골목",
  subject: "필름 카메라를 든 20대 여성",
  action: "셔터를 누르는 순간",
  typeInteraction: "통과",
  dominantColor: "따뜻한 세피아",
  accentColor: "선명한 주황",
  forbidden: "로고, 워터마크",
};

describe("기획 프롬프트", () => {
  it("사용자 지시와 레퍼런스 문법을 함께 준다", () => {
    const prompt = buildPlanPrompt(input);
    expect(prompt).toContain("필름 카메라 감성의 사진전 포스터");
    expect(prompt).toContain("글자가 인물을 통과한다");
  });

  it("글자수를 숫자로 못 박지 않는다", () => {
    // 2026-08-20 결정. 내용에 따라 적절한 양이 달라진다.
    expect(buildPlanPrompt(input)).not.toMatch(/\d+\s*자/);
  });

  it("모르는 것은 지어내지 말라고 못 박는다", () => {
    expect(buildPlanPrompt(input)).toMatch(/지어내|비워/);
  });
});

describe("슬롯 기획", () => {
  it("주 모델은 claude-sonnet-5 다", () => {
    expect(PRIMARY_POSTER_MODEL).toBe("claude-sonnet-5");
  });

  it("채워진 슬롯을 돌려준다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: [] }),
    });
    expect(result.slots.headline).toBe("가을, 셔터를 누르다");
    expect(result.slots.sideTexts).toEqual(["28MM F2.0", "ISO 400"]);
    expect(result.issues).toEqual([]);
  });

  it("주 모델이 실패하면 예비로 넘어가고 사실을 남긴다", async () => {
    const backup = vi.fn(async () => ({ slots: filled }));
    const result = await planPoster(input, {
      plan: async () => { throw new Error("Claude 실패"); },
    }, { plan: backup });
    expect(backup).toHaveBeenCalledTimes(1);
    expect(result.slots.headline).toBe("가을, 셔터를 누르다");
    expect(result.issues.join("\n")).toMatch(/예비.*Claude 실패/);
  });

  it("둘 다 실패하면 빈 슬롯과 두 이유를 준다 — 사람이 직접 채운다", async () => {
    const result = await planPoster(input, {
      plan: async () => { throw new Error("주 실패"); },
    }, { plan: async () => { throw new Error("예비 실패"); } });
    expect(result.slots).toEqual(EMPTY_SLOTS);
    expect(result.issues.join("\n")).toMatch(/주 실패/);
    expect(result.issues.join("\n")).toMatch(/예비 실패/);
  });

  it("예비가 없으면 그 사실도 남긴다", async () => {
    const result = await planPoster(input, {
      plan: async () => { throw new Error("주 실패"); },
    });
    expect(result.issues.join("\n")).toMatch(/예비/);
  });

  it("모르는 칸이 섞여 오면 스키마가 거절하고 빈 슬롯을 준다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: { ...filled, 이상한칸: "값" } }),
    });
    expect(result.slots).toEqual(EMPTY_SLOTS);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("예외를 밖으로 던지지 않는다", async () => {
    await expect(planPoster(input, {
      plan: async () => { throw new Error("무슨 일이든"); },
    })).resolves.toBeDefined();
  });

  it("일부만 채워 와도 나머지는 빈 칸으로 둔다 — 사람이 마저 채운다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: { headline: "제목만 있음" } }),
    });
    expect(result.slots.headline).toBe("제목만 있음");
    expect(result.slots.scene).toBe("");
    expect(result.slots.typeInteraction).toBeNull();
  });
});

/**
 * 설계 §5 4번 — 기획 AI 도 번호·역할·01 지시를 함께 본다.
 *
 * **셋 다 시험 밖이었다.** 위 `input` 에 그 값들이 아예 없어서, `planning.ts`
 * 에서 번호를 지우든 역할을 지우든 01 지시를 지우든 시험 81개가 전부
 * 초록이었다(2026-09-08 리뷰). 기획이 첨부를 못 보면 「첨부한 그림과 겉도는
 * 칸」이라는 원래 문제로 되돌아간다.
 */
describe("기획도 화면과 같은 번호로 첨부를 본다", () => {
  const withRoles = {
    ...input,
    references: [
      { title: "만화 포스터", number: 2, roleLabel: "따라 만들기" },
      { title: "가족 사진", number: 1, roleLabel: "인물 그대로 지키기" },
    ],
  };

  it("넘겨받은 번호를 그대로 쓴다 — 다시 세지 않는다", () => {
    // 화면 ②번이 기획에서도 2번이어야 한다. 여기서 다시 세면 목록에 담긴
    // 차례대로 1, 2 가 되어 화면·프롬프트와 갈린다.
    const prompt = buildPlanPrompt(withRoles);
    expect(prompt).toContain("2. 만화 포스터");
    expect(prompt).toContain("1. 가족 사진");
  });

  it("역할을 함께 알려 준다", () => {
    const prompt = buildPlanPrompt(withRoles);
    expect(prompt).toContain("[따라 만들기]");
    expect(prompt).toContain("[인물 그대로 지키기]");
  });

  it("첨부에 대해 사용자가 적은 말을 넘긴다", () => {
    const prompt = buildPlanPrompt({
      ...withRoles,
      attachmentIntent: "1번 사진의 사람들을 2번 그림 느낌으로",
    });
    expect(prompt).toContain("1번 사진의 사람들을 2번 그림 느낌으로");
  });

  it("안 적었으면 그 줄이 없다", () => {
    expect(buildPlanPrompt(withRoles)).not.toContain("사용자가 적은 말");
  });

  it("번호가 없으면 담긴 차례대로 센다 — 옛 작업", () => {
    const prompt = buildPlanPrompt(input);
    expect(prompt).toContain("1. SNAP 포스터");
  });
});

/**
 * 사람을 한 명씩 넘긴다 (2026-09-08 실측).
 *
 * 전에는 기획이 여럿을 한 줄로 뭉갰다 — 「1번 사진에 등장하는 사람들(흰색
 * 티셔츠 착용)」. 그 한 줄이 최종 프롬프트의 유일한 인물 묘사라, 요약에 없는
 * 안경이 안 그려졌다.
 */
describe("사람을 한 명씩 넘긴다", () => {
  const withPeople = {
    ...input,
    references: [{
      title: "단체 사진",
      number: 1,
      roleLabel: "사람은 그대로, 그림 느낌만",
      people: ["왼쪽 첫째 · 선글라스 · 흰 티셔츠", "둘째 · 검정 캡 · 흰 티셔츠"],
    }],
  };

  it("한 명당 한 줄로 적는다", () => {
    const prompt = buildPlanPrompt(withPeople);
    expect(prompt).toContain("· 왼쪽 첫째 · 선글라스 · 흰 티셔츠");
    expect(prompt).toContain("· 둘째 · 검정 캡 · 흰 티셔츠");
  });

  it("그림 줄 아래에 붙는다 — 어느 그림의 사람인지 알아야 한다", () => {
    const prompt = buildPlanPrompt(withPeople);
    expect(prompt.indexOf("1. 단체 사진")).toBeLessThan(prompt.indexOf("왼쪽 첫째"));
  });

  it("**한 줄로 뭉뚱그리지 말라고 시킨다**", () => {
    expect(buildPlanPrompt(withPeople)).toContain("한 줄로 뭉뚱그리지 마세요");
  });

  it("위에 없는 것은 지어내지 말라고 한다", () => {
    // 읽은 것이 없는데 채우면 그림이 사진과 달라진다.
    expect(buildPlanPrompt(withPeople)).toContain("위에 없는 것은 지어내지 말고");
  });

  it("읽은 사람이 없으면 지금까지 그대로다", () => {
    const prompt = buildPlanPrompt(input);
    expect(prompt).toContain("1. SNAP 포스터");
    expect(prompt).not.toContain("       · ");
  });
});

/**
 * **빈 칸을 남기지 않는다. 대신 지어낸 것을 밝힌다.**
 *
 * 전에는 「알 수 없는 칸은 지어내지 말고 비워 두세요」였다. 뜻은 분명했다 — AI 가
 * 지어낸 설정이 그림에 섞이면 사용자는 왜 그게 나왔는지 모른다.
 *
 * **그런데 너무 잘 들었다.** 「벚꽃 아래에서 손을 흔드는 교복 입은 학생」에 칸을
 * 0개 채운다(2026-09-16 실측). 벚꽃에서 분홍을 읽는 것은 날조가 아니라 당연한
 * 읽기인데, 「지어내지 말라」를 성실히 따르면 그것까지 비운다. AI 가 추론과 날조를
 * 구분하지 못하고 둘 다 피하는 것으로 보인다.
 *
 * 초보일수록 빈 칸을 못 채운다. 그 사람이 도움을 받으러 왔다.
 *
 * **그래서 채우게 하고, 지어낸 칸을 표시한다**(2026-09-17 사용자 결정). 사용자가
 * 04 에서 그 표를 보고 지우거나 고친다. 판단은 사람이 하되, 판단할 거리는
 * AI 가 만들어 준다.
 */
describe("지어낸 칸", () => {
  it("기획이 돌려준 목록을 그대로 낸다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: ["dominantColor", "action"] }),
    });

    expect(result.invented).toEqual(["dominantColor", "action"]);
  });

  /**
   * 안 돌려주면 빈 목록으로 읽되 **그 사실을 남긴다.**
   *
   * 빈 목록과 「안 줬다」는 다르다. 안 줬는데 빈 목록으로만 읽으면 글자 칸이
   * 전부 사람 것으로 보여, 2026-09-08 사고를 막던 금지문이 영영 안 붙는다
   * (2026-09-17 리뷰). 옛 신호(빈 칸)는 결정적이었는데 새 신호는 자기신고라,
   * 못 받았을 때 기본값이 위험한 쪽으로 떨어진다.
   */
  it("안 돌려주면 빈 목록이되 그 사실을 남긴다", async () => {
    const result = await planPoster(input, { plan: async () => ({ slots: filled }) });

    expect(result.invented).toEqual([]);
    expect(result.issues.join("\n")).toMatch(/안 알려/);
  });

  /**
   * **모르는 칸 이름은 버린다.** 화면은 이름으로 칸을 찾으므로, 없는 이름이
   * 섞이면 조용히 아무 데도 표시가 안 붙는다. 들어올 때 걸러 낸다.
   */
  it("없는 칸 이름은 버린다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: ["scene", "없는칸", "mood"] }),
    });

    expect(result.invented).toEqual(["scene"]);
  });

  it("목록이 아니면 빈 목록이다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: "dominantColor" }),
    });

    expect(result.invented).toEqual([]);
  });

  /** 기획이 통째로 실패하면 지어낸 것도 없다. */
  it("실패하면 빈 목록이다", async () => {
    const result = await planPoster(input, {
      plan: async () => { throw new Error("주 실패"); },
    });

    expect(result.invented).toEqual([]);
  });
});

describe("기획 프롬프트의 규칙", () => {
  const prompt = buildPlanPrompt(input);

  it("빈 칸을 남기지 말라고 한다", () => {
    expect(prompt).toContain("비워 두지 말고");
  });

  /** 「지어내지 마세요」가 남아 있으면 둘이 부딪혀 AI 가 안전한 쪽으로 쏠린다. */
  it("지어내지 말라는 말이 안 남았다", () => {
    expect(prompt).not.toContain("지어내지 말고 비워");
  });

  it("지어낸 칸을 적으라고 한다", () => {
    expect(prompt).toContain("invented");
  });
});


/**
 * **사람이 고친 칸은 더 이상 「AI 가 골라 채운 것」이 아니다.**
 *
 * 표를 그대로 두면 자기가 쓴 글에 「AI 가 골라 채움」이 붙어 있는 꼴이 된다.
 *
 * **화면이 아니라 서버가 뺀다.** 화면 state 에서만 지우면 새로고침에 되살아난다
 * (2026-09-17 리뷰). 저장은 옛 값과 새 값을 둘 다 아는 자리라, 무엇이 바뀌었는지
 * 여기서 알 수 있다. 화면을 안 믿어도 되는 쪽이 안전하다.
 */
describe("고친 칸은 표에서 뺀다", () => {
  const 옛값 = { ...EMPTY_SLOTS, headline: "AI 가 쓴 말", dominantColor: "주황" };

  it("바꾼 칸이 빠진다", () => {
    const 남은것 = keepInvented(["headline", "dominantColor"], 옛값, {
      ...옛값, headline: "사람이 고친 말",
    });

    expect(남은것).toEqual(["dominantColor"]);
  });

  it("안 바꾼 칸은 남는다", () => {
    expect(keepInvented(["headline"], 옛값, 옛값)).toEqual(["headline"]);
  });

  /** 지우는 것도 고치는 것이다. 사람이 「이건 빼자」고 판단한 것이다. */
  it("지운 칸도 빠진다", () => {
    expect(keepInvented(["headline"], 옛값, { ...옛값, headline: "" })).toEqual([]);
  });

  /** 배열 칸도 본다. 곁텍스트는 문자열이 아니다. */
  it("곁텍스트가 바뀌어도 빠진다", () => {
    const 있음 = { ...EMPTY_SLOTS, sideTexts: ["가", "나"] };
    expect(keepInvented(["sideTexts"], 있음, { ...있음, sideTexts: ["가"] })).toEqual([]);
    expect(keepInvented(["sideTexts"], 있음, 있음)).toEqual(["sideTexts"]);
  });

  it("옛 목록이 없으면 빈 목록이다", () => {
    expect(keepInvented(undefined, 옛값, 옛값)).toEqual([]);
  });
});

/**
 * **평평하게 돌려줘도 읽는다.**
 *
 * 전에는 `{ slots: … }` 로 안 감싸고 칸을 바로 올려도 `?? raw` 가 받아 냈다.
 * 그런데 `invented` 를 더하면서 그 응답에 낯선 칸이 하나 섞이게 됐고,
 * `PosterSlotsSchema` 가 `.strict()` 라 「Unrecognized key」로 던진다 — 예비
 * 제공자까지 부르고(돈·시간) 결국 빈 슬롯이 된다(2026-09-17 리뷰).
 */
describe("평평한 응답", () => {
  it("칸을 바로 올려도 읽는다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ ...filled, invented: ["dominantColor"] }),
    });

    expect(result.slots.headline).toBe("가을, 셔터를 누르다");
    expect(result.invented).toEqual(["dominantColor"]);
    expect(result.issues).toEqual([]);
  });
});

describe("못 알아들은 칸 이름", () => {
  it("몇 개를 버렸는지 남긴다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: ["지배색", "slots.scene", "scene"] }),
    });

    expect(result.invented).toEqual(["scene"]);
    expect(result.issues.join("\n")).toMatch(/2개/);
  });

  /** 다 알아들었으면 아무 말도 안 한다. 쓸데없는 경고는 다음 경고를 흐린다. */
  it("다 알아들으면 조용하다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: ["scene"] }),
    });

    expect(result.issues).toEqual([]);
  });

  /** 같은 이름을 두 번 적어도 한 번만 센다. */
  it("겹친 이름은 하나로 본다", async () => {
    const result = await planPoster(input, {
      plan: async () => ({ slots: filled, invented: ["scene", "scene"] }),
    });

    expect(result.invented).toEqual(["scene"]);
  });
});

/**
 * **장면 칸을 자세히 쓰게 한다.**
 *
 * 최종 프롬프트의 ④ 구역은 이 칸들에서 나온다(`prompt.ts` 의 `sceneLines`).
 * 칸이 「해 질 녘 바닷가」면 그림 모델이 받는 것도 딱 그만큼이고, 나머지는
 * 모델이 알아서 정한다 — 사용자가 바란 것이 아닌 쪽으로 갈 수 있다.
 *
 * 실측에서 포스터 슬롯은 다 합쳐 260자였다. 같은 일을 하는 카드뉴스의 장면
 * 문장은 1,850자다(2026-09-17). **긴 프롬프트도 잘 반영되는 것을 확인했다**
 * (사용자) — 자세할수록 그림에 더 들어간다.
 *
 * **글자 칸은 다르다.** 거기는 사람이 시킨 글자만 쓴다 — 길게 쓰라고 하면
 * 없는 문구를 지어낸다.
 */
describe("장면을 자세히", () => {
  const prompt = buildPlanPrompt(input);

  it("자세히 쓰라고 말한다", () => {
    expect(prompt).toMatch(/자세히|구체적으로/);
  });

  /** 무엇을 적을지 알려 줘야 한다. 「자세히」만으로는 무엇을 더 쓸지 모른다. */
  it("무엇을 적을지 짚어 준다", () => {
    expect(prompt).toMatch(/빛|조명/);
    expect(prompt).toMatch(/재질|질감/);
  });

  /** 길이를 스스로 줄이지 말라고 못 박는다. */
  it("길이를 스스로 줄이지 말라고 한다", () => {
    expect(prompt).toMatch(/줄이지|길어도/);
  });
});

/**
 * **글자를 지어냈으면 장면에서도 글자 얘기를 하지 않는다.**
 *
 * 2026-09-17 실물에서 한 프롬프트가 스스로 모순이었다.
 *
 *   Action: 거대한 헤드라인 글자가 프레임 상단에서 인물의 머리 위쪽과 겹치며…
 *   Scene:  인물과 거대한 타이포그래피만이 화면을 채운다
 *     ↓ 바로 아래
 *   "No text was authored for this image. Render it with NO text."  (7줄)
 *
 * 까닭: 기획이 헤드라인을 쓰고 「지어냄」으로 신고하면 글자 칸은 지워지는데
 * (`prompt.ts` 의 `copyLines`), **장면·동작에 적은 글자 얘기는 안 지워진다.**
 * 그 금지문은 2026-09-08 「BEST DAY EVER!」 사고의 대응이라 뺄 수 없다 — 그때도
 * POSTER REFERENCE 가 붙어 있었고, 막는 말이 없어 모델이 글자를 만들었다.
 *
 * 그러니 **기획이 애초에 두 말을 같이 하지 않게** 한다. 지우는 쪽이 아니라
 * 안 쓰는 쪽이다 — 글로 지우려 들면 어느 문장을 지울지 코드가 판단해야 한다.
 */
describe("글자를 지어냈을 때의 장면", () => {
  const prompt = buildPlanPrompt(input);

  it("지어낸 글자는 장면에서도 말하지 말라고 한다", () => {
    expect(prompt).toMatch(/invented[^\n]*글자|글자[^\n]*invented/);
  });

  /** 무엇을 하지 말라는 것인지 짚어 준다. 「글자 얘기」만으로는 모호하다. */
  it("무엇이 글자 얘기인지 짚어 준다", () => {
    // 느슨한 검사였다 — `subline  헤드라인을 받치는 문구` 가 이미 걸려
    // 이 줄을 통째로 지워도 초록이었다(2026-09-17 리뷰).
    expect(prompt).toContain("타이포그래피·헤드라인·글자가 어디에 놓이는지");
  });
});
