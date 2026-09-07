import { describe, expect, it } from "vitest";
import { AD_SPECS } from "../../../lib/ad/specs";
import { planDerivation } from "../../../lib/ad/derive";
import {
  defaultSelection, downloadable, excludedCount, exportableItems, isActualSize,
  failureMessage, previewWidth, safeAreaOverlayStyle, safeAreaPercent, specRows, zipEntryName,
  PREVIEW_MAX_WIDTH, PORTAL_LABEL, SHRINK_WARNING, adSourceItems, bytesFromDataUrl, previewBackdrop,
  cropNotice, libraryImagePicks, missingRequiredCount, posterImagePicks,
} from "../export-rules";

const rows = specRows(planDerivation);

describe("화면에 걸 목록", () => {
  it("규격을 하나도 빠뜨리지 않는다", () => {
    expect(rows.map((row) => row.spec.id)).toEqual(AD_SPECS.map((spec) => spec.id));
  });

  /**
   * **지원 안 하는 규격도 숨기지 않는다.** 숨기면 「이 시스템은 비즈보드를
   * 모르는구나」가 되고, 보이면 「아직 안 되는구나」가 된다(설계 §9 원칙 3).
   */
  it("못 뽑는 규격도 목록에 남기고 까닭을 준다", () => {
    // 4단계에서 비즈보드가 조립으로 열렸다. 로고는 여전히 못 만든다 —
    // 모델이 브랜드 로고를 지어내면 매번 다른 로고가 된다.
    const logo = rows.find((row) => row.spec.id === "google-rda-logo")!;
    expect(logo.supported).toBe(false);
    expect(logo.unsupportedReason).toBeTruthy();
  });

  it("뽑을 수 있는 규격에는 까닭이 안 붙는다", () => {
    const square = rows.find((row) => row.spec.id === "google-rda-square")!;
    expect(square.supported).toBe(true);
    expect(square.unsupportedReason).toBeUndefined();
  });
});

describe("처음에 켜 두는 것", () => {
  it("필수만 켠다 — 선택은 사용자가 고른다", () => {
    const picked = defaultSelection(rows);
    for (const id of picked) {
      expect(AD_SPECS.find((spec) => spec.id === id)!.required, id).toBe(true);
    }
  });

  /**
   * 못 뽑는 것은 필수여도 안 켠다 — 켜 봐야 실패만 돌아온다.
   * 카카오 비즈보드와 네이버 스마트채널이 그렇다.
   */
  it("못 뽑는 규격은 필수여도 안 켠다", () => {
    const blocked = rows.filter((row) => !row.supported);
    expect(blocked.length, "이 시험의 전제").toBeGreaterThan(0);
    const picked = defaultSelection(rows);
    for (const row of blocked) expect(picked, row.spec.id).not.toContain(row.spec.id);
  });

  it("전부 켜지 않는다 — 규격 12개면 응답이 8MB 다", () => {
    expect(defaultSelection(rows).length).toBeLessThan(rows.length);
  });

  it("그래도 하나는 켠다 — 빈 화면으로 시작하지 않는다", () => {
    expect(defaultSelection(rows).length).toBeGreaterThan(0);
  });
});

describe("ZIP 안의 이름", () => {
  it("규격 id 와 형식으로 짓는다", () => {
    expect(zipEntryName("google-rda-square", "jpg")).toBe("google-rda-square.jpg");
  });

  /**
   * **사용자가 적은 문자열을 쓰지 않는다.** id 는 우리가 정한 값이지만 한 번
   * 거른다 — 나중에 누가 슬래시를 넣을 수 있다.
   */
  it("경로를 만들 수 있는 글자를 거른다", () => {
    expect(zipEntryName("../../etc/passwd", "jpg")).toBe("------etc-passwd.jpg");
    expect(zipEntryName("a/b", "png")).toBe("a-b.png");
  });

  it("투명 규격도 png 확장자를 받는다", () => {
    expect(zipEntryName("kakao-bizboard", "png-alpha")).toBe("kakao-bizboard.png");
  });

  it("실린 규격 전부가 겹치지 않는 이름을 만든다", () => {
    const names = AD_SPECS.map((spec) => zipEntryName(spec.id, spec.format));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("안전영역 띠", () => {
  /**
   * 규격의 `safeArea` 는 **실제 픽셀**이고 미리보기는 줄여서 보여 준다.
   * 그대로 덮으면 띠가 엉뚱한 자리에 앉는다.
   */
  it("픽셀을 비율로 옮긴다", () => {
    const band = safeAreaPercent(
      { top: 100, right: 0, bottom: 100, left: 40 },
      { width: 1200, height: 1200 },
    );
    expect(band).toEqual({
      top: "8.33%", bottom: "8.33%", left: "3.33%", right: "0.00%",
    });
  });

  it("세로가 긴 규격에서 위아래 비율이 달라진다", () => {
    const band = safeAreaPercent(
      { top: 100, right: 0, bottom: 100, left: 40 },
      { width: 720, height: 1280 },
    );
    expect(band.top).toBe("7.81%");
    expect(band.left).toBe("5.56%");
  });
});

describe("많이 줄었다는 경고", () => {
  /**
   * **초판의 두 시험은 산술 항등식이라 규격표를 아예 안 봤다.** 그래서 기준을
   * 2 로 바꿔도 5.5 로 바꿔도 전부 초록이었다.
   *
   * **경고 대상은 원본 폭에 따라 달라진다.** `batch.ts:172` 가 `AD_MASTERS` 가
   * 아니라 **실제 올린 그림의 폭**으로 재기 때문이다. 그래서 집합 하나를
   * 못 박을 수 없고, 폭을 주고 그때의 집합을 못 박는다.
   */
  const warnedAt = (sourceWidth: number) =>
    AD_SPECS.filter(
      (spec) => Number((sourceWidth / spec.target.width).toFixed(2)) > SHRINK_WARNING,
    ).map((spec) => spec.id);

  it("1200 폭 원본에서는 파워링크 하나뿐이다", () => {
    expect(warnedAt(1200)).toEqual(["naver-powerlink"]);
  });

  it("2048 폭 원본에서는 넷으로 는다", () => {
    expect(warnedAt(2048)).toEqual([
      "naver-gfa-thumb", "naver-brand-pc", "naver-brand-mobile", "naver-powerlink",
    ]);
  });

  /**
   * `naver-gfa-thumb`(300×300)은 1200 폭에서 **정확히 4.00 배**다. 비교가 `>` 라
   * 경고가 안 붙는다 — 경계에 정확히 앉은 유일한 규격이고, 아무도 검사하지
   * 않던 자리다.
   */
  it("딱 4.00 배는 안 붙는다 — 비교가 `>` 다", () => {
    expect(Number((1200 / 300).toFixed(2)), "이 시험의 전제").toBe(4);
    expect(warnedAt(1200)).not.toContain("naver-gfa-thumb");
  });

  /**
   * **두 상수를 잇는 유일한 시험이다.** 「많이 줄었으니 글자를 보세요」라고 해
   * 놓고 그림을 또 줄여 보여 주면 경고가 뜻을 잃는다(설계 §5.2).
   */
  it("경고 대상은 전부 미리보기에 1:1 로 들어간다", () => {
    const ids = new Set([...warnedAt(1200), ...warnedAt(2048)]);
    for (const id of ids) {
      const spec = AD_SPECS.find((entry) => entry.id === id)!;
      expect(isActualSize(spec.target, PREVIEW_MAX_WIDTH), id).toBe(true);
    }
  });
});

describe("화면이 적는 말", () => {
  /**
   * `PORTAL_LABEL.naver` 를 `"카카오"` 로 바꿔도 시험이 전부 초록이었다.
   * 포털 이름이 뒤바뀐 목록은 **틀린 규격을 고르게 만든다.**
   */
  it("포털 이름을 뒤바꾸지 않는다", () => {
    expect(PORTAL_LABEL.naver).toBe("네이버");
    expect(PORTAL_LABEL.google).toBe("구글");
    expect(PORTAL_LABEL.kakao).toBe("카카오");
  });

  /**
   * **`planDerivation` 이 준 말을 고정 문구로 덮지 않는다.** 덮으면 「투명 배경은
   * 조립 엔진이 필요합니다」가 「아직 지원하지 않습니다」로 바뀌어, 사용자가
   * 기다리면 되는 것인지 다른 길을 찾아야 하는지 알 수 없게 된다.
   */
  it("못 뽑는 까닭을 파생 계획이 준 말 그대로 옮긴다", () => {
    for (const row of rows.filter((entry) => !entry.supported)) {
      const plan = planDerivation(row.spec) as { reason?: string };
      expect(row.unsupportedReason, row.spec.id).toBe(plan.reason);
    }
  });
});

describe("안전영역 띠가 실제로 그려지는가", () => {
  /**
   * **넷을 전부 다르게 둔다.** 초판은 `top` 과 `bottom` 이 둘 다 100 이라
   * **위아래를 맞바꿔도 시험이 통과했다** — 띠가 거꾸로 앉아도 조용하다.
   */
  const style = safeAreaOverlayStyle(
    { top: 100, right: 20, bottom: 40, left: 60 },
    { width: 1200, height: 1200 },
  );

  /**
   * **초판이 여기서 틀렸다.** `border-width` 에 퍼센트를 넣었는데, CSS 의
   * `<line-width>` 는 길이·`thin`·`medium`·`thick` 만 받는다 — 퍼센트는
   * 무시된다. 띠가 아예 안 그려지는데 화면은 멀쩡해 보였다.
   *
   * jsdom 이 없어 DOM 으로는 못 재므로, **CSS 를 고르는 규칙 자체**를 잰다.
   */
  it("퍼센트를 받지 않는 속성에 퍼센트를 넣지 않는다", () => {
    for (const [property, value] of Object.entries(style as Record<string, string>)) {
      if (!value.includes("%")) continue;
      expect(property, `${property} 는 퍼센트를 받지 않는다`).not.toMatch(/[Ww]idth$/);
      expect(property).not.toMatch(/border/i);
    }
  });

  it("네 변이 각자 제 값을 받는다", () => {
    expect(style.top).toBe("8.33%");
    expect(style.right).toBe("1.67%");
    expect(style.bottom).toBe("3.33%");
    expect(style.left).toBe("5.00%");
  });

  /**
   * **모양만 잠그면 「보이는가」가 안 잠긴다.** 초판은 `/^0 0 0 \d+px rgba\(/` 만
   * 봤고, 그래서 퍼짐을 `0px` 로 바꿔도(아무것도 안 덮임 = 고치기 전과 같음)
   * 투명도를 `0` 으로 바꿔도(완전 투명 = 안 보임) 전부 초록이었다.
   *
   * jsdom 이 없어 DOM 으로는 못 재지만, **값이 시각적으로 무효인지는 숫자만
   * 봐도 안다.**
   */
  it("그림자가 실제로 보일 값이다 — 퍼짐도 투명도도 0 이 아니다", () => {
    const matched = String(style.boxShadow).match(
      /^0 0 0 (\d+)px color-mix\(in srgb, var\(--[a-z-]+\) ([\d.]+)%, transparent\)$/,
    );
    expect(matched, "형태부터 맞아야 한다").not.toBeNull();
    const [, spread, alpha] = matched!;
    // 미리보기 한 칸(최대 480px)을 덮고도 남아야 한다.
    expect(Number(spread)).toBeGreaterThan(PREVIEW_MAX_WIDTH);
    expect(Number(alpha), "0 이면 없는 것과 같다").toBeGreaterThan(0);
    expect(Number(alpha), "그림을 못 볼 만큼 덮어도 안 된다").toBeLessThan(50);
  });

  /**
   * 리터럴 색으로 되돌아가면 **다크 모드에서 띠만 굳는다** — 배경이 어두워지는데
   * 띠는 안 따라와 대비가 떨어진다. 화면은 멀쩡해 보인다.
   */
  it("색을 리터럴로 박지 않는다 — 테마를 탄다", () => {
    expect(String(style.boxShadow)).toContain("var(--destructive)");
    expect(String(style.boxShadow), "hex 토큰을 hsl() 로 감싸면 조용히 버려진다")
      .not.toMatch(/hsl\(/);
  });

  it("안전영역이 없는 규격에는 띠를 만들지 않는다", () => {
    // 화면이 `entry.safeArea` 가 있을 때만 부른다. 여기서는 0 이 들어와도
    // 그림자가 화면을 통째로 덮지 않는지만 본다.
    const none = safeAreaOverlayStyle(
      { top: 0, right: 0, bottom: 0, left: 0 }, { width: 100, height: 100 },
    );
    expect(none.top).toBe("0.00%");
  });
});

describe("고를 수 있는 작업만 보여 준다", () => {
  const base = { title: "t", createdAt: 0 };
  const items = [
    { ...base, id: "a", tool: "pdp" as const, storage: "account" as const },
    { ...base, id: "b", tool: "pdp" as const, storage: "browser" as const },
    { ...base, id: "c", tool: "reference" as const, storage: "account" as const },
    { ...base, id: "d", tool: "redesign" as const, storage: "account" as const },
  ];

  /**
   * `/api/ad/export` 는 `library_images` 표만 읽는다. 브라우저 저장분은 **서버에
   * 파일이 아예 없고**, 참고 이미지는 id 체계가 다르다. 걸러내지 않으면
   * 사용자가 고를 수 있는데 누르면 「뽑지 못했습니다」만 뜬다.
   */
  it("브라우저에만 있는 작업을 뺀다 — 서버에 파일이 없다", () => {
    expect(exportableItems(items).map((item) => item.id)).not.toContain("b");
  });

  it("참고 이미지를 뺀다 — id 체계가 다르다", () => {
    expect(exportableItems(items).map((item) => item.id)).not.toContain("c");
  });

  it("계정에 보관된 작업은 남긴다", () => {
    expect(exportableItems(items).map((item) => item.id)).toEqual(["a", "d"]);
  });
});

describe("ZIP 에 무엇을 담는가", () => {
  const results = [
    { specId: "ok-1", status: "ok", dataUrl: "data:image/jpeg;base64,AA" },
    { specId: "fail-bytes", status: "failed", dataUrl: "data:image/jpeg;base64,BB" },
    { specId: "fail-none", status: "failed" },
  ];

  /**
   * `batch.ts` 는 **일부러** 검증 실패 시에도 바이트를 준다 — 사람이 그림을
   * 보고 판단해야 하기 때문이다. 그것을 그대로 묶으면 **포털이 반려할 파일이
   * 정상 파일과 같은 이름으로 한 봉투에 들어간다.**
   */
  it("검증에 걸린 것은 빼고 담는다", () => {
    expect(downloadable(results).map((entry) => entry.specId)).toEqual(["ok-1"]);
  });

  it("빠진 것의 수를 셀 수 있다 — 화면이 그것을 알린다", () => {
    expect(excludedCount(results)).toBe(1);
  });

  it("바이트가 아예 없는 것은 뺀 것으로 세지 않는다 — 애초에 안 만들어졌다", () => {
    expect(excludedCount([{ specId: "x", status: "failed" }])).toBe(0);
  });
});

describe("미리보기를 실제 크기로 보여 준다", () => {
  const CELL = PREVIEW_MAX_WIDTH;

  /**
   * 전부 같은 폭으로 그리면 214×214 가 **1.43배 확대**되어 실제보다 잘 읽히게
   * 보인다 — 「글자가 읽히는지 보세요」라고 적어 놓고 읽히는지 볼 수 없는
   * 크기로 보여 주는 셈이다(설계 §5.2).
   */
  it("셀보다 작은 규격은 1:1 로 그린다", () => {
    expect(previewWidth({ width: 214 }, CELL)).toBe(214);
    expect(isActualSize({ width: 214 }, CELL)).toBe(true);
  });

  it("경고가 붙는 셋은 전부 1:1 로 보인다 — 그래야 경고가 뜻이 있다", () => {
    for (const width of [456, 376, 214]) {
      expect(isActualSize({ width }, CELL), `${width}`).toBe(true);
    }
  });

  it("셀보다 큰 규격은 셀에 맞추고 1:1 이 아니라고 말한다", () => {
    expect(previewWidth({ width: 1200 }, CELL)).toBe(CELL);
    expect(isActualSize({ width: 1200 }, CELL)).toBe(false);
  });

  /**
   * **상한이 이 셋보다 작으면 경고가 뜻을 잃는다.** 「많이 줄었으니 글자를
   * 보세요」라고 해 놓고 그림을 또 줄여서 보여 주는 꼴이 된다.
   */
  it("상한이 경고 대상 중 가장 넓은 것보다 크다", () => {
    expect(PREVIEW_MAX_WIDTH).toBeGreaterThanOrEqual(456);
  });

  it("작은 것을 늘리지 않는다", () => {
    expect(previewWidth({ width: 100 }, CELL)).toBeLessThanOrEqual(100);
  });
});

describe("실패를 사람이 읽을 말로 옮긴다", () => {
  /**
   * 라우트는 두 곳에서 **본문 없는 404** 를 낸다 — 기능이 꺼져 있을 때와 그림을
   * 못 찾을 때. 화면이 `response.json()` 을 `catch(() => null)` 로 받으면 둘 다
   * 「뽑지 못했습니다」로 뭉개져 **왜 안 되는지 알 길이 없다.**
   */
  it("본문이 없어도 404 는 무엇을 하라고 말한다", () => {
    expect(failureMessage(404, null)).toMatch(/다른 작업/);
  });

  it("붐비는 것은 다시 누르면 된다고 말한다", () => {
    expect(failureMessage(429, null)).toMatch(/다시/);
  });

  it("로그인이 풀린 것과 서버 오류를 가른다", () => {
    expect(failureMessage(401, null)).toMatch(/로그인/);
    expect(failureMessage(500, null)).not.toMatch(/로그인/);
  });

  /**
   * 서버가 준 말이 있으면 그것이 낫다 — 「규격을 하나 이상 고르세요」처럼
   * 무엇을 고치면 되는지 이미 적혀 있다.
   */
  it("서버가 준 말이 있으면 그대로 쓴다", () => {
    expect(failureMessage(400, "규격을 하나 이상 고르세요.")).toBe("규격을 하나 이상 고르세요.");
  });

  it("모르는 상태에도 빈 말을 주지 않는다", () => {
    expect(failureMessage(418, null).length).toBeGreaterThan(0);
  });
});

describe("잘라 만드는 규격도 뽑을 수 있다", () => {
  /**
   * **`supported` 에서 `crop` 을 빼도 시험 35개가 전부 초록이었다.**
   *
   * 실제 영향은 작지 않다. 기본으로 켜지는 필수 일곱 중 브랜드검색 둘이 `crop`
   * 이라, 빠지면 **필수 둘이 회색으로 죽고 기본 선택에서 조용히 사라진다.**
   * 그래서 규격 하나를 이름으로 짚어 못 박는다.
   */
  it("브랜드검색 모바일 썸네일은 잘라서라도 뽑는다", () => {
    const row = rows.find((r) => r.spec.id === "naver-brand-mobile")!;
    expect(planDerivation(row.spec).kind, "이 시험의 전제").toBe("crop");
    expect(row.supported).toBe(true);
    expect(row.unsupportedReason).toBeUndefined();
  });

  it("잘라 만드는 필수 규격이 기본 선택에 들어간다", () => {
    expect(defaultSelection(rows)).toContain("naver-brand-mobile");
  });
});

describe("data URL 에서 바이트 꺼내기", () => {
  it("base64 를 그대로 바이트로 옮긴다", () => {
    expect(bytesFromDataUrl("data:image/png;base64,QUJD")).toEqual(new Uint8Array([65, 66, 67]));
  });

  /**
   * `slice(comma + 1)` 을 `slice(comma)` 로 바꾸면 **ZIP 안의 모든 파일이
   * 깨진다** — 앞에 쉼표가 붙은 채로 디코드된다. 화면은 멀쩡하고 봉투만 썩는다.
   */
  it("쉼표를 남기지 않는다", () => {
    const bytes = bytesFromDataUrl("data:image/png;base64,QUJD");
    expect(bytes.length).toBe(3);
    expect(bytes[0]).toBe(65);
  });

  it("256 을 넘지 않는 값으로 담는다 — 멀티바이트가 아니다", () => {
    const bytes = bytesFromDataUrl("data:application/octet-stream;base64,//79");
    expect(Array.from(bytes)).toEqual([255, 254, 253]);
  });

  it("data URL 이 아니면 던진다", () => {
    expect(() => bytesFromDataUrl("그냥 문자열")).toThrow();
  });
});

describe("필수를 꺼 두면 알린다", () => {
  /**
   * 설계 §9 원칙 1 의 뒷 절반이다. 앞 절반(「필수는 켜고 시작한다」)만 있으면,
   * 사용자가 필수를 끄고 뽑아도 화면이 아무 말을 안 한다 — 포털이 반려하고 나서야
   * 안다.
   *
   * **못 뽑는 규격은 세지 않는다.** 그것은 사용자가 어쩔 수 없는 것이고,
   * 그 자리에는 이미 다른 문구가 있다.
   */
  it("필수를 다 켜 두면 0 이다", () => {
    expect(missingRequiredCount(rows, defaultSelection(rows))).toBe(0);
  });

  it("필수를 하나 끄면 1 이다", () => {
    const picked = defaultSelection(rows).filter((id) => id !== "naver-brand-pc");
    expect(missingRequiredCount(rows, picked)).toBe(1);
  });

  it("선택 규격을 꺼도 세지 않는다", () => {
    const optional = rows.find((r) => r.supported && !r.spec.required)!;
    expect(defaultSelection(rows)).not.toContain(optional.spec.id);
    expect(missingRequiredCount(rows, defaultSelection(rows))).toBe(0);
  });

  /**
   * **4단계에서 「필수인데 못 뽑는 것」이 사라졌다.** 조립이 붙어 비즈보드와
   * 스마트채널이 열렸고, 남은 미지원(로고)은 필수가 아니다. 그래도 규칙은
   * 그대로 지킨다 — 나중에 다시 생길 수 있다.
   */
  it("못 뽑는 필수 규격은 세지 않는다 — 사용자가 어쩔 수 없다", () => {
    const fake = [
      ...rows,
      { spec: { ...rows[0]!.spec, id: "가짜-필수", required: true }, supported: false,
        unsupportedReason: "가짜" },
    ];
    expect(missingRequiredCount(fake, defaultSelection(rows))).toBe(0);
  });
});

describe("어디서 그림을 고르는가", () => {
  /**
   * **3단계가 만드는 것은 라이브러리에 없다**(설계 §10 3-e). 광고 마스터는
   * `poster_images` 에 쌓이는데 이 화면은 `library_images` 만 읽어서, 마스터를
   * 만들고 여기 오면 **고를 그림이 하나도 없었다.** 로컬에서 켜 보고 알았다.
   */
  const library = [
    { id: "L1", title: "가을 사진전", storage: "account", tool: "pdp" },
    { id: "L2", title: "브라우저 초안", storage: "browser", tool: "pdp" },
    { id: "L3", title: "참고", storage: "account", tool: "reference" },
  ] as never[];
  const posters = [
    { id: "P1", title: "광고 (2048×1072)", status: "done", images: [{ variantIndex: 0 }] },
    { id: "P2", title: "만드는 중", status: "generating", images: [] },
    { id: "P3", title: "결과 없음", status: "done", images: [] },
  ];

  it("라이브러리와 포스터를 함께 보여 준다", () => {
    const items = adSourceItems(library, posters);
    expect(items.map((item) => item.id)).toEqual(["P1", "L1"]);
  });

  /** 광고 마스터가 최근 것이므로 위에 온다 — 만들자마자 고르러 온다. */
  it("포스터를 먼저 세운다", () => {
    expect(adSourceItems(library, posters)[0]!.source).toBe("poster");
  });

  it("서버에 그림이 없는 것은 안 보여 준다", () => {
    const ids = adSourceItems([], posters).map((item) => item.id);
    expect(ids, "만드는 중이거나 결과가 없는 것은 고를 수 없다").toEqual(["P1"]);
  });

  it("라이브러리 쪽 거르기는 그대로다", () => {
    const ids = adSourceItems(library, []).map((item) => item.id);
    expect(ids, "브라우저 저장분과 참고 이미지는 서버에 파일이 없다").toEqual(["L1"]);
  });

  /** 어느 쪽에서 왔는지가 실려야 라우트가 어느 표를 읽을지 안다. */
  it("출처를 함께 싣는다", () => {
    const items = adSourceItems(library, posters);
    expect(items.find((item) => item.id === "L1")!.source).toBe("library");
  });
});

describe("어느 그림을 뽑는가", () => {
  /**
   * **미리보기와 내보내기가 서로 다른 그림을 가리키고 있었다.**
   *
   * 화면은 배열 번호를 `position` 으로 보냈는데, 서버는 그것을 `variantIndex`
   * 로 읽는다. `variantIndex` 는 **배치마다 0 부터 다시 시작하므로**
   * (`generate.ts:174`) 한 작업 안에서 번호가 겹친다 — 「고치기」나 재생성을
   * 한 번만 해도 그렇다. 그러면 사용자가 A 를 보고 골랐는데 **ZIP 에는 B 가
   * 담긴다.** 「사람 눈이 의도 검증이다」(§5.2)가 여기서 헛돈다.
   *
   * 3-0 에서 같은 사실(번호가 겹친다)을 **저장 경로 충돌**로만 봤고 화면 쪽은
   * 못 봤다. 같은 사실의 다른 얼굴이다.
   */
  it("포스터 그림은 변형 번호를 그대로 보낸다", () => {
    const picks = posterImagePicks("p1", [{ variantIndex: 0 }, { variantIndex: 3 }]);
    expect(picks.map((pick) => pick.position)).toEqual([0, 3]);
  });

  /** 겹친 번호는 하나로 접는다 — 안 접으면 같은 그림이 두 번 뜨고 React key 도 겹친다. */
  it("겹친 변형 번호를 접는다", () => {
    const picks = posterImagePicks("p1", [
      { variantIndex: 0 }, { variantIndex: 0 }, { variantIndex: 1 },
    ]);
    expect(picks.map((pick) => pick.position)).toEqual([0, 1]);
  });

  it("주소가 변형 번호를 가리킨다 — 배열 번호가 아니다", () => {
    const picks = posterImagePicks("p1", [{ variantIndex: 5 }]);
    expect(picks[0]!.image).toBe("/api/poster/projects/p1/images/5/file");
  });

  it("그림이 없으면 빈 목록이다", () => {
    expect(posterImagePicks("p1", [])).toEqual([]);
  });

  /**
   * 라이브러리는 다르다 — `/api/library` 가 `position` 을 채워 주므로 그 값을 쓴다.
   * 없으면 배열 번호로 떨어진다(옛 응답).
   */
  it("라이브러리 그림은 응답이 준 position 을 쓴다", () => {
    const picks = libraryImagePicks([
      { image: "a", sectionName: "1", position: 2 },
      { image: "b", sectionName: "2" },
    ]);
    expect(picks.map((pick) => pick.position)).toEqual([2, 1]);
  });
});

describe("라이브러리 그림의 번호가 어긋나는 자리", () => {
  /**
   * **`getAccountItemImages` 가 `position` 을 버린다**(`lib/library.ts:286`).
   * 게다가 `url` 이 없는 것을 `.filter` 로 걸러내므로, 중간이 하나라도 비면
   * **배열 번호와 실제 `position` 이 어긋난다.** 그러면 미리보기와 내보내기가
   * 다른 그림이 된다 — 포스터 쪽에서 고친 것과 같은 부류다.
   *
   * 그래서 `position` 이 실려 오면 그것을 쓰고, 없으면 지금까지처럼 배열
   * 번호로 떨어진다.
   */
  it("중간이 비어도 실제 번호를 따라간다", () => {
    const picks = libraryImagePicks([
      { image: "a", sectionName: "1번째 이미지", position: 0 },
      { image: "c", sectionName: "3번째 이미지", position: 2 },
    ]);
    expect(picks.map((pick) => pick.position), "1번은 url 이 없어 걸러졌다").toEqual([0, 2]);
  });
});

describe("작업을 썸네일로 고른다", () => {
  /**
   * **글자만으로는 못 고른다.** 광고 모드는 한 번 누를 때 마스터마다 프로젝트를
   * 만들어 작업이 배로 쌓이고, 제목이 「가을 사진전 (1200×1200)」처럼 붙는다.
   * 이 저장소는 그림 고르는 자리를 전부 썸네일 격자로 만든다
   * (`_components/library-picker.tsx`).
   */
  it("포스터는 첫 변형의 사본을 쓴다", () => {
    const items = adSourceItems([], [
      { id: "P1", title: "광고", status: "done", images: [{ variantIndex: 2 }] },
    ]);
    expect(items[0]!.thumbnail).toBe("/api/poster/projects/P1/images/2/file?size=thumb");
  });

  it("라이브러리는 목록이 준 썸네일을 쓴다", () => {
    const items = adSourceItems(
      [{ id: "L1", title: "가을", storage: "account", tool: "pdp", thumbnail: "data:x" }] as never[],
      [],
    );
    expect(items[0]!.thumbnail).toBe("data:x");
  });

  /** 없으면 없는 채로 둔다 — 화면이 자리표시를 그린다. */
  it("썸네일이 없어도 목록에서 빼지 않는다", () => {
    const items = adSourceItems(
      [{ id: "L1", title: "가을", storage: "account", tool: "pdp" }] as never[],
      [],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.thumbnail).toBeUndefined();
  });
});

describe("잘라서 만든 규격을 말한다", () => {
  /**
   * **크롭은 구도를 버린다.** 2048×1072 마스터에서 456×304(1.5:1)를 뽑으면
   * 좌우가 잘려 헤드라인 한쪽이 사라진다. 화면이 그 사실을 안 적으면 사용자는
   * **그림이 깨진 줄 안다** — 실제로 그런 보고를 받았다.
   *
   * 설계 §11 이 「크롭하는 셋이 구도를 버린다 → 미리보기로 사람이 본다」고
   * 적었는데, 보여 주기만 하고 **무엇을 보라고는 안 했다.**
   */
  it("잘라 만든 규격이면 그렇다고 한다", () => {
    expect(cropNotice("naver-brand-mobile", planDerivation)).toMatch(/잘랐습니다/);
  });

  it("그대로 줄인 규격에는 안 붙인다", () => {
    expect(cropNotice("google-rda-landscape", planDerivation)).toBeUndefined();
  });

  /**
   * **`ad-3x2` 마스터가 생기면서 브랜드검색 PC 가 여기서 빠졌다.**
   * 456×304 가 정확히 3:2 라 이제 구도를 하나도 안 버린다
   * (설계 `2026-09-07-ad-assembly-engine.md` §3.2).
   */
  it("브랜드검색 PC 는 이제 안 잘린다", () => {
    expect(cropNotice("naver-brand-pc", planDerivation)).toBeUndefined();
  });

  it("모르는 규격에는 안 붙인다", () => {
    expect(cropNotice("없는-규격", planDerivation)).toBeUndefined();
  });
});

describe("조립으로 만드는 규격", () => {
  /**
   * **판단을 순수 함수로 뽑아 놓고 그것을 부르는 줄을 안 잠그는 일이 이
   * 프로젝트에서 네 번 반복됐다**(설계 4-d). `derive.ts` 에 조립 갈래를 더해도
   * 이 줄이 그것을 모르면 두 화면이 계속 「아직 지원하지 않습니다」로 그리고,
   * `defaultSelection` 이 `supported` 로 거르므로 **필수인데 기본 선택에서
   * 빠진다.**
   */
  it("조립 규격을 회색으로 두지 않는다", () => {
    for (const id of ["kakao-bizboard", "naver-smartchannel"]) {
      const row = rows.find((entry) => entry.spec.id === id)!;
      expect(planDerivation(row.spec).kind, "이 시험의 전제").toBe("assemble");
      expect(row.supported, id).toBe(true);
      expect(row.unsupportedReason, id).toBeUndefined();
    }
  });

  it("필수인 조립 규격이 기본 선택에 든다", () => {
    const picked = defaultSelection(rows);
    expect(picked).toContain("kakao-bizboard");
    expect(picked).toContain("naver-smartchannel");
  });

  /** 조립은 자르는 것이 아니다 — 「좌우를 잘랐습니다」가 붙으면 거짓말이다. */
  it("조립 규격에는 잘림 안내를 안 붙인다", () => {
    expect(cropNotice("kakao-bizboard", planDerivation)).toBeUndefined();
    expect(cropNotice("naver-smartchannel", planDerivation)).toBeUndefined();
  });

  /** 올려야 하는 것은 여전히 회색이다 — 모델이 로고를 지어내면 안 된다. */
  it("업로드 규격은 그대로 회색이다", () => {
    const logo = rows.find((entry) => entry.spec.id === "google-rda-logo")!;
    expect(logo.supported).toBe(false);
    expect(logo.unsupportedReason).toBeTruthy();
  });
});

describe("미리보기 바탕", () => {
  /**
   * **투명을 회색 판 위에 그리면 구분이 안 된다**(설계 §6.3). 이 기능의 존재
   * 이유가 투명인데 사람 눈이 그것만 확인할 수 없다.
   */
  it("투명 규격에는 체크무늬를 깐다", () => {
    const style = previewBackdrop("png-alpha");
    expect(style.backgroundImage).toContain("linear-gradient");
    expect(style.backgroundSize).toBeTruthy();
  });

  it("불투명 규격은 그대로 둔다", () => {
    expect(previewBackdrop("jpg")).toEqual({});
    expect(previewBackdrop("png")).toEqual({});
  });

  /** 색은 토큰을 탄다 — 리터럴을 박으면 다크 모드에서 굳는다. */
  it("색을 리터럴로 박지 않는다", () => {
    expect(previewBackdrop("png-alpha").backgroundImage).toContain("var(--muted)");
  });
});
