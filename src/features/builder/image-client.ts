"use client";

import { createClient } from "@/lib/supabase/client";

import { buildImagePath, fitWithin, validateImageFile } from "./image-upload";

const BUCKET = "scenario-images";

async function resizeToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) throw new Error("encode failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

/** 형식·크기 검사 → 브라우저에서 리사이즈 → 본인 폴더에 업로드. 저장된 Storage 경로를 돌려준다. */
export async function uploadCharacterImage(
  file: File,
  userId: string,
  scenarioId: string,
): Promise<string> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  let blob: Blob;
  try {
    blob = await resizeToWebp(file);
  } catch {
    throw new Error("이미지를 처리하지 못했습니다. 다른 파일로 시도해 주세요.");
  }

  const path = buildImagePath(userId, scenarioId, crypto.randomUUID());
  const { error } = await createClient()
    .storage.from(BUCKET)
    .upload(path, blob, { contentType: "image/webp", upsert: false });
  if (error)
    throw new Error("업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return path;
}

/** 비공개 버킷이라 임시(서명) 주소로 보여준다. */
export async function getImageUrl(path: string): Promise<string | null> {
  const { data, error } = await createClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}
