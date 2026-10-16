"use client";

import { useEffect, useState } from "react";

import type { Fetched } from "./state";

/**
 * 서버에서 값을 읽어 오는 훅. key 가 바뀔 때마다 다시 읽고, 이전 값은 새 값이 올 때까지 유지한다.
 * (화면이 깜빡이지 않도록 실패해도 마지막 성공 값을 그대로 둔다.)
 */
export function useRemote<T>(
  load: () => Promise<Fetched<T>>,
  key: unknown,
  enabled = true,
): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void load().then((r) => {
        if (cancelled) return;
        setState((prev) =>
          r.ok
            ? { data: r.data, error: null }
            : { data: prev.data, error: r.error },
        );
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // load 는 호출하는 쪽에서 key 가 바뀔 때만 의미가 달라지도록 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
}
