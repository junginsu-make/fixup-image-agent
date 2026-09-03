import Image from "next/image";
import type { LandingCopy } from "./landing-content";
import { MotionCard } from "./motion-card";

/**
 * 결과물 갤러리.
 *
 * 설명을 붙이지 않는다. 비율이 다른 결과물을 원본 그대로 흘려 배치하고
 * 간격만 최소로 둔다 — 이 섹션에서 할 말은 이미지 자체다.
 * 설명은 alt 로만 남긴다(화면에는 안 보이고 스크린리더와 검색엔진은 읽는다).
 */
export function Gallery({ t }: { t: LandingCopy }) {
  return (
    <section id="gallery" className="mcs-section">
      <div className="mcs-shell">
        <div className="mcs-head">
          <div>
            <p className="mcs-kicker">{t.galleryKicker}</p>
            <h2 className="mcs-h2">{t.galleryTitle}</h2>
            <p className="mcs-lead">{t.galleryLead}</p>
          </div>
          <span className="mcs-pill">
            <i className="mcs-dot mcs-dot--ok" aria-hidden="true" />
            {t.galleryNote}
          </span>
        </div>

        <div className="mcs-gallery">
          <figure className="mcs-figure">
            <Image
              src="/landing/result-cardnews-lease.png"
              alt={`${t.g1kind}, ${t.g1title}`}
              width={1080}
              height={1080}
              sizes="(min-width: 1180px) 24vw, (min-width: 760px) 32vw, 46vw"
            />
          </figure>

          <figure className="mcs-figure">
            <Image
              src="/landing/result-poster-sports.png"
              alt={`${t.g2kind}, ${t.g2title}`}
              width={1024}
              height={1536}
              sizes="(min-width: 1180px) 24vw, (min-width: 760px) 32vw, 46vw"
            />
          </figure>

          <figure className="mcs-figure">
            <Image
              src="/landing/result-winter-trend.png"
              alt={`${t.g3kind}, ${t.g3title}`}
              width={1232}
              height={2192}
              sizes="(min-width: 1180px) 24vw, (min-width: 760px) 32vw, 46vw"
            />
          </figure>

          <figure className="mcs-figure mcs-figure--ink">
            <MotionCard src="/landing/result-motion.mp4" label={t.g4title} />
          </figure>
        </div>
      </div>
    </section>
  );
}
