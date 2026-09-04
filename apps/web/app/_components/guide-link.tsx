import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Button } from "@fixup/ui";

/**
 * 상단의 이용 안내 버튼.
 *
 * 전에는 여기에 모달로 안내를 다 담았다. 그런데 도구가 늘면서 모달에 없는
 * 도구가 생겼고(카드뉴스·이미지 만들기·수집), 설정 항목을 짚어 줄 자리도
 * 없었다. 같은 설명을 두 곳에 두면 반드시 한쪽만 고치게 된다.
 *
 * 이제 안내는 `/guide` 한 곳에 있다. 이 버튼은 거기로 가는 문이다.
 */
export function GuideLink() {
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" asChild>
      <Link href="/guide">
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">이용 안내</span>
      </Link>
    </Button>
  );
}
