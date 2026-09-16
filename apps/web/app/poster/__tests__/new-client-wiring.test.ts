import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 규칙과 화면을 잇는 줄들의 자물쇠.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-c·3-d
 *
 * **왜 소스 문자열을 보는가.** 이 저장소에는 jsdom 이 없고 `package.json` 을
 * 건드리면 격리 계약이 깨진다(§4.1). 그래서 컴포넌트를 렌더해서 볼 수 없다.
 *
 * 판단은 전부 `poster-form-rules.ts` 로 뽑아 시험 19개로 잠갔다. 그런데
 * **그것을 부르는 줄은 여전히 아무도 안 봤다.** 호출부 다섯을 동시에 뒤집어도
 * 812개가 전부 초록이었다 — 그 다섯 줄이 정확히 이번에 고친 고장이 살던
 * 자리다:
 *
 * - `effectiveRatio(adMode, …)` 를 `false` 로 → 광고 모드가 nano 에서 죽는다
 * - `projectCount(adMode, …)` 를 `false` 로 → 비용이 절반 이하로 보인다
 * - `posterSpecSections` 의 `adEnabled` 를 `true` 로 → 계약 5 가 사라진다
 * - `canCreatePoster` 의 `adMode` 를 `false` 로 → 과금 전 차단이 사라진다
 * - `modelId: choice.model.id` 를 `modelId` 로 → 화면 안내와 보내는 값이 어긋난다
 *
 * **문자열 대조라 리팩터링에 약하다. 그것이 이 시험의 값이다** — 이 줄들을
 * 건드리면 사람이 한 번 멈춰 서게 만든다. 이 저장소는 같은 판단을 이미 했다
 * (`packages/sns-core/src/__tests__/ad-isolation-lock.test.ts`).
 */

const source = readFileSync(new URL("../new-client.tsx", import.meta.url), "utf8");

describe("판단이 살아 있는 상태에 이어져 있는가", () => {
  it("비율을 광고 모드에 따라 고른다", () => {
    expect(source).toContain("effectiveRatio(adMode, ratio)");
  });

  it("프로젝트 수를 광고 모드에 따라 센다", () => {
    expect(source).toContain("projectCount(adMode,");
  });

  it("무엇을 그릴지 스위치와 모드 양쪽으로 정한다", () => {
    expect(source).toContain("posterSpecSections({ adEnabled, adMode })");
  });

  it("만들기 버튼이 광고 판단을 본다", () => {
    expect(source).toContain("adReady: adPlan.ready");
    expect(source).toMatch(/canCreatePoster\({[\s\S]*?\badMode,/);
  });

  /**
   * 화면이 「GPT Image 2 로 만듭니다」라고 말했으면 그 모델을 **보내야** 한다.
   *
   * **두 곳을 각각 짚는다.** `choice.model.id` 는 추정과 본문 양쪽에 나오는데,
   * 그냥 `toContain` 으로 보면 한쪽을 되돌려도 다른 쪽이 시험을 통과시킨다 —
   * 실제로 그렇게 뮤테이션 하나가 살아남았다.
   */
  it("추정을 바뀐 모델과 실제 비율로 잰다", () => {
    expect(source).toMatch(/estimatePosterCost\(\{\s*modelId: choice\.model\.id, ratioId: submitRatio,/);
  });

  it("본문에도 바뀐 모델을 싣는다", () => {
    expect(source).toMatch(/ratio: submitRatio,[\s\S]{0,500}modelId: choice\.model\.id,/);
  });

  /** 광고 모드가 아니면 마스터 크기가 안 나온다. */
  it("광고 본문은 순수 함수가 만든다", () => {
    expect(source).toContain("adProjectBodies(projectBody(), adPlan.masters, title)");
  });
});

/**
 * 고른 차례가 화면 상태에 이어져 있는가.
 *
 * 규칙은 `@fixup/poster-core` 로 뽑아 시험으로 잠갔는데, **화면이 그것을 부르는
 * 줄은 아무도 안 보고 있었다.** `picked` 를 예전처럼 `references.filter(…)` 로
 * 되돌리거나 세 목록을 `Object.keys(roles)` 에서 뽑아도 시험 1059개가 전부
 * 초록이었다(2026-09-08 리뷰). 그 줄들이 정확히 이번에 고친 고장이 살던 자리다.
 */
describe("고른 차례가 화면 상태에 이어져 있는가", () => {
  it("규칙을 여기 다시 적지 않고 poster-core 를 부른다", () => {
    // 두 벌로 적으면 화면과 서버의 번호가 갈린다.
    expect(source).toContain("nextPickOrder(current, id,");
    expect(source).toMatch(/visibleOrder\(\s*pickOrder,/);
  });

  it("역할을 바꿀 때 차례도 함께 고친다", () => {
    expect(source).toMatch(/setRoles\([\s\S]{0,200}?setPickOrder\(/);
  });

  it("보이는 것만 보낸다 — 목록에 없는 id 를 거른다", () => {
    // 안 거르면 그 뒤 번호가 전부 1씩 밀린다.
    expect(source).toContain("references.some((entry) => entry.id === id)");
  });

  it("세 목록을 전부 고른 차례에서 뽑는다", () => {
    // `roles` 에서 직접 뽑으면 차례에 없는 id 가 서버로 새어 나간다.
    for (const line of [
      "const styleIds = orderedIds.filter",
      "const preservedIds = orderedIds.filter",
      "const personIds = orderedIds.filter",
    ]) {
      expect(source, `${line} 가 orderedIds 에서 나와야 한다`).toContain(line);
    }
  });

  it("차례와 첨부에 대한 말을 서버로 보낸다", () => {
    expect(source).toContain("attachmentOrder: orderedIds");
    expect(source).toContain("attachmentIntent: attachmentIntent.trim()");
  });
});

/**
 * 01에 적은 말을 03에서 다시 볼 수 있는가.
 *
 * 03은 **우선순위를 정하는 자리**다 — 「여기 적은 말이 다른 모든 지시보다
 * 우선합니다」라고 화면이 말한다. 그런데 정작 01에 무엇을 적었는지는 볼 수 없어,
 * 같은 말을 두 번 쓰거나 반대되는 말을 적어 놓고 모르는 일이 생긴다.
 */
describe("01에 적은 말이 03에서 보이는가", () => {
  const panel = source.slice(source.indexOf('step === "instruction"'));

  it("03 화면이 01의 말을 읽는다", () => {
    expect(panel).toContain("01에서 첨부한 그림에 대해 적은 말");
    expect(panel).toMatch(/\{attachmentIntent\.trim\(\) \? \(/);
  });

  it("안 적었으면 아무것도 안 보인다 — 빈 칸을 만들지 않는다", () => {
    expect(panel).toMatch(/attachmentIntent\.trim\(\)[\s\S]{0,900}?\) : null\}/);
  });

  it("여기서 고치지 않고 01로 돌려보낸다 — 입력 칸은 하나뿐이어야 한다", () => {
    // 두 곳에서 고치게 하면 어느 쪽이 진짜인지 사람이 판단해야 한다.
    expect(panel).toContain('onClick={() => setStep("reference")}');
    expect(panel).not.toMatch(/setAttachmentIntent\(/);
  });
});

/**
 * **미리 채워 주던 것이 사라진 자리.**
 *
 * 예전에는 01 레퍼런스에 적은 「이 그림을 어떻게 쓸까요」를 03 한 줄 지시에
 * 옮겨 적어 줬다(`seedInstruction`). 같은 말을 두 번 쓰게 만들어서 생긴
 * 땜질이었다(2026-09-08 사용자).
 *
 * 지시가 맨 앞으로 오면서 **두 질문이 더 이상 겹치지 않는다** — 01은 「무엇을
 * 만들까」, 02는 「이 그림을 어떻게 쓸까」다. 땜질의 이유가 사라졌으므로 걷어냈다.
 *
 * **이 시험은 되돌아오지 않게 막는다.** 다시 넣으면 첨부에 대해 적은 말이 한 줄
 * 지시를 덮어써서, 01에서 쓴 글이 소리 없이 바뀐다.
 */
describe("한 줄 지시를 대신 채우지 않는다", () => {
  it("미리 채우는 장치가 없다", () => {
    expect(source).not.toContain("seedInstruction");
    expect(source).not.toContain("instructionTouched");
  });

  /** 입력 칸은 하나이고, 거기 쓴 것이 그대로 남는다. */
  it("사람이 친 것을 그대로 넣는다", () => {
    expect(source).toContain("onChange={(event) => setInstruction(event.target.value)}");
  });
});

/**
 * 「사람은 그대로, 그림 느낌만」이 화면에서 서버까지 이어지는가 (설계 §4-3).
 */
describe("그림 느낌만 바꾸는 사람이 이어져 있는가", () => {
  it("사람 목록에도 함께 넣는다 — 「인물은 한 명만」이 함께 걸려야 한다", () => {
    expect(source).toMatch(
      /personIds = orderedIds\.filter\([\s\S]{0,160}preserve_person_restyled/,
    );
  });

  it("따로 든 목록을 서버로 보낸다", () => {
    expect(source).toContain('roles[id] === "preserve_person_restyled"');
    expect(source).toMatch(/^\s+restyledIds,$/m);
  });
});

/**
 * 안 고르면 한 장으로 시작한다 (2026-09-08 사용자 결정).
 */
describe("기본 장수가 이어져 있는가", () => {
  it("숫자를 화면에 박지 않고 poster-core 를 쓴다", () => {
    // 박아 두면 상수를 고쳐도 화면이 안 따라온다.
    expect(source).toContain("React.useState(DEFAULT_VARIANTS)");
    expect(source, "3장으로 되돌아가면 안 된다").not.toContain("useState(3)");
  });
});

/**
 * **글만으로 만드는 길이 실제로 이어져 있는가.**
 *
 * 규칙(`canCreatePoster`·`resolveLook`·`PosterProjectInputSchema`)을 아무리 풀어
 * 놔도, 화면이 이어 주지 않으면 사용자는 그 길로 못 간다. 되돌리기 쉬운 줄들이라
 * 문자열로 못 박는다 — 이 시험이 없으면 「다음」 버튼에 `styleIds.length === 0`
 * 한 줄만 되살려도 아무도 모른다(2026-09-16).
 */
describe("글만으로 만드는 길", () => {
  it("첫 화면이 지시다", () => {
    expect(source).toContain('React.useState("instruction")');
  });

  /** 첨부는 선택이다. 여기에 장수 조건이 돌아오면 길이 다시 막힌다. */
  it("레퍼런스 「다음」이 장수를 안 본다", () => {
    const next = source.match(/onClick=\{\(\) => setStep\("spec"\)\}[^>]*/);

    expect(next).not.toBeNull();
    expect(next![0]).toContain("disabled={overReferenceLimit}");
    expect(next![0]).not.toContain("styleIds.length");
  });

  /** 첨부 유무 하나로 결·값·엔드포인트가 갈린다. 화면이 그 하나를 들고 있어야 한다. */
  it("첨부 유무를 한 자리에서 판단한다", () => {
    expect(source).toContain("const hasReferences = styleIds.length + preservedIds.length > 0;");
    expect(source).toMatch(/estimatePosterCost\(\{[\s\S]*?hasReferences,/);
  });

  /**
   * **빼지 않고 흐리게 둔다.**
   *
   * 처음에는 첨부가 없으면 「레퍼런스 스타일」을 목록에서 뺐다. 그랬더니 그런
   * 기능이 있다는 것을 알 길이 없었다 — 사용자가 화면을 보며 「auto 가 어디
   * 있냐」고 물었다(2026-09-16). 못 누르게만 막으면 배울 수 있다.
   */
  it("결은 다 보여 주되 못 고르는 것은 막는다", () => {
    expect(source).toContain("looksFor()");
    expect(source).toContain("lookBlockedReason(entry, hasReferences)");
    expect(source).toContain("disabled={Boolean(blocked)}");
  });

  /** 회색 버튼만 두면 고장으로 읽힌다. 무엇을 하면 눌리는지 적는다. */
  it("못 고르는 까닭을 화면에 적는다", () => {
    expect(source).toContain('lookBlockedReason("auto", hasReferences)');
  });

  /**
   * **켜 보인 것과 보내는 것이 같아야 한다.** 화면이 「실사」를 켜 두고 본문에
   * `auto` 를 실으면, 결을 정하는 말이 프롬프트에 한 줄도 안 들어간다.
   */
  it("켜 보인 결을 그대로 보낸다", () => {
    expect(source).toContain("const shownLook = resolveLook(look, hasReferences);");
    expect(source).toContain("look: shownLook,");
  });

  /** 값을 보여 준 자리에서 만든다. 규격이 마지막 칸이다. */
  it("만들기 버튼이 규격 칸에 있다", () => {
    const spec = source.slice(source.indexOf('step === "spec"'));
    expect(spec).toMatch(/onClick=\{\(\) => void submit\(\)\}/);
  });
});

/**
 * **두 칸이 정반대로 동작한다는 것을 화면이 말하는가.**
 *
 * 「무엇을 만들까」는 AI 가 읽고 다시 쓰고, 「직접 쓴 프롬프트」는 손 안 대고
 * 그대로 간다. 이름만으로는 알 길이 없어서, 완성된 JSON 프롬프트를 앞 칸에
 * 넣은 사용자가 그것을 통째로 잃었다(2026-09-16 사용자 보고).
 */
describe("01 두 칸의 차이를 말한다", () => {
  it("칸 이름이 무슨 칸인지 말한다", () => {
    expect(source).toContain("무엇을 만들까 · 한두 줄");
    expect(source).toContain("꼭 지킬 말");
  });

  /**
   * **접어 둔다.** 칸 둘이 나란히 펼쳐져 있으니 「둘 다 써야 하나」로 읽혔다
   * (2026-09-16 사용자 보고). 이건 선택이고 대부분은 위 칸 하나로 끝난다.
   */
  it("두 번째 칸은 접혀 있다", () => {
    const block = source.slice(source.indexOf("꼭 지킬 말이 있나요?"));
    expect(source).toMatch(/<details[\s\S]{0,400}꼭 지킬 말이 있나요\?/);
    expect(block.slice(0, 200)).toContain("눌러서 펼치기");
  });

  /**
   * **이 칸은 완성 프롬프트를 넣는 자리가 아니다.** 여기 적은 말은 프롬프트
   * 맨 앞과 맨 뒤 **두 번** 들어간다(2026-09-04 실측). 200자를 넣으면 400자가
   * 실린다. 완성 프롬프트의 자리는 위 칸이다.
   */
  it("두 번 들어간다는 것을 적는다", () => {
    expect(source).toContain("맨 앞과 맨 뒤에 두 번");
    expect(source).toContain("완성된 프롬프트는 위 칸에 넣으세요");
  });

  /**
   * 예시가 「배경은 밤」 하나뿐이라 그림 얘기만 적는 칸으로 읽혔다. 글자 처리·
   * 구도까지 무엇이든 적을 수 있고, 특히 한글은 이 칸이 유일한 길이다.
   */
  it("무엇을 적을 수 있는지 예시로 보여 준다", () => {
    expect(source).toContain("한국어가 깨지지 않게");
    expect(source).toContain("무엇이든 적을 수 있습니다");
  });

  /** 접었으니 완성 프롬프트의 자리는 위 칸 설명이 말해야 한다. */
  it("완성 프롬프트의 자리를 위 칸이 알려 준다", () => {
    const block = source.slice(source.indexOf("poster-instruction"));
    expect(block.slice(0, 1400)).toContain("완성된 프롬프트가 있으면 여기에 그대로 넣으세요");
  });
});

/**
 * **03 규격에서 길을 잃지 않게.**
 *
 * 유튜브 썸네일은 16:9 로 이미 만들 수 있는데 버튼 이름이 「가로 배너」라
 * 못 찾았다. 그리고 광고 규격은 여기서 새로 그리는데, 옆에 거의 공짜인 길이
 * 있다는 것을 화면이 안 적었다(2026-09-16 사용자 보고).
 */
describe("03 규격 길잡이", () => {
  /** 버튼을 늘리면 같은 픽셀이 다른 이름으로 둘 생긴다. 길잡이만 단다. */
  it("용도 길잡이를 코드에서 가져온다", () => {
    expect(source).toContain("RATIO_USES.map(");
    expect(source).not.toContain('"유튜브 썸네일"');
  });

  it("광고 모드에 싼 길을 알린다", () => {
    const block = source.slice(source.indexOf('sections.includes("ad-specs")'));
    const shown = block.slice(0, 1200);

    expect(shown).toContain("규격마다 새로 그립니다");
    expect(shown).toContain('href="/ad"');
  });
});

/**
 * **알아채고 묻는 길이 실제로 이어져 있는가.**
 *
 * 판별 규칙(`prompt-mode.ts`)과 엔진(`verbatimScene`)을 아무리 만들어도, 화면이
 * 이어 주지 않으면 사용자는 그 길로 못 간다(2026-09-16 설계 §3).
 */
describe("쓴 그대로 보내는 길", () => {
  it("완성된 프롬프트인지 판별해 묻는다", () => {
    expect(source).toContain("looksFinished(instruction)");
    expect(source).toContain("그대로 생성");
    expect(source).toContain("AI가 다듬어서 생성");
  });

  /** 규칙을 화면에 다시 적으면 둘이 갈린다. */
  it("판별 규칙을 여기 다시 적지 않는다", () => {
    expect(source).toContain('from "./prompt-mode"');
    expect(source).not.toMatch(/JSON\.parse\(/);
  });

  /** 고른 갈래가 본문에 안 실리면 서버는 늘 다듬는다. */
  it("고른 갈래를 본문에 싣는다", () => {
    expect(source).toMatch(/title: title\.trim\(\)[\s\S]{0,200}promptMode,/);
  });

  /** 기본이 반대면 쓰던 사람이 깨진다. */
  it("기본은 다듬어서다", () => {
    expect(source).toContain('React.useState<PromptMode>("assisted")');
  });

  /** 같은 것을 되풀이해 물으면 알림을 안 읽게 된다. */
  it("한 번 고르면 다시 안 묻는다", () => {
    expect(source).toContain("!modeAnswered && looksFinished(instruction)");
  });

  /** 되돌릴 길이 없으면 잘못 누른 사람이 작업을 새로 만들어야 한다. */
  it("고른 뒤에도 바꿀 수 있다", () => {
    expect(source).toContain("setModeAnswered(false)");
  });
});
