import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupAttachments } from "@fixup/sns-core";
import { slotRows, visibleIntents } from "../slot-rows";

/**
 * 카드뉴스 첨부를 이미지 만들기와 같게 맞췄는가 (설계 §3 3단계).
 *
 * **카드에 번호 배지를 못 단다.** 카드뉴스는 카드마다 첨부를 골라서 보내므로,
 * 같은 인물이 표지에서는 ②, 속지에서는 ①일 수 있다. 그래서 자리별로 묶어
 * 보여주고 지시도 자리마다 받는다(2026-09-08 사용자 결정).
 */

const slot = readFileSync(new URL("../slot-intents.tsx", import.meta.url), "utf8");
const rules = readFileSync(new URL("../slot-rows.ts", import.meta.url), "utf8");
const picker = readFileSync(new URL("../attachment-picker.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../../new-client.tsx", import.meta.url), "utf8");

describe("자리별 묶음이 프롬프트와 같은가", () => {
  it("**화면도 같은 함수로 고른다** — 갈리면 번호가 어긋난다", () => {
    // 프롬프트는 `selectReferencesForRole` 로 고른다. 화면이 따로 세면
    // 「①번」이 가리키는 그림이 달라진다.
    expect(rules).toContain("selectReferencesForRole(grouped, slot)");
    expect(slot).toContain("attachmentNumber(index)");
  });

  it("자리 셋을 다 본다", () => {
    expect(rules).toMatch(/SLOTS: StyleRole\[\] = \["cover", "body", "ending"\]/);
  });

  it("갈 그림이 없는 자리는 안 그린다", () => {
    expect(rules).toContain("row.picks.length > 0");
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

  it("적은 말을 서버로 보낸다 — 보이는 자리만", () => {
    expect(client).toContain("attachmentIntents: visibleIntents(");
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

/**
 * **값으로 잰다.** 위 소스 문자열 대조는 `picks.map` 을
 * `[...picks].reverse().map` 으로 바꿔도 통과했다 — 이 기능의 유일한 약속이
 * 정면으로 깨지는데도(2026-09-08 리뷰 실측).
 */
describe("자리별 차례를 값으로 잰다", () => {
  const coverRef = { id: "c", kind: "style_reference" as const, role: "cover" as const, assetPath: "a", url: "u" };
  const bodyRef = { id: "b", kind: "style_reference" as const, role: "body" as const, assetPath: "a", url: "u" };
  const person = { id: "p", kind: "keep_identity" as const, subject: "person" as const, assetPath: "a", url: "u" };

  it("**레퍼런스가 먼저, 인물이 뒤** — 프롬프트와 같은 차례다", () => {
    const rows = slotRows(groupAttachments([person, coverRef]));
    const cover = rows.find((row) => row.slot === "cover")!;
    expect(cover.picks.map((p) => p.id)).toEqual(["c", "p"]);
  });

  it("같은 인물이 자리마다 다른 번호다", () => {
    const rows = slotRows(groupAttachments([coverRef, bodyRef, person]));
    const at = (slot: string) => rows.find((row) => row.slot === slot)!.picks.findIndex((p) => p.id === "p");
    // 표지는 [표지레퍼런스, 인물] 이라 인물이 2번, 속지도 [속지레퍼런스, 인물] 이라 2번.
    expect(at("cover")).toBe(1);
    expect(at("body")).toBe(1);
  });

  it("인물만 있으면 세 자리에 다 나온다", () => {
    const rows = slotRows(groupAttachments([person]));
    expect(rows.map((row) => row.slot)).toEqual(["cover", "body", "ending"]);
  });

  it("갈 그림이 없는 자리는 안 나온다", () => {
    const rows = slotRows(groupAttachments([coverRef]));
    expect(rows.map((row) => row.slot)).toEqual(["cover"]);
  });

  it("**엔딩 이미지를 올렸으면 엔딩 자리를 뺀다**", () => {
    // 그 카드는 AI 를 안 거치고 원본을 그대로 넣는다 — 적은 글이 아무 데도 안 간다.
    const ending = { id: "e", kind: "ending" as const, assetPath: "a", url: "u" };
    const rows = slotRows(groupAttachments([person, ending]));
    expect(rows.map((row) => row.slot)).toEqual(["cover", "body"]);
  });

  it("아무것도 없으면 빈 목록", () => {
    expect(slotRows(groupAttachments([]))).toEqual([]);
  });
});

describe("화면에 없는 자리의 글은 안 보낸다", () => {
  const coverRef = { id: "c", kind: "style_reference" as const, role: "cover" as const, assetPath: "a", url: "u" };
  const full = { cover: "표지글", body: "속지글", ending: "엔딩글" };

  it("보이는 자리만 남는다", () => {
    // 표지 레퍼런스만 있으면 표지 줄 하나만 뜬다.
    expect(visibleIntents(groupAttachments([coverRef]), full))
      .toEqual({ cover: "표지글", body: "", ending: "" });
  });

  it("원본을 안 바꾼다", () => {
    const before = { ...full };
    visibleIntents(groupAttachments([coverRef]), full);
    expect(full).toEqual(before);
  });

  it("아무것도 없으면 전부 비운다", () => {
    expect(visibleIntents(groupAttachments([]), full))
      .toEqual({ cover: "", body: "", ending: "" });
  });
});
