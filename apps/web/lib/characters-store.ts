import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStoragePath } from "./storage/safe-path";
import {
  getLocalDatabase,
  localStoreRoot,
  type LocalCharacterRow,
  type LocalCharacterViewRow,
} from "./local-store";

/**
 * 로컬 모드의 캐릭터 창고.
 *
 * 다른 기능은 전부 로컬·운영이 같게 도는데 캐릭터만 Supabase 를 바로 불러서
 * 로컬 개발에서는 아예 만들 수 없었다. 화면을 고쳐도 손으로 확인할 방법이
 * 없다는 뜻이라 여기부터 맞춘다.
 *
 * 경로 규약은 운영과 같다 — `{characterId}/{angle}.{ext}`. 운영은 앞에 소유자
 * 칸이 더 붙는다(버킷 정책이 첫 칸으로 소유자를 판정한다). 로컬은 파일이
 * 사용자별 폴더 밖으로 나가지 않으므로 그 칸이 필요 없다.
 */

const ROOT_DIR = "characters";

function fileFor(storagePath: string): string {
  assertStoragePath(storagePath);
  const parts = storagePath.split("/");
  if (![2, 3].includes(parts.length)) {
    throw new Error("캐릭터 파일 경로가 올바르지 않습니다.");
  }
  return path.join(localStoreRoot(), ROOT_DIR, ...parts);
}

export async function writeLocalCharacterFile(storagePath: string, bytes: Buffer): Promise<void> {
  const target = fileFor(storagePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

export async function readLocalCharacterFile(storagePath: string): Promise<Buffer> {
  return readFile(fileFor(storagePath));
}

export async function removeLocalCharacterFiles(storagePaths: string[]): Promise<void> {
  for (const storagePath of storagePaths) {
    await rm(fileFor(storagePath), { force: true });
  }
}

export async function insertLocalCharacter(row: LocalCharacterRow): Promise<void> {
  await getLocalDatabase().update((data) => {
    data.characters.push(row);
  });
}

export async function replaceLocalCharacterViews(
  characterId: string,
  rows: LocalCharacterViewRow[],
): Promise<void> {
  await getLocalDatabase().update((data) => {
    data.characterViews = [
      ...data.characterViews.filter((view) => view.characterId !== characterId),
      ...rows,
    ];
  });
}

/** 각도 한 장만 갈아 끼운다. 다시 만들기가 이 길로 온다. */
export async function upsertLocalCharacterView(row: LocalCharacterViewRow): Promise<void> {
  await getLocalDatabase().update((data) => {
    data.characterViews = [
      ...data.characterViews.filter(
        (view) => !(view.characterId === row.characterId && view.angle === row.angle),
      ),
      row,
    ];
  });
}

export function listLocalCharacters(userId: string): Promise<LocalCharacterRow[]> {
  return getLocalDatabase().read((data) =>
    data.characters
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

export function listLocalCharacterViews(userId: string): Promise<LocalCharacterViewRow[]> {
  return getLocalDatabase().read((data) => data.characterViews.filter((row) => row.userId === userId));
}

export function findLocalCharacter(
  userId: string,
  characterId: string,
): Promise<LocalCharacterRow | undefined> {
  return getLocalDatabase().read((data) =>
    data.characters.find((row) => row.userId === userId && row.id === characterId),
  );
}

export async function deleteLocalCharacter(userId: string, characterId: string): Promise<string[]> {
  return getLocalDatabase().update((data) => {
    const active=(data as unknown as {generationRuns?:Array<{id:string;user_id:string;resource_type:string|null;resource_id:string|null;state:string}>}).generationRuns?.some(run=>
      run.user_id===userId&&!['succeeded','failed','cancelled'].includes(run.state)&&(run.id===characterId||(run.resource_type==='character'&&run.resource_id===characterId)));
    if(active)throw new Error("generation_active");
    const paths = data.characterViews
      .filter((view) => view.userId === userId && view.characterId === characterId)
      .map((view) => view.path);
    data.characterViews = data.characterViews.filter(
      (view) => !(view.userId === userId && view.characterId === characterId),
    );
    data.characters = data.characters.filter(
      (row) => !(row.userId === userId && row.id === characterId),
    );
    return paths;
  });
}
