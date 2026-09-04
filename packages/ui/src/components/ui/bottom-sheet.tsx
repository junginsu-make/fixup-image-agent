"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * 아래에서 올라오는 창.
 *
 * 가운데 뜨는 `Dialog` 와 같은 원시 부품(Radix Dialog)을 쓴다 — 바깥 누르면
 * 닫히고, Esc 로 닫히고, 열린 동안 뒤가 안 눌리는 성질이 공짜로 따라온다.
 *
 * 가운데 창과 나누는 기준은 **얼마나 오래 머무르는가**다. 가운데 창은 묻고
 * 끝내는 자리(지울까요?)이고, 이 창은 그 안에서 고르고 만들고 결과까지 보는
 * 자리다. 그래서 높이를 넉넉히 잡고 안쪽만 구른다 — 뒤 페이지가 함께 길어지면
 * 창을 닫았을 때 엉뚱한 곳에 가 있다.
 */

const BottomSheet = DialogPrimitive.Root;
const BottomSheetTrigger = DialogPrimitive.Trigger;
const BottomSheetClose = DialogPrimitive.Close;

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className="fixup-sheet-overlay fixed inset-0 z-50 bg-black/60"
    />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 올라오는 움직임은 globals.css 의 `.fixup-sheet` 가 한다. 이 저장소는
        // `tailwindcss-animate` 를 안 써서 `animate-in` 류가 아무 일도 안 한다.
        "fixup-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-t bg-background shadow-lg",
        className,
      )}
      {...props}
    >
      {/* 손잡이. 이 창이 아래에서 올라온 것이고 내려서 닫는다는 것을 말한다. */}
      <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 flex-none rounded-full bg-border" />
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">닫기</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
BottomSheetContent.displayName = "BottomSheetContent";

/** 늘 보이는 머리. 창이 길어져도 무엇을 하는 자리인지가 안 사라진다. */
const BottomSheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-none border-b px-5 py-4", className)} {...props} />
);
BottomSheetHeader.displayName = "BottomSheetHeader";

/** 여기만 구른다. 뒤 페이지를 늘리지 않으려고 창을 쓰는 것이다. */
const BottomSheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />
);
BottomSheetBody.displayName = "BottomSheetBody";

/**
 * 늘 보이는 바닥.
 *
 * 만드는 단추가 여기 있다. 몸통을 굴려 내려가야 단추가 나오면, 고르다 말고
 * 단추를 찾게 된다.
 */
const BottomSheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-none border-t bg-background px-5 py-4", className)} {...props} />
);
BottomSheetFooter.displayName = "BottomSheetFooter";

const BottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-bold leading-none tracking-tight", className)}
    {...props}
  />
));
BottomSheetTitle.displayName = DialogPrimitive.Title.displayName;

const BottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
BottomSheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
};
