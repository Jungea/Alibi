"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { importScenarioAction } from "./actions";

const MAX_BYTES = 2 * 1024 * 1024;

export function ImportButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("파일이 너무 큽니다. (최대 2MB)");
      return;
    }
    setBusy(true);
    try {
      const result = await importScenarioAction(await file.text());
      if (result.ok) router.push(`/builder/${result.id}/edit`);
      else setError(result.error);
    } catch {
      setError("가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="시나리오 JSON 파일 선택"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload /> {busy ? "가져오는 중…" : "JSON 가져오기"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
