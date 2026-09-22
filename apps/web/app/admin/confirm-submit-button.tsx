"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@fixup/ui";

type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type ButtonSize = "default" | "sm" | "lg" | "icon";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingLabel = "처리 중...",
  className,
  disabled,
  title,
  size = "sm",
  variant = "default",
}: {
  children: ReactNode;
  confirmMessage: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  /** 눌리지 않을 때 왜인지. 마우스를 올리면 보인다. */
  title?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={className}
      disabled={disabled || pending}
      title={title}
      size={size}
      variant={variant}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
