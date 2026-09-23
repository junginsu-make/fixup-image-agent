import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **리디자인 화면 검수**(2026-09-23 사용자: 「UI/UX 레이아웃까지 검토·검수」).
 *
 * 실제 브라우저로 1920·1440·1280·1024·390 폭을 띄워 본 뒤 고친 것들이다.
 * 레이아웃은 단위 시험으로 잴 수 없어 **화면이 그 모양을 쓰는지** 원본으로 잰다.
 * 폭별 캡처 대조는 이 저장소 밖(검수 스크립트)에서 했다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const results = read("../redesign-results.tsx");
const panels = read("../redesign-panels.tsx");
const bits = read("../redesign-bits.tsx");

describe("결과 화면", () => {
  it("**아무 일도 안 하는 「히어로 다시 생성」 단추가 없다**", () => {
    // 단추 글자·안내 호출만 본다. 뺀 사연을 적은 주석은 괜찮다.
    expect(results).not.toMatch(/>\s*히어로 다시 생성\s*</);
    expect(results).not.toContain('onToast("히어로 1장 재생성');
  });

  it("**전체 다운로드는 ZIP 하나다** — 잇단 낱장 다운로드는 브라우저가 막는다", () => {
    expect(results).toContain("new JSZip()");
    expect(results).not.toMatch(/index \* 250/);
  });

  it("**카드가 폭 220 부터 채워 여러 장씩 놓인다** — 1440 에서 두 장씩이라 페이지가 6천 픽셀이었다", () => {
    expect(results).toContain("[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]");
    expect(results).not.toContain("grid-cols-3 gap-3 max-2xl:grid-cols-2");
  });

  it("**수정 칸은 접혀 있다가 펼친다** — 카드마다 같은 양식이 늘 펼쳐져 있었다", () => {
    expect(results).toContain("<details");
    expect(results).toContain("이 섹션 수정하기");
    /*
      **펼침은 카드가 들고 있다**(독립 리뷰 MEDIUM). `open={editing || undefined}`
      는 고치는 동안엔 아무 효과가 없고, 끝나는 순간(실패해도) 칸을 접었다 —
      방금 적은 요청이 오류 알림과 함께 가려졌다.
    */
    expect(results).not.toContain("open={editing || undefined}");
    expect(results).toContain("onToggle={(event) => setEditOpen(event.currentTarget.open)}");
    // 사파리의 기본 삼각형을 숨긴다. 안 숨기면 화살표가 둘 보인다.
    expect(results).toContain("[&::-webkit-details-marker]:hidden");
  });

  it("ZIP 도구는 누를 때 불러온다 — 화면을 열 때마다 100KB 를 받지 않는다", () => {
    expect(results).not.toMatch(/^import JSZip/m);
    expect(results).toContain('await import("jszip")');
  });

  it("생성 대기 창의 차감 안내도 회원의 단위를 쓴다", () => {
    expect(results).not.toContain("최대 {count}장이 차감됩니다");
  });

  it("**긴 제목과 단추를 두 줄로 나눈다**", () => {
    expect(results).toContain('<Topbar eyebrow="RESULTS" title={title} stacked>');
    expect(bits).toContain("stacked ? \"flex-col\"");
  });

  it("「참고 이미지로 보관」이 옆 단추와 같은 모양이다 — 테두리 없는 글자라 단추로 안 보였다", () => {
    expect(results).toContain('buttonVariant="secondary"');
  });

  it("차감 안내가 회원의 단위를 쓴다 — 크레딧으로 옮긴 회원에게 「장」이라 하지 않는다", () => {
    expect(results).not.toContain("크레딧 1장이 차감됩니다");
    expect(results).toContain("1{단위} 차감됩니다");
  });
});

describe("카드 머리의 딱지", () => {
  /*
    공용 `CardHeader` 는 세로로 쌓고 자식을 늘린다. 제목 옆에 딱지를 둔 자리에서
    딱지가 한 줄 전체로 늘어났다(「대용량 가능」·「정밀형」).
  */
  it("**딱지를 둔 머리는 가로 줄이다**", () => {
    const row = 'className="flex-row items-start justify-between gap-3 space-y-0"';
    expect(panels.split(row).length - 1).toBe(2);
    expect(results.split(row).length - 1).toBe(1);
  });

  it("딱지가 두 줄로 꺾이지 않는다 — 휴대폰에서 「정밀 / 형」이 됐다", () => {
    expect(`${panels}${results}`.match(/shrink-0 whitespace-nowrap/g)?.length).toBe(3);
  });
});

describe("모델 고르기", () => {
  it("**내부 모델 이름을 보여 주지 않는다** — 비개발자에게 뜻이 없다", () => {
    expect(panels).not.toContain("{models[model].id}");
    expect(panels).toContain("{models[model].hint}");
  });
});
