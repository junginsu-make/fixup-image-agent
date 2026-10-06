import type { ReactNode } from "react";
import { noIndexMetadata } from "../../lib/seo/metadata";

/** 비밀번호 바꾸기 화면은 검색 결과에 나올 까닭이 없다. 화면이 클라이언트 컴포넌트라 여기서 단다. */
export const metadata = noIndexMetadata("비밀번호 바꾸기");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
