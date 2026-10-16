import type { Metadata } from "next";
import { LegacyAnalytics } from "../../components/LegacyMounts";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <LegacyAnalytics />;
}
