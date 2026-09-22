import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { modelCatalog } from "../../../lib/model-catalog";

/**
 * **가린 이름을 밝히는 화면은 관리자 안에만 있어야 한다.**
 *
 * 회원 화면은 모델 이름을 일부러 가린다. 이 표가 회원 쪽으로 새면 가린 뜻이
 * 사라진다 — 그래서 자리와 문지기를 값으로 재 둔다(2026-09-16).
 */

const panel = readFileSync(new URL("../ModelCatalogPanel.tsx", import.meta.url), "utf8");
/**
 * 주석을 뺀 본문. **왜 안 적는지 설명한 주석이 「적었다」로 잡히면 안 된다** —
 * 그러면 이유를 적어 둘수록 시험이 화를 낸다.
 */
const drawn = panel
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");
// 2026-09-22 에 시스템 관리 탭(`/admin/system`)으로 옮겼다.
const adminPage = readFileSync(new URL("../system/page.tsx", import.meta.url), "utf8");
const adminLayout = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");

describe("모델 대조표", () => {
  it("관리자 화면에 실제로 걸려 있다", () => {
    expect(adminPage).toContain("<ModelCatalogPanel />");
    expect(adminPage).toContain('from "../ModelCatalogPanel"');
  });

  /** 관리자 폴더의 문지기가 이 표를 덮는다. 없어지면 누구나 본다. */
  it("관리자 문지기 안에 있다", () => {
    expect(adminLayout).toContain("requireAdmin()");
  });

  /**
   * **표를 손으로 적지 않는다.** 적어 두면 모델이 늘거나 값이 바뀔 때 한쪽만
   * 바뀌고, 가장 믿어야 할 화면이 거짓말을 한다 — 설명서에서 이미 겪었다.
   */
  it("코드에서 읽어 온다", () => {
    expect(panel).toContain('from "../../lib/model-catalog"');
    expect(panel).toContain("modelCatalog()");
    expect(panel).not.toMatch(/"gpt-image-2\.5-flare"/);
    expect(panel).not.toMatch(/"nano-banana"/);
  });

  /** 실제 id 와 종점이 화면에 나와야 밝히는 뜻이 있다. */
  it("실제 id 와 두 종점을 모두 그린다", () => {
    expect(panel).toContain("{row.id}");
    expect(panel).toContain("{row.t2iEndpoint}");
    expect(panel).toContain("{row.i2iEndpoint}");
  });

  /**
   * **제공자를 단정하지 않는다.** 코드가 아는 것은 종점 앞부분뿐이다.
   * 「Google」이라고 적으면 근거 없는 말이 된다.
   */
  it("모르는 것을 지어내지 않는다", () => {
    for (const invented of ["Google", "구글", "Gemini", "제미나이"]) {
      expect(drawn).not.toContain(invented);
    }
  });

  /** 지금 모델 여섯이 다 나오는지 — 하나라도 빠지면 대조표가 아니다. */
  it("코드에 있는 모델을 전부 담는다", () => {
    const rows = modelCatalog();

    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.map((row) => row.label)).toContain("표준형");
    expect(rows.map((row) => row.label)).toContain("경제형");
  });
});
