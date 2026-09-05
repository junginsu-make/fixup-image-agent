"use client";

/**
 * 통합 라이브러리 — 두 도구의 IndexedDB 저장소를 읽기 전용으로 합쳐 보여준다.
 * 데이터 병합/이동은 하지 않는다(각 도구의 독립 저장소 유지). 조회만 통합한다.
 */
import type { LibraryItem } from "@fixup/shared";
import { listPdpDrafts, deletePdpDraft, getPdpDraft } from "../app/create/pdp-drafts";

const REDESIGN_DB = "hanirum-redesign-projects";
const REDESIGN_STORE = "projects";

interface RedesignProjectRow {
  id?: string | number;
  title?: string;
  createdAt?: string;
  sections?: Array<{ imageUrl?: string }>;
}

function parseTime(value?: string): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/** 'new'(새로 만들기) 도구의 IndexedDB 초안을 LibraryItem으로 변환 */
async function readPdpDrafts(): Promise<LibraryItem[]> {
  try {
    const drafts = await listPdpDrafts();
    return drafts.map((d) => ({
      id: d.id,
      tool: "pdp" as const,
      title: d.title,
      thumbnail: d.thumbnailUrl ?? undefined,
      createdAt: parseTime(d.updatedAt),
    }));
  } catch {
    return [];
  }
}

/** '리디자인' 도구의 IndexedDB 프로젝트를 LibraryItem으로 변환 (읽기 전용) */
async function readRedesignProjects(): Promise<LibraryItem[]> {
  if (typeof indexedDB === "undefined") return [];

  return new Promise<LibraryItem[]>((resolve) => {
    let settled = false;
    const done = (items: LibraryItem[]) => {
      if (!settled) {
        settled = true;
        resolve(items);
      }
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(REDESIGN_DB, 1);
    } catch {
      return done([]);
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REDESIGN_STORE)) {
        db.createObjectStore(REDESIGN_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => done([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REDESIGN_STORE)) {
        db.close();
        return done([]);
      }
      try {
        const tx = db.transaction(REDESIGN_STORE, "readonly");
        const getAll = tx.objectStore(REDESIGN_STORE).getAll();
        getAll.onsuccess = () => {
          const rows = (getAll.result || []) as RedesignProjectRow[];
          done(
            rows.map((p) => ({
              id: String(p.id ?? ""),
              tool: "redesign" as const,
              title: String(p.title || "리디자인 작업"),
              thumbnail: p.sections?.[0]?.imageUrl,
              createdAt: parseTime(p.createdAt),
            })),
          );
        };
        getAll.onerror = () => done([]);
      } catch {
        done([]);
      }
    };
  });
}

/** 두 도구의 작업을 최신순으로 합쳐 반환 */
/**
 * 서버(내 계정)에 보관된 작업물.
 *
 * 브라우저 저장소와 달리 기기를 옮겨도 남고, 다른 사용자에게는 보이지 않는다.
 * 로그인하지 않았거나 서버가 응답하지 않으면 빈 목록으로 넘어간다 — 서버
 * 라이브러리 때문에 브라우저 저장분까지 안 보이면 손해가 더 크다.
 */
async function readAccountItems(): Promise<LibraryItem[]> {
  try {
    const response = await fetch("/api/library", { cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      ok?: boolean;
      items?: Array<{
        id: string; title: string; tool: string; imageCount: number;
        createdAt: string; coverUrl: string | null; coverThumbUrl?: string | null;
      }>;
    };
    if (!body.ok || !body.items) return [];

    return body.items.map((item) => ({
      id: item.id,
      // 서버는 도구를 create/redesign 으로 부르고, 화면은 pdp/redesign 으로 부른다.
      // 여기서 맞춰준다 — 어긋나면 TOOL_META 조회가 undefined 라 배지에서 터진다.
      tool: item.tool === "redesign" ? "redesign" : "pdp",
      title: item.title,
      // **목록 카드에서만 작은 사본을 쓴다.** 없으면 원본으로 떨어진다 —
      // 이미 쌓인 항목에는 사본이 없다.
      thumbnail: item.coverThumbUrl ?? item.coverUrl ?? undefined,
      createdAt: Date.parse(item.createdAt) || 0,
      storage: "account" as const,
      imageCount: item.imageCount,
    }));
  } catch {
    return [];
  }
}

/**
 * 내 디자인 레퍼런스.
 *
 * 계정 화면에서만 보였다. 사용자에게는 이것도 "내가 계정에 올려 둔 것"이라
 * 라이브러리에 없으면 어디에 뒀는지 찾지 못한다. 한 장짜리 항목으로 싣는다.
 */
async function readReferenceItems(): Promise<LibraryItem[]> {
  try {
    const response = await fetch("/api/pdp/style-references", { cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      ok?: boolean;
      references?: Array<{ id: string; name: string; createdAt: string; url: string | null }>;
    };
    if (!body.ok || !body.references) return [];

    return body.references.map((reference) => ({
      id: reference.id,
      tool: "reference" as const,
      title: reference.name,
      thumbnail: reference.url ?? undefined,
      createdAt: Date.parse(reference.createdAt) || 0,
      storage: "account" as const,
      imageCount: 1,
    }));
  } catch {
    return [];
  }
}

export async function loadLibrary(): Promise<LibraryItem[]> {
  const [pdp, redesign, account, references] = await Promise.all([
    readPdpDrafts(),
    readRedesignProjects(),
    readAccountItems(),
    readReferenceItems(),
  ]);
  const browserItems = [...pdp, ...redesign].map((item) => ({
    ...item,
    storage: "browser" as const,
  }));
  return [...browserItems, ...account, ...references].sort((a, b) => b.createdAt - a.createdAt);
}

/** '리디자인' 도구의 IndexedDB 프로젝트를 삭제 (읽기 통합과 동일하게 각 저장소 독립) */
async function deleteRedesignProject(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  return new Promise<void>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(REDESIGN_DB, 1);
    } catch {
      return resolve();
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REDESIGN_STORE)) {
        db.createObjectStore(REDESIGN_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REDESIGN_STORE)) {
        db.close();
        return resolve();
      }
      try {
        const tx = db.transaction(REDESIGN_STORE, "readwrite");
        tx.objectStore(REDESIGN_STORE).delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        db.close();
        resolve();
      }
    };
  });
}

/** 라이브러리 항목을 해당 도구의 저장소에서 삭제한다. */
export async function deleteLibraryItem(item: LibraryItem): Promise<void> {
  // 레퍼런스는 다른 표에 있다. 라이브러리 삭제 API 로 보내면 아무것도 지워지지
  // 않고 사라진 것처럼 보인다.
  if (item.tool === "reference") {
    await fetch("/api/pdp/style-references", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    return;
  }

  // 서버 보관분은 파일까지 함께 지워야 한다. 브라우저 저장소를 지우는 것과 다르다.
  if (item.storage === "account") {
    await fetch("/api/library", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id }),
    });
    return;
  }

  if (item.tool === "pdp") {
    await deletePdpDraft(item.id);
  } else {
    await deleteRedesignProject(item.id);
  }
}

/** 라이브러리 뷰어용 결과 이미지 한 장. */
export interface PdpResultImage {
  sectionName: string;
  image: string;
}

/**
 * 계정에 보관된 작업의 이미지 전체.
 *
 * 브라우저 저장분과 달리 서버에 있으므로 API 로 가져온다. 이미지는 짧은 수명의
 * 서명 URL 이라 그때그때 발급받는다 — 목록에 미리 담아두면 열기도 전에 만료된다.
 */
export async function getAccountItemImages(
  item: LibraryItem,
): Promise<{ title: string; images: PdpResultImage[] } | null> {
  try {
    const response = await fetch(`/api/library?id=${encodeURIComponent(item.id)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      ok?: boolean;
      images?: Array<{ position: number; url: string | null }>;
    };
    if (!body.ok || !body.images?.length) return null;

    return {
      title: item.title,
      images: body.images
        .filter((entry) => entry.url)
        .map((entry) => ({
          sectionName: `${entry.position + 1}번째 이미지`,
          image: entry.url as string,
        })),
    };
  } catch {
    return null;
  }
}

/**
 * 'pdp'(새로 만들기) 저장 작업에서 생성된 섹션 이미지들을 꺼낸다.
 *
 * 편집 상태(editorState.sections)를 우선한다. 순서 변경·추가가 반영된 최신본이기
 * 때문이다. 없으면 분석 원본(result.blueprint.sections)으로 떨어진다.
 * 이미지가 아직 없는 섹션은 건너뛴다.
 */
export async function getPdpResultImages(
  id: string
): Promise<{ title: string; images: PdpResultImage[] } | null> {
  const draft = await getPdpDraft(id);
  if (!draft) {
    return null;
  }

  const sections =
    draft.editorState?.sections?.length
      ? draft.editorState.sections
      : draft.result?.blueprint.sections ?? [];

  const images = sections
    .map((section, index) => ({
      sectionName: section.section_name || `섹션 ${index + 1}`,
      image: section.generatedImage ?? "",
    }))
    .filter((entry) => Boolean(entry.image));

  return { title: draft.title, images };
}
