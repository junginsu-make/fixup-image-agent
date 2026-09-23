import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-09-23 사용자 요청 여섯 가지 중 편집기 배선.
 *
 * 순수 규칙(`library-save.ts`·`stitch-layout.ts`)은 따로 시험한다. 여기서는
 * **화면이 그 규칙을 실제로 부르는지** 잰다 — 규칙이 맞아도 한 줄 배선이
 * 빠지면 아무 일도 안 일어난다.
 */
const NEWLINE_RE = new RegExp(String.raw`\r?\n`);
const COMMENT_LINE_RE = new RegExp(String.raw`^\s*(\*|/\*|//|\{/\*)`);
const 코드만 = (source: string) =>
  source
    .split(NEWLINE_RE)
    .filter((line) => !COMMENT_LINE_RE.test(line))
    .join("\n");

const editor = 코드만(readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8"));
const gallery = 코드만(readFileSync(new URL("../SectionGallery.tsx", import.meta.url), "utf8"));

const 구간 = (source: string, 시작: string, 끝: string) => {
  const at = source.indexOf(시작);
  if (at < 0) throw new Error(`${시작} 을 못 찾음`);
  const to = source.indexOf(끝, at + 시작.length);
  return source.slice(at, to > at ? to : undefined);
};

describe("3 — 라이브러리에 한 작업으로, 자동으로", () => {
  const 저장 = 구간(editor, "const handleSaveToLibrary", "saveToLibraryRef.current = handleSaveToLibrary");

  it("**모든 요청에 같은 sourceId 를 싣는다** — 묶음마다 새 작업이 되지 않는다", () => {
    // 표의 칸이 uuid 라 그림으로 지은 UUID 를 쓴다(독립 리뷰 CRITICAL).
    expect(저장).toContain("libraryWorkId(libraryVersionSections)");
    expect(저장).toMatch(/body: JSON\.stringify\(\{[^}]*sourceId,/s);
  });

  it("**몇 번째 장부터인지 알리고, 먼저 서버에 몇 장 있는지 묻는다** — 다시 연 초안이 또 붙이지 않는다", () => {
    expect(저장).toContain("startPosition: sent,");
    expect(저장).toContain("`/library?sourceId=${sourceId}`");
  });

  it("**못 읽은 장을 건너뛰지 않고 멈춘다** — 건너뛰면 뒤의 장 자리가 당겨진다", () => {
    expect(저장).not.toContain("if (!base64) continue;");
    expect(저장).toMatch(/if \(!base64\) \{\s*못읽음 = /);
  });

  it("**앞단 10MB 안에 맞춰 나눈다** — 20MB 예산을 쓰지 않는다", () => {
    expect(저장).toContain("requestBatches(images)");
    expect(editor).not.toContain("planUploadBatches");
  });

  it("제목에 「(1/3)」을 붙이지 않는다 — 한 작업이다", () => {
    expect(저장).not.toMatch(/\$\{index \+ 1\}\/\$\{batches\.length\}/);
  });

  it("이미 보낸 판은 다시 안 보내고, 끊긴 판은 이어 보낸다", () => {
    expect(저장).toContain("pendingLibraryUpload(libraryProgressRef.current");
    expect(저장).toContain("libraryEntries.slice(sent)");
  });

  it("**생성이 끝나면 자동으로 부른다**", () => {
    const 효과 = 구간(editor, "const autoSavedRunRef", "if (!currentSection) {");
    expect(효과).toContain('generationRun?.status !== "finished"');
    expect(효과).toContain("saveToLibraryRef.current({ auto: true })");
    // 다 만들어졌을 때만. 반쪽을 올리면 나머지를 채운 뒤 또 한 벌이 생긴다.
    expect(효과).toContain("sections.some((section) => !section.generatedImage)");
  });
});

describe("5 — 내려받기 단추", () => {
  it("**「현재 섹션 다운로드」가 없다** — 갤러리에서 늘 첫 장을 받았다", () => {
    // 단추 글자로 남았는지 본다. 주석이 옛 이름을 적는 것은 괜찮다.
    expect(editor).not.toMatch(/[>}]\s*현재 섹션 다운로드\s*</);
    expect(editor).not.toMatch(/[>}]\s*전체 ZIP\s*</);
  });

  it("「전체 다운로드」 하나가 ZIP 을 부른다", () => {
    expect(editor.match(/[>}]\s*전체 다운로드\s*</g)).toHaveLength(1);
    expect(구간(editor, "handleDownloadAll()", "전체 다운로드")).toBeTruthy();
  });

  it("**확대 창에서 그 장을 내려받는다** — 지금 보는 장 번호로 부른다", () => {
    expect(gallery).toContain("await onDownload(zoomIndex)");
    expect(gallery).toContain("이 이미지 다운로드");
    expect(editor).toContain("onDownload={downloadSection}");
  });
});

describe("4 — 이어보기 다운로드", () => {
  it("단추가 있고, 이어 붙이는 배치를 쓴다", () => {
    expect(editor).toContain("이어보기 다운로드");
    const 함수 = 구간(editor, "const handleDownloadStitched", "const handleDownloadAll");
    expect(함수).toContain("stitchLayout(");
    // 얹은 글자까지 구운 장을 붙인다. 원본만 붙이면 내려받은 것과 다르다.
    expect(함수).toContain("captureSectionBlob(index)");
  });
});

describe("1 — 왼쪽 칸이 편집 화면을 덮지 않는다", () => {
  it("**칸이 내용보다 작아질 수 있다** — 긴 설명이 칸을 넓히지 않는다", () => {
    expect(editor).toContain('<aside className="grid min-w-0 grid-cols-[minmax(0,1fr)]');
    expect(editor).toContain('<div className="grid grid-cols-[minmax(0,1fr)] gap-1">');
  });
});

describe("6 — 도구 막대가 잘 보인다", () => {
  it("단추가 테두리와 14px 글자를 쓴다 — 테두리 없는 12px 가 아니다", () => {
    const 막대 = 구간(editor, "설정으로", "전체 다운로드");
    expect(막대).not.toContain('variant="ghost"');
    expect(막대).toContain("toolbarButtonClass");
    expect(editor).toMatch(/const toolbarButtonClass = "[^"]*text-sm font-semibold/);
  });
});
