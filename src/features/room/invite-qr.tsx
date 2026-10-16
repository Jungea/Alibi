"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** 초대 링크를 QR 코드로 보여 준다 (브라우저에서만 만들며 외부 서비스를 쓰지 않는다). */
export function InviteQr({
  code,
  size = 200,
}: {
  code: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [link, setLink] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/join/${code}`;
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: size * 2 })
      .then((data) => {
        if (cancelled) return;
        setLink(url);
        setSrc(data);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      {src ? (
        // 흰 배경을 유지해야 스캔이 잘 된다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          width={size}
          height={size}
          alt={`초대 코드 ${code} QR 코드`}
          className="rounded-lg bg-white p-1"
        />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="bg-muted rounded-lg"
          aria-hidden
        />
      )}
      {link && (
        <span className="text-muted-foreground text-xs break-all">{link}</span>
      )}
    </div>
  );
}
