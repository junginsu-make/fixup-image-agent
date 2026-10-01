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

/** 그림을 받는 파일 입력이 있는 파일. 지식 파일(PDF·TXT)만 받는 관리자 업로드는 빠진다. */
const 업로드파일들 = tsx파일들(app).filter((path) => {
  const 내용 = readFileSync(path, "utf8");
  return /type="file"/.test(내용) && /accept="[^"]*image/.test(내용);
});

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
 * 「쉽게 만들기」 화면은 다른 작업(`feat/easy-cardnews`)이 같은 파일을 크게
 * 고치는 중이었다(2026-10-01). 여기서 손대면 그 작업과 부딪힌다. 그 작업이
 * 합류한 뒤 한 줄을 붙이고 이 항목을 지운다.
 */
const 보류: Record<string, string> = {
  "easy/easy-client.tsx": "다른 작업이 고치는 중(2026-10-01). 합류 뒤 붙인다",
};

describe("업로드 자리의 권리 안내", () => {
  it("문구가 짧고 권한을 말한다", () => {
    expect(UPLOAD_RIGHTS_NOTE).toBe("사용 권한이 있는 이미지만 올려 주세요.");
  });

  /** 찾는 그물이 비어 있으면 아래 검사가 모두 그냥 통과한다. */
  it("그림 업로드 자리를 실제로 찾는다", () => {
    expect(업로드파일들.length).toBeGreaterThanOrEqual(10);
  });

  it.each(업로드파일들.map((path) => [경로(path)]))("%s 에서 안내 한 줄이 보인다", (파일) => {
    if (보류[파일]) return;
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
