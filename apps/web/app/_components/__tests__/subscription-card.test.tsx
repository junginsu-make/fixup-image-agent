import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SubscriptionCard } from "../subscription-card";
it("월 기본량과 결제 확인된 실제 지급량을 구별한다",()=>{
 const html=renderToStaticMarkup(<SubscriptionCard subscription={{state:"present",status:"active",plan:{id:"basic",name:"베이직",monthlyUnits:100,priceKrw:10000},startedAt:"2026-10-02",cancelAt:null,currentPeriod:{period:"2026-10-01",startsAt:"2026-10-02T00:00:00+09:00",expiresAt:"2026-11-01T00:00:00+09:00",grantedUnits:120,paidKrw:12000}}}/>);
 expect(html).toContain("베이직"); expect(html).toContain("100"); expect(html).toContain("120"); expect(html).toContain("12,000"); expect(html).not.toContain("자동 결제");
});
it("미가입과 조회 실패를 구별한다",()=>{
 expect(renderToStaticMarkup(<SubscriptionCard subscription={{state:"none"}}/>)).toContain("이용 중인 구독이 없습니다");
 expect(renderToStaticMarkup(<SubscriptionCard subscription={{state:"unavailable"}}/>)).toContain("확인하지 못했습니다");
});
