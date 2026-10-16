"use client";

import { Mic, MicOff } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

// 브라우저 음성 인식(Web Speech API)은 표준 타입 정의에 없어 필요한 부분만 적는다.
interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

/** 마이크 버튼: 말한 내용을 글자로 바꿔 onText 로 넘긴다. 지원하지 않는 브라우저에서는 보이지 않는다. */
export function DictationButton({
  onText,
}: {
  onText: (text: string) => void;
}) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => recognitionCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState(false);
  const rec = useRef<Recognition | null>(null);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "ko-KR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text.trim()) onText(text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setFailed(true);
      setListening(false);
    };
    rec.current = r;
    setFailed(false);
    try {
      r.start();
      setListening(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={listening ? "default" : "outline"}
        aria-pressed={listening}
        onClick={toggle}
      >
        {listening ? <MicOff /> : <Mic />} {listening ? "받아쓰는 중…" : "음성"}
      </Button>
      {failed && (
        <span role="alert" className="text-destructive text-xs">
          마이크를 사용할 수 없습니다. 권한을 확인해 주세요.
        </span>
      )}
    </span>
  );
}
