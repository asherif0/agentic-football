import type { Metadata } from "next";
import { Suspense } from "react";
import PromptsView from "../../components/prompts/PromptsView";

export const metadata: Metadata = { title: "Prompts" };

export default function PromptsPage() {
  return (
    <Suspense>
      <PromptsView />
    </Suspense>
  );
}
