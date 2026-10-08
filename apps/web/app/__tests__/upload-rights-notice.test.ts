import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { UPLOAD_RIGHTS_NOTE } from "../../lib/rights/upload-notice";

/**
 * **그림을 올리는 자리마다 권리 안내 한 줄이 보인다**(2026-10-01).
 *
 * 약관 제8조는 「올리는 자료는 쓸 권리나 허락을 갖춰야 한다」고 정하는데,
 * 정작 올리는 자리 11곳 어디에도 그 말이 없었다. 체크박스·경고창은 두지
 * 않는다 — 가입 때 약관 동의를 받고, 올릴 때마다 막으면 핵심 흐름이 끊긴다.
 *
 * 새 업로드 자리를 만들고 한 줄을 빠뜨리면 여기서 걸린다.
 */

const app = join(__dirname, "..");
const 건너뛸곳 = new Set(["node_modules", "__tests__", ".next"]);

function tsx파일들(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (건너뛸곳.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsx파일들(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const 경로 = (path: string) => relative(app, path).split(sep).join("/");

/**
 * 파일을 고르는 입력이 있는 파일 **전부**. `accept` 는 보지 않는다 — `accept={상수}`
 * 로 쓰면 그림인지 글자로 알 수 없어, 그물에서 조용히 빠진다(2026-10-01 독립 리뷰).
 * 그림이 아닌 자리는 아래 `그림아님` 에 이유와 함께 적는다.
 */
const 업로드파일들 = tsx파일들(app).filter((path) =>
  /type=(?:"file"|\{\s*["']file["']\s*\})/.test(readFileSync(path, "utf8")),
);

/**
 * **지금 아는 파일 입력 자리 전부**(2026-10-01). 늘거나 줄면 이 목록부터 고친다 —
 * 새 자리에 안내를 붙였는지, 빠진 자리가 정말 없어졌는지 그때 사람이 본다.
 */
const 알려진자리 = [
  "characters/CharacterStudio.tsx",
  "characters/OwnCharacterField.tsx",
  "create/PdpMakerClient.tsx",
  "create/ProductSlots.tsx",
  "create/StyleReferenceAttach.tsx",
  "easy/easy-client.tsx",
  "library/references-tab.tsx",
  "library/set-editor.tsx",
  "poster/_components/reference-picker.tsx",
  "redesign/redesign-panels.tsx",
  "redesign/redesign-wizard.tsx",
  "sns/_components/attachment-picker.tsx",
  "sns/layout/library-picker.tsx",
];

/** 그림을 받지 않는 파일 입력. 안내가 필요 없다. */
const 그림아님: Record<string, string> = {
  "redesign/redesign-wizard.tsx": "관리자가 지식 파일(PDF·TXT·MD)을 올리는 자리. 그림을 받지 않는다",
};

/**
 * 입력은 그 파일에 있지만 **안내는 부르는 쪽 화면이 보여 주는** 자리.
 * 버튼이 좁아 그 안에 넣으면 세 줄로 접힌다.
 */
const 안내를보여주는곳: Record<string, string> = {
  "sns/layout/library-picker.tsx": "sns/layout/layout-client.tsx",
};

/**
 * **아직 안 붙인 자리 — 이유가 있어야 한다.**
 *
 * 「쉽게 만들기」 화면이 다른 작업(`feat/easy-cardnews`)과 부딪혀 잠시 여기 있었다.
 * 그 작업이 합류해(PR #231, 2026-10-01) 한 줄을 붙이고 비웠다.
 */
const 보류: Record<string, string> = {};

describe("업로드 자리의 권리 안내", () => {
  it("문구가 짧고 권한을 말한다", () => {
    expect(UPLOAD_RIGHTS_NOTE).toBe("사용 권한이 있는 이미지만 올려 주세요.");
  });

  /**
   * 그물이 비거나 한 자리가 빠지고 다른 자리가 들어와도 개수만 보면 모른다.
   * 목록을 통째로 맞춘다.
   */
  it("찾은 파일 입력 자리가 알려진 목록과 같다", () => {
    expect(업로드파일들.map(경로).sort()).toEqual([...알려진자리].sort());
  });

  /** 예외가 거짓이 되지 않게 한다 — 그림을 받기 시작하면 안내를 붙여야 한다. */
  it.each(Object.keys(그림아님).map((파일) => [파일]))("그림아님으로 둔 %s 는 정말 그림을 받지 않는다", (파일) => {
    expect(readFileSync(join(app, 파일), "utf8")).not.toMatch(/accept=[^>]*image/);
  });

  it.each(업로드파일들.map((path) => [경로(path)]))("%s 에서 안내 한 줄이 보인다", (파일) => {
    if (보류[파일] || 그림아님[파일]) return;
    const 보여주는곳 = 안내를보여주는곳[파일] ?? 파일;
    const 내용 = readFileSync(join(app, 보여주는곳), "utf8");
    expect(내용, `${보여주는곳} 가 {UPLOAD_RIGHTS_NOTE} 를 화면에 그리지 않는다`).toMatch(/\{UPLOAD_RIGHTS_NOTE\}/);
  });

  /** 보류가 끝났는데 목록에 남아 있으면 다음 사람이 이유를 오해한다. */
  it.each(Object.keys(보류).map((파일) => [파일]))("보류한 %s 는 아직 안내가 없다(붙였으면 보류에서 지운다)", (파일) => {
    const 내용 = readFileSync(join(app, 파일), "utf8");
    expect(내용).not.toMatch(/\{UPLOAD_RIGHTS_NOTE\}/);
  });
});
