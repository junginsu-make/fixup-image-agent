import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **관리자가 다른 회원의 작업을 다시 만들 때 그림까지 들어 있어야 한다.**
 *
 * 01 은 채워지는데 02 가 통째로 비었다(2026-09-16 사용자 보고). 운영 데이터를
 * 보니 붙였던 그림이 그 회원 것이라 관리자 목록에 없어, 「못 보는 것은 뺀다」
 * 규칙에 전부 걸렸다. 그래서 그림을 관리자 라이브러리로 **복사해 와서** 채운다.
 *
 * 원문만 훑는 시험이라 값을 직접 못 잰다. 그래서 **순서**를 잰다 — 오늘 이
 * 파일의 형제(`rerun-wiring.test.ts`)가 글자만 세다가 여러 번 뚫렸다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(web, path), "utf8");

/** `source` 안에서 `marks` 가 **이 차례대로** 나오는지. 못 찾으면 -1 로 실패한다. */
function inOrder(source: string, marks: string[]) {
  const positions = marks.map((mark) => source.indexOf(mark));
  marks.forEach((mark, index) => {
    expect(positions[index], `「${mark}」 를 못 찾았다 — 가늠자를 고쳐라`).toBeGreaterThan(-1);
  });
  for (let index = 1; index < positions.length; index += 1) {
    expect(
      positions[index]!,
      `「${marks[index]}」 가 「${marks[index - 1]}」 보다 앞에 있다`,
    ).toBeGreaterThan(positions[index - 1]!);
  }
}

describe("이미지 만들기 — 남의 그림을 복사해 채운다", () => {
  const source = read("app/poster/new-client.tsx");

  it("관리자 통로로 읽은 **다음에** 복사하고, 복사한 **다음에** 목록을 읽는다", () => {
    /*
      목록을 먼저 읽으면 복사본이 목록에 없어서, 방금 복사해 온 그림이 전부
      「못 가져온 것」으로 빠진다 — 고치려던 02 빈칸이 그대로 남는다.
    */
    inOrder(source, [
      "found = await read(`/api/admin/works/poster/",
      "adopted = await adoptReferences(rerunFrom)",
      "const visible = new Set((await loadReferences()).map((item) => item.id))",
      "posterSeed(project, visible)",
    ]);
  });

  it("작업의 id 를 복사본으로 바꿔 끼운 것을 심는다", () => {
    // 복사만 하고 안 바꿔 끼우면 작업은 여전히 남의 id 를 가리켜 빠진다.
    expect(source).toContain("adoptPosterReferences(original.data ?? {}, adopted)");
  });

  it("복사는 **남의 작업일 때만** 한다", () => {
    /*
      내 작업에서까지 부르면 관리자가 아닌 회원은 403 을 받고, 관리자는 자기
      그림을 쓸데없이 한 번 더 부른다. 회원용 길이 404 인 가지 안이어야 한다.
    */
    const guard = source.indexOf("found.status === 404");
    const adopt = source.indexOf("adopted = await adoptReferences(rerunFrom)");
    expect(guard).toBeGreaterThan(-1);
    expect(adopt).toBeGreaterThan(guard);
    expect(source.split("adoptReferences(rerunFrom)").length - 1).toBe(1);
  });
});

describe("카드뉴스 — 남의 첨부를 복사해 채운다", () => {
  const source = read("app/sns/new-client.tsx");

  it("남의 것으로 정한 **다음에** 복사하고, 그 복사본으로 심는다", () => {
    inOrder(source, [
      "found = await read(`/api/admin/works/sns/",
      "mine = false;",
      "adopted = await adoptAttachments(rerunFrom)",
      "snsSeed(project, mine, adopted)",
    ]);
    expect(source.split("adoptAttachments(rerunFrom)").length - 1).toBe(1);
  });
});

describe("복사 주소", () => {
  const route = read("app/api/admin/works/[kind]/[id]/references/route.ts");

  it("화면이 보낸 id 를 받지 않는다", () => {
    /*
      받으면 관리자 권한으로 아무 회원의 아무 그림이나 복사하는 길이 열린다.
      무엇을 복사할지는 작업 기록에서만 뽑는다.
    */
    expect(route).not.toMatch(/request\.json\(|request\.formData\(|searchParams/);
    inOrder(route, [
      "await authenticateApiAdmin()",
      "readAnyWork(kind, id)",
      "referenceIdsOfWork(kind,",
      "copyReferencesToSelf(ids, auth.member.userId)",
    ]);
  });
});

describe("새 작업 화면에서 04·05 로 원래 작업에 돌아간다", () => {
  /*
    결과물에서 지난 단계로 넘어오면 04 기획 확인·05 결과가 막혀 돌아갈 길이
    없었다(2026-09-16 사용자 보고).
  */
  it("이미지 만들기는 돌아온 길에서만 04·05 를 열고 원래 작업으로 보낸다", () => {
    const source = read("app/poster/new-client.tsx");
    const bar = source.slice(source.indexOf("<StepBar"), source.indexOf("/>", source.indexOf("<StepBar")));

    expect(bar).toContain("reachableBeforeCreate(id) || Boolean(rerunFrom)");
    expect(bar).toContain("`/poster/${encodeURIComponent(rerunFrom)}`");
    expect(bar).toContain('id === "plan" ? `${back}?view=plan` : back');
  });

  it("원래 작업 화면은 `?view=plan` 으로 오면 기획을 연다", () => {
    const source = read("app/poster/[id]/poster-client.tsx");

    inOrder(source, [
      'useSearchParams().get("view") === "plan"',
      "if (!askedForPlan",
      "setPlanOpen(true);",
    ]);
  });

  it("카드뉴스는 돌아온 길에서만 04·05 를 열고 원래 작업으로 보낸다", () => {
    const source = read("app/sns/new-client.tsx");
    const bar = source.slice(source.indexOf("<StepBar"), source.indexOf("/>", source.indexOf("<StepBar")));

    expect(bar).toContain("Boolean(rerunFrom)");
    expect(bar).toContain("`/sns/${encodeURIComponent(rerunFrom)}`");
    // 전에는 04·05 가 그냥 눌려 없는 단계로 바뀌고 화면이 비었다.
    expect(bar).not.toContain("setStep(id as Step)");
  });

  it("개발 중 임시 글자가 사용자에게 안 보인다", () => {
    expect(read("app/sns/new-client.tsx")).not.toContain("Task 13");
  });
});
