import type { Metadata } from "next";
import { LegacyPrompts } from "../../components/LegacyMounts";

export const metadata: Metadata = { title: "Prompts" };

export default function Page() {
  return <LegacyPrompts />;
}
