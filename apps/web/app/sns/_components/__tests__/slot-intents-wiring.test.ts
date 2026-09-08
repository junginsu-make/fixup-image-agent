import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 카드뉴스 첨부를 이미지 만들기와 같게 맞췄는가 (설계 §3 3단계).
 *
 * **카드에 번호 배지를 못 단다.** 카드뉴스는 카드마다 첨부를 골라서 보내므로,
 * 같은 인물이 표지에서는 ②, 속지에서는 ①일 수 있다. 그래서 자리별로 묶어
 * 보여주고 지시도 자리마다 받는다(2026-09-08 사용자 결정).
 */

const slot = readFileSync(new URL("../slot-intents.tsx", import.meta.url), "utf8");
const picker = readFileSync(new URL("../attachment-picker.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../../new-client.tsx", import.meta.url), "utf8");

describe("자리별 묶음이 프롬프트와 같은가", () => {
  it("**화면도 같은 함수로 고른다** — 갈리면 번호가 어긋난다", () => {
    // 프롬프트는 `selectReferencesForRole` 로 고른다. 화면이 따로 세면
    // 「①번」이 가리키는 그림이 달라진다.
    expect(slot).toContain("selectReferencesForRole(grouped, slot)");
    expect(slot).toContain("attachmentNumber(index)");
  });

  it("자리 셋을 다 본다", () => {
    expect(slot).toMatch(/SLOTS: StyleRole\[\] = \["cover", "body", "ending"\]/);
  });

  it("갈 그림이 없는 자리는 안 그린다", () => {
    expect(slot).toContain("row.picks.length > 0");
  });

  it("인물은 공통이라고 표시한다 — 두 자리에 다 보인다", () => {
    // 한 곳에만 보이면 「속지에는 사람이 안 들어가나?」로 오해한다.
    expect(slot).toContain('pick.kind === "keep_identity"');
    expect(slot).toContain("공통");
  });

  it("자리마다 칸이 따로다", () => {
    expect(slot).toContain("slot-intent-${slot}");
    expect(slot).toMatch(/onChange\(\{ \.\.\.intents, \[slot\]: event\.target\.value \}\)/);
  });
});

describe("화면이 서버까지 이어져 있는가", () => {
  it("picker 가 자리별 칸을 그린다", () => {
    expect(picker).toContain("<SlotIntents");
  });

  it("적은 말을 서버로 보낸다", () => {
    expect(client).toContain("attachmentIntents: intents");
  });

  it("네 번째 역할이 목록에 있다", () => {
    expect(picker).toContain('"preserve_person_restyled"');
  });

  it("**restyle 을 따로 저장한다** — 공용 어휘가 둘을 같은 kind 로 옮긴다", () => {
    expect(picker).toMatch(/restyle: value === "preserve_person_restyled" \? true : undefined/);
    expect(picker).toMatch(/attachment\.restyle/);
  });

  it("역할 설명을 보여준다 — 이름만 보고 고르지 않게", () => {
    expect(picker).toContain("ATTACHMENT_ROLE_HINT[");
  });
});
