"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage와 동기화되는 상태 훅 (useSyncExternalStore 기반).
 * - 서버 렌더링과 첫 하이드레이션에서는 fallback을 사용해 불일치가 생기지 않는다.
 * - 저장소가 막혀 있어도(시크릿 모드 등) 예외 없이 메모리로 동작한다.
 * - fallback은 모듈 상수처럼 참조가 변하지 않는 값을 넘겨야 한다.
 */

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();
// 저장에 실패했을 때 세션 동안만 값을 유지하기 위한 보관소
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  const mem = memory.get(key);
  if (mem !== undefined) return mem;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string) {
  try {
    localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    memory.set(key, raw);
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function useLocalStorageState<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key);
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.value as T;

    let value: T = fallback;
    if (raw !== null) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!validate || validate(parsed)) value = parsed as T;
      } catch {
        // 손상된 값은 fallback으로 대체
      }
    }
    cache.set(key, { raw, value });
    return value;
  }, [key, fallback, validate]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = getSnapshot();
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      writeRaw(key, JSON.stringify(resolved));
      listeners.forEach((l) => l());
    },
    [key, getSnapshot],
  );

  return [value, setValue];
}
