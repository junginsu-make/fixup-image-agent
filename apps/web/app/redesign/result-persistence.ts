/** 두 저장소는 독립적이다. 한쪽 실패 때문에 다른 사본까지 잃지 않는다. */
export async function persistRedesignResult(
  saveLocal: () => Promise<void>,
  saveLibrary: () => Promise<Response>,
): Promise<{ localSaved: boolean; librarySaved: boolean }> {
  const [local, library] = await Promise.allSettled([
    Promise.resolve().then(saveLocal), Promise.resolve().then(saveLibrary),
  ]);
  return { localSaved: local.status === "fulfilled", librarySaved: library.status === "fulfilled" && library.value.ok };
}
