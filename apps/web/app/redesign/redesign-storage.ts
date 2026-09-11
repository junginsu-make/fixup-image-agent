/**
 * 브라우저에 작업을 담아 두는 곳(IndexedDB).
 *
 * 서버 라이브러리와는 다른 자리다 — 이쪽은 그 브라우저에만 남는다.
 * 결과물을 서버에 올리는 일은 화면이 따로 한다.
 */

import { demoProjectTitles, projectDbName, projectStoreName, type Project } from "./redesign-model";
export async function openProjectDb() {
  if (typeof indexedDB === "undefined") return null;

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(projectDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(projectStoreName)) {
        db.createObjectStore(projectStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSavedProjects() {
  const db = await openProjectDb();
  if (!db) return [];

  return new Promise<Project[]>((resolve, reject) => {
    const transaction = db.transaction(projectStoreName, "readonly");
    const store = transaction.objectStore(projectStoreName);
    const request = store.getAll();
    request.onsuccess = () => {
      const projects = (request.result as Project[])
        .filter((project) => project?.id && project.sections?.length)
        .filter((project) => !isDemoProject(project))
        .sort((a, b) => new Date(b.savedAt || b.createdAt).getTime() - new Date(a.savedAt || a.createdAt).getTime());
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

export function isDemoProject(project: Project) {
  return demoProjectTitles.has(project.title) && project.sections.every((section) => !section.imageUrl);
}

export async function saveProjectToDb(project: Project) {
  const db = await openProjectDb();
  if (!db) throw new Error("브라우저 저장소를 열 수 없습니다.");

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(projectStoreName, "readwrite");
    transaction.objectStore(projectStoreName).put(project);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteProjectFromDb(projectId: string) {
  const db = await openProjectDb();
  if (!db) throw new Error("브라우저 저장소를 열 수 없습니다.");

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(projectStoreName, "readwrite");
    transaction.objectStore(projectStoreName).delete(projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

