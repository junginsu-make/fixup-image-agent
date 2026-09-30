/**
 * Next 가 서버를 켤 때 한 번 부른다. **기다리지 않는다** — 정리가 늦거나 실패해도 기동은
 * 계속한다(배포 건강 확인은 40초 안에 끝나야 한다).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { closeRestartOrphans } = await import("./lib/runtime/restart-orphans");
  void closeRestartOrphans();
}
