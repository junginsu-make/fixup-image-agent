const locks = new Map<string, Promise<void>>();

/** 같은 웹 프로세스에서 두 탭의 폴링이 다음 카드를 중복 제출하지 않게 직렬화한다. */
export async function withSnsProjectLock<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  locks.set(projectId, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(projectId) === tail) locks.delete(projectId);
  }
}
