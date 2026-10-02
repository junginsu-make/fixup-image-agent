/** 회원별로 하나의 조회만 실행한다. 요청 중 변경은 마지막 재조회까지 기다린다. */
export function createAccountRefresh<T>(options: {
  read(signal: AbortSignal): Promise<T>; accept(value: T): void;
  fail(error: unknown): void; pending(value: boolean): void;
}) {
  let generation = 0, running = false, disposed = false, denied = false;
  let nextAt = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  let waiters: Array<() => void> = [];
  const finish = () => { options.pending(false); const pending = waiters; waiters = []; pending.forEach(resolve => resolve()); };
  function schedule(immediate = false) {
    if (disposed || denied || running) return;
    if (timer) clearTimeout(timer);
    const delay = immediate ? 0 : Math.max(0, nextAt - Date.now());
    if (!delay) void run();
    else timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  }
  async function run() {
    if (disposed || denied) return;
    running = true;
    options.pending(true);
    const started = generation;
    abort = new AbortController();
    nextAt = Date.now() + 1000;
    let failed = false;
    try {
      const value = await options.read(abort.signal);
      if (!disposed && started === generation) options.accept(value);
    } catch (error) {
      if (!disposed) {
        failed = true;
        denied = [401, 403].includes((error as { status?: number })?.status ?? 0);
        nextAt = Date.now() + 60_000;
        options.fail(error);
      }
    } finally {
      running = false;
      if (disposed) return;
      if (!failed && generation !== started) schedule();
      else finish();
    }
  }
  return {
    request(immediate = false): Promise<void> {
      if (disposed || denied) return Promise.resolve();
      generation += 1;
      const done = new Promise<void>(resolve => waiters.push(resolve));
      schedule(immediate);
      return done;
    },
    dispose() {
      disposed = true; if (timer) clearTimeout(timer); abort?.abort();
      const pending = waiters; waiters = []; pending.forEach(resolve => resolve());
    },
  };
}
