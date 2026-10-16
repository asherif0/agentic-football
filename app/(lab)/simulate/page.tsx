import type { Metadata } from "next";
import { Suspense } from "react";
import SimulateView from "../../components/simulate/SimulateView";

export const metadata: Metadata = { title: "Simulate" };

export default function SimulatePage() {
  return (
    <Suspense>
      <SimulateView />
    </Suspense>
  );
}
