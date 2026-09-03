import { ExternalLink, Search } from "lucide-react";

/**
 * 레퍼런스 찾기 — 핀터레스트로 나간다.
 *
 * 만들기 전에 참고할 그림을 찾는 일이 잦은데, 그때마다 새 탭을 열고 주소를
 * 치고 있었다. 상단에 고정해 두면 어느 화면에서든 한 번에 간다.
 *
 * **색을 다르게 쓴다.** 이 화면의 강조색(자미)은 「만들기」처럼 이 앱 안에서
 * 무언가를 일으키는 버튼의 색이다. 이건 앱 밖으로 나가는 문이라 같은 색이면
 * 안에서 무슨 일이 일어나는 줄 안다. 청록은 크림 바탕에서 눈에 띄면서
 * 상태색(성공 초록·경고 호박)과도 겹치지 않는다.
 *
 * 새 탭으로 연다. 만들던 것을 두고 나가면 그때까지 채운 칸이 사라진다.
 * `noreferrer` 는 나가는 쪽에 우리 주소를 넘기지 않는다.
 */
export function ReferenceHuntButton() {
  return (
    <a
      href="https://kr.pinterest.com/"
      target="_blank"
      rel="noreferrer noopener"
      className="
        inline-flex h-9 flex-none items-center gap-1.5 rounded-md px-3 text-sm font-bold
        bg-[#12706E] text-white shadow-[0_0_0_1px_rgba(18,112,110,0.35)]
        transition-colors hover:bg-[#0d5b59]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12706E] focus-visible:ring-offset-2
        dark:bg-[#3AA6A0] dark:text-[#0d1b17] dark:hover:bg-[#4cbcb5]
      "
    >
      <Search className="size-4" aria-hidden />
      레퍼런스 찾기
      <ExternalLink className="size-3 opacity-70" aria-hidden />
      <span className="sr-only">(새 탭에서 핀터레스트가 열립니다)</span>
    </a>
  );
}
