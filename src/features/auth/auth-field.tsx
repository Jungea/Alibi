import type { LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

export function AuthField({
  id,
  name,
  type = "text",
  autoComplete,
  placeholder,
  icon: Icon,
  error,
  minLength,
  maxLength,
}: {
  id: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder: string;
  icon: LucideIcon;
  error?: string;
  minLength?: number;
  maxLength?: number;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Icon aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" strokeWidth={1.8} />
        <Input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={minLength}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="h-11 pl-10"
          required
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
