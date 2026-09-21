import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_MIN, HANDLE, LIST_DEFAULT, RESULT_DEFAULT, RESULT_MAX } from "../split";

/**
 * Easy 모드는 **다른 도구와 같은 셸 안**에 있다 (2026-09-21 사용자).
 *
 * ── 왜 시험으로 묶나 ─────────────────────────────────────────
 *
 * 이건 **한 번 뒤집힌 판단**이다. 2026-09-17 에는 반대로 정했다 — 「사이드바에
 * 도구가 여섯 개 걸리면 「쉬운 모드」가 아니다」. 그 판단이 코드와 주석에
 * 남아 있어서, 다음 사람이 그 주석을 읽고 되돌릴 수 있다.
 *
 * 되돌아가면 사용자가 겪은 일이 그대로 돌아온다 — 「스튜디오에서 카드뉴스를
 * 만들든 이미지를 만들든 사이드바나 상단바는 고정되는데 **이지모드만 페이지가
 * 완전히 바뀝니다.**」
 *
 * ── 두 벌이 되는 값도 여기서 묶는다 ──────────────────────────
 *
 * 결과 칸의 처음 너비는 `split.ts` 가 값으로 정하는데, 재기 전 한 프레임 동안은
 * **CSS 클래스**가 같은 일을 한다. 둘이 갈리면 화면이 튄다.
 */

const 화면 = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * 주석을 걷어낸 코드만.
 *
 * **이 저장소의 주석은 길고, 고친 까닭을 적느라 옛 클래스 이름을 그대로
 * 인용한다.** 「`animate-pulse` 로 때우지 않는다」를 설명하는 주석 때문에
 * 「`animate-pulse` 가 없다」는 검사가 실패했다(2026-09-21). 없어야 하는 것을
 * 잴 때는 코드만 봐야 한다.
 */
const 코드 = (path: string) =>
  화면(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const layout = 화면("../layout.tsx");
const dashboard = 화면("../_components/dashboard.tsx");
const list = 화면("../_components/conversation-list.tsx");
const handle = 화면("../_components/split-handle.tsx");
const panel = 화면("../_components/result-panel.tsx");
const client = 화면("../easy-client.tsx");

describe("셸 안에 산다", () => {
  it("제 레이아웃이 아니라 StudioLayout 을 쓴다", () => {
    expect(layout).toContain("StudioLayout");
    expect(layout).toContain("<StudioLayout fill>");
  });

  /**
   * **제 사이드바를 다시 세우지 않는다.** 셸의 사이드바를 밀어낸 것이 그것이었다.
   * 대화 목록은 이제 대시보드 안의 칸이다.
   */
  it("제 상단바·제 사이드바를 만들지 않는다", () => {
    expect(layout).not.toContain("StudioActions");
    expect(layout).not.toContain("ThemeToggle");
    expect(layout).not.toContain("<nav");
    expect(layout).not.toContain("h-dvh");
  });

  it("대화 목록을 대시보드 안에 둔다", () => {
    expect(layout).toContain("EasyDashboard");
    expect(dashboard).toContain("EasyConversationList");
  });

  /**
   * **출구를 두 번 그리지 않는다.** 셸 사이드바의 「이미지 만들기」가 그것이다 —
   * 사용자가 라이브러리 단추를 뺄 때 쓴 것과 같은 판단이다(중복).
   */
  it("「자세한 모드로」를 따로 그리지 않는다", () => {
    expect(layout).not.toContain("자세한 모드로");
    expect(client).not.toContain("자세한 모드로");
  });
});

describe("구분선 둘", () => {
  /**
   * 칸이 셋이면 선이 둘이다. 목록 쪽 선이 빠지면 **넓힌 목록을 되돌릴 길이
   * 없다** — 2026-09-21 에 사용자가 「여기도 선 이동 될 수 있게」라고 한 자리다.
   */
  it("목록 쪽과 결과 쪽 양쪽에 있다", () => {
    expect(dashboard).toContain("side=" + JSON.stringify("left"));
    expect(client).toContain("side=" + JSON.stringify("right"));
  });

  /**
   * **끌 수 있다는 것이 눈에 보여야 한다**(2026-09-21 사용자 — 「양쪽 다 이동할
   * 수 있다는 아이콘을 표시해주세요」). 1px 선뿐이면 커서를 정확히 그 위에
   * 올려 보기 전에는 알 수 없고, 모르면 없는 기능이다.
   */
  it("양쪽으로 간다는 아이콘을 단다", () => {
    // **그려야 잡힌다.** 이름만 보면 안 쓰이는 import 하나로도 통과한다.
    expect(handle).toContain("<MoveHorizontal");
  });

  /**
   * **선은 하나여야 한다**(2026-09-21 사용자 — 「여기는 왜 2줄인가요? 결과는
   * 1줄인데」).
   *
   * 목록 칸이 제 오른쪽 테두리를 긋고 구분선이 제 선을 또 그어서 줄이 둘이었다.
   * 결과 칸에는 테두리가 없어 하나였고, 그래서 양쪽이 달라 보였다.
   *
   * **끌면 따라 움직이는 쪽이 선을 긋는다.** 옆 칸이 또 그으면 끌 때 두 줄이
   * 따로 논다.
   */
  it("옆 칸이 선을 따로 긋지 않는다", () => {
    expect(list).not.toContain("border-r");
    expect(panel).not.toContain("border-l");
  });

  /**
   * **`--border` 로는 안 보인다.** 바탕과 거의 같은 값이라 카드 테두리에는
   * 맞지만, 잡아서 끄는 선에는 약하다(2026-09-21 사용자 — 「전체적으로
   * 구분선이 매우 잘 안보입니다」).
   */
  /**
   * **손잡이가 옆 칸 밑에 깔리면 잘린다**(2026-09-21 사용자 — 「아이콘이 채팅
   * 목록 섹션보다 밑에 있어서 가려지고 있습니다」).
   *
   * 손잡이는 8px 선 위에 20px 짜리라 **양옆으로 6px 씩 나온다.** 목록 칸은
   * flex 자식이고, flex 자식에는 자리를 안 줘도 `z-index` 가 먹는다 — 떠 있는
   * 판을 위해 둔 `z-40` 이 넓은 화면에서도 살아 손잡이 왼쪽 절반을 덮었다.
   */
  it("옆 칸이 손잡이를 덮지 않는다", () => {
    // 목록의 `z-40` 은 떠 있을 때(`max-md`)만이어야 한다.
    expect(list).not.toMatch(/(^|[\s"'])z-40/m);
    expect(list).toContain("max-md:z-40");
    expect(handle).toMatch(/(^|[\s"'])z-10/);
  });

  it("선 색이 테두리 색이 아니다", () => {
    expect(handle).toContain("bg-subtle-foreground/");
    expect(handle).not.toContain("bg-border");
  });
});

describe("대화 목록의 처음 너비", () => {
  /** 「채팅목록 사이즈 더 넓혀주세요」(2026-09-21). 전에는 224 였다. */
  it("전보다 넓다", () => {
    expect(LIST_DEFAULT).toBeGreaterThan(224);
  });

  it("CSS 가 적어 둔 값이 split.ts 와 같다", () => {
    const rem = Number(/w-\[(\d+(?:\.\d+)?)rem\]/.exec(list)?.[1]);
    expect(rem * 16).toBe(LIST_DEFAULT);
  });
});

describe("결과 칸의 처음 너비", () => {
  /**
   * 「처음부터 사용자가 늘릴 수 있는 만큼 최대한으로 늘려서 그걸 기본값으로
   * 하세요」(2026-09-21 사용자). **상한이 곧 기본값**이라야 그 말이 지켜진다.
   */
  it("끌 수 있는 최대와 같다", () => {
    expect(RESULT_DEFAULT).toBe(RESULT_MAX);
  });

  /**
   * 재기 전 한 프레임을 CSS 가 맡는다. `w-[45rem]` 은 720px, 뺄 값은 대화
   * 바닥에 구분선 하나를 더한 것이다. 16 은 Tailwind 의 rem 기본값이다.
   */
  it("CSS 가 적어 둔 값이 split.ts 와 같다", () => {
    const rem = Number(/w-\[(\d+(?:\.\d+)?)rem\]/.exec(panel)?.[1]);
    expect(rem * 16).toBe(RESULT_MAX);

    const 남길것 = Number(/max-w-\[calc\(100%-(\d+)px\)\]/.exec(panel)?.[1]);
    expect(남길것).toBe(CHAT_MIN + HANDLE);
  });
});

/**
 * **기다리는 동안 움직이는 것이 보여야 한다** (2026-09-21 사용자 — 「모션을
 * 줘서 실제 로딩되는 표시로 해줘… 이미지 생성 중에도 생성 중이라는 표시를
 * 정확히 알 수 있게」).
 *
 * 전에는 둘 다 `animate-pulse` 였다. 옅어졌다 진해지는 것은 **멈춘 것과 구분이
 * 안 된다** — 천천히 바뀌는 데다 내용은 그대로라 화면이 멎은 것인지 기다리는
 * 것인지 알 수 없다.
 */
describe("기다리는 표시", () => {
  const message = 화면("../_components/message.tsx");

  it("답을 기다릴 때 점이 뛴다", () => {
    expect(message).toContain("fixup-typing-dot");
    // 셋이 **차례로** 뛰어야 흐르는 것으로 읽힌다. 같이 뛰면 깜빡이는 것이다.
    expect(message).toContain("animationDelay");
  });

  /**
   * 이미지는 30초에서 1분이 걸린다. 도는 표시만으로는 **살아 있는지** 알 수
   * 없어서 지난 시간을 같이 낸다.
   */
  it("이미지를 만들 때 도는 표시·흐르는 막대·지난 시간을 함께 낸다", () => {
    expect(message).toContain("animate-spin");
    expect(message).toContain("fixup-working-bar");
    expect(message).toContain("<ElapsedTime");
  });

  it("옅어졌다 진해지는 것으로 때우지 않는다", () => {
    expect(코드("../_components/message.tsx")).not.toContain("animate-pulse");
  });

  /** 결과가 앉을 자리에서도 같은 판을 쓴다. 다르게 생기면 다른 일로 보인다. */
  it("결과 칸에서도 같은 판으로 알린다", () => {
    // **그려야 잡힌다.** 이름만 보면 안 쓰이는 import 하나로도 통과한다.
    expect(panel).toContain("<EasyImageWorking");
    expect(client).toContain("working={");
  });
});

/**
 * **칸이 주는 너비를 다 쓴다**(2026-09-21 사용자 — 「텍스트가 표시되는 영역이
 * 작아보이는데… 양쪽 여백을 조금만 남기고」).
 *
 * `max-w-2xl`(672px)로 가운데에 묶어 뒀더니, 대화 칸을 넓혀 놔도 글은 그 너비에
 * 갇혀 **양옆이 통째로 비었다.** 넓힐지는 구분선을 끄는 사람이 정한다.
 */
describe("대화 칸의 글 너비", () => {
  it("글을 좁은 단에 가두지 않는다", () => {
    expect(코드("../easy-client.tsx")).not.toContain("max-w-2xl");
  });
});
