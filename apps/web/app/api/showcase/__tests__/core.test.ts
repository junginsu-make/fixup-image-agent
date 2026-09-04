import { describe, expect, it } from "vitest";
import {
  ShowcaseCreateSchema,
  isShowcased,
  showcaseAssetPath,
  showcasePatchRow,
  toShowcaseAdminView,
  toShowcaseView,
  type ShowcaseRow,
} from "../core";

const ROW: ShowcaseRow = {
  id: "s1",
  source_kind: "poster",
  source_id: "p1",
  source_index: 2,
  owner_id: "member-9",
  storage_path: "showcase/s1.png",
  mime_type: "image/png",
  width: 1024,
  height: 1536,
  caption: "고촌초등학교 가을 운동회",
  kind_label: "포스터",
  position: 0,
  visible: true,
  created_at: "2026-09-04T00:00:00.000Z",
};

describe("공개로 나가는 모양", () => {
  it("누가 만들었는지, 원본이 무엇인지, 어디 있는지를 담지 않는다", () => {
    // 로그인 없이 누구나 읽는 응답이다. 회원의 출시 전 기획물이 어느 계정
    // 것인지가 새 나가면 그림 한 장보다 훨씬 큰 것이 새 나간다.
    const view = toShowcaseView(ROW);
    expect(view).not.toHaveProperty("owner_id");
    expect(view).not.toHaveProperty("ownerId");
    expect(view).not.toHaveProperty("sourceId");
    expect(view).not.toHaveProperty("storagePath");
    expect(view).not.toHaveProperty("storage_path");
    expect(JSON.stringify(view)).not.toContain("member-9");
    expect(JSON.stringify(view)).not.toContain("showcase/s1.png");
  });

  it("화면이 읽을 주소는 저장 경로가 아니라 우리 라우트다", () => {
    expect(toShowcaseView(ROW).url).toBe("/api/showcase/s1/file");
  });

  it("비율을 알려 준다 — 흘려 배치하는 열이 밀리지 않아야 한다", () => {
    const view = toShowcaseView(ROW);
    expect(view.width).toBe(1024);
    expect(view.height).toBe(1536);
  });
});

describe("관리자가 보는 모양", () => {
  it("어디서 온 것인지와 꺼져 있는지를 더 준다", () => {
    const view = toShowcaseAdminView({ ...ROW, visible: false });
    expect(view).toMatchObject({ sourceKind: "poster", sourceId: "p1", visible: false });
  });

  it("몇 번째 장인지도 준다 — 카드뉴스는 한 작업에 여러 장이다", () => {
    // 이 값이 없으면 라이브러리가 "이 작업의 무언가가 걸렸다"까지만 알아,
    // 지금 보고 있는 장을 또 걸려다 중복 오류를 만난다.
    expect(toShowcaseAdminView(ROW).sourceIndex).toBe(2);
  });

  it("그래도 소유자는 담지 않는다", () => {
    // 관리자 화면은 작업물 목록에서 이미 소유자를 안다. 여기까지 실어
    // 나를 이유가 없다.
    expect(JSON.stringify(toShowcaseAdminView(ROW))).not.toContain("member-9");
  });
});

describe("복사본이 놓일 자리", () => {
  it("소유자 폴더가 아니라 showcase 아래다", () => {
    // library 버킷의 Storage 정책은 첫 칸을 소유자로 본다. 이 경로는
    // 어떤 회원도 직접 열 수 없고, 오직 우리 라우트만 흘려 준다.
    expect(showcaseAssetPath("s1", "image/png")).toBe("showcase/s1.png");
    expect(showcaseAssetPath("s1", "image/jpeg")).toBe("showcase/s1.jpg");
  });

  it("모르는 형식이면 png 로 둔다", () => {
    expect(showcaseAssetPath("s1", "image/gif")).toBe("showcase/s1.png");
  });
});

describe("고칠 때", () => {
  it("보낸 칸만 바꾼다", () => {
    // undefined 를 그대로 넘기면 supabase-js 가 null 로 덮어쓴다.
    // 차례만 바꾸려다 설명이 사라지면 안 된다.
    const row = showcasePatchRow({ id: "s1", position: 3 }, "2026-09-04T01:00:00.000Z");
    expect(row).toEqual({ position: 3, updated_at: "2026-09-04T01:00:00.000Z" });
    expect(row).not.toHaveProperty("caption");
    expect(row).not.toHaveProperty("visible");
  });

  it("null 은 지워 달라는 뜻이라 살린다", () => {
    const row = showcasePatchRow({ id: "s1", caption: null }, "2026-09-04T01:00:00.000Z");
    expect(row.caption).toBeNull();
  });

  it("끄는 것은 거짓을 그대로 실어 보낸다", () => {
    const row = showcasePatchRow({ id: "s1", visible: false }, "2026-09-04T01:00:00.000Z");
    expect(row.visible).toBe(false);
  });
});

describe("걸 것을 고를 때", () => {
  it("저장 경로는 받지 않는다", () => {
    // 경로를 받으면 그 값으로 버킷 어디든 가리킬 수 있다 — 공개할 생각이
    // 없던 파일을 공개 주소에 올리는 길이 생긴다.
    const parsed = ShowcaseCreateSchema.parse({
      sourceKind: "sns",
      sourceId: "11111111-1111-4111-8111-111111111111",
      storagePath: "member-9/private/secret.png",
    });
    expect(parsed).not.toHaveProperty("storagePath");
  });

  it("모르는 출처는 거절한다", () => {
    expect(() =>
      ShowcaseCreateSchema.parse({
        sourceKind: "characters",
        sourceId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow();
  });
});

describe("이미 걸린 그림인가", () => {
  const HUNG = [
    toShowcaseAdminView(ROW),
    toShowcaseAdminView({ ...ROW, id: "s2", source_kind: "sns", source_id: "n1", source_index: 0 }),
  ];

  it("세 값이 모두 같아야 걸린 것으로 본다", () => {
    expect(isShowcased(HUNG, "poster", "p1", 2)).toBe(true);
    expect(isShowcased(HUNG, "sns", "n1", 0)).toBe(true);
  });

  it("같은 작업이라도 다른 장은 안 걸린 것이다", () => {
    // 카드뉴스 3번을 걸었다고 5번까지 걸린 것으로 보면, 관리자는 5번을
    // 걸 방법이 없어진다.
    expect(isShowcased(HUNG, "sns", "n1", 5)).toBe(false);
  });

  it("도구가 다르면 남이다 — id 가 겹칠 수 있다", () => {
    expect(isShowcased(HUNG, "sns", "p1", 2)).toBe(false);
  });

  it("꺼 놓은 것도 걸린 것으로 본다", () => {
    // 꺼져 있어도 행은 남아 있어 다시 걸 수 없다. 할 일은 켜는 것이다.
    const off = [toShowcaseAdminView({ ...ROW, visible: false })];
    expect(isShowcased(off, "poster", "p1", 2)).toBe(true);
  });

  it("아무것도 안 걸렸으면 거짓이다", () => {
    expect(isShowcased([], "poster", "p1", 2)).toBe(false);
  });
});
