import type { Metadata } from "next";
import { LegacySquad } from "../../components/LegacyMounts";

export const metadata: Metadata = { title: "Squad" };

export default function Page() {
  return <LegacySquad />;
}
