import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_RATIOS, IMAGE_MODELS, POSTER_RATIOS } from "@fixup/sns-core";
import { REVIEW_CRITERIA } from "@fixup/pdp-core";
import { ATTACHMENT_ROLE_LABEL } from "@fixup/shared";
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
