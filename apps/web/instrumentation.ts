/**
 * Next 가 서버를 켤 때 한 번 부른다. **기다리지 않는다** — 정리가 늦거나 실패해도 기동은
 * 계속한다(배포 건강 확인은 40초 안에 끝나야 한다).
 *
 * Next 문서가 쓰는 그대로 `if (NEXT_RUNTIME === "nodejs")` 로 감싼다(early return 대신) —
 * https://nextjs.org/docs/app/guides/instrumentation 의 권장 형태. `node:` 전용 모듈은
 * 이 안에서 부르는 `restart-orphans.ts`·`boot-id.ts` 쪽에서 이미 전역 Web Crypto 와
 * `isLocalStoreEnabled` 복제로 피해 뒀다(build fix, 시험 서버 실측).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { closeRestartOrphans } = await import("./lib/runtime/restart-orphans");
    void closeRestartOrphans();
  }
}
