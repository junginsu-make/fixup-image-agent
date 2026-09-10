/**
 * WebGL 잔손질. 셰이더 컴파일·그물 만들기·텍스처 올리기.
 *
 * 그리는 판단(`arc-layout`·`drag-physics`·`wave`)과 **그리는 손놀림**을 갈라
 * 둔다. 이 파일은 판단하지 않는다.
 */

export interface PlaneGeometry {
  position: WebGLBuffer;
  uv: WebGLBuffer;
  index: WebGLBuffer;
  count: number;
}

export function compile(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("셰이더를 만들지 못했습니다.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`셰이더 컴파일 실패: ${log}`);
  }
  return shader;
}

export function link(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("프로그램을 만들지 못했습니다.");
  gl.attachShader(program, compile(gl, vertex, gl.VERTEX_SHADER));
  gl.attachShader(program, compile(gl, fragment, gl.FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`프로그램 링크 실패: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

/**
 * 판 하나를 **격자로 쪼갠 그물**로 만든다.
 *
 * 물결의 전제다. 사각형 두 개짜리 판은 아무리 밀어도 접힌 종이처럼 꺾인다.
 * 가로를 촘촘히(48), 세로는 성기게(16) 나눈다 — 물결이 가로로 지나가므로
 * 가로 해상도가 곡선의 매끄러움을 정한다.
 */
export function createPlane(gl: WebGLRenderingContext, cols = 48, rows = 16): PlaneGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= cols; x += 1) {
      const u = x / cols;
      const v = y / rows;
      positions.push(u - 0.5, 0.5 - v);
      uvs.push(u, v);
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const a = y * (cols + 1) + x;
      const b = a + 1;
      const c = a + (cols + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    position: bufferOf(gl, new Float32Array(positions), gl.ARRAY_BUFFER),
    uv: bufferOf(gl, new Float32Array(uvs), gl.ARRAY_BUFFER),
    index: bufferOf(gl, new Uint16Array(indices), gl.ELEMENT_ARRAY_BUFFER),
    count: indices.length,
  };
}

function bufferOf(gl: WebGLRenderingContext, data: BufferSource, target: number): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("버퍼를 만들지 못했습니다.");
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

/** 아직 안 올라온 이미지 자리를 채울 한 픽셀. 없으면 검은 판이 번쩍인다. */
export function createPlaceholderTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("텍스처를 만들지 못했습니다.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([26, 26, 30, 255]),
  );
  return texture;
}

/**
 * 이미지를 텍스처로 올린다.
 *
 * 2의 거듭제곱이 아닌 크기(우리 결과물은 1232×2192 같은 값이다)는 밉맵을 못
 * 쓴다. `CLAMP_TO_EDGE` + `LINEAR` 로 못 박지 않으면 **화면이 통째로 검게**
 * 나온다 — WebGL1 의 오래된 함정이다.
 */
export function uploadTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("텍스처를 만들지 못했습니다.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // UV 의 위쪽이 v=0 이다. 여기서 뒤집으면 그림이 거꾸로 선다 — 실제로 그랬다.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}
