import type { ReferencePurpose } from "../api/reference-sets/schema";

export interface ReferenceImageRow {
  id: string;
  userId: string;
  storagePath: string;
  title: string | null;
  purpose: ReferencePurpose;
  width: number | null;
  height: number | null;
  createdAt: string;
}

type UploadFile = Blob & { name: string; type: string };

interface PersistReferenceInput {
  file: UploadFile;
  title: string;
  purpose: ReferencePurpose;
}

interface PersistReferenceDependencies {
  createId(): string;
  getUserId(): Promise<string>;
  /**
   * 원본을 올린다. 목록용 사본을 함께 만들었으면 그 자리를 돌려준다.
   * 못 만들었으면 `null` — 화면이 원본으로 떨어진다.
   */
  upload(path: string, file: UploadFile): Promise<string | null | void>;
  insert(row: {
    id: string;
    user_id: string;
    storage_path: string;
    thumb_path: string | null;
    title: string;
    purpose: ReferencePurpose;
  }): Promise<ReferenceImageRow>;
  remove(paths: string[]): Promise<void>;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function persistReferenceImage(
  input: PersistReferenceInput,
  dependencies: PersistReferenceDependencies,
): Promise<ReferenceImageRow> {
  const extension = EXTENSIONS[input.file.type];
  if (!extension) throw new Error("PNG, JPG, WEBP 이미지만 올릴 수 있습니다.");

  const userId = await dependencies.getUserId();
  const id = dependencies.createId();
  const storagePath = `${userId}/references/${id}.${extension}`;

  const thumbPath = (await dependencies.upload(storagePath, input.file)) ?? null;
  try {
    return await dependencies.insert({
      id,
      user_id: userId,
      storage_path: storagePath,
      thumb_path: thumbPath,
      title: input.title,
      purpose: input.purpose,
    });
  } catch (insertError) {
    try {
      await dependencies.remove([storagePath]);
    } catch (cleanupError) {
      const insertMessage = insertError instanceof Error ? insertError.message : "이미지 정보를 저장하지 못했습니다.";
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Storage 파일을 정리하지 못했습니다.";
      throw new Error(`${insertMessage} 업로드 파일(${storagePath})도 정리하지 못했습니다: ${cleanupMessage}`);
    }
    throw insertError;
  }
}
