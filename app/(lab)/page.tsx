import { NextStep, PageHeader } from "../components/shell/PageHeader";

export default function HomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Agentic Football Lab"
        title="Five agents. One shape. Find the prompts that win."
        description="Build a multi-model squad, replay stored matches, compare configurations and export the best player prompts."
      />
      <NextStep href="/squad" />
    </>
  );
}
