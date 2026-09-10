"use client";

import { useEffect, useRef, useState } from "react";
import { buildRing, rebaseScroll, visibleItems } from "./arc-layout";
import { INITIAL, beginDrag, dragBy, endDrag, nudge, step } from "./drag-physics";
import type { DragState } from "./drag-physics";
import { IDLE_AMPLITUDE, relaxBend } from "./wave";
import { shouldCaptureWheel, wheelDelta } from "./wheel";
import { createPlaceholderTexture, createPlane, link, loadImage, uploadTexture } from "./gl";
import { chain, perspective, rotationY, scaling, translation } from "./mat4";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./shaders";
import type { Slide } from "./slides";

/**
 * 드래그로 도는 휘어진 캐러셀.
 *
 * 판단은 전부 화면 밖 모듈이 한다(`arc-layout`·`drag-physics`·`wave`). 여기는
 * **그 값을 받아 그리기만** 한다 — 그래야 「가운데가 어긋난다」·「120Hz 에서
 * 두 배 빨리 선다」 같은 것을 시험으로 잡을 수 있다.
 */

/**
 * 판의 세로 크기(월드 단위). **모든 판이 이 높이로 통일된다.**
 *
 * 1:1 이든 16:9 든 9:16 이든 높이는 같고 **가로만 비율대로** 늘어난다.
 * 높이를 맞추지 않으면 고리가 들쭉날쭉해 늘어놓은 것처럼 보인다.
 */
const PLANE_HEIGHT = 4.2;

/** 화면이 좁을수록 뒤로 물러나 더 많이 보이게 한다. */
function cameraDistance(aspect: number) {
  // 화각 45°. 이 거리에서 세로로 약 5.8 단위가 보이니 판(4.2)이 화면의 7할을
  // 채운다. 더 당기면 위아래가 잘리고, 더 물러나면 작아 보인다.
  return aspect < 1 ? 9.2 : 7.0;
}

interface SlideTexture {
  texture: WebGLTexture;
  aspect: number;
  ready: boolean;
}

export function HeroCarousel({ slides: source }: { slides: Slide[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!context) {
      // WebGL 이 없는 기기도 있다. 그럴 때는 아래의 평범한 목록이 대신 나온다.
      setFailed(true);
      return;
    }
    // 타입을 여기서 못 박는다. 닫힌 함수 안에서 좁힘이 풀리면 편집기가
    // 「null 일 수 있다」를 계속 띄운다.
    const gl: WebGLRenderingContext = context;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let program: WebGLProgram;
    try {
      program = link(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    } catch (error) {
      console.error("[mcs-hero] 셰이더 준비 실패", error);
      setFailed(true);
      return;
    }

    const plane = createPlane(gl);
    const placeholder = createPlaceholderTexture(gl);

    const slides: SlideTexture[] = source.map(() => ({ texture: placeholder, aspect: 0.75, ready: false }));

    let disposed = false;
    source.forEach((slide, index) => {
      void loadImage(slide.src)
        .then((image) => {
          if (disposed) return;
          slides[index] = {
            texture: uploadTexture(gl, image),
            aspect: image.naturalWidth / image.naturalHeight,
            ready: true,
          };
        })
        .catch((error) => console.warn("[mcs-hero]", error));
    });

    const attribute = {
      position: gl.getAttribLocation(program, "aPosition"),
      uv: gl.getAttribLocation(program, "aUv"),
    };
    const uniform = {
      projection: gl.getUniformLocation(program, "uProjection"),
      model: gl.getUniformLocation(program, "uModel"),
      bend: gl.getUniformLocation(program, "uBend"),
      time: gl.getUniformLocation(program, "uTime"),
      idle: gl.getUniformLocation(program, "uIdle"),
      texture: gl.getUniformLocation(program, "uTexture"),
      opacity: gl.getUniformLocation(program, "uOpacity"),
      focus: gl.getUniformLocation(program, "uFocus"),
      // 이 판이 고리 위 어디에 있는가. 물결이 판 경계를 넘어 이어지려면
      // 셰이더가 판 안 좌표가 아니라 이 값을 알아야 한다.
      arcOffset: gl.getUniformLocation(program, "uArcOffset"),
      width: gl.getUniformLocation(program, "uWidth"),
    };
    /*
      **높이는 통일, 가로만 비율대로.** 이미지는 늦게 도착하므로 매 프레임
      지금 아는 비율로 다시 잰다 — 열두 장이라 값싸고, 한 장이 늦게 와도
      그때부터 제 폭을 차지한다.
    */
    const widthsOf = () => slides.map((slide) => PLANE_HEIGHT * slide.aspect);

    // 이미지가 도착할 때마다 폭이 바뀌어 고리가 밀린다. 보던 판을 붙잡아 둔다.
    let ring = buildRing(widthsOf());

    // **첫 판이 가운데 서서 시작한다.** 0 에서 시작하면 판의 왼쪽 모서리가
    // 정면에 오고, 폭이 제각각이라 어느 판이 설지도 그때그때 달라진다.
    let state: DragState = { ...INITIAL, scroll: ring.centers[0] ?? 0 };
    let bend = 0;
    let projection = perspective(Math.PI / 4, 1, 0.1, 100);

    const resize = () => {
      // 고해상도 화면에서 픽셀을 그대로 다 그리면 노트북 팬이 돈다. 2배까지만.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      projection = perspective(Math.PI / 4, width / height, 0.1, 100);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── 입력 ────────────────────────────────────────────────────────────
    let pointerId: number | null = null;
    let lastX = 0;
    let lastMoveAt = 0;

    const onPointerDown = (event: PointerEvent) => {
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastMoveAt = performance.now();
      state = beginDrag(state);
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId || !state.dragging) return;
      const now = performance.now();
      const dt = (now - lastMoveAt) / 1000;
      state = dragBy(state, event.clientX - lastX, dt);
      lastX = event.clientX;
      lastMoveAt = now;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      state = endDrag(state);
    };

    const onWheel = (event: WheelEvent) => {
      /*
        첫 화면에서는 휠이 **캐러셀을 돌린다.** 다섯 바퀴를 다 쓰거나 아래로
        내려간 뒤에는 손을 떼고 평범한 스크롤에 맡긴다 — 그러지 않으면 마우스만
        쓰는 사람이 첫 화면에 갇힌다.

        가로채는 동안에는 기본 동작을 막아야 한다. 안 막으면 캐러셀이 돌면서
        페이지도 함께 내려가 둘 다 어정쩡해진다. 그래서 `passive: false` 다.
      */
      if (!shouldCaptureWheel(window.scrollY, canvas.clientHeight)) return;

      event.preventDefault();
      state = nudge(state, wheelDelta(event.deltaX, event.deltaY), 1 / 60);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    // 기본 스크롤을 막아야 하므로 passive 가 아니다.
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // ── 그리기 ──────────────────────────────────────────────────────────
    /*
      **순수 검정으로 지운다.**

      전에는 아주 살짝 밝은 회색(rgb 5,5,8)이었다. 눈으로는 검정이지만 아래
      섹션은 진짜 #000 이라, 캔버스가 끝나는 자리에 가로줄이 하나 생겼다 —
      그리지도 않은 선이 보였다.
    */
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let frame = 0;
    let previous = performance.now();

    const drawPlanes = (seconds: number, distance: number) => {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, plane.position);
      gl.enableVertexAttribArray(attribute.position);
      gl.vertexAttribPointer(attribute.position, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, plane.uv);
      gl.enableVertexAttribArray(attribute.uv);
      gl.vertexAttribPointer(attribute.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, plane.index);

      gl.uniformMatrix4fv(uniform.projection, false, projection);
      gl.uniform1f(uniform.time, seconds);
      gl.uniform1f(uniform.idle, reduceMotion ? 0 : IDLE_AMPLITUDE);
      gl.uniform1i(uniform.texture, 0);
      gl.activeTexture(gl.TEXTURE0);

      for (const item of visibleItems(widthsOf(), state.scroll)) {
        const slide = slides[item.index]!;

        // 순서가 곧 위치다. **키우고 → 돌리고 → 옮긴다.** 뒤집으면 이동값까지
        // 함께 돌아가 옆 판들이 화면 밖으로 날아간다(`mat4.test.ts`).
        const model = chain(
          translation(item.x, 0, item.z - distance),
          rotationY(item.rotationY),
          scaling(item.width, PLANE_HEIGHT, 1),
        );

        gl.bindTexture(gl.TEXTURE_2D, slide.texture);
        gl.uniformMatrix4fv(uniform.model, false, model);
        // 세기는 **하나만** 넘긴다. 판마다 다른 값을 주면 경계에서 진폭이
        // 끊겨 이어진 천이 아니라 따로 흔들리는 조각이 된다.
        gl.uniform1f(uniform.bend, bend);
        gl.uniform1f(uniform.arcOffset, item.offset);
        gl.uniform1f(uniform.width, item.width);
        // 멀어질수록 투명해진다. 갑자기 사라지면 눈에 걸린다.
        // 멀어질수록 옅어진다. 거리(호 길이)로 재므로 판 폭에 비례해 잡는다.
        const awayFromCenter = Math.abs(item.offset) / 8;
        gl.uniform1f(uniform.opacity, slide.ready ? Math.max(0, 1 - awayFromCenter) : 0.25);
        gl.uniform1f(uniform.focus, Math.max(0, 1 - awayFromCenter * 2));
        gl.drawElements(gl.TRIANGLES, plane.count, gl.UNSIGNED_SHORT, 0);
      }
    };

    const render = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const seconds = now / 1000;

      // 폭이 바뀌었으면 보던 판이 그대로 가운데 남도록 기준을 옮긴다.
      const nextRing = buildRing(widthsOf());
      if (nextRing.centers.some((value, index) => value !== ring.centers[index])) {
        state = { ...state, scroll: rebaseScroll(ring, nextRing, state.scroll) };
        ring = nextRing;
      }

      state = step(state, dt);
      bend = reduceMotion ? 0 : relaxBend(bend, state.velocity, dt);

      gl.clear(gl.COLOR_BUFFER_BIT);
      const distance = cameraDistance(canvas.clientWidth / Math.max(canvas.clientHeight, 1));

      drawPlanes(seconds, distance);

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [source]);

  if (failed) {
    return (
      <div className="mcs-hero-fallback">
        {source.map((slide) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={slide.src} src={slide.src} alt={slide.label} />
        ))}
      </div>
    );
  }

  return <canvas ref={canvasRef} className="mcs-hero-canvas" aria-label="결과물 캐러셀" />;
}
