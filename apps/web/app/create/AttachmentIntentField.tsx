"use client";

import { identityConflictOf } from "@fixup/pdp-core";
import type { ReferenceImage } from "@fixup/pdp-core";
import { ATTACHMENT_INTENT_MAX_LENGTH } from "@fixup/pdp-core";
import { InputLengthHint } from "./InputLengthHint";

/**
 * 「이 그림을 어떻게 쓸까요」 한 칸.
 *
 * **자리마다 따로 둔다.** 하나로 두면 어느 그림 얘기인지 모호하고, 포스터처럼
 * 첨부가 한 배열이 아니라 자리가 정해져 있으므로 자리 옆이 제자리다.
 *
 * 여기 적으면 그 자리의 고정 문구가 빠진다(설계 4-1 A안). **다른 자리는 안
 * 풀린다** — 레퍼런스에 적었다고 제품 지키기가 사라지지 않는다.
 *
 * 모듈 바깥에 둔다. 렌더 함수 안에서 만들면 글자를 칠 때마다 새 컴포넌트가 되어
 * 입력 칸이 매번 다시 붙고 커서가 튄다.
 */
export function AttachmentIntentField({
  id,
  value,
  onChange,
  placeholder,
  role,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /**
   * 이 자리가 **지켜야 할 것이 있는 자리인가**(U-18).
   *
   * 제품·인물 자리에 「색을 바꿔 주세요」를 적으면 역할 규칙이 그것을 막는다.
   * 그것 자체는 맞는데, **아무도 그 사실을 말하지 않아서** 사용자는 적었는데
   * 안 바뀐 이유를 모른 채 다시 적고 이미지 값을 또 치른다.
   *
   * 안 주면 알리지 않는다 — 옛 호출자가 엉뚱한 경고를 띄우지 않게.
   */
  role?: ReferenceImage["kind"];
}) {
  /*
    **막지 않는다. 말할 뿐이다.** 낱말 대조라 틀릴 수 있다 — 「색이 잘 나오게
    조명을 밝게」는 색을 바꾸라는 말이 아니다.
  */
  const conflict = role ? identityConflictOf(value, role) : null;

  return (
    <div>
      <label className="text-meta text-subtle-foreground" htmlFor={id}>
        이 그림을 어떻게 쓸까요 · 선택
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={ATTACHMENT_INTENT_MAX_LENGTH}
        className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]"
      />
      {/*
        서버가 막는 길이와 같다(D-8). 이 말은 그 자리의 역할 규칙을 통째로
        밀어내므로 짧게 잡는다 — 화면이 모르면 설명 없는 400 을 만난다.
      */}
      <InputLengthHint value={value} limit={ATTACHMENT_INTENT_MAX_LENGTH} />
      {conflict ? (
        <p className="mt-1 text-sm text-warning">
          {`「${conflict.matched}」을 바꿔 달라고 적으셨습니다. ${conflict.message}`}
        </p>
      ) : null}
    </div>
  );
}
