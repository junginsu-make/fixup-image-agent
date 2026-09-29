/**
 * 진짜 APNG(ffmpeg 로 만든 5프레임).
 *
 * **이게 가장 위험한 입력이다.** 첫 여덟 바이트가 규격상 표준 PNG 와 같아
 * 시그니처로 못 가르고, libvips 8.18.3 은 APNG 를 읽지 못해 `pages` 를
 * `undefined` 로 준다 — 즉 프레임 수로도 못 가른다. 게다가 한 장으로 줄어든
 * 결과는 원본보다 작아서 크기 가드마저 통과한다. 세 방어가 전부 통과시킨다.
 *
 * 쓰는 곳이 둘이라 여기로 모았다(`image-encoding.test.ts`, `ai-metadata.test.ts`).
 * 두 벌로 두면 한쪽만 고쳐지고, 그때 어느 쪽이 맞는지 알 수 없다.
 *
 * **sharp 로는 이것을 만들 수 없다.** 움직이는 PNG 를 쓰는 길이 libvips 에
 * 없어서 `pages` 가 늘 `undefined` 로 나온다. 그래서 만들어 둔 바이트를 박아
 * 둔다 — 이 표본이 없으면 프레임 방어가 영영 검증되지 않는다.
 */
export const APNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAACGFjVEwAAAADAAAAAM7tusAAAAAaZmNUTAAAAAAAAAAQAAAAEAAAAAAAAAAAAAEABQAAaBqIGAAAAItJREFUeJzlktENAjEMQ5+lDnKb0FHKJr1NOgpscpsYNUWCwgESH/zgjzZOk9hSIwKOU76LgzznEzMsawRxj5hr8dwgj5odWPFg3xoU5D2kPvPR0kekkHrlZUckfaPwfw0GjnJhO1BN68kMRQRpLGdWKH09TtB+YKn/ccONBVbP21pQYYOKa7eUIV8AeOE0NVoMKPwAAAAaZmNUTAAAAAEAAAAQAAAAAwAAAAAAAAAMAAEABQAAYdb9jgAAADZmZEFUAAAAAnicY/xvzMCQAEJreRgWMDBsYRCG8s/qgPgLGIK/gPg+DG9BHIYFLAwkApI1AABTkws18ozPFgAAABpmY1RMAAAAAwAAABAAAAADAAAAAAAAAAwAAQAFAACMQC5nAAAANmZkQVQAAAAEeJxj/J/GwJDAcMuSYQEDCD1ncAPxf0VC+GrHGRJAfAZJhl0gPttyFgYSAckaAN1ZDA/NuPUvAAAAAElFTkSuQmCC",
  "base64",
);
