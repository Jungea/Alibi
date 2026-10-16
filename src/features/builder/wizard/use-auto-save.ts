"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  STEPS,
  validateSection,
  type ScenarioBundle,
  type Section,
} from "@/lib/schemas/scenario";

import { saveSectionAction } from "../actions";

export type SaveStatus = "saved" | "dirty" | "saving" | "invalid" | "error";

/** 외래키 순서: 라운드·인물이 먼저 저장되어야 힌트·미션·결말이 참조할 수 있다. */
const SAVE_ORDER: Section[] = [
  "basic",
  "world",
  "timeline",
  "rounds",
  "characters",
  "missions",
  "clues",
  "endings",
];
const DEBOUNCE_MS = 1200;
const RETRY_MS = 5000;
const LABELS = Object.fromEntries(STEPS.map((s) => [s.key, s.label])) as Record<
  Section,
  string
>;

export function sectionPayload(
  bundle: ScenarioBundle,
  section: Section,
): unknown {
  const s = bundle.scenario;
  switch (section) {
    case "basic":
      return {
        title: s.title,
        genre: s.genre,
        minPlayers: s.minPlayers,
        maxPlayers: s.maxPlayers,
        estimatedMinutes: s.estimatedMinutes,
        difficulty: s.difficulty,
        onlineSupported: s.onlineSupported,
        offlineSupported: s.offlineSupported,
        runMode: s.runMode,
      };
    case "world":
      return {
        background: s.background,
        victim: s.victim,
        incidentTime: s.incidentTime,
        incidentPlace: s.incidentPlace,
        openingText: s.openingText,
      };
    case "timeline":
      return s.timeline;
    default:
      return bundle[section];
  }
}

/**
 * 변경된 단계만 디바운스 후 서버에 저장한다.
 * - 저장 중에 같은 단계가 또 바뀌면 저장이 끝난 뒤 다시 저장한다.
 * - 검증에 실패한 단계(작성 중인 잘못된 값)는 저장을 보류하고 상태를 'invalid'로 표시한다.
 * - 서버 오류는 5초 뒤 자동 재시도한다.
 */
export function useAutoSave(
  scenarioId: string,
  getBundle: () => ScenarioBundle,
) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [message, setMessage] = useState<string | null>(null);

  const dirty = useRef(new Map<Section, number>());
  const revs = useRef(new Map<Section, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const rerun = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), ms);
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        rerun.current = false;
        const pending = SAVE_ORDER.filter((s) => dirty.current.has(s));
        if (pending.length === 0) break;

        setStatus("saving");
        let invalid: string | null = null;
        let failure: string | null = null;

        for (const section of pending) {
          const rev = dirty.current.get(section)!;
          const payload = sectionPayload(getBundle(), section);
          const v = validateSection(section, payload);
          if (!v.ok) {
            invalid = `${LABELS[section]}: ${v.error}`;
            continue;
          }
          const result = await saveSectionAction(scenarioId, section, payload);
          if (!result.ok) {
            failure = `${LABELS[section]}: ${result.error}`;
            continue;
          }
          if (dirty.current.get(section) === rev) dirty.current.delete(section);
          else rerun.current = true; // 저장하는 사이 또 바뀌었다
        }

        if (failure) {
          setStatus("error");
          setMessage(failure);
          schedule(RETRY_MS);
        } else if (invalid) {
          setStatus("invalid");
          setMessage(invalid);
        } else if (dirty.current.size === 0) {
          setStatus("saved");
          setMessage(null);
        } else {
          setStatus("dirty");
        }
      } while (rerun.current);
    } catch {
      setStatus("error");
      setMessage("네트워크 오류로 저장하지 못했습니다. 곧 다시 시도합니다.");
      schedule(RETRY_MS);
    } finally {
      running.current = false;
    }
  }, [getBundle, scenarioId, schedule]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const markDirty = useCallback(
    (sections: Section[]) => {
      for (const s of sections) {
        const rev = (revs.current.get(s) ?? 0) + 1;
        revs.current.set(s, rev);
        dirty.current.set(s, rev);
      }
      setStatus("dirty");
      schedule(DEBOUNCE_MS);
    },
    [schedule],
  );

  // 탭을 숨기거나 닫기 직전에 최대한 저장하고, 저장되지 않은 변경이 있으면 이탈 경고를 띄운다.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && dirty.current.size > 0)
        void flushRef.current();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0 || running.current) {
        void flushRef.current();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { status, message, markDirty, flush };
}
