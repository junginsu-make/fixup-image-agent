import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_RATIOS, IMAGE_MODELS, POSTER_RATIOS } from "@fixup/sns-core";
import { REVIEW_CRITERIA } from "@fixup/pdp-core";
import { ATTACHMENT_ROLE_LABEL, IMAGE_LOOK_LABEL } from "@fixup/shared";
import { GUIDE_TOPICS, neighborsOf } from "../_components/topics";

/**
 * 설명서가 실제와 어긋나지 않는지 잡는다.
 *
 * 안내가 틀리면 없는 것만 못하다. 목업과 문구는 화면이라 단위 시험의 대상이
 * 아니지만, **설명서가 인용한 목록이 코드와 같은지**는 잡을 수 있다.
 *
 * 그래서 설명서는 비율·모델·역할·심사 항목을 하드코딩하지 않고 코드에서
 * 가져다 쓴다. 이 시험은 그 약속이 깨지지 않았는지 본다.
 */

const GUIDE_DIR = join(__dirname, "..");

/** 설명서 페이지 파일을 모두 읽어 온다. */
function guideSources(): Array<{ name: string; source: string }> {
  const entries = readdirSync(GUIDE_DIR, { withFileTypes: true });
  const files: Array<{ name: string; source: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name === "__tests__") continue;
    files.push({
      name: entry.name,
      source: readFileSync(join(GUIDE_DIR, entry.name, "page.tsx"), "utf8"),
    });
  }
  files.push({ name: "(home)", source: readFileSync(join(GUIDE_DIR, "page.tsx"), "utf8") });
  return files;
}

/**
 * 주석 자리를 지운다. **개발자에게 하는 설명은 화면이 아니다.**
 *
 * 「전에는 「실사」라고 적어 뒀는데 화면은 「실사 사진」이었다」처럼, 옛 이름을
 * 적어 두는 것이 주석에서는 정당하다. 그것까지 세면 까닭을 못 적는다.
 */
function 주석을뺀다(source: string): string {
  // 코드 뒤에 붙은 것도 뗀다. 자리에 따라 정당함이 갈리지 않는다.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("설명서 목차", () => {
  it("목차의 모든 항목에 실제 페이지 파일이 있다", () => {
    const names = new Set(guideSources().map((file) => file.name));
    for (const topic of GUIDE_TOPICS) {
      const dir = topic.href === "/guide" ? "(home)" : topic.href.replace("/guide/", "");
      expect(names, `${topic.href} 에 해당하는 page.tsx 가 없다`).toContain(dir);
    }
  });

  it("모든 페이지가 목차에 등록돼 있다", () => {
    const hrefs = new Set(GUIDE_TOPICS.map((topic) => topic.href));
    for (const file of guideSources()) {
      const href = file.name === "(home)" ? "/guide" : `/guide/${file.name}`;
      expect(hrefs, `${href} 가 목차에 없다`).toContain(href);
    }
  });

  it("앞뒤 이동이 목차 순서를 따른다", () => {
    expect(neighborsOf("/guide").prev).toBeUndefined();
    expect(neighborsOf("/guide").next?.href).toBe(GUIDE_TOPICS[1].href);
    expect(neighborsOf(GUIDE_TOPICS.at(-1)!.href).next).toBeUndefined();
  });

  it("도구로 가는 길이 있는 항목은 이름도 함께 있다", () => {
    for (const topic of GUIDE_TOPICS) {
      if (topic.toolHref) expect(topic.toolLabel, `${topic.href} 의 toolLabel 이 비었다`).toBeTruthy();
    }
  });
});

describe("설명서 내용", () => {
  it("역할 어휘와 심사 항목을 베껴 적지 않는다", () => {
    // 이 둘이 가장 자주 바뀌고, 틀리면 사용자가 없는 선택지를 찾게 된다.
    // 큰따옴표로 감싼 형태만 잡는다 — 문장 안에서 「따라 만들기」처럼 언급하는
    // 것은 정당하다. 막아야 하는 것은 목록을 통째로 베껴 적는 쪽이다.
    const banned = [
      ...REVIEW_CRITERIA.map((criterion) => criterion.question),
      ...Object.values(ATTACHMENT_ROLE_LABEL).map((label) => `"${label}"`),
    ];
    for (const file of guideSources()) {
      for (const phrase of banned) {
        expect(
          file.source.includes(phrase),
          `${file.name}/page.tsx 가 "${phrase}" 를 직접 적었다. 코드에서 가져와 쓴다`,
        ).toBe(false);
      }
    }
  });

  it("비율 목록을 그리는 페이지는 코드에서 가져온다", () => {
    // 비율은 표에서 이름으로 언급할 수 있다(어느 것을 고르라는 안내). 다만
    // **목록으로 그리는** 페이지는 반드시 코드를 가져와야 한다.
    const byName = new Map(guideSources().map((file) => [file.name, file.source]));
    expect(byName.get("cardnews")).toContain("CARD_RATIOS");
    expect(byName.get("image")).toContain("POSTER_RATIOS");
    // 목록 자체가 비어 있으면 위 검사가 무의미해진다.
    expect(CARD_RATIOS.length).toBeGreaterThan(0);
    expect(POSTER_RATIOS.length).toBeGreaterThan(CARD_RATIOS.length);
  });

  /**
   * **그림체 이름을 손으로 적지 않는다.**
   *
   * 이미지 설명서에서 한 번 겪은 일이다 — 이름을 바꿨는데 설명서만 옛 이름으로
   * 남았고, 배포한 빌드를 뒤져 보고서야 찾았다. 캐릭터 설명서가 **같은 실수를
   * 그대로 안고 있었다**(2026-09-16 리뷰). 화면은 「실사 사진」인데 설명서는
   * 「실사」라고 적어, 사용자가 화면에서 그 이름을 찾다가 못 찾는 상태였다.
   *
   * 한 페이지짜리 검사로는 다음 페이지가 또 새긴다. **목록을 그리는 페이지
   * 전부**를 여기서 잰다.
   */
  it("그림체 목록을 그리는 페이지는 코드에서 가져온다", () => {
    const byName = new Map(guideSources().map((file) => [file.name, file.source]));
    for (const name of ["image", "character"]) {
      expect(byName.get(name), `${name} 설명서가 없다`).toBeTruthy();
      expect(
        byName.get(name),
        `${name}/page.tsx 가 그림체 이름을 손으로 적었다. IMAGE_LOOK_LABEL 에서 가져온다`,
      ).toContain("IMAGE_LOOK_LABEL");
    }

    // 목록 자체가 비면 위 검사가 무의미해진다.
    expect(Object.keys(IMAGE_LOOK_LABEL).length).toBeGreaterThan(3);

    /*
     * **구문이 아니라 이름을 센다.**
     *
     * 처음에는 `{ title: "실사"` 같은 구문 통째로 찾았는데, 그러면 목록을 그리는
     * 자리만 잡고 **산문에 늘어놓은 것**을 못 본다. 실제로 「(실사·애니·3D·그림)
     * 로 그립니다」 두 줄이 그렇게 살아남았다(2026-09-16 재검토).
     *
     * 세 가지를 가려낸다.
     *   · **주석은 뺀다.** 「전에는 「실사·애니」라고 적어 뒀다」는 설명이 정당하다
     *   · **새 이름을 먼저 지운다.** 옛 이름이 새 이름의 앞토막이다(「실사」⊂「실사 사진」)
     *   · **낱말 경계를 본다.** 「애니풍 강아지」는 사용자가 칠 법한 말이지 칸 이름이 아니다
     */
    const 옛이름 = ["실사", "애니"];
    for (const file of guideSources()) {
      const 새이름을뺀글 = Object.values(IMAGE_LOOK_LABEL).reduce(
        (text, label) => text.split(label).join(""),
        주석을뺀다(file.source),
      );
      for (const stale of 옛이름) {
        /*
         * 뒤에 한글이 더 붙으면 대개 다른 낱말이다(「애니풍」·「실사판」).
         * **다만 조사는 다르다** — 산문에는 「실사로」·「애니가」처럼 나간다.
         * 조사를 따로 받아 주지 않으면 정작 흔한 꼴을 다 놓친다.
         */
        const 조사 = "로|를|가|는|은|의|와|과|도|에|나|만|보다|처럼|부터|까지";
        const 홀로쓰인것 = new RegExp(`(?<![가-힣])${stale}(?:(?:${조사})(?![가-힣])|(?![가-힣]))`);
        expect(
          홀로쓰인것.test(새이름을뺀글),
          `${file.name}/page.tsx 에 옛 그림체 이름이 남았다: ${stale}`,
        ).toBe(false);
      }
      expect(
        file.source.includes('label="결"'),
        `${file.name}/page.tsx 가 그림체 칸을 「결」이라 부른다. 화면은 「그림체」다`,
      ).toBe(false);
    }
  });

  /**
   * **차감량을 손으로 적지 않는다** (2026-09-21).
   *
   * 크레딧 설명서가 가중치를 적어 두고 있었다(표준형 4장). 그런데 차감은
   * 2026-09-08 부터 **원가에서 나온다** — 가중치를 안 쓴다. 그 사이 설명서만
   * 옛 셈법으로 남아 실제(5장)와 어긋났고, 「6장이면 24장」이라는 예도 실제로는
   * 30장이었다.
   *
   * **값 안내가 틀리면 없는 것만 못하다.** 쓰는 그 함수로 그 자리에서 셈한다.
   */
  it("크레딧 설명서는 차감량을 셈해서 낸다", () => {
    const credits = guideSources().find((file) => file.name === "credits")!.source;

    expect(credits).toContain("creditUnits(unitPrice(");
    // 가중치 표가 되살아나면 또 어긋난다.
    expect(주석을뺀다(credits)).not.toMatch(/weight:\s*\d/);
    // 예도 셈해서 적는다. 손으로 적은 곱셈은 표가 바뀌면 그대로 낡는다.
    expect(주석을뺀다(credits)).not.toContain("6 × 4 = 24장");
  });

  it("설명서가 말하는 생성 방식은 실제로 고를 수 있는 것이다", () => {
    // 설명서는 방식을 이름으로 언급한다(무엇을 고르라는 안내). 그 이름이
    // 목록에 없으면 없는 것을 고르라고 말하는 셈이다.
    //
    // **모델 이름이 아니라 우리가 붙인 이름으로 부른다.** 업체·모델 이름이
    // 다시 들어오는 것은 `lib/__tests__/model-name.test.ts` 가 막는다.
    const known = IMAGE_MODELS.map((model) => model.label);
    const mentioned = new Set<string>();
    for (const file of guideSources()) {
      for (const match of file.source.matchAll(/([가-힣]+형(?: [가-힣]+)?)/g)) {
        const name = match[1]!;
        // 「형」으로 끝나는 낱말이 다 방식 이름은 아니다(예: 「정사각형」).
        if (known.includes(name)) continue;
        if (known.some((label) => label.startsWith(name))) mentioned.add(name);
      }
    }
    for (const name of mentioned) {
      expect(known, `설명서가 말하는 "${name}" 가 IMAGE_MODELS 에 없다`).toContain(name);
    }

    // 목록이 비면 위 검사가 무의미해진다.
    expect(known).toContain("표준형");
  });
});

/**
 * **도구가 늘었는데 설명서가 안 늘어난 일이 있었다** (2026-09-14).
 *
 * 「광고 규격으로 내보내기」와 「팀」이 사이드바에 있는데 설명서에는 한 줄도
 * 없었다. 도구를 더할 때 설명서를 잊지 않게 여기서 맞대 본다.
 */
describe("도구와 설명서가 짝을 이룬다", () => {
  /** 사이드바가 내는 도구의 주소. 설명이 필요한 것만 적는다. */
  const TOOLS_NEEDING_GUIDE = [
    "/easy",
    "/sns",
    "/poster",
    "/ad",
    "/create",
    "/redesign",
    "/characters",
    "/library",
    "/team",
  ];

  it("모든 도구에 설명서가 있다", () => {
    const covered = new Set(
      GUIDE_TOPICS.map((topic) => topic.toolHref).filter(Boolean),
    );
    for (const tool of TOOLS_NEEDING_GUIDE) {
      expect(covered, `${tool} 를 설명하는 문서가 없다`).toContain(tool);
    }
  });

  /**
   * 사이드바에 있는 도구를 여기 적는 것을 잊으면 이 시험이 헛돈다.
   * 셸의 목록을 글자로 읽어 맞대 본다.
   */
  it("사이드바의 도구를 빠짐없이 적었다", () => {
    const shell = readFileSync(
      join(__dirname, "..", "..", "..", "..", "..", "packages", "ui", "src", "components", "app-shell.tsx"),
      "utf8",
    );
    const hrefs = [...shell.matchAll(/href: "(\/[a-z-]+)"/g)].map((found) => found[1]);
    // 설명서·계정·관리자는 도구가 아니다.
    const tools = hrefs.filter((href) => !["/guide", "/settings", "/admin"].includes(href));
    for (const tool of new Set(tools)) {
      expect(TOOLS_NEEDING_GUIDE, `${tool} 가 사이드바에 있는데 이 목록에 없다`).toContain(tool);
    }
  });
});

/**
 * 요약 먼저 · 상세는 접기 (2026-09-14).
 *
 * 설명서가 화면을 처음부터 훑는 구조라, **이 도구가 무엇을 하는지 알려면
 * 끝까지 읽어야 했다.** 도구를 고르러 온 사람과 쓰는 법을 찾으러 온 사람이
 * 같은 글을 읽고 있었다.
 */
describe("요약이 먼저 나온다", () => {
  /** 개요 페이지는 그 자체가 요약이라 뺀다. */
  const TOOL_PAGES = GUIDE_TOPICS.filter((topic) => topic.toolHref).map((topic) =>
    topic.href.replace("/guide/", ""),
  );

  it("도구 설명서마다 요약이 있다", () => {
    const sources = new Map(guideSources().map((file) => [file.name, file.source]));
    for (const page of TOOL_PAGES) {
      expect(sources.get(page), `${page} 페이지가 없다`).toBeDefined();
      expect(sources.get(page), `${page} 에 <Summary> 가 없다`).toContain("<Summary");
    }
  });

  /** 요약은 머리말 바로 뒤다. 뒤로 밀리면 스크롤해야 보인다. */
  it("요약이 머리말 바로 뒤에 온다", () => {
    for (const file of guideSources()) {
      const summary = file.source.indexOf("<Summary");
      if (summary < 0) continue;
      const firstSection = file.source.indexOf("<Section");
      expect(summary, `${file.name}: 요약이 첫 섹션보다 뒤에 있다`).toBeLessThan(firstSection);
    }
  });

  /**
   * 접은 칸은 **닫혀 있어야 한다.** `open` 을 붙이면 접은 뜻이 없다.
   */
  it("상세 칸이 열린 채로 시작하지 않는다", () => {
    for (const file of guideSources()) {
      expect(file.source, `${file.name}: <Details open …> 이 있다`).not.toMatch(/<Details[^>]*\sopen[\s>]/);
    }
  });
});

/**
 * 「내 카드뉴스 만들기」는 소개만 있고 쓰는 법이 없었다 (2026-09-14).
 * 설명서 전체가 다른 갈래 기준이라고 못 박혀 있었다.
 */
describe("카드뉴스의 두 갈래를 모두 설명한다", () => {
  const cardnews = () =>
    guideSources().find((file) => file.name === "cardnews")!.source;

  it("두 갈래가 모두 나온다", () => {
    expect(cardnews()).toContain("내 카드뉴스 만들기");
    expect(cardnews()).toContain("새 카드뉴스 만들기");
  });

  it("「내 카드뉴스 만들기」에 쓰는 법이 있다", () => {
    const source = cardnews();
    expect(source).toContain("「내 카드뉴스 만들기」는 이렇게 씁니다");
    // 순서를 거꾸로 알면 다 짜 놓고 붙일 데가 없다는 것을 뒤늦게 안다.
    expect(source).toContain("카드뉴스 작업 만들기");
    // 칸 네 종류가 이 길을 고르는 이유다.
    expect(source).toContain("칸은 네 종류입니다");
  });
});

/**
 * **설명서가 부르는 이름이 사이드바와 같아야 한다** (2026-09-21).
 *
 * 사이드바를 갈래로 묶고 이름을 줄였는데(이미지 > 쉽게 · 다양하게 …) 설명서
 * 목차가 옛 이름 그대로였다. 그러면 **메뉴에서 본 이름을 설명서에서 못 찾는다** —
 * 「어디를 누르는지 말해 주는」 것이 이 문서의 일인데 그 이름이 다르면 안 된다.
 *
 * 글로는 못 지킨다. 다음에 이름을 또 바꿀 때 여기가 잡는다.
 */
describe("설명서와 사이드바가 같은 이름을 쓴다", () => {
  const shell = readFileSync(
    join(GUIDE_DIR, "..", "..", "..", "..", "packages", "ui", "src", "components", "app-shell.tsx"),
    "utf8",
  );

  /** 사이드바가 그 주소를 무엇이라 부르나. */
  const 사이드바이름 = new Map(
    [...shell.matchAll(/\{\s*href:\s*"(\/[a-z-]+)",\s*label:\s*"([^"]+)"[\s\S]*?\}/g)]
      .map((found) => [found[1]!, found[2]!]),
  );

  it("사이드바에서 이름을 읽어 왔다 — 못 읽으면 아래가 헛돈다", () => {
    expect(사이드바이름.get("/easy"), "/easy 의 이름을 못 읽었다").toBeTruthy();
    expect(사이드바이름.size).toBeGreaterThan(5);
  });

  /**
   * **「크레딧과 모델」은 도구 문서가 아니다.** 사이드바의 「계정」으로 가는 길을
   * 달고 있을 뿐, 그 화면을 설명하는 문서가 아니라 **값 이야기**를 모은 곳이다.
   * 이름이 같아야 하는 것은 도구 문서다.
   */
  const 도구가아닌곳 = new Set(["/settings"]);

  it("도구를 부르는 이름이 같다", () => {
    for (const topic of GUIDE_TOPICS) {
      if (!topic.toolHref || 도구가아닌곳.has(topic.toolHref)) continue;
      const 메뉴 = 사이드바이름.get(topic.toolHref);
      // 사이드바에 없는 도구(설정 등)는 맞댈 것이 없다.
      if (!메뉴) continue;
      expect(topic.label, `${topic.toolHref} 를 설명서는 「${topic.label}」, 사이드바는 「${메뉴}」라 부른다`)
        .toBe(메뉴);
    }
  });

  /** 갈래도 같아야 한다. 한쪽만 묶여 있으면 차례가 어긋난다. */
  it("갈래 이름이 같다", () => {
    const 사이드바갈래 = new Set([...shell.matchAll(/section:\s*([A-Z]+)/g)].map((found) => found[1]));
    expect(사이드바갈래.size, "사이드바에서 갈래를 못 읽었다").toBeGreaterThan(0);

    /*
      **사이드바의 갈래가 설명서에도 있어야 한다.** 설명서가 더 가질 수는 있다 —
      「크레딧과 모델」처럼 메뉴에 없는 문서를 묶을 말이 필요하다.
    */
    const 설명서갈래 = new Set(GUIDE_TOPICS.map((topic) => topic.section).filter(Boolean));
    for (const 갈래 of ["이미지", "상세페이지"]) {
      expect(설명서갈래, `설명서에 「${갈래}」 갈래가 없다`).toContain(갈래);
    }

    /** 머리말 없는 항목이 앞 갈래에 붙어 보인다 — 처음 한 줄만 그럴 수 있다. */
    const 머리말없는것 = GUIDE_TOPICS.filter((topic) => !topic.section);
    expect(머리말없는것.map((topic) => topic.href)).toEqual(["/guide"]);
  });
});
