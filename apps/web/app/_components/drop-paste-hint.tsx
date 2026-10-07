import { cn } from "@fixup/ui";
import { DROP_PASTE_HINT } from "./image-drop";

/**
 * 그림 칸 옆의 안내 — **모든 칸이 같은 말로**(2026-10-07 사용자 요청: 모두 동일하게).
 *
 * 잠긴 칸에서는 말하지 않는다. 받지 않는데 받는다고 하면 안 된다. 칸을 눌러 두면
 * 「지금 붙여넣을 수 있습니다」가 붙는다 — 칸에 `group` 이 있어야 한다.
 */
export function DropPasteHint({ locked, className }: { locked: boolean; className?: string }) {
  if (locked) return null;
  return (
    <p className={cn("text-[11px] leading-snug text-subtle-foreground", className)}>
      {DROP_PASTE_HINT}
      <span className="ml-1 hidden font-bold text-primary group-focus-within:inline">· 지금 붙여넣을 수 있습니다</span>
    </p>
  );
}
