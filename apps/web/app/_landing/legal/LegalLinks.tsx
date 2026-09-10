"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LEGAL_DOCS, type LegalDoc } from "./documents";
import { parseLegal } from "./render";

/**
 * 푸터의 법률 문서 링크와 모달.
 *
 * 대한민국에서 상용 서비스는 **이용약관과 개인정보 처리방침을 이용자가 언제든
 * 볼 수 있게** 두어야 한다(전자상거래법·개인정보보호법). 그래서 첫 화면에서
 * 늘 닿는 자리인 푸터에 둔다.
 *
 * 새 창이 아니라 모달인 이유는 하나다 — 읽고 닫으면 보던 자리로 돌아온다.
 * 다만 **주소도 함께 남긴다**(`#terms`·`#privacy`): 링크로 건네줄 데가 없으면
 * "약관 어디 있냐"는 물음에 화면을 찍어 보낼 수밖에 없다.
 */
export function LegalLinks() {
  const [open, setOpen] = useState<LegalDoc | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(null);
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    // 열기 전에 보던 자리로 초점을 돌려준다. 안 돌리면 페이지 맨 위로 튄다.
    lastFocused.current?.focus();
  }, []);

  const show = (doc: LegalDoc) => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    setOpen(doc);
    history.replaceState(null, "", `#${doc.id}`);
  };

  /* 주소로 바로 들어온 사람에게도 열어 준다. */
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const doc = LEGAL_DOCS.find((entry) => entry.id === hash);
    if (doc) setOpen(doc);
  }, []);

  /* Esc 로 닫는다. 모달을 열어 두고 갇히면 안 된다. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // 뒤 화면이 같이 스크롤되면 읽던 자리를 잃는다.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  return (
    <>
      <span className="mcs-legal-links">
        {LEGAL_DOCS.map((doc) => (
          <button key={doc.id} type="button" onClick={() => show(doc)}>
            {doc.title}
          </button>
        ))}
      </span>

      {open ? (
        <div
          className="mcs-legal-backdrop"
          role="presentation"
          onClick={(event) => {
            // 바깥을 눌러도 닫힌다. 안쪽 글을 끌어 고르는 것과는 구분한다.
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="mcs-legal-modal" role="dialog" aria-modal="true" aria-label={open.title}>
            <header>
              <h2>{open.title}</h2>
              <button type="button" onClick={close} aria-label="닫기" ref={closeRef}>
                <X size={18} strokeWidth={1.8} aria-hidden />
              </button>
            </header>

            <div className="mcs-legal-body">
              <LegalBody doc={open} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <>
      {parseLegal(doc.body).map((block, index) => {
        if (block.kind === "heading") {
          // 문서의 맨 위 제목은 모달 머리가 이미 말한다. 한 단씩 낮춰 단다.
          if (block.level === 1) return <h3 key={index}>{block.text}</h3>;
          return block.level === 2 ? <h4 key={index}>{block.text}</h4> : <h5 key={index}>{block.text}</h5>;
        }

        if (block.kind === "list") {
          return (
            <ul key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.kind === "table") {
          return (
            // 좁은 화면에서 표가 화면을 넘치면 가로로만 스크롤한다.
            <div className="mcs-legal-table" key={index}>
              <table>
                <thead>
                  <tr>
                    {block.head.map((cell, i) => (
                      <th key={i}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={index}>{block.text}</p>;
      })}
    </>
  );
}
