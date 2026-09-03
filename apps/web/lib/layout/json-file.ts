import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 로컬 개발용 JSON 저장. 뼈대와 세트가 같이 쓴다.
 *
 * 두 가지를 지킨다.
 *
 * **「없다」와 「깨졌다」를 가른다.** 깨진 파일을 「아직 아무도 저장 안 함」으로
 * 삼키면 다음 저장이 그 위를 덮어 사람이 저장해 둔 것이 통째로 사라진다.
 *
 * **임시 파일에 쓰고 옮겨 붙인다.** 쓰다가 죽으면 반쯤 쓰인 파일이 남는데,
 * 그걸 다음에 읽으면 위의 「깨짐」이 된다.
 */

export async function readJsonRows<T>(target: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`저장 파일이 목록이 아닙니다: ${path.basename(target)}`);
  return parsed as T[];
}

export async function writeJsonRows<T>(target: string, rows: T[]): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.writing`;
  await writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
