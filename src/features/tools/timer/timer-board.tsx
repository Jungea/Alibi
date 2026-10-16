"use client";

import { useEffect, useRef, useState } from "react";
import {
  Expand,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useLocalStorageState } from "@/lib/use-local-storage";
import { useNow } from "@/lib/use-now";

import { playBeep, unlockAudio, vibrate } from "./alerts";
import {
  ALERT_THRESHOLDS,
  createTimer,
  dueAlerts,
  extendTimer,
  formatTime,
  getRemainingMs,
  isFinished,
  pauseTimer,
  resetTimer,
  startTimer,
  type TimerModel,
} from "./timer-logic";

interface Preset {
  id: string;
  name: string;
  durationMs: number;
}

interface AlertSettings {
  sound: boolean;
  vibration: boolean;
}

const DEFAULT_PRESETS: Preset[] = [
  { id: "default-intro", name: "자기소개", durationMs: 2 * 60_000 },
  { id: "default-explore", name: "탐색", durationMs: 10 * 60_000 },
  { id: "default-discuss", name: "토론", durationMs: 15 * 60_000 },
];
const DEFAULT_TIMERS: TimerModel[] = [];
const DEFAULT_SETTINGS: AlertSettings = { sound: true, vibration: true };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function isPresetList(v: unknown): v is Preset[] {
  return (
    Array.isArray(v) &&
    v.every(
      (p) =>
        isObject(p) &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.durationMs === "number",
    )
  );
}

function isTimerList(v: unknown): v is TimerModel[] {
  return (
    Array.isArray(v) &&
    v.every(
      (t) =>
        isObject(t) &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        typeof t.durationMs === "number" &&
        typeof t.remainingMs === "number" &&
        (t.status === "idle" ||
          t.status === "running" ||
          t.status === "paused") &&
        (t.endAt === null || typeof t.endAt === "number"),
    )
  );
}

function isSettings(v: unknown): v is AlertSettings {
  return (
    isObject(v) &&
    typeof v.sound === "boolean" &&
    typeof v.vibration === "boolean"
  );
}

/** 오래된 알림(새로고침 직후 등)은 울리지 않기 위한 허용 지연 */
const STALE_ALERT_MS = 5000;
const FLASH_MS = 4000;

function durationLabel(ms: number) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0 && s > 0) return `${m}분 ${s}초`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

export function TimerBoard() {
  const [timers, setTimers] = useLocalStorageState(
    "alibi:timers",
    DEFAULT_TIMERS,
    isTimerList,
  );
  const [presets, setPresets] = useLocalStorageState(
    "alibi:timer-presets",
    DEFAULT_PRESETS,
    isPresetList,
  );
  const [settings, setSettings] = useLocalStorageState(
    "alibi:timer-settings",
    DEFAULT_SETTINGS,
    isSettings,
  );

  const now = useNow();
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [seconds, setSeconds] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const firedRef = useRef(new Set<string>());

  // 알림: 소리 / 진동. 화면 플래시는 렌더링 시 파생한다.
  useEffect(() => {
    for (const t of timers) {
      if (t.status !== "running" || t.endAt === null) continue;
      const remaining = getRemainingMs(t, now);
      for (const key of dueAlerts(remaining, t.durationMs)) {
        const fireId = `${t.id}:${t.endAt}:${key}`;
        if (firedRef.current.has(fireId)) continue;
        firedRef.current.add(fireId);
        const lateness =
          key === "end" ? now - t.endAt : ALERT_THRESHOLDS[key] - remaining;
        if (lateness > STALE_ALERT_MS) continue;
        if (settings.sound) playBeep(key);
        if (settings.vibration) vibrate(key);
      }
    }
  }, [now, timers, settings]);

  // 전체화면: 브라우저에서 전체화면이 풀리면(Esc 등) 오버레이도 닫는다.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenId(null);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // 전체화면 중에는 화면이 꺼지지 않게 한다 (지원 브라우저만).
  const overlayOpen = fullscreenId !== null;
  useEffect(() => {
    if (!overlayOpen) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => {
        if (cancelled) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [overlayOpen]);

  const addTimer = (timerName: string, durationMs: number) => {
    unlockAudio();
    setTimers((prev) => [
      ...prev,
      createTimer(crypto.randomUUID(), timerName, durationMs),
    ]);
  };

  const readForm = () => {
    const m = Number(minutes);
    const s = Number(seconds);
    const trimmed = name.trim();
    if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0) {
      setFormError("시간을 올바르게 입력해 주세요.");
      return null;
    }
    const durationMs = (Math.floor(m) * 60 + Math.floor(s)) * 1000;
    if (durationMs <= 0) {
      setFormError("1초 이상으로 설정해 주세요.");
      return null;
    }
    if (durationMs > 24 * 3600 * 1000) {
      setFormError("24시간 이하로 설정해 주세요.");
      return null;
    }
    setFormError(null);
    return { name: trimmed || "타이머", durationMs };
  };

  const onAdd = () => {
    const v = readForm();
    if (v) addTimer(v.name, v.durationMs);
  };

  const onSavePreset = () => {
    const v = readForm();
    if (!v) return;
    setPresets((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: v.name, durationMs: v.durationMs },
    ]);
  };

  const update = (id: string, fn: (t: TimerModel, at: number) => TimerModel) =>
    setTimers((prev) => prev.map((t) => (t.id === id ? fn(t, Date.now()) : t)));

  const onToggle = (t: TimerModel) => {
    unlockAudio();
    update(t.id, (cur, at) =>
      cur.status === "running" ? pauseTimer(cur, at) : startTimer(cur, at),
    );
  };

  const enterFullscreen = (id: string) => {
    unlockAudio();
    setFullscreenId(id);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const exitFullscreen = () => {
    setFullscreenId(null);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const fullscreenTimer = timers.find((t) => t.id === fullscreenId) ?? null;

  const renderControls = (t: TimerModel, large = false) => {
    const running = t.status === "running";
    const finished = isFinished(t, now);
    const size = large ? "lg" : "default";
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size={size} onClick={() => onToggle(t)}>
          {running && !finished ? (
            <>
              <Pause /> 일시정지
            </>
          ) : (
            <>
              <Play /> {t.status === "paused" ? "재개" : "시작"}
            </>
          )}
        </Button>
        <Button
          size={size}
          variant="outline"
          onClick={() =>
            update(t.id, (cur, at) => extendTimer(cur, 60_000, at))
          }
        >
          <Plus /> 1분
        </Button>
        <Button
          size={size}
          variant="outline"
          onClick={() => update(t.id, (cur) => resetTimer(cur))}
        >
          <RotateCcw /> 초기화
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-sm font-medium">타이머 추가</h2>
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timer-name">이름</Label>
            <Input
              id="timer-name"
              value={name}
              maxLength={30}
              placeholder="예: 토론"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex w-16 flex-col gap-1.5">
            <Label htmlFor="timer-min">분</Label>
            <Input
              id="timer-min"
              type="number"
              inputMode="numeric"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
          <div className="flex w-16 flex-col gap-1.5">
            <Label htmlFor="timer-sec">초</Label>
            <Input
              id="timer-sec"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </div>
        </div>
        {formError && (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onAdd}>
            <Plus /> 추가
          </Button>
          <Button variant="outline" onClick={onSavePreset}>
            <Save /> 프리셋으로 저장
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <h3 className="text-muted-foreground text-xs font-medium">프리셋</h3>
          {presets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              저장된 프리셋이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="bg-muted flex items-center rounded-lg text-sm"
                >
                  <button
                    type="button"
                    className="hover:bg-foreground/10 rounded-l-lg px-3 py-1.5"
                    onClick={() => addTimer(p.name, p.durationMs)}
                  >
                    {p.name} · {durationLabel(p.durationMs)}
                  </button>
                  <button
                    type="button"
                    aria-label={`${p.name} 프리셋 삭제`}
                    className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-r-lg px-2 py-1.5"
                    onClick={() =>
                      setPresets((prev) => prev.filter((x) => x.id !== p.id))
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t pt-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) =>
                setSettings({ ...settings, sound: e.target.checked })
              }
            />
            소리 알림
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.vibration}
              onChange={(e) =>
                setSettings({ ...settings, vibration: e.target.checked })
              }
            />
            진동 알림
          </label>
          <span className="text-muted-foreground text-xs">
            1분 전 · 30초 전 · 종료 시 알립니다.
          </span>
        </div>
      </section>

      {timers.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          타이머를 추가하거나 프리셋을 눌러 시작하세요.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {timers.map((t) => {
            const remaining = getRemainingMs(t, now);
            const finished = isFinished(t, now);
            const flashing =
              finished && t.endAt !== null && now - t.endAt < FLASH_MS;
            const warning =
              t.status === "running" && !finished && remaining <= 30_000;
            const ratio = t.durationMs > 0 ? remaining / t.durationMs : 0;
            return (
              <li
                key={t.id}
                className={cn(
                  "bg-card flex flex-col gap-3 rounded-xl border p-4 transition-colors",
                  flashing && "bg-destructive/30 animate-pulse",
                  finished && !flashing && "border-destructive",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium">{t.name}</h3>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="전체화면"
                      onClick={() => enterFullscreen(t.id)}
                    >
                      <Expand />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="타이머 삭제"
                      onClick={() =>
                        setTimers((prev) => prev.filter((x) => x.id !== t.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <div
                  className={cn(
                    "text-center font-mono text-5xl font-semibold tabular-nums",
                    warning && "text-amber-400",
                    finished && "text-destructive",
                  )}
                  aria-live="off"
                >
                  {formatTime(remaining)}
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      warning || finished ? "bg-destructive" : "bg-primary",
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  {renderControls(t)}
                  <span className="text-muted-foreground text-xs">
                    {finished
                      ? "종료"
                      : t.status === "running"
                        ? "진행 중"
                        : t.status === "paused"
                          ? "일시정지"
                          : durationLabel(t.durationMs)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {fullscreenTimer && (
        <FullscreenView
          timer={fullscreenTimer}
          now={now}
          onClose={exitFullscreen}
          controls={renderControls(fullscreenTimer, true)}
        />
      )}
    </div>
  );
}

function FullscreenView({
  timer,
  now,
  onClose,
  controls,
}: {
  timer: TimerModel;
  now: number;
  onClose: () => void;
  controls: React.ReactNode;
}) {
  const remaining = getRemainingMs(timer, now);
  const finished = isFinished(timer, now);
  const flashing =
    finished && timer.endAt !== null && now - timer.endAt < FLASH_MS;
  const warning =
    timer.status === "running" && !finished && remaining <= 30_000;

  return (
    <div
      role="dialog"
      aria-label={`${timer.name} 전체화면 타이머`}
      className={cn(
        "bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 p-6 transition-colors",
        flashing && "bg-destructive/40 animate-pulse",
      )}
    >
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label="전체화면 닫기"
        className="absolute top-4 right-4"
        onClick={onClose}
      >
        <X />
      </Button>
      <h2 className="text-muted-foreground text-2xl sm:text-4xl">
        {timer.name}
      </h2>
      <div
        className={cn(
          "font-mono text-[22vw] leading-none font-bold tabular-nums",
          warning && "text-amber-400",
          finished && "text-destructive",
        )}
      >
        {formatTime(remaining)}
      </div>
      {controls}
    </div>
  );
}
