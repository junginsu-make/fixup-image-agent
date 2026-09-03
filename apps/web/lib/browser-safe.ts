/**
 * 보안 컨텍스트가 아니어도 되는 것들.
 *
 * 브라우저는 몇몇 기능을 **HTTPS 나 localhost 에서만** 켜 준다. 도메인 없이
 * IP 로 열면(`http://54.180.68.212`) 그 기능들이 아예 없다. 있는 줄 알고 부르면
 * 이렇게 죽는다.
 *
 *   crypto.randomUUID is not a function
 *
 * 참고 이미지 올리기가 그 자리에서 멈췄다. 화면 여러 곳이 같은 것을 쓴다 —
 * 그림 올리기 여덟 곳, 복사하기 세 곳.
 *
 * 대신할 방법이 둘 다 있으므로 여기서 한 번만 가른다.
 */

/**
 * 새 id.
 *
 * `randomUUID` 가 없으면 `getRandomValues` 로 만든다. 그건 보안 컨텍스트가
 * 아니어도 있고, 그냥 난수가 아니라 암호학적으로 안전한 난수다.
 *
 * 둘 다 없으면 알린다. `Math.random` 으로 대충 만들면 나중에 충돌로 드러나는데,
 * 그때는 원인을 찾을 수 없다.
 */
export function randomId(source: Crypto = globalThis.crypto): string {
  if (typeof source?.randomUUID === "function") return source.randomUUID();

  if (typeof source?.getRandomValues !== "function") {
    throw new Error("이 브라우저에서는 새 id 를 만들 수 없습니다.");
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  // UUID 4판의 표식. 판 번호와 변형 자리를 규격대로 박는다.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
  ].join("-");
}

/** 화면에서 안 보이는 칸에 넣고 옛 방식으로 복사한다. */
function copyViaTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;
  const field = document.createElement("textarea");
  field.value = text;
  // 화면 밖에 두되 focus 는 받아야 한다. display:none 이면 복사가 안 된다.
  field.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * 복사하기.
 *
 * `navigator.clipboard` 도 보안 컨텍스트 전용이다. 있어도 창이 포커스를
 * 잃었거나 권한이 없으면 거부한다. 그때도 옛 방식으로 넘어간다.
 */
export async function copyText(
  text: string,
  target: Navigator = globalThis.navigator,
  fallback: (text: string) => boolean = copyViaTextarea,
): Promise<boolean> {
  if (typeof target?.clipboard?.writeText === "function") {
    try {
      await target.clipboard.writeText(text);
      return true;
    } catch {
      // 아래로 넘어간다.
    }
  }
  return fallback(text);
}
