"use client";

import { useSyncExternalStore } from "react";

/**
 * 현재 시각(epoch ms)을 주기적으로 갱신해 알려주는 훅.
 * 값은 화면 갱신용일 뿐이고, 시간 계산은 항상 이 값과 종료 시각의 차이로 한다.
 * - 탭이 다시 보이거나 포커스를 얻는 순간 즉시 갱신해 백그라운드 동안의 지연을 바로잡는다.
 * - 서버 렌더링/하이드레이션에서는 0을 돌려주므로(시각을 읽지 않음) 프리렌더와 충돌하지 않는다.
 */

const TICK_MS = 250;

const listeners = new Set<() => void>();
let snapshot = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

function tick() {
  snapshot = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (listeners.size === 1) {
    snapshot = Date.now();
    intervalId = setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = null;
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    }
  };
}

function getSnapshot() {
  if (snapshot === 0) snapshot = Date.now();
  return snapshot;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
