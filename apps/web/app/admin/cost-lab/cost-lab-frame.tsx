"use client";

import * as React from "react";

/**
 * 비용 전략실이 열리는 창.
 *
 * **왜 창(iframe)인가.** 도구가 body·button·table 같은 일반 선택자로 CSS 를
 * 건다. 앱 안에 그대로 풀면 사이드바와 다른 화면까지 함께 물든다. 창 안에 두면
 * 격리가 공짜로 따라오고, 겉모습은 라우트가 시스템 토큰을 넣어 맞춘다.
 *
 * **테마는 부모가 알려 준다.** 창 안은 다른 문서라 `<html class="dark">` 가
 * 안 내려간다. `next-themes` 를 직접 부르지 않는다 — 그러면 테마를 정하는
 * 주인이 둘이 된다. 이 화면은 정하지 않고 `<html>` 에 실제로 붙은 것을 본다.
 *
 * **높이를 재서 채운다.** 「대시보드 안에 또 대시보드」로 보이던 까닭의 절반이
 * 여백이었다 — 아래로 44px 이 남고 스크롤 막대가 둘이 됐다(2026-09-11 운영자
 * 지적). 셸의 머리말 높이를 상수로 적으면 그 값이 바뀌는 날 어긋나므로,
 * **제 자리를 재서** 화면 끝까지 채운다.
 */
export function CostLabFrame() {
  const box = React.useRef<HTMLDivElement | null>(null);
  const frame = React.useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  const send = React.useCallback(() => {
    const dark = document.documentElement.classList.contains("dark");
    frame.current?.contentWindow?.postMessage(
      { type: "mcs-theme", theme: dark ? "dark" : "light" },
      window.location.origin,
    );
  }, []);

  /*
    제 위쪽 끝을 재서 남은 높이를 준다. 높이는 위쪽 끝에 영향을 주지 않으므로
    (일반 흐름의 블록이다) 서로 물고 도는 일이 없다.
  */
  const fit = React.useCallback(() => {
    const top = box.current?.getBoundingClientRect().top ?? 0;
    setHeight(Math.max(420, Math.round(window.innerHeight - top)));
  }, []);

  React.useEffect(() => {
    fit();
    send();
    window.addEventListener("resize", fit);
    // 사용자가 해·달 단추를 누르면 `<html>` 의 class 가 바뀐다. 그것만 본다.
    const watch = new MutationObserver(send);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.removeEventListener("resize", fit);
      watch.disconnect();
    };
  }, [fit, send]);

  return (
    /*
      **셸의 여백을 되돌려 화면 끝까지 쓴다.** 도구는 1536px 를 보고 만들어졌고
      내용이 많다. 바깥 여백(좌우 clamp(16px,2.2vw,52px) · 위 16px · 아래 24px)을
      그대로 두면 볼 수 있는 넓이가 그만큼 준다.
    */
    <div
      ref={box}
      style={height ? { height } : undefined}
      className="-mx-[clamp(16px,2.2vw,52px)] -mb-6 -mt-4"
    >
      <iframe
        ref={frame}
        /*
          주소에 테마를 안 싣는다. 실으면 테마를 바꿀 때마다 창이 다시 떠서
          입력하던 조건이 날아간다. 뜨는 즉시 메시지로 맞춘다.
        */
        src="/admin/cost-lab/doc/index.html"
        title="비용 전략실"
        onLoad={send}
        className="block h-full w-full border-0"
      />
    </div>
  );
}
