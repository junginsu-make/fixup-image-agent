import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { PhoneField } from "../phone-field";
import { PHONE_CONSENT } from "../../../lib/membership/phone";

/**
 * **전화번호 칸은 선택이라는 것이 분명히 보여야 한다**(2026-10-02 사용자 요청: 「선택적으로
 * 입력하게 확실히 표시하세요. 필수는 아닙니다」). 번호를 적은 사람에게만 선택 동의를 묻는다.
 */
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });

function Harness({ initial = "", saved = null }: { initial?: string; saved?: string | null }) {
  const [phone, setPhone] = React.useState(initial);
  const [consent, setConsent] = React.useState(false);
  return <PhoneField id="phone" phone={phone} onPhone={setPhone} consent={consent} onConsent={setConsent} savedPhone={saved} />;
}
const text = () => JSON.stringify(tree.toJSON());
const checkboxes = () => tree.root.findAllByType("input").filter((x) => x.props.type === "checkbox");
const phoneInput = () => tree.root.findAllByType("input").find((x) => x.props.id === "phone")!;
const type = (value: string) => act(() => { phoneInput().props.onChange({ target: { value } }); });

describe("전화번호 칸", () => {
  it("이름표에 「선택」을 붙이고, 칸은 필수가 아니다", () => {
    act(() => { tree = create(<Harness />); });
    expect(text()).toContain("휴대폰 또는 전화번호");
    expect(text()).toContain("선택");
    const input = phoneInput();
    expect(input.props.required).toBeFalsy();
    expect(input.props.type).toBe("tel");
  });

  it("비어 있으면 동의 칸을 보이지 않는다", () => {
    act(() => { tree = create(<Harness />); });
    expect(checkboxes()).toHaveLength(0);
  });

  it("번호를 적으면 목적·항목·보유기간·거부 안내와 함께 선택 동의 칸이 나온다", () => {
    act(() => { tree = create(<Harness />); });
    type("010-1234-5678");
    expect(checkboxes()).toHaveLength(1);
    expect(checkboxes()[0].props.required, "번호를 적었으면 동의해야 저장된다").toBe(true);
    for (const words of [PHONE_CONSENT.purpose, PHONE_CONSENT.items, PHONE_CONSENT.retention, PHONE_CONSENT.refusal, "[선택]"]) {
      expect(text()).toContain(words);
    }
    type("");
    expect(checkboxes()).toHaveLength(0);
  });

  it("이미 동의하고 저장한 번호 그대로면 다시 묻지 않는다", () => {
    act(() => { tree = create(<Harness initial="010-1234-5678" saved="010-1234-5678" />); });
    expect(checkboxes()).toHaveLength(0);
    type("010-9999-8888");
    expect(checkboxes()).toHaveLength(1);
  });
});
