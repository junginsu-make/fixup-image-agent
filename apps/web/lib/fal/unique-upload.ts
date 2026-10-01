/** 같은 배치의 동일 키를 한 번만 업로드하고 URL을 재사용한다. */
export async function uploadUniqueReferences<T>(
  items: T[],
  keyOf: (item: T) => string,
  upload: (item: T) => Promise<string>,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const item of items) {
    const key = keyOf(item);
    if (urls[key] === undefined) urls[key] = await upload(item);
  }
  return urls;
}
