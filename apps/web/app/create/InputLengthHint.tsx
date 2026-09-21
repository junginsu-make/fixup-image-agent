"use client";

/**
 * 이 칸이 **얼마나 남았는지** 보여준다(U-08).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *
 * 전에는 화면에 제한이 없었다. 사용자는 얼마든지 적고, 그 뒤에 값이 **말없이
 * 잘리거나** 「요청이 올바르지 않습니다」 한 줄을 만났다 — 어느 칸이 왜 걸렸는지
 * 아무 말도 없이.
 *
 * **평소에는 안 보인다.** 모든 칸에 「0/500」이 떠 있으면 아무도 안 읽는다.
 * 가까워졌을 때만 나온다.
 */

export function InputLengthHint({ value, limit }: { value: string; limit: number }) {
  const 길이 = value.length;
  // 8할을 넘겨야 보인다. 그 전에는 알려 줄 것이 없다.
  if (길이 < limit * 0.8) return null;

  const 넘침 = 길이 > limit;
  return (
    <p className={넘침 ? "mt-0.5 text-sm text-warning" : "mt-0.5 text-sm text-muted-foreground"}>
      {넘침
        ? `${길이}자 / ${limit}자까지. ${길이 - limit}자를 줄여 주세요.`
        : `${길이}자 / ${limit}자`}
    </p>
  );
}
