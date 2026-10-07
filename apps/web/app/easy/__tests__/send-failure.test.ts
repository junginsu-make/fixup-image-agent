import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerableAskId } from "../ask-chain";
import { NO_IMAGE_MADE, STILL_MAKING } from "../collect";
import { askBody, withPick } from "../row-marks";
import { keptAfterFailure, lostAfterFailure } from "../send-failure";
import type { EasyMessage } from "../turn";

/**
 * **서버가 받은 턴의 받기 실패**(2차 Task 5 리뷰). 서버가 그림 줄을 남기고 값을 잡은 뒤 받기만 실패하면
 * 화면도 그 그림 자리를 남긴다. 빼면 화면 꼬리가 [물음, 단추 답] 이 되어 물음 단추가 다시 뜨고, 다시
 * 누르면 서버는 새 말로 보아(서버 꼬리는 [물음, 답, 그림 줄]) 값이 또 나갈 수 있다(1차 STILL_MAKING 보호).
 */
const 물음: EasyMessage = { id: "q1", role: "assistant", body: askBody("ratio", "어떤 모양으로 만들까요?", { wants: "image" }) };
const 답: EasyMessage = { id: "user-pending-1", role: "user", body: withPick("이대로 만들기", { ratio: "1:1" }) };
const 자리: EasyMessage = { id: "pending-1", role: "image", body: "" };

describe("보낸 턴이 실패했을 때 화면에 남는 것", () => {
  it("서버가 받은 뒤 받기가 실패하면 그림 자리를 남기고 실패로 적는다 — 물음 단추가 다시 안 뜬다", () => {
    for (const 까닭 of [STILL_MAKING, NO_IMAGE_MADE]) {
      const 줄 = keptAfterFailure([물음, 답, 자리], "pending-1", true);
      expect(줄).toEqual([물음, 답, 자리]);
      expect(lostAfterFailure({}, "pending-1", true, 까닭)).toEqual({ "pending-1": 까닭 });
      expect(answerableAskId(줄)).toBeUndefined();
    }
  });

  it("서버가 받기 전의 실패는 그림 자리를 빼고 실패로 안 적는다 — 서버의 실패 줄과 같게 단추를 다시 단다", () => {
    const 줄 = keptAfterFailure([물음, 답, 자리], "pending-1", false);
    expect(줄).toEqual([물음, 답]);
    expect(lostAfterFailure({ a: "x" }, "pending-1", false, NO_IMAGE_MADE)).toEqual({ a: "x" });
    expect(answerableAskId(줄)).toBe("q1");
  });

  it("받은 것 표시는 그림 자리를 잡은 뒤, 받기 앞에서 켠다", () => {
    const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
    const 자리잡기 = 화면.indexOf('setMessages((current) => [...current, { id: 자리, role: "image", body: "" }]);');
    const 받음 = 화면.indexOf("받음 = true;");
    expect(자리잡기).toBeGreaterThan(0);
    expect(받음).toBeGreaterThan(자리잡기);
    expect(받음).toBeLessThan(화면.indexOf("await collectEasyImage("));
    expect(화면).toContain("setMessages((current) => keptAfterFailure(current, 자리, 받음));");
    expect(화면).toContain("setLost((current) => lostAfterFailure(current, 자리, 받음, 까닭));");
    expect(화면).not.toContain("current.filter((one) => one.id !== 자리)");
  });
});
