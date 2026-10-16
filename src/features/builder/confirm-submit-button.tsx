"use client";

import { Button } from "@/components/ui/button";

/** 눌렀을 때 확인을 받은 뒤에만 폼을 제출한다. */
export function ConfirmSubmitButton({
  confirmText,
  children,
  ...props
}: { confirmText: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
