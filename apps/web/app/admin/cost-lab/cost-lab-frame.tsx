"use client";

import * as React from "react";

/**
 * 비용 전략실이 열리는 창.
 *
 * **왜 창(`iframe`)인가.** 도구가 `body`·`button`·`table` 같은 일반 선택자로
 * CSS 를 건다. 앱 안에 그대로 풀면 사이드바와 다른 화면까지 함께 물든다.
 * 창 안에 두면 격리가 공짜로 따라오고, 겉모습은 라우트가 시스템 토큰을 넣어
 * 맞춘다.
 *
 * **테마는 부모가 알려 준다.** 창 안은 다른 문서라 `<html class="dark">` 가
 * 안 내려간다.
 *
 * `next-themes` 를 직접 부르지 않는다. 그것은 `@fixup/ui` 의 의존성이라
 * 여기서 부르면 의존성이 하나 늘고, 무엇보다 **테마를 정하는 주인이 둘이
 * 된다.** 이 화면은 정하지 않고 **`<html>` 에 실제로 붙은 것을 본다** —
 * 그 표시가 결과이므로 어긋날 여지가 없다.
 */
export function CostLabFrame() {
  const frame = React.useRef<HTMLIFrameElement | null>(null);

  const send = React.useCallback(() => {
    const dark = document.documentElement.classList.contains("dark");
    frame.current?.contentWindow?.postMessage(
      { type: "mcs-theme", theme: dark ? "dark" : "light" },
      window.location.origin,
    );
  }, []);

  React.useEffect(() => {
    send();
    // 사용자가 해·달 단추를 누르면 `<html>` 의 class 가 바뀐다. 그것만 본다.
    const watch = new MutationObserver(send);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => watch.disconnect();
  }, [send]);

  return (
    <iframe
      ref={frame}
      /*
        주소에 테마를 안 싣는다. 실으면 테마를 바꿀 때마다 창이 다시 떠서
        **입력하던 조건이 날아간다.** 뜨는 즉시 메시지로 맞춘다.
      */
      src="/admin/cost-lab/doc/index.html"
      title="비용 전략실"
      onLoad={send}
      className="h-[calc(100vh-13rem)] min-h-[32rem] w-full rounded-xl border bg-card"
    />
  );
}
