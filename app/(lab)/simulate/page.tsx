import type { Metadata } from "next";
import { LegacySimulate } from "../../components/LegacyMounts";

export const metadata: Metadata = { title: "Simulate" };

export default function Page() {
  return <LegacySimulate />;
}
