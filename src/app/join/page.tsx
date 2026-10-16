import type { Metadata } from "next";

import { JoinSection } from "@/features/room/join-section";

export const metadata: Metadata = { title: "방 입장 | 알리바이" };

export default function JoinPage() {
  return <JoinSection />;
}
