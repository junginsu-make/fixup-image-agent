import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAGE_MODELS as PDP_MODELS } from "@fixup/pdp-core";
import { IMAGE_MODELS as STUDIO_MODELS } from "@fixup/sns-core";
import { RETIRED_MODEL_NAME, modelDisplayName } from "../model-name";

/**
 * 회원 화면에 **모델 이름이 새지 않는가.**
 *
 * 어떤 업체의 어떤 모델을 어디에 쓰는지는 실측으로 쌓은 결론이다. 화면에
 * 적으면 가입 한 번으로 그 결론이 통째로 넘어간다.
 *
 * 이 검사가 없으면 새 화면을 만들 때마다 조용히 다시 샌다 — **틀려도 아무도
 * 안 아프기 때문이다.** 화면은 멀쩡히 돌아가고, 우리는 아무것도 모른다.
 */

/**
 * **사람이 읽는 형태의 모델 이름.** 문장이나 이름표에 이것이 있으면 그대로
 * 화면에 뜬다.
 *
 * 코드 속 id(`nano-banana-pro` 같은 것)는 여기서 막지 않는다 — 서버에 보낼
 * 값이라 지울 수 없다. 대신 아래 「문장에 섞여 있지 않다」가 따로 잡는다.
 */
const 새면_안_되는_이름 = [
  "GPT Image",
  "Nano Banana",
  "Seedream",
  "Qwen Image",
  "OpenAI Image",
  "Google Nano",
  "Gemini",
  "Anthropic",
  "Midjourney",
  "Stable Diffusion",
  "DALL·E",
];

/** 코드에 남는 진짜 id. 값으로 쓰는 것은 되고, 글에 섞이는 것은 안 된다. */
const 진짜_ID = [...PDP_MODELS.map((m) => m.id as string), ...STUDIO_MODELS.map((m) => m.id)];

const WEB = join(__dirname, "..", "..");
const ROOT = join(WEB, "..", "..");

/**
 * 회원에게 **글이 나갈 수 있는 곳**을 전부 훑는다.
 *
 * 처음에는 `apps/web/app` 의 `.tsx` 만 봤다가 **두 군데를 놓쳤다.**
 *
 *   - `app/_landing/landing-content.ts` — 로그인도 필요 없는 **공개 홈**에
 *     「GPT Image 2 · 가중치 4」가 그대로 떠 있었다. 검색엔진도 읽는 자리다.
 *   - `packages` 안의 `src` — 비율 안내와 오류 문구가 여기서 만들어져 화면으로 간다.
 *
 * 화면 파일만 보면 **문구를 만드는 자리**를 놓친다. 확장자와 폴더를 넓게 잡는
 * 편이 낫다 — 여기서 한 번 빠뜨리면 그 경로는 영영 검사되지 않는다.
 */
function 회원화면(): Array<{ path: string; source: string }> {
  const found: Array<{ path: string; source: string }> = [];

  const walk = (dir: string, base: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // `/admin` 은 운영자만 본다. 시험 파일은 이름을 적어 두는 자리다.
        if (entry === "admin" || entry === "__tests__" || entry === "node_modules") continue;
        if (entry.startsWith(".")) continue;
        walk(full, base);
        continue;
      }
      if (!entry.endsWith(".tsx") && !entry.endsWith(".ts")) continue;
      if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;

      // 윈도우는 경로를 역슬래시로 준다. 아래 판정을 한 가지 모양으로만 하려고 바꾼다.
      const path = full.slice(base.length + 1).split(String.fromCharCode(92)).join("/");
      // 수집은 **남의 소식을 구독하는 기능**이다. 「Anthropic Claude 공식 소식」은
      // 우리가 무엇으로 만드는지가 아니라 사용자가 고르는 출처 이름이다.
      if (path.includes("/sources") || path.includes("ingest")) continue;

      found.push({ path, source: readFileSync(full, "utf8") });
    }
  };

  walk(join(WEB, "app"), WEB);
  walk(join(WEB, "lib"), WEB);
  for (const pkg of ["sns-core", "poster-core", "pdp-core", "redesign-core", "layout-core", "shared"]) {
    walk(join(ROOT, "packages", pkg, "src"), ROOT);
  }
  return found;
}

/**
 * 주석은 뺀다. 빌드에서 사라져 화면에 안 나오고, **왜 이 모델인가**를 남겨 둔
 * 자리라 지우면 다음 사람이 이유를 모른 채 되돌린다.
 */
function 주석을_뺀다(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("회원 화면에 모델 이름이 없다", () => {
  const 화면들 = 회원화면();

  it("훑을 화면이 있다", () => {
    // 걷기가 조용히 빈 배열을 돌려주면 아래 검사가 전부 통과해 버린다.
    expect(화면들.length).toBeGreaterThan(150);
  });

  /**
   * **문자열 안만 본다.** 화면에 나가는 것은 결국 문자열이다.
   *
   * 코드 이름까지 잡으면 `import Anthropic from "@anthropic-ai/sdk"` 같은
   * 서버 전용 임포트가 걸린다. 그건 브라우저로 가지도 않고 바꿀 수도 없다.
   * 잘못 걸리는 검사는 곧 꺼지고, 꺼진 검사는 없는 것만 못하다.
   */
  const 문자열들 = (source: string): string[] =>
    (주석을_뺀다(source).match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? []).map((조각) => 조각.slice(1, -1));

  for (const 이름 of 새면_안_되는_이름) {
    it(`「${이름}」이 없다`, () => {
      const 걸린곳 = 화면들
        .filter((file) => 문자열들(file.source).some((글) => 글.includes(이름)))
        .map((file) => file.path);

      expect(걸린곳, `회원 화면에 「${이름}」이 남아 있다`).toEqual([]);
    });
  }

  /**
   * id 는 서버에 보낼 값이라 코드에 남는다. 다만 **글에 섞이면** 그대로
   * 화면에 뜬다 — `「nano-banana-pro 로 만듭니다」` 같은 식으로.
   *
   * 그래서 id 가 나오는 문자열은 **id 하나로만 이루어져 있어야** 한다.
   */
  it("id 가 문장에 섞여 있지 않다", () => {
    const 섞인곳: string[] = [];

    for (const file of 화면들) {
      const source = 주석을_뺀다(file.source);
      for (const 조각 of source.match(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g) ?? []) {
        const 안쪽 = 조각.slice(1, -1);
        if (!진짜_ID.some((id) => 안쪽.includes(id))) continue;

        // 값으로 쓴 것과 글에 섞인 것을 **띄어쓰기와 한글**로 가른다. id 는
        // 붙여 쓴 한 낱말이라, 공백이나 한글이 같이 있으면 사람이 읽을 문장이다.
        const 문장이다 = /\s/.test(안쪽) || /[가-힣]/.test(안쪽);
        if (문장이다) 섞인곳.push(`${file.path}: ${조각}`);
      }
    }

    expect(섞인곳).toEqual([]);
  });
});

describe("저장된 작업의 모델 이름", () => {
  it("아는 id 는 우리가 붙인 이름으로 나온다", () => {
    expect(modelDisplayName("gpt-image-2")).toBe("정밀형");
    expect(modelDisplayName("nano-banana")).toBe("경제형");
  });

  /** 은퇴한 모델로 만든 옛 작업이 남아 있다. 모른다고 원본을 내보내면 안 된다. */
  it("모르는 id 에도 원본을 되돌려주지 않는다", () => {
    const 나온이름 = modelDisplayName("some-retired-model-v9");
    expect(나온이름).toBe(RETIRED_MODEL_NAME);
    expect(나온이름).not.toContain("some-retired-model");
  });

  it("id 가 없으면 빈 자리로 둔다", () => {
    expect(modelDisplayName(null)).toBe("—");
    expect(modelDisplayName(undefined)).toBe("—");
  });
});

describe("목록 두 개가 같은 이름을 쓴다", () => {
  /**
   * 상세페이지와 스튜디오가 목록을 따로 들고 있다. 같은 모델을 다르게 부르면
   * 사용자는 두 화면에서 다른 물건으로 본다.
   */
  it("양쪽에 다 있는 모델은 이름이 같다", () => {
    const pdp = new Map(PDP_MODELS.map((model) => [model.id, model.label]));

    for (const studio of STUDIO_MODELS) {
      const 짝 = pdp.get(studio.id as never);
      if (!짝) continue;
      expect(짝, `${studio.id} 의 이름이 두 목록에서 다르다`).toBe(studio.label);
    }
  });

  /**
   * 목록은 브라우저로 통째로 실려 나간다. 진짜 이름을 담는 칸을 만들면
   * 가려 놓은 이름이 번들 안에 그대로 남는다 — 화면에 안 뿌려도 새는 것이다.
   */
  it("보이는 이름에 업체·모델 이름이 안 섞인다", () => {
    for (const model of [...PDP_MODELS, ...STUDIO_MODELS]) {
      for (const 이름 of 새면_안_되는_이름) {
        expect(model.label, `${model.id} 의 이름에 「${이름}」이 있다`).not.toContain(이름);
        // 설명은 상세페이지 목록에만 있다.
        const 설명 = "description" in model ? model.description : "";
        expect(설명, `${model.id} 의 설명에 「${이름}」이 있다`).not.toContain(이름);
      }
    }
  });
});
