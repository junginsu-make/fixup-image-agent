"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * 오른쪽에서 밀려 나오는 작업 패널.
 *
 * 가운데 뜨는 `Dialog` 와 같은 원시 부품(Radix Dialog)을 쓴다 — 바깥 누르면
 * 닫히고, Esc 로 닫히고, 열린 동안 뒤가 안 눌리는 성질이 공짜로 따라온다.
 *
 * 가운데 창과 나누는 기준은 **얼마나 오래 머무르는가**다. 가운데 창은 묻고
 * 끝내는 자리(지울까요?)이고, 이 패널은 그 안에서 고르고 만들고 결과까지 보는
 * 자리다.
 *
 * **아래가 아니라 오른쪽이다.** 아래에서 올리면 화면 높이에 갇혀 그림 넉 장을
 * 늘어놓기에도 좁다(2026-09-04 사용자 화면). 옆에서 나오면 화면 높이를 통째로
 * 쓴다. 뒤 페이지는 길어지지 않고 패널 안쪽만 구른다.
 */

const SidePanel = DialogPrimitive.Root;
const SidePanelTrigger = DialogPrimitive.Trigger;
const SidePanelClose = DialogPrimitive.Close;

const SidePanelContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className="fixup-panel-overlay fixed inset-0 z-50 bg-black/60"
    />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 밀려 나오는 움직임은 globals.css 의 `.fixup-panel` 이 한다. 이 저장소는
        // `tailwindcss-animate` 를 안 써서 `animate-in` 류가 아무 일도 안 한다.
        //
        // 좁은 화면에서는 폭을 다 쓴다 — 옆에 남겨 둔 자리로는 아무것도 못 한다.
        "fixup-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col border-l bg-background shadow-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">닫기</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SidePanelContent.displayName = "SidePanelContent";

/** 늘 보이는 머리. 창이 길어져도 무엇을 하는 자리인지가 안 사라진다. */
const SidePanelHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-none border-b px-5 py-4", className)} {...props} />
);
SidePanelHeader.displayName = "SidePanelHeader";

/** 여기만 구른다. 뒤 페이지를 늘리지 않으려고 창을 쓰는 것이다. */
const SidePanelBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />
);
SidePanelBody.displayName = "SidePanelBody";

/**
 * 늘 보이는 바닥.
 *
 * 만드는 단추가 여기 있다. 몸통을 굴려 내려가야 단추가 나오면, 고르다 말고
 * 단추를 찾게 된다.
 */
const SidePanelFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-none border-t bg-background px-5 py-4", className)} {...props} />
);
SidePanelFooter.displayName = "SidePanelFooter";

const SidePanelTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-bold leading-none tracking-tight", className)}
    {...props}
  />
));
SidePanelTitle.displayName = DialogPrimitive.Title.displayName;

const SidePanelDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SidePanelDescription.displayName = DialogPrimitive.Description.displayName;

export {
  SidePanel,
  SidePanelTrigger,
  SidePanelClose,
  SidePanelContent,
  SidePanelHeader,
  SidePanelBody,
  SidePanelFooter,
  SidePanelTitle,
  SidePanelDescription,
};
