import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SubscriptionCard } from "../subscription-card";
const present = (status: "active" | "canceled" | "suspended") => ({state:"present" as const,status,plan:{id:"basic",name:"베이직",monthlyUnits:75,priceKrw:89000},startedAt:"2026-10-09T05:00:00Z",cancelAt:null,currentPeriod:{period:"2026-10-09",startsAt:"2026-10-09T05:00:00Z",expiresAt:"2026-11-09T05:00:00Z",grantedUnits:75,paidKrw:89000}});
/** 2026-10-09 사용자 결정: 배정하면 바로, 매달 배정한 날에 자동으로. 「결제 확인」은 더 없다. */
it("이번 기간과 지급량, 다음 지급일을 보여 주고 결제 확인을 말하지 않는다",()=>{
 const html=renderToStaticMarkup(<SubscriptionCard subscription={present("active")}/>);
 expect(html).toContain("베이직"); expect(html).toContain("75크레딧");
 expect(html).toContain("이번 기간"); expect(html).toContain("다음 지급");
 expect(html).toContain("2026년 11월 9일");
 expect(html).not.toContain("결제 확인"); expect(html).not.toContain("자동 결제");
});
it("해지·중단이면 다음 지급일을 말하지 않는다",()=>{
 const html=renderToStaticMarkup(<SubscriptionCard subscription={present("canceled")}/>);
 expect(html).not.toContain("다음 지급"); expect(html).toContain("이미 지급된 크레딧");
});
it("미가입과 조회 실패를 구별한다",()=>{
 expect(renderToStaticMarkup(<SubscriptionCard subscription={{state:"none"}}/>)).toContain("이용 중인 구독이 없습니다");
 expect(renderToStaticMarkup(<SubscriptionCard subscription={{state:"unavailable"}}/>)).toContain("확인하지 못했습니다");
});
