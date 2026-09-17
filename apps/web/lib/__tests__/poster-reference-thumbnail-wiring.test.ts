import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * 포스터 레퍼런스도 **사본을 쓰고, 목록은 라이브러리와 같은 규칙을 탄다.**
 *
 * 두 가지가 여기서 겹친다.
 *
 * 1. 사본 규약 — 격자는 사본, 확대·fal 전달은 원본. 표에는 `thumb_path` 가
 *    적혀 있는데 읽는 질의가 그 칸을 안 골라, 불러오기 창이 2MB 짜리 원본을
 *    스무 장씩 받은 적이 있다(2026-09-15: 사본 68KB · 원본 2,199KB).
 *    **실패 신호가 없는 종류의 사고다** — 화면은 멀쩡히 뜨고 느리기만 하다.
 * 2. 목록 규칙 — 이미지 만들기만 저만의 질의를 써서 「내 것 + 내 팀 것」만
 *    봤다. 그래서 카드뉴스·캐릭터·광고에 보이던 공용 그림이 여기서만 없었고,
 *    관리자도 여기서만 남의 것을 못 봤다(2026-09-17 사용자 확인 요청).
 *    이제 `listReferenceImages` 하나를 같이 쓴다.
 */

vi.mock("server-only", () => ({}));

const { toPosterReference } = await import("../poster/references");

const 그림 = {
  id: "r1",
  userId: "u1",
  storagePath: "u1/references/r1.png",
  title: "겨울",
  purpose: "poster" as const,
  width: null,
  height: null,
  createdAt: "2026-01-01",
  signedUrl: "signed:u1/references/r1.png",
  thumbUrl: "signed:u1/references/r1.thumb.webp",
  mine: true,
  ownerEmail: null,
};

describe("포스터 레퍼런스 — 사본 규약", () => {
  it("격자는 사본, 확대·fal 전달은 원본", () => {
    const record = toPosterReference(그림);
    expect(record.url).toBe("signed:u1/references/r1.png");
    expect(record.thumbUrl).toBe("signed:u1/references/r1.thumb.webp");
  });

  it("사본이 없는 옛 항목은 **비어 있다** — 원본으로 떨어뜨리지 않는다", () => {
    // 떨어뜨리면 화면 쪽에서 사본인지 원본인지 구분할 수 없어지고,
    // 「사본을 쓰고 있다」고 착각한 채 2MB 를 계속 받는다.
    expect(toPosterReference({ ...그림, thumbUrl: null }).thumbUrl).toBeNull();
  });

  it("파일 이름은 경로 끝에서 뽑는다", () => {
    expect(toPosterReference(그림).fileName).toBe("r1.png");
  });

  /**
   * **주인 표시를 떨어뜨리면 안 된다**(2026-09-17 독립 리뷰).
   *
   * 목록이 공용이 되면서 02 고르는 창에 남의 그림이 들어왔다. 이 값이 없으면
   * 창은 내 것과 남의 것을 못 가리고, 관리자는 남의 것인 줄 모른 채 지운다 —
   * 그 그림을 쓰던 다른 회원의 작업이 함께 깨진다.
   */
  it("내 것인지와 올린 사람을 그대로 싣는다", () => {
    const 남의것 = toPosterReference({ ...그림, mine: false, ownerEmail: "him@example.com" });
    expect(남의것.mine).toBe(false);
    expect(남의것.ownerEmail).toBe("him@example.com");
    expect(toPosterReference(그림).mine).toBe(true);
  });
});

describe("포스터 레퍼런스 — 라이브러리와 같은 규칙", () => {
  const source = readFileSync(new URL("../poster/references.ts", import.meta.url), "utf8");
  const route = readFileSync(
    new URL("../../app/api/poster/references/route.ts", import.meta.url), "utf8",
  );
  const generate = readFileSync(
    new URL("../../app/api/poster/projects/[id]/generate/route.ts", import.meta.url), "utf8",
  );
  const plan = readFileSync(
    new URL("../../app/api/poster/projects/[id]/plan/route.ts", import.meta.url), "utf8",
  );

  it("규칙을 옮겨 적지 않고 그 함수를 부른다", () => {
    expect(source).toContain("listReferenceImages(viewer)");
    expect(source).toContain("referenceImagesByIds(viewer, ids)");
    // 저만의 질의로 돌아가면 두 화면이 또 갈린다.
    expect(source).not.toContain('from("reference_images")');
  });

  it("목록·기획·만들기 셋 다 이 길로 간다", () => {
    expect(route).toContain("posterReferences({");
    expect(plan).toContain("posterReferencesByIds(viewer, project.data.referenceIds)");
    expect(generate).toContain("posterReferencesByIds(viewer, project.data.referenceIds)");
  });

  /**
   * **`isAdmin` 을 박아 두면 회원 전원에게 지우기 단추가 붙는다**(2026-09-17
   * 독립 리뷰가 뮤테이션으로 실증 — 그때는 시험이 초록이었다).
   *
   * 서버의 실제 판정과 같은 자리(`hasFullScope`)에서 나와야 한다.
   */
  it("관리자 여부를 목록과 함께 주되, 서버 판정에서 가져온다", () => {
    expect(route).toContain('isAdmin: hasFullScope(viewerFrom(auth.member), "delete")');
  });

  it("보는 사람은 **세션에서 꺼낸다** — 팀을 본문으로 받으면 남의 것이 열린다", () => {
    for (const [이름, 소스] of [["목록", route], ["기획", plan], ["만들기", generate]] as const) {
      expect(소스, 이름).toContain("role: auth.member.profile.role");
      expect(소스, 이름).toContain("teamId: await teamIdOf(auth.member.userId)");
    }
  });
});
