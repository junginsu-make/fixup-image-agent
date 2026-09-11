import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_REFERENCE_IMAGES, sizeForRatio } from "@fixup/redesign-core";

/**
 * 리디자인에서 **조용히 어긋나던 것들.**
 *
 * 넷 다 화면은 멀쩡히 돌아가고 아무도 안 아팠다 — 결과만 틀렸다. 그래서
 * 값으로 잰다.
 */

const WEB = join(__dirname, "..", "..", "..");
const wizard = readFileSync(join(WEB, "app/redesign/redesign-wizard.tsx"), "utf8");
const route = readFileSync(join(WEB, "app/api/library/route.ts"), "utf8");
const library = readFileSync(join(WEB, "lib/server-library.ts"), "utf8");

describe("원본 장수 상한", () => {
  /**
   * 화면은 장수 제한 없이 받고 서버는 앞 4장만 썼다. 긴 상세페이지를 조각으로
   * 나눠 올리는 것이 정상 사용이라, **5장째부터 아무 말 없이 사라졌다.**
   */
  it("화면이 몇 장까지 반영되는지 말한다", () => {
    expect(wizard).toContain("장까지 그림 생성에 반영됩니다");
  });

  it("화면이 든 값과 서버가 쓰는 값이 같다", () => {
    const 화면값 = /const MAX_REFERENCE_IMAGES = (\d+);/.exec(wizard)?.[1];
    expect(화면값, "화면에 상한 값이 없다").toBeDefined();
    expect(Number(화면값)).toBe(MAX_REFERENCE_IMAGES);
  });
});

describe("고른 비율이 실제 크기를 정한다", () => {
  /** 전에는 `size` 가 못 박혀 있어 무엇을 고르든 결과가 같았다. */
  it("아는 비율은 그 크기로 간다", () => {
    expect(sizeForRatio("9:16")).toBe("1152x2048");
    expect(sizeForRatio("1080×1920")).toBe("1152x2048");
  });

  /** 모르는 값에 터지면, 새 비율을 넣다가 옛 작업이 깨진다. */
  it("모르는 비율은 지금까지의 크기로 떨어진다", () => {
    expect(sizeForRatio("없는비율")).toBe("1152x2048");
    expect(sizeForRatio("")).toBe("1152x2048");
  });
});

describe("라이브러리에 저절로 남는다", () => {
  /**
   * 그동안 결과는 브라우저 IndexedDB 에만 있었다. 기기를 옮기거나 브라우저
   * 데이터를 지우면 사라졌다 — 다른 도구는 전부 서버에 남는데 여기만 달랐다.
   */
  it("섹션을 만들면 손대지 않아도 올린다", () => {
    expect(wizard).toContain("void autoSaveSections(");
    expect(wizard).toMatch(/async function autoSaveSections[\s\S]{0,900}fetch\("\/api\/library"/);
  });

  /** 같은 작업의 섹션이 여덟 줄로 흩어지면 목록이 못 쓰게 된다. */
  it("같은 작업의 섹션은 한 줄로 모인다", () => {
    expect(wizard).toContain("sourceId: project.id");
    expect(route).toContain("sourceId: body.sourceId");
    expect(library).toContain("export async function saveOrAppendLibraryItem");
  });

  /**
   * 이어 붙이다 실패했을 때 작업째로 지우면 **앞서 저장된 섹션까지 날아간다.**
   */
  it("이어 붙이다 실패해도 앞서 저장된 것은 안 지운다", () => {
    expect(library).toMatch(/if \(!appendTo\) await supabase\.from\("library_items"\)\.delete\(\)/);
  });

  /** 두 번째 섹션이 표지가 되면 목록에서 페이지가 중간부터 시작해 보인다. */
  it("표지는 첫 장일 때만 정한다", () => {
    expect(library).toMatch(/appendTo\s*\?\s*\{ image_count:/);
  });
});
