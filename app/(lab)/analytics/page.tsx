import type { Metadata } from "next";
import { Suspense } from "react";
import AnalyticsView from "../../components/analytics/AnalyticsView";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <Suspense>
      <AnalyticsView />
    </Suspense>
  );
}
