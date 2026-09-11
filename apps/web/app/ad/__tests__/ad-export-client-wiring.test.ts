import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 규칙과 화면을 잇는 줄들의 자물쇠.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-e
 *
 * **이 저장소에는 jsdom 이 없다.** `package.json` 을 건드리면 격리 계약이
 * 깨진다(§4.1). 그래서 판단은 `export-rules.ts` 로 뽑아 시험으로 잠그는데,
 * **그것을 부르는 줄은 계속 시험 밖에 남았다.** 실제로 아래 줄들을 지워도
 * 저장소 834개가 전부 초록이었다 — 그 줄들이 정확히 방금 고친 고장이 살던
 * 자리다.
 *
 * 문자열 대조라 리팩터링에 약하다. **그것이 이 시험의 값이다** — 이 줄을
 * 건드리면 사람이 한 번 멈춰 선다. 같은 방식이 `app/poster/__tests__/
 * new-client-wiring.test.ts` 와 `packages/sns-core/src/__tests__/
 * ad-isolation-lock.test.ts` 에 이미 있다.
 */

const client = readFileSync(new URL("../ad-export-client.tsx", import.meta.url), "utf8");
const fileRoute = readFileSync(
  new URL("../../api/poster/projects/[id]/images/[index]/file/route.ts", import.meta.url),
  "utf8",
);

describe("어디서 그림을 가져오는가", () => {
  /** 지우면 포스터 작업이 라이브러리 갈래로 가서 다시 「찾을 수 없습니다」가 된다. */
  it("어느 표를 읽을지 서버에 알린다", () => {
    expect(client).toContain("source: item.source");
  });

  it("포스터면 포스터 목록을 읽는다", () => {
    expect(client).toMatch(/next\.source === "poster"\s*\?\s*await posterItemImages\(next\.id\)/);
  });

  it("세 목록을 합쳐 보여 준다", () => {
    expect(client).toContain("adSourceItems({");
    for (const key of ["works: works ?? []", "references: references ?? []", "posters: posters ?? []"]) {
      expect(client, key).toContain(key);
    }
  });

  /**
   * **`loadLibrary()` 를 안 쓴다.** 그 함수는 서버가 준 `mine` 과 `sourceType` 을
   * 떨어뜨려, 누구 것인지와 캐릭터인지를 가릴 수 없게 만든다. 이 화면이 쓰는
   * 세 곳만 직접 읽는다.
   */
  it("합쳐 주는 함수 대신 세 곳을 직접 읽는다", () => {
    expect(client).not.toMatch(/loadLibrary\(\)/);
    for (const url of ['"/api/library"', '"/api/reference-images"', '"/api/poster/projects"']) {
      expect(client, url).toContain(url);
    }
  });

  /** 참고 이미지는 한 줄이 곧 한 장이다. 변형 목록을 물을 곳이 없다. */
  it("참고 이미지는 한 장으로 세운다", () => {
    expect(client).toMatch(/next\.source === "reference"/);
  });
});

describe("어느 그림을 뽑는가", () => {
  /**
   * **배열 번호를 보내면 안 된다.** 서버는 그것을 `variantIndex` 로 읽는데
   * 그 번호는 배치마다 0 부터 다시 시작한다 — 사용자가 A 를 보고 골랐는데
   * ZIP 에는 B 가 담긴다.
   */
  it("고른 그림의 실제 번호를 보낸다", () => {
    expect(client).toContain("setPosition(image.position)");
    expect(client, "배열 번호로 되돌아가면 안 된다").not.toContain("setPosition(index)");
  });

  it("두 목록 다 순수 규칙이 번호를 정한다", () => {
    expect(client).toContain("posterImagePicks(projectId,");
    expect(client).toContain("libraryImagePicks(");
  });
});

describe("로컬에서 전체 조회를 안 쓴다", () => {
  /**
   * 지우면 로컬에서 포스터 그림이 한 장도 안 보인다(500) — 「사람 눈이 의도
   * 검증이다」가 통째로 없어진다. 순수 함수만 시험하면 이 줄이 안 잠긴다.
   *
   * **둘이 함께 있어야 한다.** 누가 전체를 보는가는 `access/core.ts` 가 정하고
   * (`hasFullScope`), 로컬 예외는 `usesAdminLookup` 이 더한다. 한쪽만 남으면
   * 목록과 상세가 어긋나거나(2026-09-04) 로컬이 500 이 된다.
   */
  it("등록부의 판단 위에 로컬 예외를 얹는다", () => {
    expect(fileRoute).toMatch(
      /usesAdminLookup\(\s*hasFullScope\(viewerFrom\(auth\.member\), "read"\),\s*isLocalStoreEnabled\(\),?\s*\)/,
    );
  });
});

describe("고른 그림이 없는 상태로 두지 않는다", () => {
  /**
   * `position` 이 서버 번호가 된 뒤로 `0` 은 **목록에 없을 수 있는 값**이다.
   * 라이브러리에서 첫 그림의 서명이 실패하면 목록이 1번부터 그려지고, 그때
   * 아무것도 선택돼 보이지 않는데 뽑으면 0번을 보낸다.
   */
  it("첫 장의 실제 번호로 시작한다", () => {
    // 판단이 `startingPosition` 으로 옮겨 갔다(주소로 들어온 변형을 먼저 본다).
    // 되돌아가는 자리는 그대로 「첫 장의 서버 번호」이고, 그 규칙은
    // `export-rules.test.ts` 의 「어느 변형을 고를까」가 값으로 잠근다.
    expect(client).toContain("setPosition(startingPosition(loaded, preferred))");
  });

  /**
   * 세 곳 중 하나가 죽어도 「불러오는 중…」에 영원히 멈추지 않는다. 셋 다
   * 실패했을 때만 오류로 끝내고, 일부만 실패하면 **모자라다는 사실을 말한다** —
   * 있어야 할 그림이 안 보이는데 이유를 모르는 것이 가장 나쁘다.
   */
  it("목록 적재가 실패해도 멈추지 않는다", () => {
    // 세 요청이 각각 `catch` 로 `null` 이 되어야 한 곳이 죽어도 나머지가 뜬다.
    // **`loadSources` 안만 본다** — 이 파일에는 다른 `catch` 도 있다.
    const from = client.indexOf("const loadSources");
    const to = client.indexOf("React.useEffect", from);
    expect(from, "loadSources 를 찾았다").toBeGreaterThan(0);
    const loader = client.slice(from, to);
    expect(loader.match(/\.catch\(\(\) => null\)/g) ?? [], "세 곳 각각").toHaveLength(3);
    expect(client).toContain("setItems([])");
    expect(client).toContain("일부 목록을 불러오지 못했습니다");
  });
});

describe("단계를 나눠 보여 준다", () => {
  /** 다른 도구(`/poster`·`/sns`·`/create`·`/redesign`)와 같은 부품이다. */
  it("진행 막대를 단다", () => {
    expect(client).toContain("<StepBar steps={AD_STEPS}");
  });

  /**
   * **어느 단계로든 자유롭게 간다**(운영자 요청 2026-09-11). `StepBar` 는
   * `allowJump` 을 받으면 그것으로 막는다 — 이 화면은 넘기지 않아야 한다.
   */
  it("어느 단계로든 갈 수 있다", () => {
    const from = client.indexOf("<StepBar");
    const bar = client.slice(from, client.indexOf("/>", from));
    expect(bar, "allowJump 을 넘기면 막힌다").not.toContain("allowJump");
    expect(bar).toContain("onJump={setStep}");
  });

  it("한 단계씩 보여 준다", () => {
    for (const id of ['step === "pick"', 'step === "portal"', 'step === "result"']) {
      expect(client, id).toContain(id);
    }
  });

  /** 고르고 나서 같은 자리에 머물면 「골랐는데 아무 일도 안 일어난다」가 된다. */
  it("고르면 다음 단계로 넘긴다", () => {
    expect(client).toContain('if (loaded.length > 0) setStep("portal")');
    expect(client).toContain('setStep("result")');
  });

  /**
   * 막대가 어느 단계로든 보내므로 **아직 안 뽑은 채 03 으로 뛰는 길**이 늘
   * 열려 있다. 그때 빈 화면이면 고장 난 것처럼 보인다.
   */
  it("아직 뽑지 않았을 때도 03 이 비지 않는다", () => {
    expect(client).toContain("{!results && (");
    expect(client).toContain("아직 뽑은 것이 없습니다");
  });
});

describe("너무 작아진 것을 화면이 알린다", () => {
  /**
   * `batch.ts` 가 `tooSmall` 을 실어 줘도 **화면이 안 그리면 뜻이 없다.**
   * 설계 §5.4② 가 「막지 않고 알린다」로 정한 자리다 — 규격 검증은 이것을
   * 통과시키므로 사람 눈이 유일한 관문이다.
   */
  it("경고를 그린다", () => {
    expect(client).toContain("entry.tooSmall");
    expect(client).toMatch(/너무 작게 들어갔습니다/);
  });
});

describe("투명 배너를 투명하게 보여 준다", () => {
  /**
   * 규칙이 있어도 **화면이 안 부르면 뜻이 없다.** 이 기능의 존재 이유가
   * 투명인데, 회색 판 위에 그리면 사람이 그것만 확인할 수 없다(설계 §6.3).
   */
  it("미리보기 바탕에 체크무늬를 건다", () => {
    expect(client).toContain("previewBackdrop(entry.format)");
  });
});

/**
 * **이후에 할 일 안내**(사용자 요청 2026-09-08).
 *
 * `actionNotices` 는 순수 함수라 시험은 쉽다. 늘 빠지는 것은 **부르는 줄**이고,
 * 그 줄이 없으면 함수도 시험도 멀쩡한 채로 화면만 조용하다.
 */
describe("이후 할 일 안내를 화면이 부른다", () => {
  const picker = readFileSync(
    new URL("../../poster/ad-spec-picker.tsx", import.meta.url), "utf8",
  );

  it("`/ad` 가 고른 규격으로 안내를 그린다", () => {
    expect(client).toContain("<ActionNotices notices={actionNotices(picked, planDerivation)} />");
  });

  /** 쌍둥이 화면이 다른 말을 하면 안 된다 — 같은 함수, 같은 상자. */
  it("만들기 화면도 같은 함수로 그린다", () => {
    expect(picker).toContain("<ActionNotices notices={actionNotices(picked, planDerivation)} />");
  });

  /** 고장이 아니라 할 일이다. 오류 상자 색을 쓰면 사용자가 잘못된 줄 안다. */
  it("안내 상자는 오류 색을 안 쓴다", () => {
    const box = readFileSync(new URL("../action-notices.tsx", import.meta.url), "utf8");
    expect(box).toContain("border-primary/25");
    expect(box).not.toContain("destructive");
  });
});

/**
 * **결과에서 광고로 가는 길**(설계 `2026-09-08-ad-portal-first-selection.md`).
 *
 * 순수 함수는 값으로 잠겨 있다. 늘 빠지는 것은 **부르는 줄**이다.
 */
describe("결과 화면이 광고로 보낸다", () => {
  const detail = readFileSync(
    new URL("../../poster/[id]/poster-client.tsx", import.meta.url), "utf8",
  );
  const detailPage = readFileSync(
    new URL("../../poster/[id]/page.tsx", import.meta.url), "utf8",
  );
  const bridge = readFileSync(
    new URL("../../poster/[id]/detail-client.tsx", import.meta.url), "utf8",
  );

  it("변형마다 주소를 만든다", () => {
    expect(detail).toContain("adExportHref(project.id, image.variantIndex)");
  });

  /** 꺼져 있는데 버튼이 보이면 눌러서 404 를 만난다. */
  it("스위치가 꺼지면 안 그린다", () => {
    expect(detail).toContain("{adEnabled && (");
  });

  /** 서버에서만 읽히는 값이라, 중간에서 떨어뜨리면 영영 안 보인다. */
  it("서버가 스위치를 내려 준다", () => {
    expect(detailPage).toContain("adEnabled={isAdExportEnabled()}");
    expect(bridge).toContain("adEnabled={adEnabled}");
  });

  /**
   * **규격 목록을 결과 화면 번들로 끌고 오면 안 된다.**
   *
   * `export-rules.ts` 는 `AD_SPECS`(249줄)와 `derive` 를 들인다. 결과 화면은
   * 광고와 상관없는 사람이 훨씬 많이 보는 화면이라, 규격 고르는 칸을 별도
   * 조각으로 뺀 일이 여기서 헛돌면 안 된다.
   */
  it("결과 화면은 규격 목록을 안 들인다", () => {
    expect(detail).not.toMatch(/from "\.\.\/\.\.\/ad\/export-rules"/);
    expect(detail).not.toMatch(/from "\.\.\/\.\.\/\.\.\/lib\/ad\/specs"/);
    expect(detail).toContain('from "../../ad/href"');
  });
});

/**
 * **포털부터 고른다**(설계 §1 ③).
 *
 * 판단은 `export-rules.test.ts` 가 값으로 잠근다. 여기서는 화면이 그것을
 * 실제로 쓰는지 본다 — 초판의 「필수 9개 미리 켬」으로 되돌아가면 깨진다.
 */
describe("`/ad` 가 포털부터 묻는다", () => {
  it("아무것도 안 고른 채로 시작한다", () => {
    expect(client).toContain("React.useState<string[]>([])");
    expect(client).not.toContain("useState<string[]>(() => defaultSelection(ROWS))");
  });

  it("고른 포털의 규격만 그린다", () => {
    expect(client).toContain("rowsForPortals(ROWS, portals)");
    expect(client).toContain("{visibleRows.map((row) => {");
  });

  /**
   * **판단을 화면에 다시 쓰지 않는다.** 초판은 `setPortals` 업데이터 안에서
   * `setPicked` 를 불러, React 가 두 번 돌리자 선택이 겹쳐 쌓였다.
   */
  it("포털 토글을 순수 함수에 맡긴다", () => {
    expect(client).toContain("togglePortal(ROWS, { portals, picked }, portal)");
    expect(client).not.toMatch(/setPortals\(\(current\)/);
  });

  /** 안 고른 포털의 필수를 두고 「빠졌다」고 하면 안 지워지는 경고가 된다. */
  it("필수 경고를 보이는 규격으로만 센다", () => {
    expect(client).toContain("missingRequiredCount(visibleRows, picked)");
  });

  it("포털을 안 골랐으면 무엇을 하라고 말한다", () => {
    expect(client).toContain("올릴 포털을 하나 이상 고르세요");
  });

  /** 주소로 들어온 그림은 `chooseItem` 을 거쳐야 그림 목록이 뜬다. */
  it("주소로 들어온 그림을 목록까지 불러 고른다", () => {
    expect(client).toContain("void chooseItem(wanted, positionFromQuery(query.get(\"position\")))");
  });
});

/**
 * **사이드바에 걸고, 빈 화면에서 만드는 곳을 준다**(사용자 요청 2026-09-08).
 *
 * 사이드바에 걸리면 **처음 온 사람이 여기를 먼저 누른다.** 그때 라이브러리로
 * 보내 봐야 거기도 비어 있다.
 */
describe("아무것도 없는 사람이 먼저 왔을 때", () => {
  const shell = readFileSync(
    new URL("../../_components/studio-layout.tsx", import.meta.url), "utf8",
  );

  it("만드는 곳을 준다", () => {
    expect(client).toContain('<Link href="/poster/new">이미지 만들기</Link>');
  });

  /** 「광고」라는 말만 보고 여기서 만들어지는 줄 알면 계속 기다리게 된다. */
  it("새로 만들지 않는다고 말한다", () => {
    expect(client).toContain("새로 만들지 않고");
  });

  it("셸에 스위치를 내려 준다", () => {
    expect(shell).toContain("hasAd={isAdExportEnabled()}");
  });
});
