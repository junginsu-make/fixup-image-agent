import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **화면이 판단 함수를 정확히 그 모양으로 쓰는가.**
 *
 * 무엇을 어떤 차례로 부를지(`loadPosterRerun`·`loadSnsRerun`)와 단계 막대에서
 * 어디로 갈지(`posterRerunJump`·`snsRerunJump`)는 **값으로** 잰다
 * (`poster/__tests__/rerun-load.test.ts`, `sns/__tests__/rerun-load.test.ts`).
 *
 * 여기서는 화면이 그 함수를 **그대로** 부르는지만 본다. 부분 글자로 재면 뚫린다 —
 * 독립 리뷰가 `if (found.body?.ok)` → `if (!found.body?.ok)`,
 * `Boolean(rerunFrom)` → `!Boolean(rerunFrom)` 으로 바꿔도 초록인 것을 실증했다
 * (2026-09-16). 그래서 **문장 전체**를 요구한다. 한 글자라도 바뀌면 멈춘다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(web, path), "utf8");

/** 문장이 **정확히 한 번** 있는가. 두 번 있으면 한쪽이 옛 것일 수 있다. */
function once(source: string, sentence: string) {
  const count = source.split(sentence).length - 1;
  expect(count, `「${sentence}」 가 ${count}번 있다 — 정확히 한 번이어야 한다`).toBe(1);
}

describe("이미지 만들기 새 작업 화면", () => {
  const source = read("app/poster/new-client.tsx");

  it("값 불러오기를 함수에 맡기고, 결과를 그대로 따른다", () => {
    once(source, "const result = await loadPosterRerun(rerunFrom, {");
    once(source, "if (!result.ok) {");
    once(source, "const { seed } = result;");
  });

  it("서버에 묻는 일은 검증된 함수에 맡기고, 목록 읽기는 **복사 뒤에 부르게** 넘긴다", () => {
    /*
      요청 코드를 화면에 적어 두었을 때는 `status` 를 200 으로 박거나 POST 응답을
      버려도 초록이었다(2026-09-16 리뷰). 이제 `fetchRerunDeps` 가 하고, 그 함수는
      가짜 fetch 로 값을 잰다(`_components/__tests__/rerun-fetch.test.ts`).
    */
    once(source, "...fetchRerunDeps(),");
    once(source, "loadVisible: async () => new Set((await loadReferences()).map((item) => item.id)),");
    expect(source).not.toContain("async get(url)");
    expect(source).not.toContain("async post(url)");
  });

  it("옛 흐름이 화면에 남아 있지 않다", () => {
    // 화면 안에 흐름이 다시 적히면 값 시험이 못 본다.
    expect(source).not.toContain("adoptReferences(");
    expect(source).not.toContain("/api/admin/works/poster/");
    expect(source).not.toContain("found.status === 404");
  });

  it("단계 막대는 `posterRerunJump` 가 정한 대로만 움직인다", () => {
    once(source, "const jumpContext = { rerunFrom, seeded: rerun !== null };");
    once(source, "allowJump={(id) => posterRerunJump(id, jumpContext) !== null}");
    once(source, "const jump = posterRerunJump(id, jumpContext);");
    once(source, 'if (jump?.kind === "step") setStep(jump.id);');
    once(source, 'if (jump?.kind === "go") router.push(jump.href);');
  });
});

describe("카드뉴스 새 작업 화면", () => {
  const source = read("app/sns/new-client.tsx");

  it("값 불러오기를 함수에 맡기고, 결과를 그대로 따른다", () => {
    once(source, "const result = await loadSnsRerun(rerunFrom, fetchRerunDeps());");
    once(source, "if (!result.ok) {");
    once(source, "const { seed } = result;");
    expect(source).not.toContain("async get(url)");
    expect(source).not.toContain("async post(url)");
  });

  it("옛 흐름이 화면에 남아 있지 않다", () => {
    expect(source).not.toContain("adoptAttachments(");
    expect(source).not.toContain("/api/admin/works/sns/");
    expect(source).not.toContain("let mine =");
  });

  it("단계 막대는 `snsRerunJump` 가 정한 대로만 움직인다", () => {
    once(source, "const jumpContext = { rerunFrom, seeded: rerun !== null };");
    once(source, "allowJump={(id) => snsRerunJump(id, jumpContext) !== null}");
    once(source, "const jump = snsRerunJump(id, jumpContext);");
    once(source, 'if (jump?.kind === "step") setStep(jump.id as Step);');
    once(source, 'if (jump?.kind === "go") router.push(jump.href);');
  });

  it("개발 중 임시 글자가 사용자에게 안 보인다", () => {
    expect(source).not.toContain("Task 13");
  });
});

describe("원래 작업 화면 — `?view=plan` 으로 오면 기획을 연다", () => {
  const source = read("app/poster/[id]/poster-client.tsx");
  /*
    **그 효과 한 덩어리만 본다.** 파일 전체에서 `setPlanOpen(true)` 를 찾으면 바로
    아래 다른 효과의 것이 잡혀, 이 효과에서 지워도 초록이었다(2026-09-16 리뷰).
  */
  const start = source.indexOf('const askedForPlan = useSearchParams().get("view") === "plan";');
  const end = source.indexOf("React.useEffect(() => {", source.indexOf("React.useEffect(() => {", start) + 1);
  const effect = source.slice(start, end);

  it("효과를 찾는다", () => {
    expect(start, "기획 열기 효과를 못 찾았다 — 가늠자를 고쳐라").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("주소를 읽어 기획 칸을 연다", () => {
    once(effect, 'if (!askedForPlan || project.data.promptMode === "verbatim") return;');
    once(effect, "setPlanOpen(true);");
  });
});

/*
  **복사 주소는 여기서 안 잰다.** 글자로 재던 가늠자가 두 번 뚫렸다 — `.text()`,
  `arguments[0]` 로 본문을 읽어도 초록이었다(2026-09-16 리뷰). 이제 라우트를 실제로
  불러서, 건드리면 터지는 요청과 복사 함수의 인자로 잰다
  (`api/admin/works/__tests__/references-route.test.ts`).
*/
