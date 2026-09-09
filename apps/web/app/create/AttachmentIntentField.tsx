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
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
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
        className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-subtle-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]"
      />
    </div>
  );
}
