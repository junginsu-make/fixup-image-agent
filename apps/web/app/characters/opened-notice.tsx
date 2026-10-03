import type { OpenedFrontState } from "./use-opened-character";

/**
 * 연 캐릭터의 값을 가져왔다는 안내. 다양하게(`poster/new-client.tsx:547-550`)의
 * 「값을 가져왔습니다」와 같은 자리·같은 말투다.
 */
export function OpenedNotice({ name, front }: { name: string; front: OpenedFrontState }) {
  return (
    <div role="status" className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
      <b>「{name || "이름 없는 캐릭터"}」</b> 의 값을 가져왔습니다. 고쳐서 만들면
      <b> 새 캐릭터</b>가 하나 더 생기고 원래 캐릭터는 그대로 남습니다. 정면을 그대로 두고
      각도를 고르면, 고르지 않은 각도는 원래 캐릭터에서 옮겨 담습니다.
      <span className="mt-1 block text-xs text-muted-foreground">
        이름에는 원래 캐릭터와 섞이지 않게 「(수정본)」을 붙였습니다.
        처음에 붙였던 참고 그림과 고른 모델은 저장되지 않아 비어 있습니다.
        {front === "missing"
          ? " 정면 그림을 불러오지 못해 설정만 채웠습니다. 「정면 만들기」로 다시 시작하세요."
          : " 필요하면 「설정 고치기」에서 다시 고르세요."}
      </span>
    </div>
  );
}
