import { describe, expect, it } from "vitest";
import {
  CHARACTER_ANGLES,
  angleDirective,
  migrateAngle,
  buildCandidatePrompt,
  buildSceneWithCharacterDirective,
  buildTurnaroundPrompt,
  pickAngleForSection,
  selectCharacterModel,
} from "./pdp.character";
import { IMAGE_MODELS } from "./types";

describe("각도 정의", () => {

  // 이 순서가 화면과 라이브러리의 순서다. 목록 표지와 첫 장이 정면이어야 한다.
  it("정면이 맨 앞이다", () => {
    expect(CHARACTER_ANGLES[0].id).toBe("front");
  });



  it("각도마다 영어 지시문이 있다", () => {
    for (const angle of CHARACTER_ANGLES) {
      expect(angle.directive.length).toBeGreaterThan(30);
      expect(angle.label.length).toBeGreaterThan(0);
    }
  });

  // 원본이 겪어보고 넣은 문장이다. 없으면 뒤통수에 얼굴이 생긴다.
  it("뒷모습에 얼굴을 그리지 말라고 명시한다", () => {
    const back = CHARACTER_ANGLES.find((angle) => angle.id === "back")!;
    expect(back.directive).toMatch(/do not place facial features on the back/i);
  });
});

describe("후보 생성 프롬프트", () => {
  const prompt = buildCandidatePrompt({
    description: "30대 한국인 여성, 단발머리, 베이지 니트",
    aspectRatio: "9:16",
    photoreal: true,
  });

  it("사용자 묘사를 그대로 싣는다", () => {
    expect(prompt).toContain("30대 한국인 여성");
  });

  it("한 명만 그리라고 못 박는다", () => {
    expect(prompt).toMatch(/exactly one/i);
    expect(prompt).toMatch(/do not add a second character/i);
  });

  // 세로 비율은 전신이 들어가야 한다. 억지로 욱여넣으면 비율이 깨진다.
  it("세로 비율이면 전신 구도를 요구한다", () => {
    expect(prompt).toMatch(/head to toe|full-length/i);
    expect(prompt).toMatch(/never compress|never squeeze/i);
  });

  it("가로·정사각이면 상반신 구도를 요구한다", () => {
    const wide = buildCandidatePrompt({ description: "x", aspectRatio: "16:9", photoreal: true });
    expect(wide).toMatch(/head-to-waist|three-quarter view/i);
  });

  // 보정 티가 나면 상세페이지에서 바로 가짜로 보인다.
  it("실사면 피부 표현을 지시한다", () => {
    expect(prompt).toMatch(/pores/i);
    expect(prompt).toMatch(/avoid beauty filters|airbrush/i);
  });

  it("실사가 아니면 피부 지시를 넣지 않는다", () => {
    const illustration = buildCandidatePrompt({
      description: "x",
      aspectRatio: "1:1",
      photoreal: false,
    });
    expect(illustration).not.toMatch(/pores/i);
  });
});

describe("다각도 프롬프트", () => {
  it("고른 후보를 기준으로 그 각도를 만든다", () => {
    const prompt = buildTurnaroundPrompt({
      identityPrompt: "30대 한국인 여성, 단발머리",
      angle: "back",
      photoreal: true,
    });
    expect(prompt).toContain("30대 한국인 여성");
    expect(prompt).toMatch(/back view/i);
  });

  it("같은 인물임을 못 박는다", () => {
    const prompt = buildTurnaroundPrompt({
      identityPrompt: "x",
      angle: "front",
      photoreal: false,
    });
    expect(prompt).toMatch(/same character|same person/i);
  });
});

describe("섹션에 쓸 각도 고르기", () => {
  it("클로즈업·정면이면 정면", () => {
    expect(pickAngleForSection("정면 클로즈업, 인물 중심 구도")).toBe("front");
    expect(pickAngleForSection("close-up portrait facing camera")).toBe("front");
  });

  it("뒤돌아선 장면이면 뒷모습", () => {
    expect(pickAngleForSection("뒤돌아 걸어가는 뒷모습")).toBe("back");
    expect(pickAngleForSection("walking away, seen from behind")).toBe("back");
  });

  it("오른쪽을 보는 장면이면 우측", () => {
    expect(pickAngleForSection("모델이 오른쪽을 바라보는 구도")).toBe("right_45");
    expect(pickAngleForSection("facing right, product on the left")).toBe("right_45");
  });

  // 대부분의 사용 장면은 좌측 45도가 자연스럽다. 판단이 안 서면 여기로 온다.
  it("그 외에는 좌측", () => {
    expect(pickAngleForSection("주방에서 제품을 쓰는 장면")).toBe("left_45");
    expect(pickAngleForSection("")).toBe("left_45");
  });
});

describe("섹션 생성에 붙일 지시", () => {
  const directive = buildSceneWithCharacterDirective({
    identityPrompt: "30대 한국인 여성, 단발머리",
    hasStyleReference: true,
  });

  // 캐릭터와 스타일 레퍼런스가 인물을 두고 다툰다. 안 정해주면 모델이
  // 절충하는데, 그 절충이 얼굴을 바꾼다.
  it("얼굴은 캐릭터가 이긴다고 못 박는다", () => {
    expect(directive).toMatch(/identity.*overrides|overrides.*identity/i);
    expect(directive).toMatch(/face/i);
  });

  it("스타일 레퍼런스가 있으면 역할을 나눠 적는다", () => {
    expect(directive).toMatch(/colour|color|typograph/i);
  });

  it("스타일 레퍼런스가 없으면 그 얘기를 하지 않는다", () => {
    const alone = buildSceneWithCharacterDirective({
      identityPrompt: "x",
      hasStyleReference: false,
    });
    expect(alone).not.toMatch(/typograph/i);
  });

  it("한 명만 그리라고 못 박는다", () => {
    expect(directive).toMatch(/exactly one/i);
  });
});

describe("모델 선택", () => {
  // 실사 인물은 Nano Banana Pro 가 낫다는 것이 원본의 결론이다.
  it("실사는 nano-banana-pro", () => {
    expect(selectCharacterModel(true)).toBe("nano-banana-pro");
  });

  it("실사가 아니어도 우리가 쓰는 모델 안에서 고른다", () => {
    // 목록을 손으로 적어 두면 기본을 옮길 때 같이 깨진다. 여기서 지킬 것은
    // **아는 모델인가** 하나다 — 모르는 id 를 돌려주면 `ENDPOINTS` 에도
    // `IMAGE_MODEL_CREDIT_WEIGHT` 에도 자리가 없어 런타임에서 터진다.
    expect(IMAGE_MODELS.map((model) => model.id)).toContain(selectCharacterModel(false));
  });
});

/* ── 종류와 결 ───────────────────────────────────────────── */

describe("종류가 몸을 정한다", () => {
  const base = { description: "주황색 고양이", aspectRatio: "3:4" as const };

  it("사물에는 얼굴 이야기를 하지 않는다", () => {
    // 뒤통수에 얼굴을 그리지 말라는 지시는 물건에 뜻이 없다.
    const back = angleDirective("back", "object");
    // 단어 경계가 필요하다 — surface 안의 face 가 걸린다.
    expect(back).not.toMatch(/faces?|eyes|hairstyle/i);
  });

  it("동물은 얼굴 대신 주둥이와 털로 말한다", () => {
    expect(angleDirective("back", "animal")).toMatch(/fur|coat/i);
    expect(angleDirective("front", "animal")).toMatch(/muzzle|snout|head/i);
  });

  it("캐릭터에는 사람 등신을 강제하지 않는다", () => {
    // 2등신 캐릭터에 사람 비율을 요구하면 캐릭터가 사람이 된다.
    const prompt = buildCandidatePrompt({ ...base, kind: "character", look: "anime" });
    expect(prompt).not.toMatch(/anatomically correct/i);
  });

  it("사람에는 여전히 사람 비율을 요구한다", () => {
    const prompt = buildCandidatePrompt({ ...base, kind: "person", look: "photoreal" });
    expect(prompt).toMatch(/anatomically correct/i);
  });

  it("동물은 꼬리와 발까지 넣으라고 한다", () => {
    const prompt = buildCandidatePrompt({ ...base, kind: "animal", look: "photoreal" });
    expect(prompt).toMatch(/tail|paws|whole body/i);
  });
});

describe("결이 질감을 정한다", () => {
  const base = { description: "x", aspectRatio: "3:4" as const, kind: "person" as const };

  it("모공 지시는 사람이고 실사일 때만 나온다", () => {
    expect(buildCandidatePrompt({ ...base, look: "photoreal" })).toMatch(/pores/i);
    expect(buildCandidatePrompt({ ...base, look: "anime" })).not.toMatch(/pores/i);
    // 실사 동물에 사람 모공을 요구하면 이상해진다.
    expect(buildCandidatePrompt({ ...base, kind: "animal", look: "photoreal" }))
      .not.toMatch(/pores/i);
  });

  it("결마다 다른 질감을 말한다", () => {
    const anime = buildCandidatePrompt({ ...base, look: "anime" });
    const three = buildCandidatePrompt({ ...base, look: "3d" });
    const draw = buildCandidatePrompt({ ...base, look: "illustration" });
    expect(anime).toMatch(/cel|anime/i);
    expect(three).toMatch(/3d|render/i);
    expect(draw).toMatch(/hand|brush|paint|ink/i);
    expect(new Set([anime, three, draw]).size).toBe(3);
  });

  it("결이 기본 모델을 정한다", () => {
    // 실사만 값을 박는다. 실측 결론이라 바꾸려면 비교를 먼저 해야 한다.
    expect(selectCharacterModel("photoreal")).toBe("nano-banana-pro");

    // 나머지 셋은 **서로 같고, 실사와 다르고, 아는 모델**이면 된다. 어느
    // 모델인지는 `MODEL_BY_LOOK` 한 곳이 정한다.
    const 나머지 = ["anime", "3d", "illustration"].map((look) =>
      selectCharacterModel(look as never),
    );
    expect(new Set(나머지).size).toBe(1);
    expect(나머지[0]).not.toBe("nano-banana-pro");
    expect(IMAGE_MODELS.map((model) => model.id)).toContain(나머지[0]);
    // 옛 boolean 호출과도 어긋나면 안 된다 — 같은 「실사 아님」이다.
    expect(나머지[0]).toBe(selectCharacterModel(false));
  });
});

describe("첨부한 그림의 역할", () => {
  const base = {
    description: "x", aspectRatio: "3:4" as const,
    kind: "person" as const, look: "anime" as const,
  };

  it("결만 따라 만들기는 그 캐릭터를 베끼지 말라고 한다", () => {
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "style" });
    expect(prompt).toMatch(/do not copy/i);
    expect(prompt).toMatch(/style|rendering|palette/i);
  });

  it("뽑아내기는 그 캐릭터를 그대로 살리라고 한다", () => {
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "extract" });
    expect(prompt).toMatch(/same character/i);
    // 배경은 버린다 — 캐릭터만 독립으로 뽑는 것이 목적이다.
    expect(prompt).toMatch(/background/i);
  });

  /**
   * **「그리는 방식」은 뽑아내기에서 뗀다** (2026-09-08).
   *
   * 캐릭터 도구는 결(실사/애니/3D)을 따로 고르게 되어 있는데, 뽑아내기 문구가
   * `the same colour palette` 를 요구해서 「뽑아내기 + 결: 실사」가 정면으로
   * 부딪혔다 — 화면에서 그냥 눌리는 조합인데도.
   */
  it("**그리는 방식은 베끼지 말라고 못 박는다**", () => {
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "extract" });
    expect(prompt).toMatch(/rendering style is NOT part of what you copy/i);
    expect(prompt).toMatch(/may differ from the reference/i);
  });

  it("그림 전체의 색조를 그대로 가져오라고 하지 않는다", () => {
    // 이 한 마디가 결(look)과 부딪혔다. 결은 아래에서 따로 말한다.
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "extract" });
    expect(prompt).not.toMatch(/the same colour palette/i);
  });

  it("**그 캐릭터의 색은 지킨다** — 머리·피부·옷", () => {
    // 그림 전체의 색조와 캐릭터 자신의 색은 다르다. 뒤엣것은 정체성이다.
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "extract" });
    expect(prompt).toMatch(/colours that belong to the character itself/i);
  });

  it("작은 것을 이름으로 부른다 — 안경이 사라진 자리다", () => {
    // 이미지 만들기에서 겪은 것과 같다(설계 §4-3). 「그대로 재현하라」만 적으면
    // 큰 것만 옮기고 안경·모자를 버린다.
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "extract" });
    for (const item of ["glasses", "hats", "one at a time"]) {
      expect(prompt, `${item} 를 말해야 한다`).toContain(item);
    }
  });

  it("결을 바꿔도 사람은 그대로라고 말한다 — 두 지시가 함께 선다", () => {
    const prompt = buildCandidatePrompt({
      ...base, kind: "person", look: "anime", referenceRole: "extract",
    });
    // 정체성 쪽
    expect(prompt).toMatch(/same face or head shape/i);
    // 결 쪽 — 서로 안 부딪힌다
    expect(prompt).toMatch(/rendering style is NOT part of what you copy/i);
  });

  it("결만 따라 만들기는 지금까지 그대로다", () => {
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "style" });
    expect(prompt).toMatch(/STYLE reference/i);
    expect(prompt).toMatch(/Do not copy the character in it/i);
  });

  it("역할이 없으면 첨부 이야기를 하지 않는다", () => {
    expect(buildCandidatePrompt(base)).not.toMatch(/supplied reference/i);
  });
});

describe("옛 호출이 그대로 동작한다", () => {
  // 상세페이지(/create)가 같은 함수를 쓴다. 종류·결을 안 주면 사람으로 떨어진다.
  it("photoreal 만 줘도 된다", () => {
    const prompt = buildCandidatePrompt({
      description: "30대 여성", aspectRatio: "3:4", photoreal: true,
    });
    expect(prompt).toMatch(/pores/i);
    expect(prompt).toMatch(/anatomically correct/i);
  });

  it("photoreal false 는 그림 결로 본다", () => {
    const prompt = buildCandidatePrompt({
      description: "30대 여성", aspectRatio: "3:4", photoreal: false,
    });
    expect(prompt).not.toMatch(/pores/i);
  });

  it("각도 프롬프트도 옛 호출을 받는다", () => {
    const prompt = buildTurnaroundPrompt({
      identityPrompt: "x", angle: "back", photoreal: true,
    });
    expect(prompt).toMatch(/back view/i);
  });
});

describe("후보는 정면이어야 한다", () => {
  const base = { description: "30대 여성", aspectRatio: "3:4" as const };

  it("후보 프롬프트에 정면 지시가 들어간다", () => {
    // 후보를 그대로 「정면」으로 저장한다. 각도를 안 말하면 모델이 3/4 뷰를
    // 그릴 수 있고, 그러면 정면이 정면이 아닌 채로 나머지 셋의 기준이 된다.
    const prompt = buildCandidatePrompt({ ...base, kind: "person", look: "photoreal" });
    expect(prompt).toContain(angleDirective("front", "person"));
  });

  it("종류에 맞는 정면 지시를 쓴다", () => {
    const animal = buildCandidatePrompt({ ...base, kind: "animal", look: "photoreal" });
    expect(animal).toContain(angleDirective("front", "animal"));
    const object = buildCandidatePrompt({ ...base, kind: "object", look: "photoreal" });
    expect(object).toContain(angleDirective("front", "object"));
  });

  it("후보도 각도 3장과 같은 배경을 쓴다", () => {
    // 각도 3장은 plain neutral background 로 만든다. 정면만 배경이 있으면
    // 네 장이 한 벌로 안 보인다.
    for (const kind of ["person", "animal", "character", "object"] as const) {
      const prompt = buildCandidatePrompt({ ...base, kind, look: "photoreal" });
      expect(prompt, kind).toMatch(/plain neutral background/i);
    }
  });

  it("뽑아내기에서도 정면을 요구한다", () => {
    // 첨부한 그림이 옆모습이어도 정면으로 세워야 기준이 된다.
    const prompt = buildCandidatePrompt({
      ...base, kind: "person", look: "anime", referenceRole: "extract",
    });
    expect(prompt).toContain(angleDirective("front", "person"));
  });
});

describe("각도 여섯 종", () => {
  it("여섯을 쓴다", () => {
    expect(CHARACTER_ANGLES.map((angle) => angle.id)).toEqual([
      "front", "left_45", "right_45", "left_90", "right_90", "back",
    ]);
  });

  it("정면이 맨 앞이다", () => {
    // 이 순서가 화면과 라이브러리의 순서다. 첫 장이 정면이어야 알아본다.
    expect(CHARACTER_ANGLES[0]!.id).toBe("front");
  });

  it("45도는 두 눈이 남고 90도는 옆얼굴이다", () => {
    for (const id of ["left_45", "right_45"] as const) {
      expect(angleDirective(id, "person")).toMatch(/45 degrees/i);
      // 낱말이 아니라 뜻을 본다 — 45도에서 두 눈이 남는가.
      expect(angleDirective(id, "person")).toMatch(/both eyes/i);
    }
    for (const id of ["left_90", "right_90"] as const) {
      expect(angleDirective(id, "person")).toMatch(/90 degrees|profile/i);
      // 90도는 두 눈이 안 보인다. 보인다고 하면 모델이 억지로 돌린다.
      expect(angleDirective(id, "person")).not.toMatch(/both eyes remain visible/i);
    }
  });

  it("왼쪽과 오른쪽이 서로 반대를 본다", () => {
    for (const [left, right] of [["left_45", "right_45"], ["left_90", "right_90"]] as const) {
      // 45도는 subject-left, 90도는 the subject's own left 로 적는다.
      // 요구하는 것은 문구 형식이 아니라 좌우가 반대라는 사실이다.
      expect(angleDirective(left, "person")).toMatch(/subject.{0,10}left/i);
      expect(angleDirective(right, "person")).toMatch(/subject.{0,10}right/i);
      expect(angleDirective(left, "person")).not.toMatch(/subject.{0,10}right/i);
    }
  });

  it("여섯 각도 모두 종류마다 지시가 있다", () => {
    for (const angle of CHARACTER_ANGLES) {
      for (const kind of ["person", "animal", "character", "object"] as const) {
        expect(angleDirective(angle.id, kind), `${angle.id}/${kind}`).toBeTruthy();
      }
    }
  });

  it("사물의 90도에도 얼굴 이야기가 없다", () => {
    for (const id of ["left_90", "right_90"] as const) {
      expect(angleDirective(id, "object")).not.toMatch(/\bfaces?\b|\beyes\b|hairstyle/i);
    }
  });
});

describe("옛 각도 이름", () => {
  it("left·right 는 45도였다", () => {
    // 2026-09 이전 자료는 left/right 가 45도를 뜻했다. 그 뜻 그대로 옮긴다.
    expect(migrateAngle("left")).toBe("left_45");
    expect(migrateAngle("right")).toBe("right_45");
    expect(migrateAngle("three_quarter")).toBe("left_45");
  });

  it("아는 이름은 그대로 둔다", () => {
    for (const angle of CHARACTER_ANGLES) {
      expect(migrateAngle(angle.id)).toBe(angle.id);
    }
  });

  it("모르는 이름은 그대로 돌려준다", () => {
    // 조용히 정면으로 바꾸면 없던 정면이 둘이 된다.
    expect(migrateAngle("무엇")).toBe("무엇");
  });
});

describe("사용자가 친 말과 고른 값이 부딪힐 때", () => {
  const base = { description: "수채화풍 소녀", aspectRatio: "3:4" as const };

  it("친 말이 맨 앞에서 최우선으로 선다", () => {
    // 종류·결은 고르는 값이고 이것은 직접 친 말이다. 「수채화풍으로」라고
    // 적었는데 결이 사진에 머물면 적은 말이 무시된 것으로 보인다.
    const prompt = buildCandidatePrompt({ ...base, look: "photoreal" });
    expect(prompt.startsWith("USER INSTRUCTION")).toBe(true);
    expect(prompt).toContain("highest priority");
    expect(prompt.indexOf("수채화풍 소녀")).toBeLessThan(prompt.indexOf("Create exactly one"));
  });

  it("맨 끝 가까이에서 한 번 더 못 박는다", () => {
    // 긴 프롬프트에서 중간 문장은 힘을 잃는다. 가장 중요한 것은 양끝에 둔다.
    const prompt = buildCandidatePrompt({ ...base, look: "anime" });
    expect(prompt).toContain("re-read the USER INSTRUCTION");
    expect(prompt.lastIndexOf("수채화풍 소녀")).toBeGreaterThan(prompt.length / 2);
  });

  it("친 말에 없는 것은 고른 값이 그대로 간다", () => {
    // 사용자 말을 최우선으로 올린다고 옵션이 빠지면 안 된다. 안 적은 것은
    // 고른 대로 나와야 한다.
    const prompt = buildCandidatePrompt({ ...base, kind: "animal", look: "anime" });
    expect(prompt).toContain("Show it as");
    expect(prompt.toLowerCase()).toContain("anime");
  });

  it("구도 지시는 여전히 맨 뒤다", () => {
    // 2026-09-04 실측: 뒤에 문단을 덧붙였더니 앞쪽 구도 지시가 밀려 전신으로
    // 뽑으라는 말이 무시됐다(발이 프레임 밖으로 나갔다). 그 자리를 뺏지 않는다.
    const prompt = buildCandidatePrompt({ ...base, look: "photoreal" });
    expect(prompt.indexOf("re-read the USER INSTRUCTION"))
      .toBeLessThan(prompt.indexOf("Keep the primary identifying features clearly visible"));
  });

  it("첨부가 없으면 레퍼런스 순위를 말하지 않는다", () => {
    // 없는데 「레퍼런스보다 세다」고 하면 모델이 있지도 않은 첨부를 찾는다.
    expect(buildCandidatePrompt(base)).not.toContain("Priority when instructions conflict");
  });

  it("첨부가 있으면 순위를 밝힌다", () => {
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "style" });
    expect(prompt).toContain("Priority when instructions conflict");
    expect(prompt).toContain("the USER INSTRUCTION");
  });

  it("정체성을 뽑아 쓸 첨부면 그 대상도 순위에 넣는다", () => {
    const prompt = buildCandidatePrompt({ ...base, referenceRole: "extract" });
    expect(prompt).toContain("the PRESERVED SUBJECT");
  });

  it("각도 만들기는 첨부가 기준이라 손대지 않는다", () => {
    // 각도는 「고른 정면과 같은 캐릭터」를 만드는 일이다. 여기서 친 말을
    // 최우선으로 올리면 기준 그림에서 벗어난 것이 나온다.
    const prompt = buildTurnaroundPrompt({ identityPrompt: "수채화풍 소녀", angle: "back" });
    expect(prompt).not.toContain("USER INSTRUCTION");
    expect(prompt).toContain("Preserve the same");
  });
});

describe("좌우가 갈리는가", () => {
  const KINDS = ["person", "character", "animal", "object"] as const;

  it("왼쪽과 오른쪽이 낱말 하나만 다르지 않다", () => {
    // 2026-09-04 운영에서 왼쪽 45°와 오른쪽 45°가 거의 같은 그림으로 나왔다.
    // 두 지시문이 "left"/"right" 한 낱말만 달랐던 것이 원인의 하나다 —
    // 나머지가 통째로 같으면 앞의 참조 그림이 그 한 낱말을 눌러 버린다.
    //
    // 방향을 말하는 자리가 둘 이상이어야 한다.
    for (const kind of KINDS) {
      for (const [left, right] of [["left_45", "right_45"], ["left_90", "right_90"]] as const) {
        const l = angleDirective(left, kind);
        const r = angleDirective(right, kind);
        expect((l.match(/\bLEFT\b|\bleft\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect((r.match(/\bRIGHT\b|\bright\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("왼쪽 지시문에 오른쪽 방향이 섞이지 않는다", () => {
    // 사람·동물은 「먼 쪽 귀는 가려진다」를 말하느라 반대 낱말이 한 번 나온다.
    // 그것까지 막지는 않되, 방향을 말하는 횟수는 제 쪽이 더 많아야 한다.
    for (const kind of KINDS) {
      const l = angleDirective("left_45", kind);
      const r = angleDirective("right_45", kind);
      expect((l.match(/left/gi) ?? []).length).toBeGreaterThan((l.match(/right/gi) ?? []).length);
      expect((r.match(/right/gi) ?? []).length).toBeGreaterThan((r.match(/left/gi) ?? []).length);
    }
  });

  it("화면 기준으로 말한다 — 「본인 기준」은 모델이 뒤집어 생각해야 한다", () => {
    for (const kind of KINDS) {
      for (const angle of ["left_45", "right_45", "left_90", "right_90"] as const) {
        expect(angleDirective(angle, kind)).toMatch(/edge of the frame/i);
        expect(angleDirective(angle, kind)).not.toMatch(/their own|its own/i);
      }
    }
  });

  it("정면이 아니라고 못 박는다", () => {
    // 참조로 정면을 함께 보내므로, 안 막으면 모델이 그것을 그대로 베낀다.
    for (const kind of KINDS) {
      for (const angle of ["left_45", "right_45", "left_90", "right_90"] as const) {
        expect(angleDirective(angle, kind)).toMatch(/NOT a (straight-on )?front view/i);
      }
    }
  });

  it("각도 그리기는 참조가 정면이라는 것을 알린다", () => {
    const prompt = buildTurnaroundPrompt({ identityPrompt: "호랑이", angle: "left_45" });
    expect(prompt).toMatch(/FRONT view/);
    expect(prompt).toMatch(/do not copy its camera angle/i);
  });

  it("사물 지시문에는 여전히 얼굴 이야기가 없다", () => {
    // 물건에 얼굴 이야기가 섞이면 모델이 얼굴을 떠올린다. 동사 "faces" 도 안 쓴다.
    for (const angle of ["left_45", "right_45", "left_90", "right_90"] as const) {
      expect(angleDirective(angle, "object")).not.toMatch(/\bfaces?\b|\beyes\b|cheek|ear\b/i);
    }
  });
});

describe("한 장에 한 자세만", () => {
  const base = { description: "호랑이 마스코트", aspectRatio: "3:4" as const };

  it("캐릭터 시트를 이름 대어 막는다", () => {
    // 2026-09-07 운영에서 정면 후보 한 장에 다섯 자세가 격자로 나왔다.
    // 「캐릭터를 하나만」으로는 안 막힌다 — 모델에게 캐릭터 시트는 여전히
    // 「캐릭터 하나」다.
    const prompt = buildCandidatePrompt(base);
    expect(prompt).toMatch(/NOT a character sheet/i);
    expect(prompt).toMatch(/NOT a turnaround/i);
    expect(prompt).toMatch(/NOT a grid/i);
  });

  it("자세와 카메라가 하나라고 못 박는다", () => {
    const prompt = buildCandidatePrompt(base);
    expect(prompt).toMatch(/exactly ONE pose/i);
    expect(prompt).toMatch(/one subject, one pose, one camera/i);
  });

  it("같은 대상을 다시 그리지 말라고 한다", () => {
    // 「하나만 그려라」는 두 인물이 나오는 것만 막는다. 같은 인물을 여러 번
    // 그리는 것은 안 막힌다 — 그것이 캐릭터 시트다.
    const prompt = buildCandidatePrompt(base);
    expect(prompt).toMatch(/do not repeat the subject/i);
    expect(prompt).toMatch(/several\s+angles at once/i);
  });

  it("각도 그리기에도 같은 빗장이 걸린다", () => {
    // 각도 한 장을 부탁했는데 시트가 오면 똑같이 못 쓴다.
    const prompt = buildTurnaroundPrompt({ identityPrompt: "호랑이", angle: "left_45" });
    expect(prompt).toMatch(/exactly ONE pose/i);
    expect(prompt).toMatch(/NOT a character sheet/i);
  });

  it("종류가 무엇이든 걸린다", () => {
    for (const kind of ["person", "character", "animal", "object"] as const) {
      expect(buildCandidatePrompt({ ...base, kind })).toMatch(/exactly ONE pose/i);
    }
  });
});
