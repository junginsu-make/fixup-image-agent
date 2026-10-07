import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * **「대화를 찾을 수 없습니다.」는 이름 붙은 오류다**(2026-10-07 후속 Task 1). 라우트가 예상 못 한
 * 오류의 원문을 가리면서도 이 안내만은 알아보고 그대로 보이게 한다.
 */

vi.mock("server-only", () => ({}));

const root = mkdtempSync(path.join(tmpdir(), "easy-store-"));
vi.stubEnv("LOCAL_STORE", "1");
vi.stubEnv("LOCAL_STORE_ROOT", root);

const { easyStoreForUser } = await import("../store");
const { EasyConversationMissingError } = await import("../store-core");

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("파일 저장소 — 남의 대화에 줄 남기기", () => {
  it("EasyConversationMissingError 로 막는다 (글은 지금과 같다)", async () => {
    const 남의대화 = await easyStoreForUser("other-1").createConversation("남의 것");
    const 던진것 = await easyStoreForUser("me-1")
      .appendMessage({ conversationId: 남의대화.id, role: "user", body: "안녕" })
      .catch((error: unknown) => error);
    expect(던진것).toBeInstanceOf(EasyConversationMissingError);
    expect((던진것 as Error).message).toBe("대화를 찾을 수 없습니다.");
  });
});
