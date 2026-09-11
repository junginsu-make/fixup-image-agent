import type { ImageLook } from "@fixup/shared";
import type { Model, Project } from "./redesign-model";

/**
 * 같은 요청인가, 다른 요청인가.
 *
 * 서버는 **멱등 키**로 중복을 막는다. 같은 키로 두 번 오면 두 번째를
 * 「이미 처리된 요청」으로 돌려보낸다. 그래서 이 값이 중요하다.
 *
 *   · 너무 **넓으면**(값이 잘 안 바뀌면) — 설정을 바꿔 다시 눌러도 서버가 같은
 *     요청으로 보고 막는다. 사용자는 왜 안 되는지 모른다.
 *   · 너무 **좁으면**(값이 자꾸 바뀌면) — 실패해서 다시 누를 때마다 새 요청이
 *     되어 **돈이 두 번 나간다.**
 *
 * 실제로 한 번 좁게 틀렸었다 — `look`(그림의 결)이 빠져 있어서, 실패 후 결만
 * 바꿔 다시 누르면 같은 키로 나갔고 서버가 같은 요청으로 봤다.
 *
 * **화면에서 떼어 낸 이유가 그것이다.** 컴포넌트 안에 있으면 값으로 잴 수 없고,
 * 틀려도 화면은 멀쩡히 돌아간다.
 */
export interface RequestIdentityInput {
  model: Model;
  startSection: number;
  count: number;
  /** 이어 만드는 중이면 그 작업. 처음이면 없다. */
  baseProject?: Pick<Project, "id"> | null;
  channel: string;
  ratio: string;
  look: ImageLook | string;
  request: string;
  rolloutRequest: string;
  /** 올린 파일. 이름과 크기만 본다 — 내용을 읽지 않고도 바뀐 것을 안다. */
  files: Array<{ name: string; size: number }>;
}

export function requestIdentityOf(input: RequestIdentityInput): string {
  return [
    "generate",
    input.model,
    input.startSection,
    input.count,
    input.baseProject?.id || "new",
    input.channel,
    input.ratio,
    input.look,
    input.request,
    input.rolloutRequest,
    input.files.map((file) => `${file.name}:${file.size}`).join(","),
  ].join("|");
}
