import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 남의 작업을 복사하면 **내 것이지, 내 팀 것이 아니다.**
 *
 * `library_items`·`characters`·`sns_projects`·`poster_projects` 에는
 * `stamp_team` 트리거가 걸려 있다(`202609070004_team_stamp.sql`). 넣을 때
 * 팀을 안 적으면 트리거가 **행 주인의 팀**을 찾아 찍는다. 그러면 관리자가
 * 회원 A 의 작업을 복사하는 순간, 관리자가 속한 팀 전원이 A 의 기획안 전문과
 * 결과 그림을 자기 팀 작업물로 보게 된다 — A 는 그런 일이 있었는지도 모른다.
 *
 * ── `team_id: null` 은 안 먹는다 ──────────────────────────────────
 *
 * 트리거의 관문이 `if new.team_id is not null then return new` 라서, 명시한
 * `null` 은 「안 정했다」와 구분되지 않는다. 그래서 **넣은 뒤에 지운다.**
 * 이 사실은 값으로 잴 수 없어서(로컬에 Supabase 가 없다) 여기서 센다.
 */
const STORE = join(__dirname, "..", "store.ts");
const source = readFileSync(STORE, "utf8");

/**
 * 남의 것을 내 것으로 옮기는 함수들 중 **팀을 지우는 것.** 늘어나면 여기도
 * 늘어야 한다.
 */
const COPIERS = ["copyLibraryWorkToSelf", "copyCharacterToSelf", "copyWorkToSelf"] as const;

/**
 * **팀을 지우면 안 되는 복사 함수.**
 *
 * 참고 이미지 표에서는 `team_id = null` 이 「주인만」이 아니라 **「누구나 본다」**
 * 다(`202609070006_reference_team_scope.sql`). 처음에 이 함수도 위 목록에 넣고
 * 팀을 지우게 했더니, 팀 X 만 보던 회원의 그림이 **전 회원에게 공개**됐다 —
 * 그리고 이 가늠자가 그 잘못을 굳혀 버렸다(2026-09-16 독립 리뷰가 배포 전에
 * 잡음). 이쪽은 **원본의 팀을 물려받아야** 한다.
 */
const INHERITS_SCOPE = ["copyReferencesToSelf"] as const;

/**
 * 팀 도장이 찍히는 표 중 **복사가 건드리는 것**.
 *
 * 함수 수와 다르다 — `copyWorkToSelf` 하나가 카드뉴스와 포스터 두 표를
 * 다룬다. 그래서 함수를 세면 한 갈래가 빠져도 못 잡는다.
 */
const STAMPED_TABLES = ["library_items", "characters", "sns_projects", "poster_projects"] as const;

describe("복사본은 팀에 열지 않는다", () => {
  it("옮기는 함수를 하나도 빠짐없이 센다", () => {
    /*
      **찾지 말고 센다.** 네 번째 복사 함수가 생겼는데 여기 이름을 안 더하면,
      그 함수만 조용히 팀에 열린 채로 남는다.
    */
    const found = [...source.matchAll(/export async function (copy\w+ToSelf)/g)]
      .map((match) => match[1] as string);
    expect(found.sort()).toEqual([...COPIERS, ...INHERITS_SCOPE].sort());
  });

  it("넣은 만큼 지운다", () => {
    /*
      트리거가 찍은 팀을 되돌리는 자리가 복사 함수 수만큼 있어야 한다.
      하나가 빠지면 그 갈래만 팀에 열린다.

      **부르는 곳을 센다.** 지우는 일 자체는 `keepCopyPrivate` 한 곳에 있다 —
      네 표에 같은 두 줄을 복사해 넣으면 다섯 번째 자리가 생기는 날 그곳만
      빠진다(`stamp_team` 을 트리거로 만든 것과 같은 이유다).
    */
    const cleared = source.split("await keepCopyPrivate(").length - 1;
    expect(cleared).toBe(STAMPED_TABLES.length);
  });

  it.each(STAMPED_TABLES)("%s 의 복사본에서 팀을 지운다", (table) => {
    expect(source).toContain(`await keepCopyPrivate(admin, "${table}"`);
  });

  it("지우는 일은 한 곳에만 적혀 있다", () => {
    /*
      손으로 적은 `.update({ team_id: null })` 이 따로 생기면 그 둘이
      어긋난다 — `stamp_team` 을 일곱 파일에 복사하지 않고 트리거로 만든 것과
      같은 이유다.
    */
    expect(source.split(".update({ team_id: null })").length - 1).toBe(1);
  });

  it.each(COPIERS)("%s 가 팀을 지운다", (name) => {
    const at = source.indexOf(`export async function ${name}`);
    expect(at).toBeGreaterThan(-1);
    // 함수 한 벌 안에서 본다. 다른 함수의 것을 세면 빠진 것을 못 잡는다.
    const next = COPIERS
      .map((other) => source.indexOf(`export async function ${other}`))
      .filter((index) => index > at);
    const body = source.slice(at, next.length ? Math.min(...next) : source.length);

    expect(body).toContain("await keepCopyPrivate(");
  });

  it("지우는 일이 넣기 **직후**다", () => {
    /*
      그림을 다 옮긴 뒤에 지우면 그 사이 내내 팀에 열려 있다. 한 작업에 스무
      장이면 몇 초다 — 짧다고 없는 것이 아니다.
    */
    const at = source.indexOf("export async function copyLibraryWorkToSelf");
    const body = source.slice(at, at + 4000);
    const created = body.indexOf(".select(\"id\")");
    const cleared = body.indexOf("await keepCopyPrivate(");
    const moved = body.indexOf("moveAssets(");

    expect(created).toBeGreaterThan(-1);
    expect(cleared).toBeGreaterThan(created);
    expect(cleared).toBeLessThan(moved);
  });
});

describe("참고 이미지 복사본은 원본의 팀을 물려받는다", () => {
  const at = source.indexOf("export async function copyReferencesToSelf");
  const next = source.indexOf("export async function", at + 10);
  const body = source.slice(at, next > at ? next : source.length);

  it("함수를 찾는다", () => {
    expect(at, "copyReferencesToSelf 를 못 찾았다 — 가늠자를 고쳐라").toBeGreaterThan(-1);
  });

  it("**팀을 지우지 않는다**", () => {
    // 이 표에서 팀을 지우면 전 회원 공개다.
    expect(body).not.toContain("keepCopyPrivate(");
    expect(body).not.toMatch(/team_id:\s*null/);
  });

  it("원본 줄의 팀으로 맞춘다", () => {
    // 원본이 팀에 묶였으면 그 팀, 공용이면 관리자 팀(원래 청중보다 좁다).
    expect(body).toContain("const scope = row.team_id ?? adminTeamId;");
    const calls = body.match(/matchReferenceScope\(admin, newId, scope\)/g) ?? [];
    // 새로 만들 때, 이미 있을 때, 다른 요청이 먼저 만들었을 때 — 세 갈래 모두.
    expect(calls.length).toBe(3);
  });

  it("팀을 맞추는 함수가 원본 팀 값을 그대로 쓴다", () => {
    const helper = source.slice(
      source.indexOf("async function matchReferenceScope"),
      source.indexOf("export async function copyReferencesToSelf"),
    );
    expect(helper).toContain(".update({ team_id: teamId })");
  });
});
