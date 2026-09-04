import Image from "next/image";
import type { LandingCopy } from "./landing-content";
import { MotionCard } from "./motion-card";
import { listPublicShowcase } from "../api/showcase/store";
import type { ShowcaseView } from "../api/showcase/core";

const SIZES = "(min-width: 1180px) 24vw, (min-width: 760px) 32vw, 46vw";

/**
 * 결과물 갤러리.
 *
 * 설명을 붙이지 않는다. 비율이 다른 결과물을 원본 그대로 흘려 배치하고
 * 간격만 최소로 둔다 — 이 섹션에서 할 말은 이미지 자체다.
 * 설명은 alt 로만 남긴다(화면에는 안 보이고 스크린리더와 검색엔진은 읽는다).
 *
 * 무엇을 걸지는 **관리자가 고른다.** 전부 자동으로 걸면 회원이 만든 출시 전
 * 기획물이 만들어지는 즉시 공개 인터넷에 올라간다.
 *
 * 아직 하나도 안 골랐으면 원래 쓰던 네 장을 그대로 보여준다. 관리자가 손대기
 * 전까지 첫 화면이 텅 비어 있으면 안 된다.
 */
export async function Gallery({ t }: { t: LandingCopy }) {
  const items = await listPublicShowcase();

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
          {items.length ? items.map((item) => <ShowcaseFigure key={item.id} item={item} />) : <DefaultFigures t={t} />}
        </div>
      </div>
    </section>
  );
}

/**
 * 관리자가 고른 한 장.
 *
 * 크기를 아는 것만 next/image 로 내보낸다. 흘려 배치하는 열이라 비율을
 * 모르면 그림이 뜨는 순간 열이 통째로 밀린다 — 그럴 때는 브라우저가 알아서
 * 자리를 잡게 두는 편이 낫다.
 */
function ShowcaseFigure({ item }: { item: ShowcaseView }) {
  const alt = [item.kindLabel, item.caption].filter(Boolean).join(", ");

  return (
    <figure className="mcs-figure">
      {item.width && item.height ? (
        <Image src={item.url} alt={alt} width={item.width} height={item.height} sizes={SIZES} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={alt} loading="lazy" />
      )}
    </figure>
  );
}

/** 관리자가 아직 아무것도 안 골랐을 때 보여주는 원래 네 장. */
function DefaultFigures({ t }: { t: LandingCopy }) {
  return (
    <>
      <figure className="mcs-figure">
        <Image
          src="/landing/result-cardnews-lease.png"
          alt={`${t.g1kind}, ${t.g1title}`}
          width={1080}
          height={1080}
          sizes={SIZES}
        />
      </figure>

      <figure className="mcs-figure">
        <Image
          src="/landing/result-poster-sports.png"
          alt={`${t.g2kind}, ${t.g2title}`}
          width={1024}
          height={1536}
          sizes={SIZES}
        />
      </figure>

      <figure className="mcs-figure">
        <Image
          src="/landing/result-winter-trend.png"
          alt={`${t.g3kind}, ${t.g3title}`}
          width={1232}
          height={2192}
          sizes={SIZES}
        />
      </figure>

      <figure className="mcs-figure mcs-figure--ink">
        <MotionCard src="/landing/result-motion.mp4" label={t.g4title} />
      </figure>
    </>
  );
}
