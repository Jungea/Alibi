"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

/** 다른 목록(인물·라운드·미션)을 선택지로 쓰는 필드를 위한 참조 데이터 */
export interface RefOptions {
  characters: Option[];
  rounds: Option[];
  missions: Option[];
}

interface Base<T> {
  key: keyof T & string;
  label: string;
  hint?: string;
  /** 2열 그리드에서 한 줄 전체를 차지한다 */
  full?: boolean;
}

export type FieldDef<T> =
  | (Base<T> & { type: "text"; placeholder?: string; maxLength?: number })
  | (Base<T> & {
      type: "textarea";
      placeholder?: string;
      rows?: number;
      maxLength?: number;
    })
  | (Base<T> & { type: "number"; min?: number; max?: number; suffix?: string })
  /** 비워두면 null (예: 시간 제한 없음) */
  | (Base<T> & {
      type: "nullableNumber";
      min?: number;
      max?: number;
      suffix?: string;
      placeholder?: string;
    })
  | (Base<T> & { type: "select"; options: readonly Option[] })
  | (Base<T> & { type: "checkbox"; text: string })
  | (Base<T> & { type: "multi"; options: readonly Option[] })
  | (Base<T> & { type: "ref"; refs: keyof RefOptions; emptyLabel: string });

const selectClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2 text-sm outline-none focus-visible:ring-3 dark:bg-input/30";

export function FieldInput<T>({
  def,
  item,
  onChange,
  refs,
}: {
  def: FieldDef<T>;
  item: T;
  onChange: (key: keyof T & string, value: unknown) => void;
  refs: RefOptions;
}) {
  const id = useId();
  const value = (item as Record<string, unknown>)[def.key];
  const set = (v: unknown) => onChange(def.key, v);

  let control: React.ReactNode;
  switch (def.type) {
    case "text":
      control = (
        <Input
          id={id}
          value={(value as string) ?? ""}
          maxLength={def.maxLength}
          placeholder={def.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case "textarea":
      control = (
        <Textarea
          id={id}
          rows={def.rows ?? 4}
          value={(value as string) ?? ""}
          maxLength={def.maxLength}
          placeholder={def.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      );
      break;
    case "number":
      control = (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={def.min}
            max={def.max}
            value={Number.isFinite(value as number) ? (value as number) : ""}
            onChange={(e) =>
              set(e.target.value === "" ? Number.NaN : Number(e.target.value))
            }
          />
          {def.suffix && (
            <span className="text-muted-foreground shrink-0 text-sm">
              {def.suffix}
            </span>
          )}
        </div>
      );
      break;
    case "nullableNumber":
      control = (
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={def.min}
            max={def.max}
            placeholder={def.placeholder}
            value={
              value === null || value === undefined ? "" : (value as number)
            }
            onChange={(e) =>
              set(e.target.value === "" ? null : Number(e.target.value))
            }
          />
          {def.suffix && (
            <span className="text-muted-foreground shrink-0 text-sm">
              {def.suffix}
            </span>
          )}
        </div>
      );
      break;
    case "select":
      control = (
        <select
          id={id}
          className={selectClass}
          value={value as string}
          onChange={(e) => set(e.target.value)}
        >
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "ref":
      control = (
        <select
          id={id}
          className={selectClass}
          value={(value as string | null) ?? ""}
          onChange={(e) => set(e.target.value || null)}
        >
          <option value="">{def.emptyLabel}</option>
          {refs[def.refs].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "checkbox":
      control = (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => set(e.target.checked)}
          />
          {def.text}
        </label>
      );
      break;
    case "multi": {
      const selected = (value as string[]) ?? [];
      control = (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {def.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  set(
                    e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
      break;
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", def.full && "sm:col-span-2")}>
      {def.type === "multi" || def.type === "checkbox" ? (
        <span className="text-sm leading-none font-medium">{def.label}</span>
      ) : (
        <Label htmlFor={id}>{def.label}</Label>
      )}
      {control}
      {def.hint && <p className="text-muted-foreground text-xs">{def.hint}</p>}
    </div>
  );
}

export function FieldGrid<T>({
  fields,
  item,
  onChange,
  refs,
}: {
  fields: readonly FieldDef<T>[];
  item: T;
  onChange: (key: keyof T & string, value: unknown) => void;
  refs: RefOptions;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((def) => (
        <FieldInput
          key={def.key}
          def={def}
          item={item}
          onChange={onChange}
          refs={refs}
        />
      ))}
    </div>
  );
}
