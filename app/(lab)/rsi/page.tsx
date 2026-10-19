import type { Metadata } from "next";
import { Suspense } from "react";
import RsiView from "../../components/rsi/RsiView";

export const metadata: Metadata = { title: "RSI" };

export default function RsiPage() {
  return (
    <Suspense>
      <RsiView />
    </Suspense>
  );
}
