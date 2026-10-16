import type { Metadata } from "next";
import LibraryIndex from "../../components/library/LibraryIndex";
import { PageHeader } from "../../components/shell/PageHeader";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Library"
        description="Everything that supports the main workflow: research behind each idea, versioned records, manual portal evidence and automation."
      />
      <LibraryIndex />
    </>
  );
}
