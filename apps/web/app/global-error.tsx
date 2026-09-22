"use client";

import Link from "next/link";

/**
 * 어디서든 예상 못 한 오류가 나면 뜨는 화면.
 *
 * 전에는 이 파일이 없어서 Next 기본 화면(「Application error: a server-side
 * exception …」)이 영어로 떴다. 운영 빌드는 오류의 글을 가리므로 여기서도 원인은
 * 못 보여 준다 — 대신 **오류 번호(Digest)를 보여 주고 그 번호를 알려 달라고 한다.**
 * 그 번호로 서버 기록에서 원인을 바로 찾는다(2026-09-22 팀 빼기 오류가 그렇게 찾아졌다).
 *
 * 레이아웃까지 무너졌을 때도 뜨는 화면이라 `<html>`·`<body>` 를 스스로 그리고,
 * 디자인 부품에 기대지 않는다.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "Pretendard, 'Apple SD Gothic Neo', sans-serif", background: "#faf8f5", color: "#1f1d1a" }}>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: "0 20px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 12px" }}>문제가 생겼습니다</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" }}>
            잠시 후 다시 시도해 주세요. 계속되면 아래 오류 번호를 운영자에게 알려 주세요. 번호로 원인을 바로 찾을 수 있습니다.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 14, margin: "0 0 20px" }}>
              오류 번호 <code style={{ userSelect: "all", background: "#efe9e1", padding: "2px 6px", borderRadius: 4 }}>{error.digest}</code>
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={reset} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #c9bfb3", background: "#fff", cursor: "pointer" }}>다시 시도</button>
            <Link href="/" style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #c9bfb3", color: "inherit", textDecoration: "none" }}>처음으로</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
