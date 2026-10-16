import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import LibrarySection from "../../../components/library/LibrarySection";
import { SECTIONS } from "../../../components/library/sections";
import { PageHeader } from "../../../components/shell/PageHeader";

export function generateStaticParams() {
  return SECTIONS.map((s) => ({ section: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return { title: SECTIONS.find((s) => s.id === section)?.label ?? "Library" };
}

export default async function LibrarySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const s = SECTIONS.find((x) => x.id === section);
  if (!s) notFound();
  return (
    <>
      <PageHeader
        eyebrow={`Library · ${s.group}`}
        title={s.label}
        description={s.blurb}
      />
      <Suspense>
        <LibrarySection section={s} />
      </Suspense>
    </>
  );
}
