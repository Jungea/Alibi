"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { emptyNotes, type Notes } from "@/lib/game/notes";

import type { RoomContext } from "./room-client";
import { fetchMyNotes, saveMyNotes } from "./state";

export type NotesStatus = "loading" | "idle" | "saving" | "saved" | "error";

export interface NotesApi {
  notes: Notes;
  /** 현재 노트를 받아 새 노트를 돌려주는 함수를 적용한다 (잠시 뒤 자동 저장). */
  update: (fn: (n: Notes) => Notes) => void;
  status: NotesStatus;
  error: string | null;
}

const SAVE_DELAY_MS = 1200;

/**
 * 내 추리노트: 처음에 서버에서 읽고, 고칠 때마다 잠시 뒤 자동 저장한다.
 * 읽기가 끝나기 전에는 저장하지 않아 서버의 노트를 빈 노트로 덮어쓰지 않는다.
 * 탭을 숨기거나 화면을 떠날 때는 기다리지 않고 바로 저장한다.
 */
export function useNotes(ctx: RoomContext, enabled: boolean): NotesApi {
  const { supabase, roomId } = ctx;
  const [notes, setNotes] = useState<Notes>(emptyNotes);
  const [status, setStatus] = useState<NotesStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(notes);
  const loaded = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);

  const flush = useCallback(
    async function run(): Promise<void> {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!loaded.current || !dirty.current || saving.current) return;
      dirty.current = false;
      saving.current = true;
      setStatus("saving");
      const res = await saveMyNotes(supabase, roomId, latest.current);
      saving.current = false;
      if (res.ok) {
        setError(null);
        setStatus(dirty.current ? "idle" : "saved");
      } else {
        dirty.current = true; // 다음 변경 때 다시 시도한다.
        setError(res.error);
        setStatus("error");
      }
      if (dirty.current && res.ok) void run();
    },
    [supabase, roomId],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void fetchMyNotes(supabase, roomId).then((r) => {
        if (cancelled) return;
        if (r.ok) {
          latest.current = r.data;
          setNotes(r.data);
          loaded.current = true;
          setStatus("idle");
        } else {
          setError(r.error);
          setStatus("error");
        }
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, supabase, roomId]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (n: Notes) => Notes) => {
      if (!loaded.current) return;
      const next = fn(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      dirty.current = true;
      setNotes(next);
      setStatus("idle");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  return { notes, update, status, error };
}
