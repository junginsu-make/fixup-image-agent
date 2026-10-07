import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **모든 그림 칸이 같은 공용 부품으로 받는가**(2026-10-07 사용자 요청).
 *
 * 화면마다 따로 만들면 손잡이가 또 갈린다. 이 표에 화면을 하나씩 더한다.
 * 이 저장소에는 jsdom 이 없어 화면 코드의 문장을 직접 본다. 동작 자체는
 * `image-drop.test.tsx` 가 잰다.
 */

interface Screen {
  name: string;
  file: string;
  /** 손잡이를 펼친 변수 이름 — `{...<이것>.handlers}` */
  zone: string;
  multiple: boolean;
  /** 받은 그림을 넣는 길 — 그 칸의 「올리기」와 같아야 하고, 알림도 함께 넘긴다. */
  onFiles: string;
  /** 칸을 잠그는 조건. */
  disabled: string;
  /** 잠기면 Tab 으로 들어가지 않게 하는 식. */
  tabIndex: string;
}

const SCREENS: Screen[] = [
  {
    name: "캐릭터 · 참고할 그림",
    file: "../../characters/CharacterStudio.tsx",
    zone: "referenceDrop",
    multiple: false,
    onFiles: "onFiles: (files, notice) => void attachFile(files, notice)",
    disabled: "disabled: locked",
    tabIndex: "tabIndex={locked ? -1 : 0}",
  },
  {
    name: "캐릭터 · 내 캐릭터",
    file: "../../characters/OwnCharacterField.tsx",
    zone: "drop",
    multiple: false,
    onFiles: "onFiles: (files, notice) => props.onUpload(files, notice)",
    disabled: "disabled: locked",
    tabIndex: "tabIndex={locked ? -1 : 0}",
  },
  {
    name: "라이브러리 · 참고 이미지",
    file: "../../library/references-tab.tsx",
    zone: "imagesDrop",
    multiple: true,
    onFiles: "onFiles: (files, notice) => void upload(files, notice)",
    disabled: "disabled: uploading",
    tabIndex: "tabIndex={uploading ? -1 : 0}",
  },
  {
    name: "라이브러리 · 세트 편집",
    file: "../../library/set-editor.tsx",
    zone: "uploadDrop",
    multiple: true,
    onFiles: "onFiles: (files, notice) => void upload(files, notice)",
    disabled: "disabled: uploading",
    tabIndex: "tabIndex={uploading ? -1 : 0}",
  },
];

function read(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

/** `const <zone> = useImageDropTarget({ … });` 의 안쪽. */
function hookCall(source: string, zone: string): string {
  const at = source.indexOf(`const ${zone} = useImageDropTarget({`);
  expect(at, `${zone} 손잡이가 없다`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf("});", at));
}

/** 손잡이를 펼친 요소의 여는 태그(속성들). */
function zoneTag(source: string, zone: string): string {
  const at = source.indexOf(`{...${zone}.handlers}`);
  expect(at, `${zone} 를 펼친 칸이 없다`).toBeGreaterThan(-1);
  const start = source.lastIndexOf("<", at);
  const end = source.indexOf(">", source.indexOf("className", at));
  return source.slice(start, end + 1);
}

describe.each(SCREENS)("$name", (screen) => {
  const source = read(screen.file);

  it("공용 부품을 쓴다 — 화면에 따로 복사해 두지 않는다", () => {
    expect(source).toMatch(/from "(\.\.\/)+_components\/image-drop"/);
  });

  it("여러 장 여부·넣는 길(알림 포함)·잠그는 조건이 그 칸과 같다", () => {
    const call = hookCall(source, screen.zone);
    expect(call).toContain(screen.multiple ? "multiple: true" : "multiple: false");
    expect(call).toContain(screen.onFiles);
    expect(call).toContain(screen.disabled);
  });

  it("칸을 눌러 고를 수 있고, 잠기면 Tab 으로 들어가지 않는다", () => {
    const tag = zoneTag(source, screen.zone);
    expect(tag).toContain('role="group"');
    expect(tag).toContain(screen.tabIndex);
  });

  it("마우스로 눌러도 테두리로 「이 칸이 받는다」를 보이고, 끄는 동안 강조한다", () => {
    const at = source.indexOf(`{...${screen.zone}.handlers}`);
    const classes = source.slice(at, source.indexOf(")}", at));
    expect(classes).toContain("group");
    expect(classes).toContain("focus-within:ring-2");
    expect(classes).toMatch(/\.over && /);
  });

  it("안내는 공용 문구 부품으로 — 잠기면 숨고, 누르면 「지금 붙여넣을 수 있습니다」", () => {
    expect(source).toMatch(/<DropPasteHint locked=\{/);
  });
});
