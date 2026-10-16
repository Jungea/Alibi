import type { AlertKey } from "./timer-logic";

let audioCtx: AudioContext | null = null;

/** 브라우저 정책상 소리는 사용자 조작 이후에만 나므로, 버튼 클릭 시 호출해 미리 활성화한다. */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    // 오디오를 지원하지 않는 환경
  }
}

const BEEPS: Record<
  AlertKey,
  { count: number; durationMs: number; hz: number }
> = {
  minute: { count: 1, durationMs: 250, hz: 660 },
  thirty: { count: 2, durationMs: 250, hz: 740 },
  end: { count: 3, durationMs: 600, hz: 880 },
};

export function playBeep(kind: AlertKey) {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== "running") return;
  const { count, durationMs, hz } = BEEPS[kind];
  const gapS = 0.15;
  const lenS = durationMs / 1000;
  const start = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    const t = start + i * (lenS + gapS);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = hz;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + lenS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + lenS + 0.02);
  }
}

const VIBRATION: Record<AlertKey, number[]> = {
  minute: [200],
  thirty: [200, 100, 200],
  end: [500, 200, 500, 200, 500],
};

/** iOS Safari 등 미지원 환경에서는 조용히 무시된다. */
export function vibrate(kind: AlertKey) {
  try {
    navigator.vibrate?.(VIBRATION[kind]);
  } catch {
    // 무시
  }
}
