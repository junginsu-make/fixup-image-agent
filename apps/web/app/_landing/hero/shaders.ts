import {
  FALLOFF_PER_UNIT,
  MAX_FALLOFF,
  RIPPLE_FREQUENCY,
  WAVE_FREQUENCY,
  WAVE_SPEED,
} from "./wave";

/**
 * 판 하나를 그리는 셰이더.
 *
 * 판은 평평한 사각형이 아니라 **잘게 쪼갠 그물**이다(가로 48칸). 그래야
 * 정점을 하나씩 밀어 물결을 만들 수 있다. 사각형 두 개짜리 판으로는 아무리
 * 밀어도 접힌 종이처럼 꺾일 뿐이다.
 *
 * 얼마나 휠지는 `wave.ts` 가 정해서 `uBend` 로 넘겨준다. 여기서는 **받은 대로
 * 밀기만 한다** — GLSL 은 시험으로 못 재기 때문이다.
 */

export const VERTEX_SHADER = `
attribute vec2 aPosition;
attribute vec2 aUv;

uniform mat4 uProjection;
uniform mat4 uModel;
uniform float uBend;
uniform float uTime;
uniform float uIdle;
uniform float uArcOffset;
uniform float uWidth;

varying vec2 vUv;
varying float vDepth;

void main() {
  vec3 pos = vec3(aPosition, 0.0);

  /*
    이 점이 **고리 위 어디인가.** 판 안 좌표가 아니라 이 값으로 파형을 계산해야
    파도가 이미지 경계를 넘어 이어진다. 판 안 좌표를 쓰면 판마다 파형이 처음부터
    다시 시작해 열두 장이 각각 흔들리는 필름 프레임처럼 보인다.
  */
  float worldX = uArcOffset + aPosition.x * uWidth;

  // 1) 판 자체의 굽음. 가운데가 앞으로 나오고 양끝이 뒤로 물러난다.
  //    원통에 붙은 종이처럼 보이게 하는 기본 형태다. 이건 판 단위가 맞다.
  float curve = 1.0 - aPosition.x * aPosition.x * 0.5;
  pos.z += curve * 0.34;

  /*
    2) 물결. 끄는 속도(uBend)가 클수록 크게 출렁인다.

    파도를 **둘 겹친다.** 하나만 쓰면 세게 키울 때 판이 규칙적인 골판지가
    된다. 파장과 속도가 다른 둘을 겹치면 같은 세기라도 천처럼 읽힌다.
  */
  float wavePhase = worldX * ${WAVE_FREQUENCY} + uTime * ${WAVE_SPEED};
  float ripple = sin(wavePhase) * 0.72
    + sin(worldX * ${RIPPLE_FREQUENCY} - uTime * 1.3) * 0.28;

  /*
    세기도 **고리 위 위치**로 정한다. 판마다 하나의 값을 주면 경계에서 진폭이
    툭 끊긴다 — 이어진 천이 아니라 서로 다른 세기로 흔들리는 조각이 된다.
  */
  float falloff = min(1.0 + abs(worldX) * ${FALLOFF_PER_UNIT}, ${MAX_FALLOFF});
  float bend = uBend * falloff;

  pos.z += ripple * bend;

  // 3) 세로로도 흔든다. 가로로만 흔들면 블라인드처럼 보인다.
  pos.z += sin(aPosition.y * 2.2 + worldX * 0.3 + uTime * 1.4) * bend * 0.6;

  // 4) 천이 끌릴 때 뒤가 늦게 따라오는 결. 이것도 고리 기준이라 이어진다.
  pos.z += sin(worldX * 0.22) * bend * 0.5;

  // 5) 가만히 있을 때의 숨. 완전히 굳으면 죽은 화면으로 읽힌다.
  pos.z += sin(worldX * 0.45 + uTime * 0.55) * uIdle;

  // 6) 휘는 만큼 옆으로도 늘어난다. 천이 출렁일 때 폭이 변하는 결.
  //    판 안 좌표로 나눠야 제 폭에 맞게 늘어난다.
  pos.x += sin(wavePhase) * bend * 0.16 / max(uWidth, 0.001);

  vec4 world = uModel * vec4(pos, 1.0);
  vDepth = world.z;
  vUv = aUv;
  gl_Position = uProjection * world;
}
`;

export const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D uTexture;
uniform float uOpacity;
uniform float uFocus;

varying vec2 vUv;
varying float vDepth;

void main() {
  vec4 color = texture2D(uTexture, vUv);

  // 뒤로 물러난 판일수록 어둡게. 조명 대신 이걸로 깊이를 만든다 —
  // 전부 같은 밝기면 종이 조각을 늘어놓은 것처럼 납작해 보인다.
  float depthFade = clamp(1.0 + vDepth * 0.05, 0.62, 1.0);

  // 가운데 판만 또렷하게. 양옆은 배경으로 물러난다.
  float focus = mix(0.72, 1.0, uFocus);

  gl_FragColor = vec4(color.rgb * depthFade * focus, color.a * uOpacity);
}
`;
