"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { FieldGrid, type FieldDef, type RefOptions } from "./fields";

interface Props<T extends { id: string }> {
  items: T[];
  fields: readonly FieldDef<T>[];
  refs: RefOptions;
  max: number;
  addLabel: string;
  emptyText: string;
  itemTitle: (item: T, index: number) => string;
  createItem: () => T;
  /** 항목 추가·수정·순서 변경 */
  onChange: (items: T[]) => void;
  /** 삭제는 다른 단계의 참조도 정리해야 해서 따로 받는다 */
  onRemove: (id: string) => void;
  /** 필드 아래에 붙는 항목별 추가 UI (이미지, 관계 등) */
  renderExtra?: (
    item: T,
    update: (patch: Partial<T>) => void,
  ) => React.ReactNode;
}

export function ListEditor<T extends { id: string }>({
  items,
  fields,
  refs,
  max,
  addLabel,
  emptyText,
  itemTitle,
  createItem,
  onChange,
  onRemove,
  renderExtra,
}: Props<T>) {
  // 항목별 펼침 상태: 처음에는 3개 이하일 때만 펼치고, 새로 추가한 항목은 항상 펼친다.
  const [openIds, setOpenIds] = useState(
    () => new Set(items.length <= 3 ? items.map((it) => it.id) : []),
  );
  const setOpen = (id: string, open: boolean) =>
    setOpenIds((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const add = () => {
    const created = createItem();
    setOpen(created.id, true);
    onChange([...items, created]);
  };

  const patch = (id: string, p: Partial<T>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const confirmRemove = (item: T, index: number) => {
    if (window.confirm(`"${itemTitle(item, index)}" 항목을 삭제할까요?`))
      onRemove(item.id);
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          {emptyText}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={item.id}>
            <details
              open={openIds.has(item.id)}
              onToggle={(e) => setOpen(item.id, e.currentTarget.open)}
              className="bg-card group rounded-xl border"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 select-none">
                <span className="truncate font-medium">
                  {itemTitle(item, i)}
                </span>
                <span
                  className="flex shrink-0 gap-1"
                  onClick={(e) => e.preventDefault()}
                >
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="위로"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="아래로"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="삭제"
                    onClick={() => confirmRemove(item, i)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </summary>
              <div className="flex flex-col gap-4 border-t p-4">
                <FieldGrid
                  fields={fields}
                  item={item}
                  refs={refs}
                  onChange={(key, value) =>
                    patch(item.id, { [key]: value } as Partial<T>)
                  }
                />
                {renderExtra?.(item, (p) => patch(item.id, p))}
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={items.length >= max}
          onClick={add}
        >
          <Plus /> {addLabel}
        </Button>
        {items.length >= max && (
          <span className="text-muted-foreground ml-3 text-xs">
            최대 {max}개까지 만들 수 있습니다.
          </span>
        )}
      </div>
    </div>
  );
}
